import asyncio
import threading
import logging
import os
import urllib.parse
import functools
import json
import websockets
from http.server import HTTPServer, SimpleHTTPRequestHandler
from websockets.server import serve

import state
from utils import get_base_path, get_user_data_path
from broadcaster import ws_handler
from lmu_reader import fetch_all_vehicles_metadata, fetch_rest_standings
from data_processor import process_data_loop, broadcast_fast_telemetry, broadcast_fast_positions, auto_cycle_tower_modes_task, auto_cycle_classes_task, enforce_replay_mode_task

class AssetHandler(SimpleHTTPRequestHandler):
    """Custom handler to serve from both app dir and userdata dir."""
    
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def translate_path(self, path):
        # 0. Clean URL (remove query strings for path resolution)
        parsed = urllib.parse.urlparse(path)
        clean_path = parsed.path
        
        # 1. Strip leading slash and split
        path_parts = clean_path.lstrip('/').split('/')
        
        # Priority 1: If it's a media request, check userdata first
        if len(path_parts) > 1 and path_parts[0] == "media":
            sub_path = os.path.join(*path_parts)
            user_version = os.path.join(get_user_data_path(), sub_path)
            if os.path.exists(user_version):
                return user_version
        
        # Priority 2: Standard project files (using cleaned path)
        return super().translate_path(clean_path)

    def log_message(self, format, *args):
        # Quiet the logs unless it's an error
        pass

    def do_GET(self):
        if self.path == "/api/config":
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            config = {
                "websocketPort": state.overlay_state.get("websocketPort", 8888)
            }
            self.wfile.write(json.dumps(config).encode())
            return
        return super().do_GET()

# Ativa o reuso da porta para evitar "Address already in use" na porta 8000
class ReusableHTTPServer(HTTPServer):
    allow_reuse_address = True

def run_http_server():
    try:
        # Usa functools.partial para passar o diretório sem precisar fazer os.chdir()
        # Isso evita bugs onde o diretório de todo o programa muda de repente
        base_dir = get_base_path()
        handler = functools.partial(AssetHandler, directory=base_dir)
        
        server = ReusableHTTPServer(('127.0.0.1', 8000), handler)
        logging.info("Static File Server started at http://127.0.0.1:8000")
        server.serve_forever()
    except Exception as e:
        logging.error(f"Failed to start HTTP server: {e}")

# REPROVED: Removed duplicate imports handled at top

async def listen_lmu_secret_websocket():
    url = "ws://127.0.0.1:6398/websocket/controlpanel"
    while True:
        try:
            async with websockets.connect(url) as ws:
                logging.info("[LMU Secret WS] Conectado! Capturando nomes e números reais...")
                while True:
                    mensagem = await ws.recv()
                    try:
                        dados = json.loads(mensagem)
                        if dados.get("type") == "standings":
                            for car in dados.get("body", []):
                                slot_id = car.get("slotID")
                                if slot_id is not None:
                                    # Pega o nome sujo (ex: DHL+Wills+Wissen) e troca os "+" por espaços
                                    team_sujo = car.get("fullTeamName", "")
                                    team_limpo = team_sujo.replace("+", " ")
                                    
                                    # Guarda na nossa gaveta do state.py
                                    state.lmu_ws_data[slot_id] = {
                                        "carNumber": car.get("carNumber", ""),
                                        "fullTeamName": team_limpo
                                    }
                    except Exception:
                        pass # Ignora se não for JSON válido
        except Exception as e:
            # Se o jogo estiver fechado ou carregando, aguarda 5 segundos e tenta de novo
            await asyncio.sleep(5)

async def main():
    logging.basicConfig(level=logging.INFO)
    
    # Start HTTP server in a separate thread
    threading.Thread(target=run_http_server, daemon=True).start()
    
    # 1. START WEBSOCKET SERVER FIRST (Non-blocking initialization)
    base_port = state.overlay_state.get("websocketPort", 8888)
    server = None
    
    for port in range(base_port, base_port + 10):
        print(f"\n--- TENTANDO INICIAR SERVIDOR WEBSOCKET (Porta {port}) ---")
        try:
            server = await serve(ws_handler, "127.0.0.1", port, 
                                 ping_interval=20, ping_timeout=20)
            state.overlay_state["websocketPort"] = port
            print(f">>> SUCESSO: Servidor WebSocket ouvindo em ws://127.0.0.1:{port}")
            logging.info(f"Sherminator Race Control PRO (V2) Backend listening on ws://127.0.0.1:{port}")
            break
        except Exception as e:
            if "10048" in str(e) or "10013" in str(e):
                print(f"!!! AVISO: Porta {port} ocupada ou restrita. Tentando próxima...")
                continue
            else:
                print(f"!!! ERRO FATAL AO INICIAR WEBSOCKET NA PORTA {port}: {e}")
                logging.error(f"Could not start WebSocket server: {e}")
                return

    if not server:
        print("!!! ERRO FATAL: Não foi possível encontrar uma porta disponível para o WebSocket após 10 tentativas.")
        return

    # 2. Start high-frequency loops in background tasks
    # Guardamos referências fortes na lista 'tasks' para evitar que o 
    # Garbage Collector do Python delete essas funções enquanto rodam
    tasks = [
        asyncio.create_task(broadcast_fast_telemetry()),
        asyncio.create_task(broadcast_fast_positions()),
        asyncio.create_task(fetch_all_vehicles_metadata()),
        asyncio.create_task(fetch_rest_standings()),
        asyncio.create_task(auto_cycle_tower_modes_task()),
        asyncio.create_task(auto_cycle_classes_task()),
        asyncio.create_task(enforce_replay_mode_task()),
        asyncio.create_task(listen_lmu_secret_websocket()),
        # 3. Start the core data processing loop
        asyncio.create_task(process_data_loop())
    ]
    
    # 4. RUN FOREVER
    await asyncio.Future() 

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass