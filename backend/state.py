import os
import json
import logging
import time
import asyncio
from utils import get_settings_path, get_user_data_path, get_base_path

SETTINGS_FILE = get_settings_path()

connected_clients = set()
update_event = asyncio.Event()
metadata_update_event = asyncio.Event()

TOWER_MODES = ["GAP", "INTERVAL", "STOPS", "POSITIONS", "ENERGY", "TYRE"]
BROADCAST_LATENCY_DELAY = 1.5 # Offset in seconds to sync telemetry with video buffer

overlay_state = {
    "is_on_track": True,
    "replay_active": False,
    "standingsTower": True,
    "sessionInfo": True,
    "driverInfo": True,
    "qualifyInfo": False,
    "qualifySelectedSlots": [],
    "onboardMode": False,
    "oneVsOne": False,
    "resultsMode": False,
    "lapInfo": False,
    "calendarInfo": False,
    "fcy": False,
    "autoH2H": True,
    "showWeather": True,
    "mediaVersion": int(time.time()),
    "focusedDriver": None,
    "manualFocusDriver": None,
    "manualFocusSlot": -1,
    "scales": {
        "session-info-container": 1.0,
        "standings-tower-container": 1.0,
        "calendar-container": 1.0,
        "driver-box-container": 1.0,
        "driver-box-container-onboard": 1.0,
        "onboard-container": 1.0,
        "one-vs-one-container": 1.0,
        "qualify-list-container": 1.0,
        "fcy-banner": 1.0,
        "replay-banner-container": 1.0, # ADICIONADO
        "results-container": 1.0,
        "track-map-container": 1.0,
        "wec-tower-container": 1.0,
        "wec-one-vs-one-container": 1.0,
        "wec-telemetry-container": 1.0,
        "wec-driver-box-container": 1.0,
        "wec-driver-box-container-onboard": 1.0, # ADICIONADO
        "wec-qualify-list-container": 1.0,
        "wec-track-map-container": 1.0,
        "wec-results-container": 1.0,
        "lap-info-container": 1.0,
        "wec-lap-info-container": 1.0
    },
    "positions": {
        "session-info-container": {"x": 40, "y": 40},
        "standings-tower-container": {"x": 20, "y": 180},
        "calendar-container": {"x": 400, "y": 180},
        "driver-box-container": {"x": 535, "y": 850},
        "driver-box-container-onboard": {"x": 535, "y": 850},
        "onboard-container": {"x": 1560, "y": 400},
        "one-vs-one-container": {"x": 310, "y": 900},
        "qualify-list-container": {"x": 660, "y": 850},
        "fcy-banner": {"x": 800, "y": 60},
        "replay-banner-container": {"x": 800, "y": 120}, # ADICIONADO
        "results-container": {"x": 960, "y": 540},
        "track-map-container": {"x": 1600, "y": 40},
        "wec-tower-container": {"x": 20, "y": 120},
        "wec-one-vs-one-container": {"x": 310, "y": 900},
        "wec-telemetry-container": {"x": 1600, "y": 750},
        "wec-driver-box-container": {"x": 960, "y": 950},
        "wec-driver-box-container-onboard": {"x": 960, "y": 950}, # ADICIONADO
        "wec-qualify-list-container": {"x": 660, "y": 850},
        "wec-track-map-container": {"x": 1600, "y": 40},
        "wec-results-container": {"x": 0, "y": 0},
        "lap-info-container": {"x": 1560, "y": 700},
        "wec-lap-info-container": {"x": 1500, "y": 800}
    },
    "autoCycle": False,
    "autoCycleTime": 30,
    "towerMode": "GAP",
    "focusedClass": "ALL",
    "trackMap": False,
    "currentTrack": "Unknown",
    "trackBounds": None,
    "classColors": {
        "Hypercar": "#e10600",
        "LMP2": "#005aff",
        "LMP3": "#800080",
        "LMGT3": "#00b33c",
        "GTE": "#ffd700",
        "Default": "#888888"
    },
    "customLogos": {},
    "autoClassTransition": True,
    "autoSwitchClass": True,
    "transitionDuration": 2500,
    "overlayTheme": "Sherminator",
    "eventName": "EVENT NAME",
    "eventStage": "1/1",
    "sponsorLogo": "",
    "instagramHandle": "",
    "youtubeHandle": "",
    "eventCalendar": [],
    "eventMode": "solo",
    "championshipName": "",
    "guiMode": "broadcast",
    "opacities": {
        "session-info-container": 0.9,
        "standings-tower-container": 0.9,
        "calendar-container": 0.9,
        "driver-box-container": 0.9,
        "driver-box-container-onboard": 0.9,
        "onboard-container": 0.9,
        "one-vs-one-container": 0.9,
        "qualify-list-container": 0.9,
        "fcy-banner": 1.0,
        "replay-banner-container": 1.0,
        "results-container": 0.9,
        "track-map-container": 0.9,
        "wec-tower-container": 0.9,
        "wec-one-vs-one-container": 0.9,
        "wec-telemetry-container": 0.9,
        "wec-driver-box-container": 0.9,
        "wec-driver-box-container-onboard": 0.9,
        "wec-qualify-list-container": 0.9,
        "wec-track-map-container": 0.9,
        "wec-results-container": 0.9,
        "lap-info-container": 0.9,
        "wec-lap-info-container": 0.9
    },
    "websocketPort": 8888,
    "_lastChangeSource": "manual"
}

