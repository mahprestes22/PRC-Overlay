import os
import asyncio
import logging
import json
import math
import time
import websockets
from websockets.server import serve

# Import do Leitor de Memória
from pyLMUSharedMemory.lmu_mmap import MMapControl
from pyLMUSharedMemory import lmu_data

# Import utilitário para API REST
from utils import async_fetch_json
from session_logger import SessionLogger

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')


SESSION_NAMES = {
    0: "TEST DAY",
    1: "TREINO LIVRE 1",
    2: "TREINO LIVRE 2",
    3: "TREINO LIVRE 3",
    4: "TREINO LIVRE 4",
    5: "CLASSIFICAÇÃO",
    6: "HYPERPOLE",
    7: "CLASSIFICAÇÃO 3",
    8: "CLASSIFICAÇÃO 4",
    9: "WARMUP",
    10: "CORRIDA",
    11: "CORRIDA 2",
    12: "CORRIDA 3",
    13: "CORRIDA 4"
}

GAME_PHASES = {
    0: "PRÉ-SESSÃO",
    1: "RECONHECIMENTO",
    2: "GRID DE LARGADA",
    3: "VOLTA DE APRESENTAÇÃO",
    4: "PROCEDIMENTO DE LARGADA",
    5: "BANDEIRA VERDE",
    6: "SAFETY CAR / FCY",
    7: "BANDEIRA VERMELHA",
    8: "BANDEIRA QUADRICULADA",
    9: "PAUSADO"
}

def normalize_class(v_class):
    """Normaliza classes de carros para as siglas clássicas do WEC/LMU."""
    c = v_class.upper().strip()
    if any(k in c for k in ["HYPERCAR", "HYPER", "HY", "LMH", "LMDH"]):
        return "HY"
    elif "ELMS" in c and ("LMP2" in c or "P2" in c):
        return "LMP2_ELMS"
    elif "WEC" in c and ("LMP2" in c or "P2" in c):
        return "LMP2_WEC"
    elif "LMP2" in c or c == "P2":
        return "LMP2"
    elif any(k in c for k in ["LMGT3", "GT3"]):
        return "LMGT3"
    elif any(k in c for k in ["GTE", "LMGTE", "GTE-AM", "GTE-PRO"]):
        return "LMGTE"
    elif "LMP3" in c or c == "P3":
        return "LMP3"
    return "HY" if "HY" in c else (c[:5] if c else "HY")

def detect_manufacturer_info(veh_name, team_name, car_class):
    """Detecta a montadora e o arquivo SVG oficial do LMU"""
    text = f"{veh_name} {team_name}".upper()
    
    # 1. LMP3 Específicos
    if "DUQUEINE" in text:
        return "Duqueine", "Brand=Duqueine.svg"
    if "GINETTA" in text:
        return "Ginetta", "Brand=Ginetta.svg"
    if "LIGIER" in text or "JS P320" in text or "JSP320" in text or "P320" in text:
        return "Ligier", "Brand=Ligier.svg"
        
    # 2. LMP2
    if "ORECA" in text or "07" in text or "LMP2" in car_class or car_class == "P2":
        return "Oreca", "Brand=Oreca.svg"
        
    # 3. Marcas Gerais
    brand_map = [
        ("FERRARI", "Ferrari", "Brand=Ferrari.svg"),
        ("PORSCHE", "Porsche", "Brand=Porsche.svg"),
        ("CORVETTE", "Corvette", "Brand=Corvette.svg"),
        ("CHEVROLET", "Corvette", "Brand=Corvette.svg"),
        ("ASTON", "Aston Martin", "Brand=Aston Martin.svg"),
        ("MCLAREN", "McLaren", "Brand=McLaren.svg"),
        ("MERCEDES", "Mercedes-AMG", "Brand=Mercedes-AMG.svg"),
        ("AMG", "Mercedes-AMG", "Brand=Mercedes-AMG.svg"),
        ("CADILLAC", "Cadillac", "Brand=Cadillac Dark.svg"),
        ("TOYOTA", "Toyota", "Brand=Toyota.svg"),
        ("BMW", "BMW", "Brand=BMW.svg"),
        ("PEUGEOT", "Peugeot", "Brand=Peugeot.svg"),
        ("ALPINE", "Alpine", "Brand=Alpine.svg"),
        ("LAMBORGHINI", "Lamborghini", "Brand=Lamborghini.svg"),
        ("LEXUS", "Lexus", "Brand=Lexus Dark.svg"),
        ("FORD", "Ford", "Brand=Ford.svg"),
        ("ISOTTA", "Isotta Fraschini", "Brand=Isotta Fraschini.svg"),
        ("GENESIS", "Genesis", "Brand=Genesis.svg")
    ]
    for key, name, svg in brand_map:
        if key in text:
            return name, svg
            
    # Fallback por classe
    if car_class in ("P3", "LMP3"):
        return "Ligier", "Brand=Ligier.svg"
    if "LMP2" in car_class or car_class == "P2":
        return "Oreca", "Brand=Oreca.svg"
        
    return "Unknown", ""

