import asyncio
import json
import logging
import time
import sys
import os
from utils import async_fetch_json, clean_driver_name
import state
from state import vehicle_metadata, standings_slot_map, metadata_update_event, overlay_state
from broadcaster import broadcast_json

# PyInstaller / Shared Memory Fallback
try:
    from pyLMUSharedMemory.lmu_data import SimInfo
except ImportError:
    sys.path.append(os.path.dirname(__file__))
    from pyLMUSharedMemory.lmu_data import SimInfo

class LMUReader:
    def __init__(self):
        self.info = None
        self._lock = asyncio.Lock()
        # Don't connect on init to avoid blocking the import or the main thread
        self.last_attempt_time = 0
        self.reconnect_cooldown = 5.0 # Seconds between connection attempts
    
    async def ensure_connected(self):
        async with self._lock:
            if self.info is None:
                now = time.time()
                if now - self.last_attempt_time < self.reconnect_cooldown:
                    return False
                    
                self.last_attempt_time = now
                logging.debug("Attempting to connect to LMU Shared Memory...")
                try:
                    # Run the blocking SimInfo() call in a separate thread
                    self.info = await asyncio.to_thread(SimInfo)
                    if self.info:
                        logging.info("Connected to LMU Shared Memory.")
                except Exception:
                    self.info = None
                    logging.debug("LMU Shared Memory not available yet.")
        return self.info is not None

    def get_data(self):
        # Este método é usado nos loops que já chamaram ensure_connected
        if not self.info:
            return None, None
        try:
            scoring = self.info.LMUData.scoring
            telemetry = self.info.LMUData.telemetry

            # --- LÓGICA AUTO-HIDE MELHORADA (ROBUSTA) ---
            is_on_track = False
            try:
                if scoring and hasattr(scoring, 'scoringInfo'):
                    s_info = scoring.scoringInfo
                    # [V4 BROADCASTER EXEMPTION]
                    # Em modo narrador, queremos ver o overlay mesmo se o narrador não estiver na pista (monitor/menus)
                    is_broadcaster = (state.overlay_state.get("guiMode") == "broadcast")
                    
                    if is_broadcaster:
                        is_on_track = s_info.mGamePhase > 0
                    else:
                        # Só consideramos "na pista" se estiver em realtime E o jogo não estiver no menu (phase 0)
                        is_on_track = bool(s_info.mInRealtime) and s_info.mGamePhase > 0
            except Exception as e:
                logging.debug(f"[Auto-Hide] Erro ao ler scoringInfo: {e}")
                is_on_track = False

            if state.overlay_state.get("is_on_track") != is_on_track:
                state.overlay_state["is_on_track"] = is_on_track
                
                # FORÇA O BROADCAST IMEDIATO
                asyncio.create_task(broadcast_json({
                    "type": "update_status",
                    "is_on_track": is_on_track
                }))
                
                logging.info(f"[Auto-Hide] Estado alterado! Na pista: {is_on_track}")
            # --------------------------------------------

            return scoring, telemetry
        except Exception as e:
            logging.error(f"Erro ao ler dados da memória: {e}")
            self.info = None
            return None, None

# ... (restante do código: fetch_all_vehicles_metadata, etc)


async def fetch_all_vehicles_metadata():
    """Background task to fetch details for all vehicles on session change."""
    import os
    import state
    from state import metadata_update_event
    
    while True:
        await metadata_update_event.wait()
        metadata_update_event.clear()
        
        try:
            data = await async_fetch_json("http://localhost:6397/rest/race/car", timeout=5.0)
            if data:
                # API sometimes returns { "value": [...] } and sometimes just [...]
                vehicles_list = data.get("value", []) if isinstance(data, dict) and "value" in data else data
                if not isinstance(vehicles_list, list):
                    logging.debug(f"Unexpected metadata structure: {type(data)}")
                    continue

                new_metadata = {}
                for idx, v in enumerate(vehicles_list):
                    m_name = v.get("manufacturer") or v.get("brand") or v.get("Manufacturer") or v.get("Brand", "")
                    
                    # 1. Key by 'id' (authoritative)
                    m_id = v.get("id")
                    if m_id and m_name:
                        new_metadata[m_id] = m_name
                    
                    # 2. Key by 'vehFile' basename (essential for Shared Memory fallback)
                    veh_file_path = v.get("vehFile")
                    if veh_file_path and m_name:
                        filename = os.path.splitext(os.path.basename(veh_file_path))[0]
                        new_metadata[filename] = m_name
                    
                if new_metadata:
                    state.vehicle_metadata.clear()
                    state.vehicle_metadata.update(new_metadata)
                    logging.debug(f"VEHICLE METADATA UPDATED (ID & File-based): {len(state.vehicle_metadata)} entries")
        except Exception as e:
            logging.debug(f"Error fetching vehicle metadata: {e}")
        
        await asyncio.sleep(5.0)