shared_data = {
    "standings": [],
    "session": {},
    "globalEvents": {
        "yellowSectors": [],
        "isFCY": False,
        "fcyState": "NONE",
        "suspects": [] # List of driver names who are potentially stopped/slow
    },
    "events": [],
    "battles": [],
    "incidents": [], # List of detected contacts/overtakes
    "focused_idx": -1,
    "focused_ve": 1.0,
    "best_lap_sectors": {},
    "personal_best_sectors": {},
    "class_best_sectors": {},
    "driver_photos": {},
    "driver_pit_start_et": {},
    "driver_pit_total_durations": {},
    "driver_outlap_tracker": {},
    "last_session_et": 0.0,
    "api_focused_name": "",
    "api_focused_slot": -1,
    "api_focused_time": 0.0,
    "driver_last_lap_best": {},
    "last_improvement_et": {},
    "last_lap_sectors": {},
    "driver_last_lap_counts": {},
    "driver_yellow_active": {},   # { driver_name: boolean }
    "last_game_phase": -1,
    "last_fcy_active": False,
    "replay_mode_enforced": False,
    "intelligent_replay_enabled": False
}

vehicle_metadata = {}
standings_slot_map = {} # slotID -> carId
standings_name_map = {} # cleanedName -> carId
rest_standings_data = {} # slotID -> full REST driver object
last_impacts = {} # slot_id -> last_impact_et
last_damage_state = {} # slot_id -> total_dent_severity (float sum)
last_positions = {} # driver_name -> position

# Armazena os dados reais de Equipe e Número vindos do WebSocket do LMU
lmu_ws_data = {}

car_image_cache = {
    "v_file": None,
    "b64": None,
    "pending_file": None,
    "failed_files": {}
}

def load_settings():
    global overlay_state
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, "r") as f:
                saved = json.load(f)
                for k, v in saved.items():
                    if k in overlay_state and k not in ["focusedDriver", "focusedCarImage", "connected"]:
                        if isinstance(v, dict) and k in overlay_state and isinstance(overlay_state[k], dict):
                            overlay_state[k].update(v)
                        else:
                            overlay_state[k] = v
            logging.info(f"Settings loaded from {SETTINGS_FILE}")
        except Exception as e:
            logging.error(f"Error loading settings: {e}")

def save_settings():
    try:
        to_save = {k: v for k, v in overlay_state.items() if k not in ["focusedDriver", "focusedCarImage", "connected", "_lastChangeSource"]}
        os.makedirs(os.path.dirname(SETTINGS_FILE), exist_ok=True)
        with open(SETTINGS_FILE, "w") as f:
            json.dump(to_save, f, indent=4)
        logging.info(f"Settings saved to {SETTINGS_FILE}")
    except Exception as e:
        logging.error(f"Error saving settings: {e}")

def load_driver_photos(quiet=False):
    """
    Carrega as fotos mesclando a base original do programa com a base do utilizador.
    As fotos do AppData (utilizador) sobrepõem as da base original.
    """
    try:
        base_json_path = os.path.join(get_base_path(), "media", "pilotos", "drivers.json")
        user_json_path = os.path.join(get_user_data_path(), "media", "pilotos", "drivers.json")
        
        shared_data["driver_photos"] = {}
        
        # 1. Carrega os padrões que vêm com o programa
        if os.path.exists(base_json_path):
            with open(base_json_path, "r", encoding='utf-8') as f:
                shared_data["driver_photos"].update(json.load(f))
                
        # 2. Carrega as adições/alterações do utilizador por cima
        if os.path.exists(user_json_path):
            with open(user_json_path, "r", encoding='utf-8') as f:
                shared_data["driver_photos"].update(json.load(f))
                
        if not quiet:
            count = len(shared_data["driver_photos"])
            if count > 0:
                logging.info(f"Loaded {count} driver photo mappings (Merged).")
            else:
                logging.warning(f"No driver photo mappings found.")
                
    except Exception as e:
        logging.error(f"Error loading drivers.json: {e}")

# Call loads on init
load_settings()
load_driver_photos()