class LMUBackendEngine:
    def __init__(self):
        self.mmap_ctrl = None
        self.secret_ws_data = {} # Armazena nomes reais e números de equipes
        self.connected_clients = set()
        self.game_focused_slot = -1
        self.pit_tracker = {} # slot_id -> { in_pits, entry_et, pit_duration, out_lap, out_lap_start_lap, out_lap_time }
        self.incidents_list = [] # Histórico de toques retornado pelo jogo
        self.driver_yellow_tracker = {} # slot_id -> { was_yellow, last_et }
        self.class_best_sectors = {}  # { class: { "s1": None, "s2": None, "s3": None } }
        self.driver_best_sectors = {} # { slot_id: { "s1": None, "s2": None, "s3": None, "sector_colors": ["", "", ""] } }
        self.yellow_flag_history = [] # Histórico em tempo real de bandeiras amarelas
        self.standings_history_api = {} # Histórico completo de voltas por slot_id
        self.track_map_cache = {} # Cache do traçado vetorial 2D da pista
        self.current_camera = "tv" # Câmera ativa no momento
        self.is_replay_active = False  # Estado do modo replay
        self.settings_path = os.path.join(os.path.dirname(__file__), "settings.json")
        self.settings = self.load_settings()
        # --- LOG DE SESSÃO EM JSON ---
        self.session_logger = SessionLogger()
        self._last_logged_session_key = None
        self._logged_incidents_hashes = set()
        # --- LOGOS OFICIAIS ---

        # carId (hash) -> manufacturer name (ex: "Oreca", "Ferrari")
        self.vehicle_metadata = {}
        # vehFile basename -> manufacturer name (fallback)
        self.vehicle_metadata_by_file = {}
        # slotID (int) -> carId (hash string)
        self.slot_to_carid = {}

    def load_settings(self):
        """Carrega configurações do arquivo settings.json"""
        default_settings = {
            "theme": "wec-official",
            "auto_camera_switch": True,
            "widgets": {
                "tower": {"enabled": True, "x": 30, "y": 100, "scale": 1.0, "visible_cams": ["tv", "trackside", "chase", "bonnet"]},
                "driver_banner": {"enabled": True, "x": 30, "y": 920, "scale": 1.0, "visible_cams": ["tv", "trackside", "chase", "bonnet", "cockpit", "nose"]},
                "trackmap": {"enabled": True, "x": 1620, "y": 780, "scale": 0.85, "visible_cams": ["tv", "trackside", "chase"]},
                "pedals": {"enabled": True, "x": 1560, "y": 880, "scale": 1.0, "visible_cams": ["cockpit", "nose", "onboard_cycle"]},
                "battle_box": {"enabled": True, "x": 1400, "y": 100, "scale": 1.0, "visible_cams": ["tv", "trackside", "chase"]}
            }
        }
        if os.path.exists(self.settings_path):
            try:
                with open(self.settings_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logging.error(f"Erro ao ler settings.json: {e}")
        return default_settings

    def save_settings(self, new_settings):
        """Salva configurações no arquivo settings.json"""
        self.settings = new_settings
        try:
            with open(self.settings_path, "w", encoding="utf-8") as f:
                json.dump(self.settings, f, indent=2, ensure_ascii=False)
            logging.info("[Settings] Configurações salvas com sucesso!")
        except Exception as e:
            logging.error(f"Erro ao salvar settings.json: {e}")
        
    async def init_memory(self):
        """Inicializa a conexão nativa com a Memória Compartilhada"""
        logging.info("Conectando à Memória Compartilhada do LMU...")
        self.mmap_ctrl = MMapControl(lmu_data.LMUConstants.LMU_SHARED_MEMORY_FILE, lmu_data.LMUObjectOut)
        try:
            self.mmap_ctrl.create(0) # 0 = Copy Access (mais seguro contra desync)
            logging.info("Memória conectada com sucesso!")
        except Exception as e:
            logging.error(f"Erro ao conectar na memória (O jogo está aberto?): {e}")

    async def listen_secret_ws(self):
        """Conecta no WebSocket interno do jogo para pegar metadados das equipes"""
        url = "ws://127.0.0.1:6398/websocket/controlpanel"
        while True:
            try:
                async with websockets.connect(url) as ws:
                    logging.info("[Secret WS] Conectado! Lendo nomes e números de equipes...")
                    async for message in ws:
                        try:
                            data = json.loads(message)
                            if data.get("type") == "standings":
                                for car in data.get("body", []):
                                    slot_id = car.get("slotID")
                                    if slot_id is not None:
                                        team_name = car.get("fullTeamName", "").replace("+", " ")
                                        self.secret_ws_data[slot_id] = {
                                            "carNumber": car.get("carNumber", ""),
                                            "fullTeamName": team_name
                                        }
                        except json.JSONDecodeError:
                            pass
            except Exception:
                await asyncio.sleep(5)

    async def _fast_lmu_request(self, method, path):
        """Dispara requisição HTTP ultrarrápida via socket assíncrono nativo (~5ms)"""
        try:
            reader, writer = await asyncio.open_connection('127.0.0.1', 6397)
            req = f"{method} {path} HTTP/1.1\r\nHost: 127.0.0.1:6397\r\nContent-Length: 0\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n"
            writer.write(req.encode('ascii'))
            await writer.drain()
            writer.close()
            await writer.wait_closed()
        except Exception as e:
            logging.error(f"[Fast Request] Erro em {method} {path}: {e}")

    async def _fast_lmu_put(self, path):
        await self._fast_lmu_request("PUT", path)

    async def _fast_lmu_post(self, path):
        await self._fast_lmu_request("POST", path)

    async def poll_game_focus(self):
        """Busca periodicamente via REST API quem é o piloto focado no momento"""
        while True:
            try:
                current_slot = await async_fetch_json("http://127.0.0.1:6397/rest/watch/focus", method="GET", timeout=1.0)
                if isinstance(current_slot, int) and current_slot >= 0:
                    self.game_focused_slot = current_slot
            except Exception:
                self.game_focused_slot = -1
            await asyncio.sleep(0.5)

    async def change_lmu_focus(self, slot_id, driver_name=None, cam_type="tv"):
        """Muda o foco da câmera no jogo para o Slot ID selecionado instantaneamente"""
        try:
            logging.info(f"[Camera] Mudando foco no jogo para Slot ID: {slot_id} ({driver_name or ''})")
            self.game_focused_slot = slot_id # Update otimista imediato
            self.current_camera = str(cam_type).lower()
            
            cam_urls = {
                "tv": "4/1/true",
                "cockpit": "2/1/true",
                "in": "2/1/true",
                "driving": "0/1/true",
                "bonnet": "1/1/true",
                "nose": "2/1/false",
                "chase": "3/1/true",
                "trackside": "5/1/true",
                "onboard_cycle": "6/1/true",
            }
            target_path = cam_urls.get(self.current_camera, "4/1/true")
            
            # Executa a mudança de foco e câmera em paralelo ultrarrápido (<10ms)
            await asyncio.gather(
                self._fast_lmu_put(f"/rest/watch/focus/{slot_id}"),
                self._fast_lmu_put(f"/rest/watch/focus/{target_path}"),
                return_exceptions=True
            )
        except Exception as e:
            logging.error(f"[Camera] Falha ao focar slot {slot_id}: {e}")

    async def change_lmu_camera(self, cam_type="tv"):
        """Muda o tipo de câmera ativa no jogo"""
        try:
            self.current_camera = str(cam_type).lower()
            logging.info(f"[Camera] Mudando câmera para: {self.current_camera}")
            cam_urls = {
                "tv": "4/1/true",
                "cockpit": "2/1/true",
                "in": "2/1/true",
                "driving": "0/1/true",
                "bonnet": "1/1/true",
                "nose": "2/1/false",
                "chase": "3/1/true",
                "trackside": "5/1/true",
                "onboard_cycle": "6/1/true",
            }
            target_path = cam_urls.get(self.current_camera, "4/1/true")
            await self._fast_lmu_put(f"/rest/watch/focus/{target_path}")
        except Exception as e:
            logging.error(f"[Camera] Falha ao mudar câmera {cam_type}: {e}")

    async def poll_incidents(self):
        """Busca periodicamente do jogo a lista oficial de toques e incidentes (a cada 2s)"""
        while True:
            try:
                data = await async_fetch_json("http://127.0.0.1:6397/rest/watch/getIncidentsList/5", method="GET", timeout=2.0)
                if isinstance(data, list):
                    self.incidents_list = data
                    for inc in data:
                        inc_key = f"{inc.get('et')}_{inc.get('player')}_{inc.get('contactWith')}"
                        if inc_key not in self._logged_incidents_hashes:
                            self._logged_incidents_hashes.add(inc_key)
                            self.session_logger.log_incident(
                                elapsed_s=float(inc.get("et", 0.0)),
                                car1_number="",
                                car1_driver=str(inc.get("player", "")),
                                car2_number="",
                                car2_driver=str(inc.get("contactWith", "")),
                                description=f"Incidente / Contato com {inc.get('contactWith', '')}"
                            )
            except Exception:
                pass
            await asyncio.sleep(2.0)


    async def poll_standings_history(self):
        """Busca periodicamente o histórico oficial de voltas da API REST (/rest/watch/standings/history)"""
        while True:
            try:
                data = await async_fetch_json("http://127.0.0.1:6397/rest/watch/standings/history", method="GET", timeout=3.0)
                if isinstance(data, dict):
                    self.standings_history_api = data
            except Exception:
                pass
            await asyncio.sleep(4.0)

    def _process_vehicle_metadata_sync(self, data):
        """Processa a lista de 566 carros em thread separada para não bloquear o event loop."""
        vehicles_list = data.get("value", []) if isinstance(data, dict) and "value" in data else data
        if not isinstance(vehicles_list, list):
            return
        new_meta = {}
        new_meta_file = {}
        for v in vehicles_list:
            mfr = v.get("manufacturer") or v.get("brand") or ""
            if not mfr:
                continue
            car_id = v.get("id")
            if car_id:
                new_meta[car_id] = mfr
            veh_file = v.get("vehFile", "")
            if veh_file:
                basename = os.path.splitext(os.path.basename(veh_file))[0]
                new_meta_file[basename] = mfr
        if new_meta:
            self.vehicle_metadata = new_meta
            self.vehicle_metadata_by_file = new_meta_file
            logging.debug(f"[Logos] vehicle_metadata atualizado: {len(new_meta)} carros indexados.")

    async def fetch_vehicle_metadata_once(self):
        """Busca metadados de carros UMA VEZ no startup em background — sem freeze, sem repoll."""
        try:
            # async_fetch_json já usa to_thread internamente (urllib síncrono em thread separada)
            data = await async_fetch_json("http://127.0.0.1:6397/rest/race/car", method="GET", timeout=8.0)
            if data:
                self._process_vehicle_metadata_sync(data)
        except Exception as e:
            logging.debug(f"[Logos] Falha ao buscar /rest/race/car: {e}")

    async def poll_slot_carid_map(self):
        """Busca /rest/watch/standings a cada 5s para mapear slotID -> carId (necessário para logos corretas)"""
        while True:
            try:
                data = await async_fetch_json("http://127.0.0.1:6397/rest/watch/standings", method="GET", timeout=3.0)
                if data:
                    standings_list = data.get("value", []) if isinstance(data, dict) and "value" in data else data
                    if isinstance(standings_list, list):
                        new_map = {}
                        for entry in standings_list:
                            slot_id = entry.get("slotID")
                            car_id = entry.get("carId")
                            if slot_id is not None and car_id:
                                new_map[int(slot_id)] = car_id
                        if new_map:
                            self.slot_to_carid = new_map
            except Exception as e:
                logging.debug(f"[Logos] Falha ao buscar /rest/watch/standings: {e}")
            await asyncio.sleep(5.0)

    async def poll_track_map(self):
        """Busca o traçado oficial (tipo 0) e o traçado contínuo do pitlane (tipo 1) da API REST (/rest/watch/trackmap)"""
        while True:
            try:
                data = await async_fetch_json("http://127.0.0.1:6397/rest/watch/trackmap", method="GET", timeout=3.0)
                if isinstance(data, list) and len(data) > 10:
                    main_pts = [p for p in data if p.get("type") == 0]
                    pit_pts = [p for p in data if p.get("type") == 1]
                    
                    if not main_pts:
                        main_pts = data

                    # Segmentação do Pitlane: detecta pulos > 25m para isolar a linha oficial do pit lane e descartar garagens
                    main_pit_segment = []
                    if pit_pts:
                        pit_segments = []
                        current_seg = [pit_pts[0]]
                        for i in range(1, len(pit_pts)):
                            p1 = pit_pts[i-1]
                            p2 = pit_pts[i]
                            d = math.sqrt((p2["x"] - p1["x"])**2 + (p2["z"] - p1["z"])**2)
                            if d > 25.0:
                                pit_segments.append(current_seg)
                                current_seg = [p2]
                            else:
                                current_seg.append(p2)
                        pit_segments.append(current_seg)
                        
                        # O traçado oficial do pitlane é sempre o segmento contínuo mais longo
                        if pit_segments:
                            main_pit_segment = max(pit_segments, key=len)

                    all_valid = main_pts + main_pit_segment
                    xs = [p["x"] for p in all_valid]
                    ys = [-p["z"] for p in all_valid] # Inverte Z para o Y da tela respeitar o sentido real da pista
                    
                    # Margem ampla (120m) para as bolinhas dos carros nunca ficarem cortadas nas bordas
                    pad = 120.0
                    min_x = min(xs) - pad
                    max_x = max(xs) + pad
                    min_y = min(ys) - pad
                    max_y = max(ys) + pad
                    w = max_x - min_x
                    h = max_y - min_y
                    
                    # Traçado Principal (tipo 0)
                    sampled_main = main_pts[::2]
                    d_parts_main = [f"{round(p['x'], 1)} {round(-p['z'], 1)}" for p in sampled_main]
                    main_d = "M " + " L ".join(d_parts_main) + " Z"
                    
                    # Traçado Oficial do Pitlane (linha contínua pura)
                    pit_d = ""
                    if main_pit_segment:
                        sampled_pit = main_pit_segment[::2]
                        d_parts_pit = [f"{round(p['x'], 1)} {round(-p['z'], 1)}" for p in sampled_pit]
                        pit_d = "M " + " L ".join(d_parts_pit)
                    
                    self.track_map_cache = {
                        "main_d": main_d,
                        "pit_d": pit_d,
                        "viewBox": f"{round(min_x, 1)} {round(min_y, 1)} {round(w, 1)} {round(h, 1)}"
                    }
            except Exception:
                pass
            await asyncio.sleep(8.0)

    async def jump_to_replay(self, slot_id, target_time):
        """Pula para um momento específico no replay (4s antes) com ativação de Replay Mode, TV Cam e Play"""
        try:
            target_time_rounded = max(0.0, round(float(target_time) - 4.0, 1))
            logging.info(f"[Replay] Pulando para {target_time_rounded}s (4s antes do evento {target_time}s) | Slot: {slot_id}")
            
            # 1. Garante que o modo de replay está ativo no jogo
            self.is_replay_active = True
            try:
                is_active = await async_fetch_json("http://127.0.0.1:6397/rest/replay/isActive", method="GET", timeout=1.0)
                if not is_active:
                    logging.info("[Replay] Ativando Replay Mode no LMU...")
                    await self._fast_lmu_post("/rest/replay/toggleactive")
            except Exception:
                pass
            
            # 2. Pula no tempo de replay IMEDIATAMENTE (sem pausa no tempo 00:00)
            await self._fast_lmu_put(f"/rest/watch/replaytime/{target_time_rounded}")
            
            # 3. Foca no piloto se informado
            if slot_id is not None:
                await self._fast_lmu_put(f"/rest/watch/focus/{slot_id}")
                self.game_focused_slot = int(slot_id)
                
            # 4. Ativa TV Cam oficial do LMU (Trackside)
            await self._fast_lmu_put("/rest/watch/focus/SCV_TRACKSIDE/GROUP1/false")
            
            # 5. Dá Play na reprodução
            await self._fast_lmu_put("/rest/watch/replayCommand/play")
        except Exception as e:
            logging.error(f"[Replay] Falha ao pular replay: {e}")

    async def return_to_live(self):
        """Retorna a câmera para o momento ao vivo da corrida desativando o modo replay"""
        try:
            logging.info("[Replay] Retornando para o tempo real (Live)")
            self.is_replay_active = False
            try:
                is_active = await async_fetch_json("http://127.0.0.1:6397/rest/replay/isActive", method="GET", timeout=1.0)
                if is_active:
                    await self._fast_lmu_post("/rest/replay/toggleactive")
            except Exception:
                pass
            await self._fast_lmu_put("/rest/sessions/returnToMonitor")
            await self._fast_lmu_put("/rest/watch/replayCommand/play")
        except Exception as e:
            logging.error(f"[Replay] Falha ao retornar para Live: {e}")

    async def change_lmu_camera(self, cam_type):
        """Muda o tipo de câmera no jogo (TV, Cockpit, Trackside, etc.) instantaneamente"""
        try:
            cam_urls = {
                "tv": "4/1/true",
                "cockpit": "2/1/true",
                "in": "2/1/true",
                "driving": "0/1/true",
                "bonnet": "1/1/true",
                "nose": "2/1/false",
                "chase": "3/1/true",
                "trackside": "5/1/true",
                "onboard_cycle": "6/1/true",
            }
            target_path = cam_urls.get(str(cam_type).lower(), cam_type)
            logging.info(f"[Camera] Mudando câmera para: {cam_type} ({target_path})")
            await self._fast_lmu_put(f"/rest/watch/focus/{target_path}")
        except Exception as e:
            logging.error(f"[Camera] Falha ao mudar câmera para {cam_type}: {e}")

    async def broadcast_loop(self):
        """Loop infinito que junta Memória + Secret WS e envia para o Overlay Web"""
        while True:
            if self.mmap_ctrl:
                self.mmap_ctrl.update() # Puxa o frame atual da Shared Memory
                
                # Verifica se o jogo está ativo e carregado
                if self.mmap_ctrl.data.generic.gameVersion:
                    scoring_info = self.mmap_ctrl.data.scoring.scoringInfo
                    cars = scoring_info.mNumVehicles
                    current_et = scoring_info.mCurrentET
                    session_num = scoring_info.mSession
                    is_race = (session_num >= 9)
                    
                    # Mapeia telemetria por ID de slot
                    tele_map = {}
                    active_vehicles = self.mmap_ctrl.data.telemetry.activeVehicles
                    for k in range(active_vehicles):
                        v_tele = self.mmap_ctrl.data.telemetry.telemInfo[k]
                        tele_map[v_tele.mID] = v_tele
                    
                    # 1. Pré-calcula os recordes absolutos de setores de cada classe (Purple Sectors)
                    for k in range(cars):
                        vs = self.mmap_ctrl.data.scoring.vehScoringInfo[k]
                        vc_raw = vs.mVehicleClass.decode('utf-8', errors='ignore').strip('\x00')
                        vc = normalize_class(vc_raw)
                        if vc not in self.class_best_sectors:
                            self.class_best_sectors[vc] = {"s1": None, "s2": None, "s3": None}
                        cb = self.class_best_sectors[vc]
                        
                        bs1 = float(vs.mBestSector1)
                        bs2_acc = float(vs.mBestSector2)
                        blt = float(vs.mBestLapTime)
                        
                        if bs1 > 0:
                            if cb["s1"] is None or bs1 < cb["s1"]:
                                cb["s1"] = bs1
                        if bs2_acc > bs1 > 0:
                            bs2 = bs2_acc - bs1
                            if cb["s2"] is None or bs2 < cb["s2"]:
                                cb["s2"] = bs2
                        if blt > bs2_acc > 0:
                            bs3 = blt - bs2_acc
                            if cb["s3"] is None or bs3 < cb["s3"]:
                                cb["s3"] = bs3

                    standings = []
                    for i in range(cars):
                        v_score = self.mmap_ctrl.data.scoring.vehScoringInfo[i]
                        slot_id = v_score.mID
                        
                        # Decodifica strings
                        d_name = v_score.mDriverName.decode('utf-8', errors='ignore').strip('\x00')
                        veh_name = v_score.mVehicleName.decode('utf-8', errors='ignore').strip('\x00')
                        v_class_raw = v_score.mVehicleClass.decode('utf-8', errors='ignore').strip('\x00')
                        car_class = normalize_class(v_class_raw)
                        
                        # Busca no WebSocket as infos reais de equipe/número
                        ws_meta = self.secret_ws_data.get(slot_id, {})
                        team_name = ws_meta.get("fullTeamName", veh_name)
                        car_number = ws_meta.get("carNumber", "")
                        
                        # Cálculo de Velocidade em KM/H
                        vx = v_score.mLocalVel.x
                        vy = v_score.mLocalVel.y
                        vz = v_score.mLocalVel.z
                        speed_kmh = round(math.sqrt(vx**2 + vy**2 + vz**2) * 3.6, 1)
                        
                        # Rastreamento de Boxes, Garagem e Out-Lap
                        in_pits = bool(v_score.mInPits)
                        pit_state = int(v_score.mPitState)
                        total_laps = int(v_score.mTotalLaps)
                        
                        # Detecção de Garagem (parado na vaga da garagem)
                        in_garage = bool(v_score.mInGarageStall) or (in_pits and pit_state == 0 and speed_kmh < 5.0)
                        
                        if slot_id not in self.pit_tracker:
                            self.pit_tracker[slot_id] = {
                                "in_pits": in_pits,
                                "entry_et": current_et if in_pits else 0.0,
                                "pit_duration": 0.0,
                                "out_lap": False,
                                "out_lap_start_lap": 0,
                                "out_lap_time": 0.0
                            }
                        
                        pdata = self.pit_tracker[slot_id]
                        
                        # Entrada no pit lane
                        if in_pits and not pdata["in_pits"]:
                            pdata["in_pits"] = True
                            pdata["entry_et"] = current_et
                            pdata["out_lap"] = False
                        
                        # Saída do pit lane (início da Out Lap)
                        elif not in_pits and pdata["in_pits"]:
                            pdata["in_pits"] = False
                            if pdata["entry_et"] > 0:
                                pdata["pit_duration"] = round(current_et - pdata["entry_et"], 1)
                                self.session_logger.log_pit_stop(
                                    elapsed_s=current_et,
                                    car_number=str(car_number),
                                    driver=d_name,
                                    team=team_name,
                                    pit_duration_s=pdata["pit_duration"],
                                    lap=total_laps
                                )
                                pdata["out_lap"] = True
                                pdata["out_lap_start_lap"] = total_laps
                                pdata["out_lap_time"] = current_et
                            else:
                                pdata["out_lap"] = False
                        
                        # Limpa out_lap quando completar volta ou após 120s
                        if pdata["out_lap"]:
                            if total_laps > pdata["out_lap_start_lap"] or (current_et - pdata.get("out_lap_time", current_et)) > 120.0:
                                pdata["out_lap"] = False
                        
                        # Detecção de Yellow Flag individual / incidente na pista
                        # Ignora no WARMUP ou antes da largada da corrida (grid/formação/countdown onde velocidade é baixa)
                        is_warmup = (session_num == 9 or "WARMUP" in SESSION_NAMES.get(session_num, "").upper())
                        game_phase_val = int(getattr(scoring_info, 'mGamePhase', 5))
                        is_pre_race = (session_num >= 10 and game_phase_val < 5)

                        is_yellow_flag = False
                        if not is_warmup and not is_pre_race and not in_pits and not in_garage and current_et > 10.0:
                            # Carro rodado, muito lento (< 45 km/h) ou com bandeira amarela mostrada para ele
                            if speed_kmh < 45.0 or bool(v_score.mUnderYellow) or (int(v_score.mFlag) == 1):
                                is_yellow_flag = True
                        
                        # Rastreamento de histórico de Bandeiras Amarelas
                        sec_val = int(v_score.mSector)
                        sec_name = "S1" if sec_val == 1 else "S2" if sec_val == 2 else "S3"
                        tracker = self.driver_yellow_tracker.setdefault(slot_id, {"was_yellow": False, "last_et": 0.0})
                        if is_yellow_flag and not is_warmup and not is_pre_race:
                            if not tracker["was_yellow"] or (current_et - tracker["last_et"] > 25.0):
                                tracker["was_yellow"] = True
                                tracker["last_et"] = current_et
                                self.yellow_flag_history.append({
                                    "type": "YELLOW_FLAG",
                                    "player": d_name,
                                    "contactWith": f"Amarela ({sec_name})",
                                    "et": round(current_et, 2),
                                    "sector": sec_name
                                })
                                self.session_logger.log_yellow_flag(current_et, f"{d_name} ({sec_name})", True)
                        else:
                            tracker["was_yellow"] = False

                        
                        # Definição de Status conforme regras solicitadas
                        is_focused = (slot_id == self.game_focused_slot)
                        pit_time_val = pdata.get("pit_duration", 0.0)
                        
                        finish_status = int(getattr(v_score, 'mFinishStatus', 0))
                        is_car_finished = bool(finish_status == 1)
                        
                        if finish_status == 1:
                            status_code = "FINISHED"
                            status_text = "FINISH"
                        elif in_garage:
                            status_code = "GARAGE"
                            status_text = "GARAGE"
                        elif in_pits:
                            if pit_state == 2:
                                status_code = "PIT_IN"
                                status_text = "PIT IN"
                            elif pit_state == 3: # Parado no box
                                status_code = "PIT"
                                status_text = "PIT"
                            elif pit_state in (4, 5): # Saindo da vaga / percorrendo saída
                                status_code = "PIT_OUT"
                                status_text = "PIT OUT"
                            else:
                                status_code = "PIT_IN"
                                status_text = "PIT IN"
                        elif pit_state == 1:
                            status_code = "REQ"
                            status_text = "REQ"
                        elif pdata["out_lap"]:
                            status_code = "OUT_LAP"
                            if pit_time_val > 0:
                                status_text = f"OUT LAP ({pit_time_val:.1f}s)"
                            else:
                                status_text = "OUT LAP"
                        elif is_yellow_flag:
                            status_code = "YELLOW_FLAG"
                            status_text = "YELLOW"
                        else:
                            if is_focused:
                                status_code = "ON_AIR"
                                status_text = "ON AIR"
                            else:
                                status_code = "ON_TRACK"
                                status_text = "ON TRACK"
                        
                        # Pneus (FL, FR, RL, RR)
                        tires = {}
                        v_tele = tele_map.get(slot_id)
                        virtual_energy = 0.0
                        fuel_pct = 0.0
                        if v_tele:
                            id_map = {0: "Soft", 1: "Medium", 2: "Hard", 3: "Wet"}
                            tires = {
                                "FL": {
                                    "compound": id_map.get(v_tele.mWheels[0].mCompoundType, "Unknown"),
                                    "wear_pct": round(v_tele.mWheels[0].mWear * 100, 1)
                                },
                                "FR": {
                                    "compound": id_map.get(v_tele.mWheels[1].mCompoundType, "Unknown"),
                                    "wear_pct": round(v_tele.mWheels[1].mWear * 100, 1)
                                },
                                "RL": {
                                    "compound": id_map.get(v_tele.mWheels[2].mCompoundType, "Unknown"),
                                    "wear_pct": round(v_tele.mWheels[2].mWear * 100, 1)
                                },
                                "RR": {
                                    "compound": id_map.get(v_tele.mWheels[3].mCompoundType, "Unknown"),
                                    "wear_pct": round(v_tele.mWheels[3].mWear * 100, 1)
                                }
                            }
                            # Energia Virtual (Hypercars) - mVirtualEnergy é fração 0.0-1.0
                            ve = getattr(v_tele, 'mVirtualEnergy', 0.0)
                            virtual_energy = round(ve * 100, 1) if ve > 0 else 0.0
                            # Combustível como % da capacidade
                            cap = v_tele.mFuelCapacity if v_tele.mFuelCapacity > 0 else 1.0
                            fuel_pct = round((v_tele.mFuel / cap) * 100, 1)

                            # Cálculo do Dano Total do Veículo (0% = Íntegro, 100% = Destruído)
                            dent_sum = sum(list(v_tele.mDentSeverity))
                            # 8 zonas x gravidade máx (3) = 24 pontos = até 60% de dano de lataria/impacto
                            dent_dmg = (dent_sum / 24.0) * 60.0
                            body_detached_dmg = 25.0 if bool(v_tele.mDetached) else 0.0
                            flat_dmg = sum(15.0 for w in v_tele.mWheels if bool(w.mFlat))
                            wheel_detached_dmg = sum(50.0 for w in v_tele.mWheels if bool(w.mDetached))
                            total_damage = min(100.0, round(dent_dmg + body_detached_dmg + flat_dmg + wheel_detached_dmg, 0))
                        else:
                            total_damage = 0.0
                        
                        # Fallback de energia: usa fuel_pct para não-hypercars
                        energy_display = virtual_energy if virtual_energy > 0 else fuel_pct

                        # Cálculo da Média das últimas 5 voltas (AVG 5 LAPS)
                        driver_laps = []
                        hist_list = self.standings_history_api.get(str(slot_id), [])
                        if hist_list:
                            for item in hist_list:
                                lt = float(item.get("lapTime", -1.0))
                                pit = bool(item.get("pitting", False))
                                if lt > 15.0 and not pit:
                                    driver_laps.append(lt)
                        
                        last_lt = float(v_score.mLastLapTime)
                        if last_lt > 15.0 and (not driver_laps or abs(driver_laps[-1] - last_lt) > 0.001):
                            driver_laps.append(last_lt)

                        recent_5 = driver_laps[-5:]
                        avg_5_laps = round(sum(recent_5) / len(recent_5), 3) if recent_5 else 0.0
                        
                        # Rastreamento oficial e determinístico de Setores (S1, S2, S3) com Best Sectors Reais
                        if car_class not in self.class_best_sectors:
                            self.class_best_sectors[car_class] = {"s1": None, "s2": None, "s3": None}
                        cls_best = self.class_best_sectors[car_class]
                        
                        now_time = time.time()
                        if slot_id not in self.driver_best_sectors:
                            self.driver_best_sectors[slot_id] = {
                                "class": car_class,
                                "sector_colors": ["", "", ""],
                                "last_laps": total_laps,
                                "current_lap_s1": None,
                                "current_lap_s2_accum": None
                            }
                        drv_best = self.driver_best_sectors[slot_id]
                        drv_best["class"] = car_class
                        
                        cur_s1 = float(v_score.mCurSector1)
                        cur_s2_accum = float(v_score.mCurSector2)
                        
                        # Best sectors individuais reais do piloto (fornecidos pelo jogo)
                        p_best_s1 = float(v_score.mBestSector1)
                        p_best_s2_accum = float(v_score.mBestSector2)
                        p_best_lt = float(v_score.mBestLapTime)
                        
                        p_best_s2 = (p_best_s2_accum - p_best_s1) if (p_best_s2_accum > p_best_s1 > 0) else 0.0
                        p_best_s3 = (p_best_lt - p_best_s2_accum) if (p_best_lt > p_best_s2_accum > 0) else 0.0

                        # 1. Volta Completa (cruzou a linha de chegada)
                        if total_laps > drv_best["last_laps"]:
                            drv_best["last_laps"] = total_laps
                            drv_best["current_lap_s1"] = None
                            drv_best["current_lap_s2_accum"] = None
                            
                            last_s1 = float(v_score.mLastSector1)
                            last_s2_accum = float(v_score.mLastSector2)
                            last_lt = float(v_score.mLastLapTime)
                            
                            if last_lt > 0 and last_s2_accum > 0 and last_s1 > 0:
                                last_s2 = last_s2_accum - last_s1
                                last_s3 = last_lt - last_s2_accum
                                
                                # Cor S1 da volta fechada
                                s1_c = "yellow"
                                if cls_best["s1"] is None or last_s1 <= cls_best["s1"] + 0.001:
                                    cls_best["s1"] = min(cls_best["s1"] if cls_best["s1"] is not None else last_s1, last_s1)
                                    s1_c = "purple"
                                    for o_slot, o_drv in self.driver_best_sectors.items():
                                        if o_slot != slot_id and o_drv.get("class") == car_class and o_drv["sector_colors"][0] == "purple":
                                            o_drv["sector_colors"][0] = "green"
                                elif p_best_s1 > 0 and last_s1 <= p_best_s1 + 0.002:
                                    s1_c = "green"
                                
                                # Cor S2 da volta fechada
                                s2_c = "yellow"
                                if cls_best["s2"] is None or last_s2 <= cls_best["s2"] + 0.001:
                                    cls_best["s2"] = min(cls_best["s2"] if cls_best["s2"] is not None else last_s2, last_s2)
                                    s2_c = "purple"
                                    for o_slot, o_drv in self.driver_best_sectors.items():
                                        if o_slot != slot_id and o_drv.get("class") == car_class and o_drv["sector_colors"][1] == "purple":
                                            o_drv["sector_colors"][1] = "green"
                                elif p_best_s2 > 0 and last_s2 <= p_best_s2 + 0.002:
                                    s2_c = "green"

                                # Cor S3 da volta fechada
                                s3_c = "yellow"
                                if cls_best["s3"] is None or last_s3 <= cls_best["s3"] + 0.001:
                                    cls_best["s3"] = min(cls_best["s3"] if cls_best["s3"] is not None else last_s3, last_s3)
                                    s3_c = "purple"
                                    for o_slot, o_drv in self.driver_best_sectors.items():
                                        if o_slot != slot_id and o_drv.get("class") == car_class and o_drv["sector_colors"][2] == "purple":
                                            o_drv["sector_colors"][2] = "green"
                                elif p_best_s3 > 0 and last_s3 <= p_best_s3 + 0.002:
                                    s3_c = "green"
                                
                                drv_best["sector_colors"] = [s1_c, s2_c, s3_c]

                        # 2. Setor 1 da volta atual concluído
                        if cur_s1 > 0:
                            if drv_best.get("current_lap_s1") != cur_s1:
                                drv_best["current_lap_s1"] = cur_s1
                                s1_color = "yellow"
                                if cls_best["s1"] is None or cur_s1 <= cls_best["s1"] + 0.001:
                                    cls_best["s1"] = min(cls_best["s1"] if cls_best["s1"] is not None else cur_s1, cur_s1)
                                    s1_color = "purple"
                                    for o_slot, o_drv in self.driver_best_sectors.items():
                                        if o_slot != slot_id and o_drv.get("class") == car_class and o_drv["sector_colors"][0] == "purple":
                                            o_drv["sector_colors"][0] = "green"
                                elif p_best_s1 > 0 and cur_s1 <= p_best_s1 + 0.002:
                                    s1_color = "green"
                                
                                # Início da nova volta: fixa S1 e limpa S2 e S3
                                drv_best["sector_colors"] = [s1_color, "", ""]

                        # 3. Setor 2 da volta atual concluído
                        if cur_s2_accum > 0 and cur_s1 > 0:
                            if drv_best.get("current_lap_s2_accum") != cur_s2_accum:
                                drv_best["current_lap_s2_accum"] = cur_s2_accum
                                cur_s2 = cur_s2_accum - cur_s1
                                if cur_s2 > 0:
                                    s2_color = "yellow"
                                    if cls_best["s2"] is None or cur_s2 <= cls_best["s2"] + 0.001:
                                        cls_best["s2"] = min(cls_best["s2"] if cls_best["s2"] is not None else cur_s2, cur_s2)
                                        s2_color = "purple"
                                        for o_slot, o_drv in self.driver_best_sectors.items():
                                            if o_slot != slot_id and o_drv.get("class") == car_class and o_drv["sector_colors"][1] == "purple":
                                                o_drv["sector_colors"][1] = "green"
                                    elif p_best_s2 > 0 and cur_s2 <= p_best_s2 + 0.002:
                                        s2_color = "green"
                                    
                                    drv_best["sector_colors"][1] = s2_color

                        # Formatação de Nome Oficial WEC: Remove primeiro nome e mantém sobrenome/tag
                        name_parts = d_name.strip().split(" ", 1)
                        formatted_name = name_parts[1].upper() if len(name_parts) > 1 else d_name.upper()
                        
                        # Detecção Oficial de Montadora (1:1 com V5)
                        # Prioridade 1: slotID → carId → /rest/race/car manufacturer
                        car_id = self.slot_to_carid.get(slot_id)
                        mfr_name = self.vehicle_metadata.get(car_id, "") if car_id else ""
                        
                        # Prioridade 2: vehFile basename → /rest/race/car manufacturer  
                        if not mfr_name:
                            ws_veh_file = ws_meta.get("vehicleFilename", "")
                            if ws_veh_file:
                                basename = os.path.splitext(os.path.basename(ws_veh_file))[0]
                                mfr_name = self.vehicle_metadata_by_file.get(basename, "")
                        
                        # Prioridade 3: Fallback por texto (veh_name da shared memory)
                        if not mfr_name:
                            mfr_name_fallback, mfr_svg_fallback = detect_manufacturer_info(veh_name, team_name, car_class)
                            mfr_name = mfr_name_fallback or ""
                        
                        # Monta a URL do logo SVG: o nome da montadora do LMU bate direto com Brand=NAME.svg
                        SVG_NAME_MAP = {
                            "Aston Martin": "Brand=Aston Martin.svg",
                            "BMW": "Brand=BMW.svg",
                            "Cadillac": "Brand=Cadillac Dark.svg",
                            "Chevrolet": "Brand=Corvette.svg",
                            "Corvette": "Brand=Corvette.svg",
                            "Duqueine": "Brand=Duqueine.svg",
                            "Ferrari": "Brand=Ferrari.svg",
                            "Ford": "Brand=Ford.svg",
                            "Genesis": "Brand=Genesis.svg",
                            "Ginetta": "Brand=Ginetta.svg",
                            "Glickenhaus": "Brand=Glickenhaus.svg",
                            "Isotta Fraschini": "Brand=Isotta Fraschini.svg",
                            "Lamborghini": "Brand=Lamborghini.svg",
                            "Lexus": "Brand=Lexus Dark.svg",
                            "Ligier": "Brand=Ligier.svg",
                            "McLaren": "Brand=McLaren.svg",
                            "Mercedes-AMG": "Brand=Mercedes-AMG.svg",
                            "Mercedes": "Brand=Mercedes-AMG.svg",
                            "Oreca": "Brand=Oreca.svg",
                            "Peugeot": "Brand=Peugeot.svg",
                            "Porsche": "Brand=Porsche.svg",
                            "Toyota": "Brand=Toyota.svg",
                            "Alpine": "Brand=Alpine.svg",
                            "Vanwall": "Brand=Vanwall.svg",
                        }
                        if mfr_name in SVG_NAME_MAP:
                            mfr_logo = SVG_NAME_MAP[mfr_name]
                        elif mfr_name.startswith("Brand="):
                            mfr_logo = mfr_name if mfr_name.endswith(".svg") else f"{mfr_name}.svg"
                        elif mfr_name:
                            mfr_logo = f"Brand={mfr_name}.svg"
                        else:
                            mfr_logo = ""



                        # Telemetria em tempo real (Acelerador, Freio, RPM, Marcha)
                        v_t = tele_map.get(slot_id)
                        throt_raw = float(getattr(v_t, 'mUnfilteredThrottle', 0.0)) if v_t else 0.0
                        throt_filt = float(getattr(v_t, 'mFilteredThrottle', 0.0)) if v_t else 0.0
                        throt = max(throt_raw, throt_filt)

                        # Calibração de escala para refletir 100% de curso de pedal real no LMU
                        # Hypercar: teto da telemetria do motor é ~0.58 devido ao BoP elétrico
                        # GT3 / LMGT3 / LMP2: teto da telemetria do motor é ~0.76 devido a restritores e mapa
                        is_hypercar = any(h in car_class.upper() for h in ("HYPER", "HY", "LMH", "LMDH", "GTP"))
                        throt_ceiling = 0.58 if is_hypercar else 0.76

                        if throt >= throt_ceiling:
                            throt = 1.0
                        elif throt > 0.02:
                            throt = min(1.0, throt / throt_ceiling)

                        throt = round(min(1.0, max(0.0, throt)), 3)

                        brk_raw = float(getattr(v_t, 'mUnfilteredBrake', 0.0)) if v_t else 0.0
                        brk_filt = float(getattr(v_t, 'mFilteredBrake', 0.0)) if v_t else 0.0
                        brk_val = max(brk_raw, brk_filt)
                        if brk_val >= 0.82:
                            brk_val = 1.0
                        elif brk_val > 0.02:
                            brk_val = min(1.0, brk_val / 0.82)
                        brk = round(min(1.0, max(0.0, brk_val)), 3)




                        rpm_val = int(v_t.mEngineRPM) if v_t and hasattr(v_t, 'mEngineRPM') else 0
                        max_rpm_val = int(v_t.mEngineMaxRPM) if v_t and hasattr(v_t, 'mEngineMaxRPM') and v_t.mEngineMaxRPM > 0 else 8500
                        gear_val = int(v_t.mGear) if v_t and hasattr(v_t, 'mGear') else 0
                        max_gears = int(v_t.mMaxGears) if v_t and hasattr(v_t, 'mMaxGears') and v_t.mMaxGears > 0 else 7
                        speed_mph = int(round(speed_kmh * 0.621371, 0))


                        standings.append({
                            "slotID": slot_id,
                            "driverName": d_name,
                            "driverNameFormatted": formatted_name,
                            "teamName": team_name,
                            "carNumber": car_number,
                            "carClass": car_class,
                            "manufacturer": mfr_name,
                            "manufacturerLogo": mfr_logo,
                            "vehicleFilename": ws_meta.get("vehicleFilename", veh_name),
                            "speedKmh": speed_kmh,
                            "speedMph": speed_mph,
                            "place": v_score.mPlace,
                            "lap": v_score.mTotalLaps,
                            "inPits": in_pits,
                            "inGarage": in_garage,
                            "pitState": pit_state,
                            "isFinished": is_car_finished,
                            "finishStatus": finish_status,
                            "statusCode": status_code,
                            "statusText": status_text,
                            "isYellowFlag": is_yellow_flag,
                            "pitDuration": pit_time_val,
                            "isFocused": is_focused,
                            "tires": tires,
                            "damagePct": int(total_damage),
                            "bestLapTime": v_score.mBestLapTime,
                            "lastLapTime": v_score.mLastLapTime,
                            "timeIntoLap": round(float(getattr(v_score, 'mTimeIntoLap', 0.0)), 2),
                            "lapInvalidated": bool(getattr(v_score, 'mLapInvalidated', False)),
                            "curSector": int(getattr(v_score, 'mSector', 1)),
                            "avg5Laps": avg_5_laps,
                            "gapToLeader": v_score.mTimeBehindLeader,
                            "gapToNext": v_score.mTimeBehindNext,
                            "lapsBehindLeader": int(v_score.mLapsBehindLeader),
                            "lapsBehindNext": int(v_score.mLapsBehindNext),
                            "sectorColors": list(drv_best["sector_colors"]),
                            "posX": round(float(v_score.mPos.x), 1),
                            "posY": round(float(-v_score.mPos.z), 1),
                            "virtualEnergy": energy_display,
                            "fuelPct": fuel_pct,
                            "numStops": int(getattr(v_score, 'mNumPitstops', 0)),
                            "posChange": (int(v_score.mQualification) - int(v_score.mPlace)) if (is_race and getattr(v_score, 'mQualification', 0) > 0 and v_score.mPlace > 0) else 0,
                            "gridPosition": int(getattr(v_score, 'mQualification', -1)),
                            "telemetry": {
                                "throttle": throt,
                                "brake": brk,
                                "rpm": rpm_val,
                                "maxRpm": max_rpm_val,
                                "gear": gear_val,
                                "maxGears": max_gears,
                                "speedMph": speed_mph
                            }
                        })


                    
                    # Garante ordenação correta pela posição na pista
                    standings.sort(key=lambda x: x["place"])
                    
                    session_num = scoring_info.mSession
                    is_race = (session_num >= 9)

                    # Calcula a posição dentro de cada classe (POS CLAS) e Gaps
                    class_counters = {}
                    class_leaders = {}
                    class_prev_car = {}  # Último carro processado de cada classe (para INT por classe)
                    
                    # Dicionários de gaps oficiais do Scoring Engine da simulação
                    # mLapsBehindNext e mTimeBehindNext registram se um carro levou volta REAL do carro à frente na pista
                    overall_time_gaps = {}
                    overall_laps_gaps = {}
                    for car in standings:
                        pos = car.get("place", 0)
                        if pos > 0:
                            overall_time_gaps[pos] = float(car.get("gapToNext", -1.0))
                            overall_laps_gaps[pos] = int(car.get("lapsBehindNext", 0))

                    def get_chain_gaps(pos_behind, pos_ahead):
                        """Calcula laps e tempo acumulados entre dois carros baseados no Scoring Engine oficial"""
                        pb = int(pos_behind)
                        pa = int(pos_ahead)
                        if pb <= pa or pa <= 0:
                            return 0, 0.0
                        tot_laps = 0
                        tot_time = 0.0
                        has_complete_time = True
                        for p in range(pa + 1, pb + 1):
                            tot_laps += overall_laps_gaps.get(p, 0)
                            t_val = overall_time_gaps.get(p, -1.0)
                            if t_val >= 0:
                                tot_time += t_val
                            else:
                                has_complete_time = False
                        return tot_laps, (tot_time if has_complete_time else -1.0)

                    for i, car in enumerate(standings):
                        c_cls = car.get("carClass", "HY")
                        class_counters[c_cls] = class_counters.get(c_cls, 0) + 1
                        car["classPlace"] = class_counters[c_cls]

                        # Cálculo de GAP CLAS
                        car["gapClassSeconds"] = 0.0
                        car["gapClassLaps"] = 0
                        if c_cls not in class_leaders:
                            class_leaders[c_cls] = car
                            car["gapClass"] = "LÍDER"
                        else:
                            leader_car = class_leaders[c_cls]
                            if is_race:
                                laps_behind_chain, time_chain = get_chain_gaps(car["place"], leader_car["place"])
                                car["gapClassLaps"] = laps_behind_chain
                                car["gapClassSeconds"] = time_chain if time_chain >= 0 else 0.0
                                if laps_behind_chain > 0:
                                    car["gapClass"] = f"+{laps_behind_chain}V" if laps_behind_chain == 1 else f"+{laps_behind_chain}Vs"
                                elif time_chain >= 0:
                                    car["gapClass"] = f"+{time_chain:.3f}s"
                                else:
                                    gap = car["gapToLeader"] - leader_car["gapToLeader"]
                                    car["gapClassSeconds"] = gap if gap > 0 else (car["gapToNext"] if car["gapToNext"] > 0 else 0.0)
                                    car["gapClass"] = f"+{gap:.3f}s" if gap > 0 else (f"+{car['gapToNext']:.3f}s" if car['gapToNext'] > 0 else "—")
                            else:
                                # Treino / Quali: GAP baseado no Best Lap do líder da classe
                                if leader_car["bestLapTime"] > 0 and car["bestLapTime"] > 0:
                                    diff = car["bestLapTime"] - leader_car["bestLapTime"]
                                    car["gapClassSeconds"] = max(0.0, diff)
                                    car["gapClass"] = f"+{diff:.3f}s" if diff > 0 else "—"
                                else:
                                    car["gapClass"] = "—"

                        # Cálculo de INT (Intervalo) — SEMPRE POR CLASSE
                        car["gapIntervalSeconds"] = 0.0
                        car["gapIntervalLaps"] = 0
                        if is_race:
                            # Corrida: INT por classe usando gap real na pista
                            if c_cls not in class_prev_car:
                                car["gapInterval"] = "—"
                            else:
                                prev_car = class_prev_car[c_cls]
                                laps_diff_chain, time_diff_chain = get_chain_gaps(car["place"], prev_car["place"])
                                car["gapIntervalLaps"] = laps_diff_chain
                                car["gapIntervalSeconds"] = time_diff_chain if time_diff_chain >= 0 else 0.0
                                if laps_diff_chain > 0:
                                    car["gapInterval"] = f"+{laps_diff_chain}V" if laps_diff_chain == 1 else f"+{laps_diff_chain}Vs"
                                elif time_diff_chain >= 0:
                                    car["gapInterval"] = f"+{time_diff_chain:.3f}s"
                                else:
                                    gap = car["gapToLeader"] - prev_car["gapToLeader"]
                                    car["gapIntervalSeconds"] = gap if gap > 0 else (car["gapToNext"] if car["gapToNext"] > 0 else 0.0)
                                    car["gapInterval"] = f"+{gap:.3f}s" if gap > 0 else (f"+{car['gapToNext']:.3f}s" if car['gapToNext'] > 0 else "—")
                            class_prev_car[c_cls] = car
                        else:
                            # Treino / Quali: INT por classe usando BestLap
                            if c_cls not in class_prev_car or car["bestLapTime"] <= 0:
                                car["gapInterval"] = "—"
                            else:
                                prev_best = class_prev_car[c_cls]["bestLapTime"]
                                if prev_best > 0 and car["bestLapTime"] > 0:
                                    diff = car["bestLapTime"] - prev_best
                                    car["gapIntervalSeconds"] = max(0.0, diff)
                                    car["gapInterval"] = f"+{diff:.3f}" if diff >= 0 else f"{diff:.3f}"
                                else:
                                    car["gapInterval"] = "—"
                            if car["bestLapTime"] > 0:
                                class_prev_car[c_cls] = car
                    
                    # Informações de Sessão e Pista
                    track_name = scoring_info.mTrackName.decode('utf-8', errors='ignore').strip('\x00')
                    session_name = SESSION_NAMES.get(session_num, "TREINO LIVRE" if session_num < 5 else "CORRIDA")
                    
                    # Gerenciador de Log JSON por Sessão
                    if track_name:
                        sess_key = (track_name, session_name)
                        if sess_key != self._last_logged_session_key:
                            self._last_logged_session_key = sess_key
                            self.session_logger.start_session(track_name, session_name)
                            # Limpa histórico de bandeiras amarelas e incidentes ao trocar de sessão
                            self.yellow_flag_history.clear()
                            self.driver_yellow_tracker.clear()
                            self.incidents_list.clear()
                            logging.info(f"[Server] Nova sessão detectada: {session_name} ({track_name}). Histórico de amarelas zerado.")
                        
                        # Salva snapshot do grid a cada 5 minutos
                        self.session_logger.maybe_log_grid_snapshot(current_et, standings, interval_s=300.0)

                    phase_num = scoring_info.mGamePhase
                    phase_name = GAME_PHASES.get(phase_num, "BANDEIRA VERDE")
                    time_remaining = float(scoring_info.mSessionTimeRemaining) if hasattr(scoring_info, 'mSessionTimeRemaining') else 0.0


                    # Formatação de string do tempo restante (ex: "1:45:00" ou "45:00")
                    if time_remaining > 0 and time_remaining < 86400:
                        hrs = int(time_remaining // 3600)
                        mins = int((time_remaining % 3600) // 60)
                        secs = int(time_remaining % 60)
                        if hrs > 0:
                            session_time_str = f"{hrs}:{mins:02d}:{secs:02d}"
                        else:
                            session_time_str = f"{mins:02d}:{secs:02d}"
                    elif current_et > 0:
                        # Em modo replay ou contagem progressiva, exibe o tempo decorrido para não pular para 00
                        hrs = int(current_et // 3600)
                        mins = int((current_et % 3600) // 60)
                        secs = int(current_et % 60)
                        if hrs > 0:
                            session_time_str = f"{hrs}:{mins:02d}:{secs:02d}"
                        else:
                            session_time_str = f"{mins:02d}:{secs:02d}"
                    else:
                        session_time_str = getattr(self, '_last_session_time_str', '00:00:00')
                    
                    self._last_session_time_str = session_time_str

                    # Bandeiras e FCY
                    # mSectorFlag: 1 ou 2 = Amarela no setor; 0 ou 11 = Verde/Livre
                    sector_yellows = [bool(int(f) in (1, 2)) for f in scoring_info.mSectorFlag]
                    yf_state = scoring_info.mYellowFlagState
                    yf_val = yf_state[0] if isinstance(yf_state, bytes) else ord(yf_state) if isinstance(yf_state, str) else int(yf_state)
                    
                    is_fcy = (yf_val == 6)
                    is_green = (phase_num in (5, 6) and not is_fcy and not any(sector_yellows))
                    any_car_finished = any(c.get("isFinished") for c in standings)
                    is_finished = (phase_num == 8 or phase_name == "BANDEIRA QUADRICULADA" or any_car_finished)

                    # Detecção de Replay Mode (consulta periódica a cada ~10 frames / ~300ms)
                    if getattr(self, '_replay_check_counter', 0) % 10 == 0:
                        try:
                            replay_resp = await async_fetch_json("http://127.0.0.1:6397/rest/replay/isActive", method="GET", timeout=0.25)
                            self.is_replay_active = bool(replay_resp)
                        except Exception:
                            pass
                    self._replay_check_counter = getattr(self, '_replay_check_counter', 0) + 1

                    session_flags = {
                        "isFCY": is_fcy,
                        "isGreen": is_green,
                        "isFinished": is_finished,
                        "isReplay": self.is_replay_active,
                        "fcyType": "FULL COURSE YELLOW" if is_fcy else "",
                        "yellowSectors": [i + 1 for i, y in enumerate(sector_yellows) if y]
                    }

                    combined_incidents = sorted(self.incidents_list + self.yellow_flag_history, key=lambda x: x.get("et", 0))
                    
                    payload = {
                        "type": "telemetry_update",
                        "track_name": track_name,
                        "session_id": session_num,
                        "session_name": session_name,
                        "session_type": "QUALIFY" if session_num in (5, 6, 7, 8) or "CLASSIFICA" in session_name.upper() or "HYPERPOLE" in session_name.upper() or "QUALI" in session_name.upper() else ("PRACTICE" if session_num < 5 else "RACE"),
                        "session_time_str": session_time_str,
                        "is_race": is_race and session_num >= 9,
                        "is_practice": (session_num < 5),
                        "is_qualifying": (session_num in (5, 6, 7, 8) or "CLASSIFICA" in session_name.upper() or "HYPERPOLE" in session_name.upper() or "QUALI" in session_name.upper()),
                        "session_time_remaining": time_remaining,
                        "game_phase": phase_num,
                        "game_phase_name": phase_name,
                        "yellow_flag_state": yf_val,
                        "sector_yellows": sector_yellows,
                        "session_flags": session_flags,
                        "is_replay": self.is_replay_active,
                        "focused_slot_id": self.game_focused_slot,
                        "current_camera": self.current_camera,
                        "is_onboard": self.current_camera.lower() in ("cockpit", "in", "driving", "bonnet", "nose", "onboard_cycle"),
                        "settings": self.settings,
                        "overlay_state": self.settings.get("overlay_state", self.settings),
                        "standings": standings,

                        "incidents": combined_incidents,
                        "track_map": self.track_map_cache
                    }
                    # Dispara via Websocket
                    if self.connected_clients:
                        msg = json.dumps(payload)
                        await asyncio.gather(*[client.send(msg) for client in self.connected_clients], return_exceptions=True)
                        
                    # Feedback periódico no terminal a cada ~10s
                    if getattr(self, '_print_counter', 0) % 300 == 0:
                        logging.info(f"LOG -> Sessão: {session_name} ({phase_name}) | Câmera: {self.current_camera} | Foco: Slot {self.game_focused_slot} | Carros: {cars} | Incidentes/Amarelas: {len(combined_incidents)}")
                    self._print_counter = getattr(self, '_print_counter', 0) + 1
            
            await asyncio.sleep(1/30) # 30Hz

    async def overlay_handler(self, websocket):
        """Gerencia mensagens recebidas do frontend (Cliques do narrador e comandos do overlay)"""
        self.connected_clients.add(websocket)
        logging.info("Membro da equipe de transmissão conectou ao WebSocket!")
        try:
            async for message in websocket:
                try:
                    data = json.loads(message)
                    action = data.get("action")
                    if action == "camera_focus":
                        slot_id = data.get("slotID")
                        driver_name = data.get("driverName")
                        cam_type = data.get("cameraType", "tv")
                        if slot_id is not None:
                            asyncio.create_task(self.change_lmu_focus(int(slot_id), driver_name, cam_type))
                    elif action == "change_camera":
                        cam_type = data.get("camera")
                        if cam_type:
                            asyncio.create_task(self.change_lmu_camera(cam_type))
                    elif action == "jump_replay":
                        slot_id = data.get("slotID")
                        target_time = data.get("targetTime", 0)
                        asyncio.create_task(self.jump_to_replay(slot_id, target_time))
                    elif action == "return_live":
                        asyncio.create_task(self.return_to_live())
                    elif action == "save_settings":
                        new_settings = data.get("settings")
                        if new_settings and isinstance(new_settings, dict):
                            self.save_settings(new_settings)
                    elif action == "set_overlay_state":
                        updates = data.get("overlay_state", {})
                        if isinstance(updates, dict):
                            if "overlay_state" not in self.settings:
                                self.settings["overlay_state"] = {}
                            self.settings["overlay_state"].update(updates)
                            self.save_settings(self.settings)
                    elif action == "update_widget":
                        widget_name = data.get("widget")
                        widget_data = data.get("data")
                        if widget_name and widget_data and "widgets" in self.settings:
                            self.settings["widgets"][widget_name] = widget_data
                            self.save_settings(self.settings)
                except json.JSONDecodeError:
                    pass
                except Exception as e:
                    logging.error(f"Erro ao processar instrução da mesa de transmissão: {e}")
        finally:
            self.connected_clients.remove(websocket)

    async def run(self):
        await self.init_memory()
        
        logging.info("Servidor de Transmissão rodando na porta 8989...")
        async with serve(self.overlay_handler, "127.0.0.1", 8989):
            # Busca metadados de montadoras UMA VEZ no startup (não poleia, não trava)
            asyncio.ensure_future(self.fetch_vehicle_metadata_once())
            await asyncio.gather(
                self.listen_secret_ws(),
                self.poll_game_focus(),
                self.poll_incidents(),
                self.poll_standings_history(),
                self.poll_track_map(),
                self.poll_slot_carid_map(),
                self.broadcast_loop()
            )


if __name__ == "__main__":
    engine = LMUBackendEngine()
    asyncio.run(engine.run())