async def fetch_rest_standings():
    """Background task to fetch standings for carId mapping (every 10s)."""
    import state
    is_offline_printed = False
    while True:
        try:
            root_json = await async_fetch_json("http://localhost:6397/rest/watch/standings", timeout=5.0)
            if root_json:
                is_offline_printed = False
                logging.debug(f"[Logos] Standings fetched. Type: {type(root_json)}, Sample: {str(root_json)[:200]}")
                standings_list = root_json.get("value", []) if isinstance(root_json, dict) else root_json
                if isinstance(standings_list, list):
                    logging.debug(f"REST Standings: {len(standings_list)} drivers fetched.")
                    
                    # Detect API Focus
                    api_focus_detected = ""
                    api_focused_slot = -1
                    for driver in standings_list:
                        # [FIXED V3] LMU Update changed 'focused' to 'focus' or 'hasFocus'
                        is_target = driver.get("focus") or driver.get("hasFocus") or driver.get("focused")
                        if is_target:
                            # [FIX V4] Clean #ID from names to match our branding system
                            api_focus_detected = clean_driver_name(driver.get("driverName", ""))
                            # Support both camelCase and pascalCase variations
                            api_focused_slot = driver.get("slotID") if driver.get("slotID") is not None else driver.get("slotId", -1)
                            break
                    
                    if api_focused_slot is not None and int(api_focused_slot) != -1:
                        import time
                        state.shared_data["api_focused_name"] = api_focus_detected
                        state.shared_data["api_focused_slot"] = int(api_focused_slot)
                        state.shared_data["api_focused_time"] = time.time()
                        logging.debug(f"[Focus] API reported focus on: {api_focus_detected} (Slot {api_focused_slot})")

                    new_rest_data = {}
                    new_slot_map = {}
                    new_name_map = {}
                    for driver in standings_list:
                        s_id = driver.get("slotID") if driver.get("slotID") is not None else driver.get("slotId")
                        c_id = driver.get("carId")
                        if s_id is not None:
                            s_id_int = int(s_id)
                            new_rest_data[s_id_int] = driver
                            if c_id:
                                new_slot_map[str(s_id)] = c_id
                        
                        # Build name map as fallback
                        drivers_list = driver.get("drivers", [])
                        for d_info in drivers_list:
                            fname = d_info.get("firstName", "")
                            lname = d_info.get("lastName", "")
                            full_name = f"{fname} {lname}".strip()
                            if full_name and c_id:
                                clean_name = clean_driver_name(full_name).lower()
                                new_name_map[clean_name] = c_id
                    
                    if new_rest_data:
                        state.rest_standings_data.clear()
                        state.rest_standings_data.update(new_rest_data)
                    if new_slot_map:
                        state.standings_slot_map.clear()
                        state.standings_slot_map.update(new_slot_map)
                    if new_name_map:
                        state.standings_name_map.clear()
                        state.standings_name_map.update(new_name_map)
                        logging.info(f"[Logos] REST STANDINGS UPDATED: {len(new_slot_map)} slots, {len(new_rest_data)} REST entries")
                else:
                    if not is_offline_printed:
                        logging.warning("[Logos] REST standings response was empty or invalid format.")
                        is_offline_printed = True
            else:
                if not is_offline_printed:
                    logging.warning("[Logos] Aguardando Servidor do jogo abrir... (rest/watch/standings offline)")
                    is_offline_printed = True
        except Exception as e:
            if not is_offline_printed:
                logging.error(f"[Logos] ERRO de conexão com o LMU (Aguardando jogo abrir...): {e}")
                is_offline_printed = True
        
        await asyncio.sleep(0.5)

async def set_lmu_hud_visibility(visible: bool):
    """
    Toggles LMU native 'In-game panels' (HUD) via the broadcast web UI API.
    Used to keep the broadcast view clean.
    """
    try:
        # 1. Fetch current overlays state
        url = "http://localhost:6397/webdata/overlays"
        state_data = await async_fetch_json(url, method="GET")
        if not state_data or "ingamePanels" not in state_data:
            return False

        # 2. Modify visibility
        state_data["ingamePanels"]["visible"] = visible
        
        # 3. Post updated state back to LMU
        await async_fetch_json(url, method="POST", data=state_data)
        logging.info(f"[LMU HUD] Set In-game panels visibility to: {visible}")
        return True
    except Exception as e:
        logging.error(f"Error toggling LMU HUD: {e}")
        return False

