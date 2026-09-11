import os
import sys
import json
import logging
import asyncio
import urllib.request
import re

def sync_fetch_json(url, method="GET", data=None, timeout=2.0):
    """Synchronous helper for fetching JSON data."""
    try:
        body = None
        if data is not None:
            if isinstance(data, (dict, list)):
                body = json.dumps(data).encode('utf-8')
            elif isinstance(data, str):
                body = data.encode('utf-8')
            else:
                body = data
        elif method in ("PUT", "POST"):
            body = b""

        req = urllib.request.Request(url, data=body, method=method)
        req.add_header('Content-Type', 'application/json')
        if body is not None:
            req.add_header('Content-Length', str(len(body)))
        
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            if not raw:
                return {}
            content = raw.decode('utf-8', errors='ignore').strip()
            if not content:
                return {}
            try:
                return json.loads(content)
            except Exception:
                return {"response": content}
    except Exception as e:
        return None

async def async_fetch_json(url, method="GET", data=None, timeout=2.0):
    """Asynchronous wrapper for sync_fetch_json using threads."""
    return await asyncio.to_thread(sync_fetch_json, url, method, data, timeout)

def get_base_path():
    """Returns the base path for THE CODE (Program Files if installed)."""
    if getattr(sys, 'frozen', False):
        # PyInstaller --onedir mode puts libraries/data in _internal
        meipass = getattr(sys, '_MEIPASS', os.path.dirname(sys.executable))
        internal = os.path.join(meipass, "_internal")
        if os.path.exists(os.path.join(internal, "frontend")):
            return internal
        return meipass
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def get_user_data_path(sub_path=""):
    """Returns a writable path in %APPDATA% for user content."""
    appdata = os.getenv('APPDATA')
    if appdata:
        base = os.path.join(appdata, "SherminatorRaceControlPRO")
    else:
        # Fallback to local if APPDATA not found (rare on Windows)
        base = os.path.join(get_base_path(), "userdata")
        
    target = os.path.join(base, sub_path)
    os.makedirs(target, exist_ok=True)
    return target

def get_settings_path():
    """Settings always go to AppData in commercial mode."""
    return os.path.join(get_user_data_path(), "settings.json")

def clean_driver_name(name):
    """Removes # and any following numbers from a driver name."""
    if not name: return ""
    if '#' in name:
        return name.split('#')[0].strip()
    return name.strip()

def normalize_class(v_class):
    """Maps various LMU class names to the 5 core categories."""
    if not v_class: return "Default"
    cls = v_class.upper()
    if "HYPER" in cls: return "Hypercar"
    if "LMP2" in cls: return "LMP2"
    if "LMP3" in cls: return "LMP3"
    if "GT3" in cls: return "LMGT3"
    if "GTE" in cls: return "GTE"
    return v_class.strip()

def clean_team_name(name):
    """
    Standardized team name cleaner for LMU.
    Removes #Number, 4-digit years, and common LMU suffixes.
    """
    if not name: return ""
    # 1. Split by # (Car Number prefix)
    cleaned = name.split('#')[0].strip()
    # 2. Remove common suffixes like :LM, :HE (Hypercar/LMP2/GT3 suffixes in LMU)
    cleaned = cleaned.split(':')[0].strip()
    # 3. Remove 4-digit years (e.g. 2024, 2025) - using word boundaries
    cleaned = re.sub(r'\b20\d{2}\b', '', cleaned).strip()
    return cleaned.strip()

