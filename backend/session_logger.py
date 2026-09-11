"""
SessionLogger — Persiste eventos de corrida em JSON por sessão.
Mantém os últimos MAX_LOGS arquivos, deletando os mais antigos automaticamente.
"""

import os
import json
import time
import logging
import glob
from datetime import datetime

LOGS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "logs")
MAX_LOGS = 10


def _ensure_logs_dir():
    os.makedirs(LOGS_DIR, exist_ok=True)


def _rotate_old_logs():
    """Deleta os logs mais antigos se houver mais de MAX_LOGS arquivos."""
    pattern = os.path.join(LOGS_DIR, "session_*.json")
    files = sorted(glob.glob(pattern), key=os.path.getmtime)
    while len(files) >= MAX_LOGS:
        oldest = files.pop(0)
        try:
            os.remove(oldest)
            logging.info(f"[SessionLog] Log antigo removido: {os.path.basename(oldest)}")
        except Exception as e:
            logging.warning(f"[SessionLog] Não foi possível remover {oldest}: {e}")


class SessionLogger:
    """
    Registra eventos de uma sessão de corrida em um arquivo JSON.
    
    Estrutura do arquivo:
    {
        "meta": { track, session_type, started_at, ... },
        "events": [
            { "type": "incident", "ts": 1234, "elapsed": "01:23:45", ... },
            { "type": "yellow_flag", ... },
            { "type": "pit_stop", ... },
            { "type": "best_lap", ... },
            { "type": "grid_snapshot", ... },
        ]
    }
    """

    def __init__(self):
        self._filepath = None
        self._session_started_at = None
        self._current_track = "Desconhecida"
        self._current_session = "SESSÃO"
        self._event_count = 0
        self._last_snapshot_time = 0

    def start_session(self, track_name: str, session_type: str):
        """Cria um novo arquivo de log para esta sessão."""
        _ensure_logs_dir()
        _rotate_old_logs()

        self._session_started_at = datetime.now()
        self._current_track = track_name or "Desconhecida"
        self._current_session = session_type or "SESSÃO"
        self._event_count = 0
        self._last_snapshot_time = time.time()

        # Nome do arquivo: session_YYYYMMDD_HHMMSS_Pista_Tipo.json
        safe_track = "".join(c if c.isalnum() or c in "_ " else "" for c in self._current_track).strip().replace(" ", "_")
        safe_session = self._current_session.replace(" ", "_")
        timestamp = self._session_started_at.strftime("%Y%m%d_%H%M%S")
        filename = f"session_{timestamp}_{safe_track}_{safe_session}.json"
        self._filepath = os.path.join(LOGS_DIR, filename)

        meta = {
            "track": self._current_track,
            "session_type": self._current_session,
            "started_at": self._session_started_at.isoformat(),
            "file": filename,
        }

        initial = {"meta": meta, "events": []}
        self._write_full(initial)
        logging.info(f"[SessionLog] Nova sessão gravando em: {filename}")

    def _write_full(self, data: dict):
        """Sobrescreve o arquivo com os dados completos."""
        try:
            with open(self._filepath, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logging.error(f"[SessionLog] Erro ao salvar: {e}")

    def _append_event(self, event: dict):
        """Adiciona um evento ao arquivo JSON existente."""
        if not self._filepath:
            return
        try:
            with open(self._filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
            data["events"].append(event)
            self._event_count += 1
            with open(self._filepath, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logging.error(f"[SessionLog] Erro ao append evento: {e}")

    def _elapsed_str(self, elapsed_s: float) -> str:
        """Converte segundos em HH:MM:SS."""
        elapsed_s = max(0.0, elapsed_s)
        h = int(elapsed_s // 3600)
        m = int((elapsed_s % 3600) // 60)
        s = int(elapsed_s % 60)
        return f"{h:02d}:{m:02d}:{s:02d}"

    def log_incident(self, elapsed_s: float, car1_number: str, car1_driver: str,
                     car2_number: str, car2_driver: str, description: str = ""):
        """Registra um toque/incidente entre dois carros."""
        self._append_event({
            "type": "incident",
            "ts": time.time(),
            "elapsed": self._elapsed_str(elapsed_s),
            "car1": {"number": car1_number, "driver": car1_driver},
            "car2": {"number": car2_number, "driver": car2_driver},
            "description": description,
        })

    def log_yellow_flag(self, elapsed_s: float, sector: str, active: bool):
        """Registra ativação ou desativação de bandeira amarela."""
        self._append_event({
            "type": "yellow_flag",
            "ts": time.time(),
            "elapsed": self._elapsed_str(elapsed_s),
            "sector": sector,
            "active": active,
        })

    def log_fcy(self, elapsed_s: float, active: bool, message: str = ""):
        """Registra Full Course Yellow / Safety Car."""
        self._append_event({
            "type": "fcy",
            "ts": time.time(),
            "elapsed": self._elapsed_str(elapsed_s),
            "active": active,
            "message": message,
        })

    def log_pit_stop(self, elapsed_s: float, car_number: str, driver: str,
                     team: str, pit_duration_s: float, lap: int):
        """Registra um pit stop completo (ao sair do pit)."""
        self._append_event({
            "type": "pit_stop",
            "ts": time.time(),
            "elapsed": self._elapsed_str(elapsed_s),
            "car_number": car_number,
            "driver": driver,
            "team": team,
            "lap": lap,
            "pit_duration_s": round(pit_duration_s, 1),
        })

    def log_best_lap(self, elapsed_s: float, car_number: str, driver: str,
                     car_class: str, lap_time_s: float, lap: int, is_class_best: bool):
        """Registra uma nova melhor volta pessoal (e indica se é best da classe)."""
        self._append_event({
            "type": "best_lap",
            "ts": time.time(),
            "elapsed": self._elapsed_str(elapsed_s),
            "car_number": car_number,
            "driver": driver,
            "car_class": car_class,
            "lap_time_s": round(lap_time_s, 3),
            "lap": lap,
            "is_class_best": is_class_best,
        })

    def maybe_log_grid_snapshot(self, elapsed_s: float, standings: list, interval_s: float = 300.0):
        """Salva um snapshot do grid a cada interval_s segundos (padrão: 5 min)."""
        now = time.time()
        if now - self._last_snapshot_time < interval_s:
            return
        self._last_snapshot_time = now

        snapshot = []
        for car in standings:
            snapshot.append({
                "pos": car.get("classPlace") or car.get("place"),
                "class": car.get("carClass"),
                "number": car.get("carNumber"),
                "driver": car.get("driverName"),
                "team": car.get("teamName"),
                "lap": car.get("lap"),
                "gap": car.get("gapClass") or car.get("gapToLeader"),
            })
        self._append_event({
            "type": "grid_snapshot",
            "ts": now,
            "elapsed": self._elapsed_str(elapsed_s),
            "grid": snapshot,
        })
        logging.info(f"[SessionLog] Snapshot do grid salvo com sucesso ({len(snapshot)} carros).")

    @property
    def is_active(self) -> bool:
        return self._filepath is not None