async def is_in_replay_mode():
    """Checks if the simulator is currently in Replay Mode via REST API."""
    try:
        res = await async_fetch_json("http://localhost:6397/rest/replay/isActive", method="GET")
        if isinstance(res, dict) and "value" in res:
            return bool(res["value"])
        return bool(res)
    except Exception:
        return False

async def trigger_replay(seconds_back=15, slot_id=None):
    """Calculates target time and triggers the reliable jump sequence via API."""
    try:
        # Use Shared Memory directly for absolute current session time
        scor_data, _ = lmu.get_data()
        current_et = scor_data.scoringInfo.mCurrentET if scor_data else 0
        
        # Fallback to state or REST only as a last resort
        if current_et <= 0:
            current_et = state.shared_data.get("session", {}).get("currentTime", 0)
            if current_et <= 0:
                # Use the /watch/replaytime GET to find current view time
                res = await async_fetch_json("http://localhost:6397/rest/watch/replaytime", method="GET")
                current_et = float(res) if res is not None else 0

        target_time = current_et - seconds_back
        if target_time < 0: target_time = 0
        
        logging.info(f"[Replay] Calculating Jump: {current_et:.1f}s - {seconds_back}s = {target_time:.1f}s")
        
        # Force HUD hidden for manual replays
        await set_lmu_hud_visibility(False)
        return await jump_to_time(target_time, slot_id=slot_id)
    except Exception as e:
        logging.error(f"Error in trigger_replay: {e}")
        return False

async def ensure_replay_active(target_slot_id=None):
    """Enforces Replay Mode on the simulator to allow instant zero-flash jumps."""
    is_replay = await is_in_replay_mode()
    
    # If we are already viewing a historical replay (manually triggered), 
    # we don't want to force a jump to the Live tip.
    if state.overlay_state.get("replay_active"):
        return False

    if not is_replay:
        logging.info("[Replay] Simulator is in LIVE mode. Forcing Replay mode for pro synchronization...")
        await async_fetch_json("http://localhost:6397/rest/replay/toggleactive", method="POST")
        state.shared_data["replay_mode_enforced"] = True
        # Small delay to allow the simulator to switch context before the jump
        await asyncio.sleep(0.5)
    
    return True

    
async def trigger_live(silent=False, slot_id=None):
    """
    [V5 - GAMBIARRA 2.0]
    Returns to 'Live' by jumping to the tip of the Replay buffer, 
    but with a small offset to allow telemetry synchronization.
    """
    state.overlay_state["replay_active"] = False
    
    if not silent:
        # Resolve driver data for transition info
        standings = state.shared_data.get("standings", [])
        focused_driver = None
        if slot_id is not None:
            try:
                s_id = int(slot_id)
                for d in standings:
                    if d.get("SlotID") == s_id:
                        focused_driver = d
                        break
            except: pass
        
        if not focused_driver:
            for d in standings:
                if d.get("IsFocused"):
                    focused_driver = d
                    break
                    
        from broadcaster import broadcast_json
        await broadcast_json({
            "type": "live_transition",
            "driver": focused_driver,
            "overlay_state": state.overlay_state
        })
    
    try:
        # 1. Ensure we are in Replay Mode (The "Gambiarra" core)
        is_replay = await is_in_replay_mode()
        if not is_replay:
            logging.info("[Replay] Entering Replay Mode for stabilized Live feed...")
            await async_fetch_json("http://localhost:6397/rest/replay/toggleactive", method="POST")
            await asyncio.sleep(0.5)

        # 2. Get exact session time from Shared Memory
        scor_data, _ = lmu.get_data()
        current_et = scor_data.scoringInfo.mCurrentET if scor_data else 0
        
        if current_et <= 0:
            res = await async_fetch_json("http://localhost:6397/rest/watch/replaytime", method="GET")
            current_et = float(res) if res is not None else 0

        # 3. APPLY FOCUS & LATENCY OFFSET
        # We focus on the driver AND jump to a point slightly behind real-time.
        if slot_id is not None:
            await async_fetch_json(f"http://localhost:6397/rest/watch/focus/{slot_id}", method="PUT")
            
        target_time = round(current_et - state.BROADCAST_LATENCY_DELAY, 1)
        
        if target_time < 0: target_time = 0
            
        logging.info(f"[Replay] Syncing Focus (Slot {slot_id}) to Offset Live Tip: {target_time}s")

        # Perform the jump
        await async_fetch_json(f"http://localhost:6397/rest/watch/replaytime/{target_time}", method="PUT")
        
        # Ensure playback
        await async_fetch_json("http://localhost:6397/rest/watch/replayCommand/play", method="PUT")
        
        # Force HUD hidden
        await set_lmu_hud_visibility(False)
        return True
    except Exception as e:
        logging.error(f"Error in trigger_live: {e}")
        return False