def guess_car_model(v_name, v_class):
    """Maps LMU vehicle names/classes to base car image filenames."""
    if not v_name: return None
    name = v_name.upper()
    cls = v_class.upper() if v_class else ""
    
    if any(x in name for x in ["FERRARI 499P", "499P"]): return ["Ferrari_499P_2023", "Ferrari_499P_2024", "Ferrari_499P"]
    if "TOYOTA" in name and "HYBRID" in name: return ["Toyota_GR010_Hybrid", "Toyota_GR010_2023", "Toyota_GR010_2024"]
    if "PORSCHE 963" in name or ("963" in name and "HYBRID" in name): return ["Porsche_963_Hybrid", "Porsche_963_2023", "Porsche_963_2024"]
    if "CADILLAC" in name: return ["Cadillac_V-Series.R", "Cadillac_V-Series_R", "Cadillac_V.Series-R"]
    if any(x in name for x in ["9X8", "PEUGEOT"]): return ["Peugeot_9X8_2023", "Peugeot_9X8_2024", "Peugeot_9X8"]
    if any(x in name for x in ["BMW M HYBRID", "M HYBRID V8"]): return "BMW_M_Hybrid_V8"
    if any(x in name for x in ["SC63", "LAMBORGHINI"]) and cls == "HYPER": return "Lamborghini_SC63"
    if any(x in name for x in ["A424", "ALPINE"]) and cls == "HYPER": return "Alpine_A424"
    if "ISOTTA" in name: return "Isotta_Fraschini_Tipo6-C"
    
    if cls == "LMP2" or "ORECA" in name: return "Oreca_07_LMP2"
    
    if "ASTON MARTIN" in name and "VANTAGE" in name: return ["Aston_Martin_Vantage_AMR_LMGT3", "Aston_Martin_Vantage_GTE"]
    if "BMW M4" in name: return ["BMW_M4_GT3_LMGT3", "BMW_M4_GT3"]
    if "CORVETTE" in name and "Z06" in name: return ["Corvette_Z06_GT3_R_LMGT3", "Chevrolet_Corvette_C8.R_GTE"]
    if "FERRARI 296" in name: return ["Ferrari_296_GT3_LMGT3", "Ferrari_296_GT3"]
    if "FORD MUSTANG" in name: return ["Ford_Mustang_GT3_LMGT3"]
    if "HURACAN" in name: return ["Lamborghini_Huracan_GT3_EVO2_LMGT3", "Lamborghini_Huracan_GT3_EVO2"]
    if "LEXUS" in name: return ["Lexus_RC_F_GT3_LMGT3"]
    if "MCLAREN 720S" in name: return ["McLaren_720S_GT3_Evo_LMGT3", "McLaren_720S_GT3_Evo"]
    if "PORSCHE 911" in name: 
        if "992" in name or "LMGT3" in cls: return ["Porsche_911_GT3_R_992_LMGT3", "Porsche_911_GT3_R_992"]
        return ["Porsche_911_RSR-19", "Porsche_911_GT3_R_992"]
    
    if "FERRARI 488" in name: return ["Ferrari_488_GTE_EVO", "Ferrari_488_GTE"]
    return None

async def get_slot_id_by_name(driver_name):
    """Helper to find the dynamic Slot ID for a driver name via REST API."""
    if not driver_name:
        return None
    try:
        # Use localhost for better compatibility on Windows
        root_json = await async_fetch_json("http://localhost:6397/rest/watch/standings", timeout=2.0)
        if not root_json:
            return None
        
        standings_list = root_json.get("value", []) if isinstance(root_json, dict) else root_json
        
        clean_name = clean_driver_name(driver_name).lower().strip()
        parts = clean_name.split()
        surname = parts[-1] if parts else ""
        first_initial = clean_name[0] if clean_name else ""
        
        for sd in standings_list:
            api_name = sd.get("driverName", "")
            if not api_name: continue
            
            cleaned_api_name = clean_driver_name(api_name).lower().strip()
            
            # Exact match
            if clean_name == cleaned_api_name:
                return sd.get("slotID")
                
            # Substring match (First Initial and Last Name)
            if surname and surname in cleaned_api_name and first_initial in cleaned_api_name:
                return sd.get("slotID")
    except Exception as e:
        logging.error(f"Error finding slot ID for {driver_name}: {e}")
    return None