async def jump_to_time(target_time, slot_id=None):
    """Jumps to a specific session time. Assumes Replay Mode is already active."""
    # MARK AS ACTIVE IMMEDIATELY! This signals the background sync to STOP pulling us to Live.
    state.overlay_state["replay_active"] = True
    
    try:
        target_time_rounded = round(target_time, 1)
        logging.info(f"[Replay] Instant Jump requested to {target_time_rounded}s")
        
        # Trigger Visual Transition in Overlay
        from broadcaster import broadcast_json
        
        # Resolve driver data for transition info (Prefer slot_id provided)
        driver_data = None
        standings = state.shared_data.get("standings", [])
        
        if slot_id is not None:
            try:
                s_id = int(slot_id) # Força a ser número
                for d in standings:
                    if d.get("SlotID") == s_id:
                        driver_data = d
                        break
            except: pass
            
        if not driver_data:
            # Fallback to current focus
            for d in standings:
                if d.get("IsFocused"):
                    driver_data = d
                    break
                    
        # AQUI TAMBÉM! APAGUE AS DUAS LINHAS ABAIXO SE AINDA EXISTIREM:
        # if not driver_data and standings:
        #     driver_data = standings[0]

        
        await broadcast_json({
            "type": "replay_transition",
            "driver": driver_data
        })

        # OPTIONAL: Keep a tiny sleep if frontend transition needs a moment to cover
        await asyncio.sleep(0.5)

        # 1. Focus
        focus_to_use = slot_id
        if focus_to_use is None:
            current_slot = await async_fetch_json("http://localhost:6397/rest/watch/focus", method="GET")
            if isinstance(current_slot, int) and current_slot >= 0:
                focus_to_use = current_slot
        
        if focus_to_use is not None:
            await async_fetch_json(f"http://localhost:6397/rest/watch/focus/{focus_to_use}", method="PUT")
            
        # 3. Set to TV camera with the PRO 'Magic String' (GROUP1/false)
        await async_fetch_json("http://localhost:6397/rest/watch/focus/SCV_TRACKSIDE/GROUP1/false", method="PUT")
        
        await asyncio.sleep(0.2)
        
        # 4. Trigger Replay API Time (Jumps back)
        log_info = await async_fetch_json(f"http://localhost:6397/rest/watch/replaytime/{target_time_rounded}", method="PUT")
        
        await asyncio.sleep(0.2)
        
        # 5. Resume Playback
        await async_fetch_json("http://localhost:6397/rest/watch/replayCommand/play", method="PUT")
        
        logging.info(f"[Replay] Ultimate Jump successful: {target_time_rounded}s | HTTP Result: {log_info}")
        
        return True
    except Exception as e:
        logging.error(f"[Replay] ERROR in ultimate jump sequence: {e}")
        return False

async def send_camera_key(cam_type, slot_id=None, skip_focus=False):
    """Sends REST API commands to LMU to change camera."""
    
    # 1. Focus Logic (REST)
    if not skip_focus and slot_id is not None:
        await async_fetch_json(f"http://localhost:6397/rest/watch/focus/{slot_id}", method="PUT")
        await asyncio.sleep(0.1)

    # 2. Camera Logic (API Only)
    try:
        # Standard mappings
        cam_urls = {
            "nose": "2/1/false",
            "chase": "3/1/true",
            "bonnet": "1/1/true",
            "trackside": "5/1/true",
            "tv": "4/1/true",
            
            # 6/1 is a cycle command to jump to the next onboard sub-camera
            "onboard_cycle": "6/1/true",
            
            # Legacy fallbacks
            "in": "2/1/true",
        }
        
        target_path = cam_urls.get(cam_type, "4/1/true")
        url = f"http://localhost:6397/rest/watch/focus/{target_path}"
            
        await async_fetch_json(url, method="PUT")
        logging.info(f"[Camera] REST Change to {cam_type} ({target_path}) successful.")
        return True
    except Exception as e:
        logging.error(f"[Camera] REST Change failed: {e}.")
        return False

async def refresh_lmu_skins():
    """Forces LMU to reload custom liveries (equivalent to Alt+F). discovered in V5 Swagger."""
    try:
        url = "http://localhost:6397/rest/materialeditor/liveryeditor/reloadCustomSkin"
        await async_fetch_json(url, method="POST")
        logging.info("[LMU Skins] Triggered global livery reload via REST API.")
        return True
    except Exception as e:
        logging.error(f"[LMU Skins] Failed to trigger livery reload: {e}")
        return False
        
lmu = LMUReader ()