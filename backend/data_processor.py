import asyncio
import json
import logging
import time
import os
import re
import math
from collections import deque

# --- FUNÇÃO DE TRADUÇÃO DE PNEUS (FORA DO LOOP PARA SALVAR CPU) ---
def get_short_name(n_str):
    if not n_str: return "?"
    
    # Se vier como bytes (direto da memória bruta), converte para string
    if isinstance(n_str, bytes):
        try:
            n_str = n_str.decode('utf-8', errors='ignore').strip('\x00')
        except:
            return "?"
            
    n_str = str(n_str).lower()
    
    # Pneus de Hypercar (As variações Quente/Frio que o TinyPedal lê)
    if "soft" in n_str and "cold" in n_str: return "SC"
    if "soft" in n_str and "hot" in n_str: return "SH"
    
    # Pneus Padrão (LMP2, GTE, GT3)
    if "soft" in n_str or "sft" in n_str: return "S"
    if "med" in n_str: return "M"
    if "hard" in n_str or "hrd" in n_str or "firm" in n_str: return "H"
    if "wet" in n_str or "rain" in n_str: return "W"
    
    return "?"

from utils import get_base_path, get_user_data_path, clean_driver_name, clean_team_name, normalize_class, get_slot_id_by_name
import state
from state import (metadata_update_event, update_event, car_image_cache, save_settings, load_driver_photos, TOWER_MODES, connected_clients)
from broadcaster import broadcast_json
from lmu_reader import lmu, async_fetch_json, trigger_replay, send_camera_key
from metadata_provider import MetadataProvider
import websockets

# Path to LMU Settings.JSON
LMU_SETTINGS_PATH = r"C:\Program Files (x86)\Steam\steamapps\common\Le Mans Ultimate\UserData\player\Settings.JSON"

# Metadata Provider instance
metadata_provider = MetadataProvider()
last_metadata_refresh = 0

def get_sec_status(last, pb, cb):
    """Returns the color status of a sector."""
    if last <= 0: return "NONE"
    if cb > 0 and last <= cb + 0.001: return "PURPLE"
    if pb > 0 and last <= pb + 0.001: return "GREEN"
    return "YELLOW"

def extract_car_number(rest_driver, v_name, v_file):
    """
    Robustly extracts the real car number from metadata.
    Prioritizes string parsing over API data because the API often returns 
    placeholders like '397' for custom skins.
    """
    # 1. Parse vehicleName (e.g. "... #007:LM") - Highly reliable when present
    if v_name and "#" in v_name:
        match = re.search(r'#(\d+)', v_name)
        if match:
            return match.group(1).lstrip('0') or "0"
            
    # 2. Parse vehicleFilename (e.g. "007_25_...") - Gold standard for custom skins
    if v_file:
        base_file = os.path.basename(v_file)
        match = re.match(r'^(\d+)_', base_file)
        if match:
            return match.group(1).lstrip('0') or "0"

    # 3. Try carNumber from REST API (Ignore 397 placeholder)
    num = rest_driver.get("carNumber") if rest_driver else ""
    if num and str(num).strip() and str(num) != "397":
        return str(num).lstrip('0') or "0"
    
    # 4. Try competitionNumber (Ignore 397 placeholder)
    num = rest_driver.get("competitionNumber") if rest_driver else ""
    if num and str(num).strip() and str(num) != "397":
        return str(num).lstrip('0') or "0"
        
    return "397" # Default if absolutely nothing else is found

async def process_client_command(data):
    """Processes incoming JSON commands from the WebSocket client."""
    try:
        logging.info(f"[WebSocket] Command: {data.get('action')} | Type: {data.get('cameraType')} | Slot: {data.get('slotID')}")
        
        if data.get("action") in ["camera", "camera_focus"]:
            driver_name = data.get("driverName")
            target_slot_id = data.get("slotID")
            cam_type = data.get("cameraType")
            
            try:
                # 1. Driver Focus Logic (Optional: only if target info provided)
                if target_slot_id is not None or driver_name:
                    tid = int(target_slot_id) if target_slot_id is not None else await get_slot_id_by_name(driver_name)
                    
                    if tid is not None and 0 <= tid < 104:
                        # [V5] Always trigger a jump to the Live tip in Broadcaster mode to ensure the new driver is synced
                        if state.shared_data.get("intelligent_replay_enabled") or state.overlay_state.get("replay_active"):
                            from lmu_reader import trigger_live
                            await trigger_live(slot_id=tid)
                            logging.info(f"[Focus] Broadcaster Sync - Jumping to Live Tip for Slot: {tid}")
                        else:
                            # Standard focus for live mode
                            await async_fetch_json(f"http://localhost:6397/rest/watch/focus/{tid}", method="PUT")
                        if driver_name: state.overlay_state["manualFocusDriver"] = driver_name
                        state.overlay_state["manualFocusSlot"] = tid
                        update_event.set()
                        target_slot_id = tid # Update for send_camera_key

                # 2. Camera Change Logic (Always executed if cam_type present)
                if cam_type:
                    logging.info(f"[Camera] Dispatching camera change: {cam_type} (Slot: {target_slot_id})")
                    await send_camera_key(cam_type, slot_id=target_slot_id, skip_focus=True)
                    
                    # Trigger Onboard Transition if switching to Onboard cam via Overlay Main Button
                    if cam_type == "in":
                        # Use persisted standings if available
                        standings = state.shared_data.get("standings", [])
                        driver_data = None
                        
                        # Priority 1: Current target slot
                        if target_slot_id is not None:
                            for d in standings:
                                if d.get("SlotID") == target_slot_id:
                                    driver_data = d
                                    break
                        
                        # Priority 2: Anyone marked focused
                        if not driver_data:
                            for d in standings:
                                if d.get("IsFocused"):
                                    driver_data = d
                                    break
                        
                        # Priority 3: First driver
                        if not driver_data and standings:
                            driver_data = standings[0]
                            
                        await broadcast_json({
                            "type": "onboard_transition",
                            "driver": driver_data
                        })
                        logging.info(f"[Onboard] Global camera command triggered transition for: {driver_data.get('Name') if driver_data else 'None'}")
            except Exception as e:
                logging.error(f"Error handling camera command: {e}")

        elif data.get("action") == "abbreviate_names_toggle":
            new_val = not state.overlay_state.get("abbreviateNames", False)
            state.overlay_state["abbreviateNames"] = new_val
            logging.info(f"Toggled Abbreviate Names: {new_val}")
            broadcast_overlay_state()

        elif data.get("action") == "overlay_toggle":
            overlay_key = data.get("key")
            if overlay_key in state.overlay_state:
                new_val = not state.overlay_state[overlay_key]
                state.overlay_state[overlay_key] = new_val
                
                # Mutual Exclusion Logic (Dashboard Sync)
                if new_val: # Only when turning ON
                    if overlay_key == "driverInfo":
                        state.overlay_state["qualifyInfo"] = False
                        state.overlay_state["oneVsOne"] = False
                        state.overlay_state["qualifySelectedSlots"] = []
                    elif overlay_key == "qualifyInfo":
                        state.overlay_state["driverInfo"] = False
                        state.overlay_state["oneVsOne"] = False
                    elif overlay_key == "oneVsOne":
                        state.overlay_state["driverInfo"] = False
                        state.overlay_state["qualifyInfo"] = False
                        state.overlay_state["qualifySelectedSlots"] = []
                    elif overlay_key == "resultsMode":
                        state.overlay_state["calendarInfo"] = False
                    elif overlay_key == "calendarInfo":
                        state.overlay_state["resultsMode"] = False
                else: # Turning OFF
                    if overlay_key == "qualifyInfo":
                        state.overlay_state["qualifySelectedSlots"] = []
                # Special Logic for Onboard Mode (Onboard Sync & Trackmap Auto-hide)
                if overlay_key == "onboardMode":
                    target_slot = state.overlay_state.get("manualFocusSlot", -1)
                    
                    if new_val: # Toggle ON
                        # 1. Store and Disable Trackmap
                        state.overlay_state["_trackmap_restore"] = state.overlay_state.get("trackMap", False)
                        state.overlay_state["trackMap"] = False

                        # 2. Switch Camera to Onboard
                        await send_camera_key("in", slot_id=target_slot, skip_focus=True)
                        
                        # 3. Trigger Transition Event
                        driver_data = None
                        standings = state.shared_data.get("standings", [])
                        
                        if target_slot != -1:
                            for d in standings:
                                if d.get("SlotID") == target_slot:
                                    driver_data = d
                                    break
                        
                        if not driver_data:
                            for d in standings:
                                if d.get("IsFocused"):
                                    driver_data = d
                                    break
                                    
                        if not driver_data and standings:
                            driver_data = standings[0]
                        
                        transition_payload = {
                            "type": "onboard_transition",
                            "driver": driver_data
                        }
                        await broadcast_json(transition_payload)
                        logging.info(f"[Onboard] ON BOARD mode activated: Hiding trackmap, switching cam and triggering transition.")
                    else: # Toggle OFF
                        # 1. Restore Trackmap
                        state.overlay_state["trackMap"] = state.overlay_state.get("_trackmap_restore", False)

                        # 2. Switch Camera back to TV
                        await send_camera_key("tv", slot_id=target_slot, skip_focus=True)
                        logging.info(f"[Onboard] ON BOARD mode deactivated: Restoring trackmap and switching back to TV cam.")

                save_settings()
                update_event.set()

        elif data.get("action") == "qualify_select_driver":
            try:
                slot_id_raw = data.get("slotID")
                if slot_id_raw is not None:
                    slot_id = int(slot_id_raw)
                    # Use a copy to avoid in-place reference issues
                    current_slots = list(state.overlay_state.get("qualifySelectedSlots", []))
                    
                    if slot_id in current_slots:
                        current_slots.remove(slot_id)
                        logging.info(f"[Qualify] Removed Slot {slot_id} from selection.")
                    else:
                        if len(current_slots) < 3:
                            current_slots.append(slot_id)
                            logging.info(f"[Qualify] Added Slot {slot_id} to selection. Total: {len(current_slots)}")
                        else:
                            logging.warning(f"[Qualify] Selection full (3). Ignoring Slot {slot_id}.")
                    
                    state.overlay_state["qualifySelectedSlots"] = current_slots
                    
                    # Auto-toggle Qualify Widget
                    should_be_on = len(current_slots) > 0
                    state.overlay_state["qualifyInfo"] = should_be_on
                    
                    # Mutual Exclusion: If Qualify is ON, turn OFF Driver Info and 1v1
                    if should_be_on:
                        state.overlay_state["driverInfo"] = False
                        state.overlay_state["oneVsOne"] = False
                    
                    save_settings()
                    update_event.set()
                await metadata_provider.refresh()
            except Exception as e:
                logging.error(f"[Qualify] Selection error: {e}")

        elif data.get("action") == "tower_mode":
            mode = data.get("mode", "GAP")
            state.overlay_state["towerMode"] = mode
            save_settings()
            update_event.set()

        elif data.get("action") == "class_focus":
            focused_class = data.get("class", "ALL")
            state.overlay_state["focusedClass"] = focused_class
            state.overlay_state["_lastChangeSource"] = data.get("source", "manual")
            
            # [FIX V2] Disable autoSwitchClass if a specific class is manually selected
            if focused_class != "ALL" and data.get("source") == "manual":
                state.overlay_state["autoSwitchClass"] = False
                logging.info(f"[Overlay] Manual Class Focus ({focused_class}) - Disabling AutoSwitchClass.")
                
            save_settings()
            update_event.set()

        elif data.get("action") == "trigger_replay":
            try:
                raw_secs = data.get("seconds_back")
                secs = int(raw_secs) if raw_secs is not None and str(raw_secs).strip() != "" else 15
            except:
                secs = 15
            
            slot_id = data.get("slot_id")
            logging.info(f"[Replay] Received request: -{secs}s back (Slot: {slot_id})")
            
            # --- IMMEDIATE FOCUS SYNC (Disable auto-live for the initial jump) ---
            if slot_id is not None and slot_id != -1:
                await process_client_command({"action": "camera_focus", "slotID": slot_id, "auto_live": False})
            await trigger_replay(secs, slot_id=slot_id)
        
        elif data.get("action") == "trigger_live":
            from lmu_reader import trigger_live
            await trigger_live()

        elif data.get("action") == "refresh_skins":
            from lmu_reader import refresh_lmu_skins
            await refresh_lmu_skins()

        elif data.get("action") == "trigger_replay_fixed":
            from lmu_reader import jump_to_time
            target_time = data.get("target_time")
            slot_id = data.get("slot_id")
            # --- IMMEDIATE FOCUS SYNC (Disable auto-live for the initial jump) ---
            if slot_id is not None and slot_id != -1:
                await process_client_command({"action": "camera_focus", "slotID": slot_id, "auto_live": False})
            if target_time is not None:
                await jump_to_time(target_time, slot_id=slot_id)

        elif data.get("action") == "auto_cycle":
            val = data.get("value", False)
            state.overlay_state["autoCycle"] = val
            save_settings()
            update_event.set()

        elif data.get("action") == "auto_cycle_time":
            val = data.get("value", 30)
            state.overlay_state["autoCycleTime"] = val
            save_settings()
            update_event.set()

        elif data.get("action") == "class_cycle":
            val = data.get("value", False)
            state.overlay_state["classCycle"] = val
            if val:
                state.overlay_state["_lastChangeSource"] = "auto"
            save_settings()
            update_event.set()

        elif data.get("action") == "class_cycle_time":
            val = data.get("value", 120)
            state.overlay_state["classCycleTime"] = val
            save_settings()
            update_event.set()

        elif data.get("action") == "clear_manual_focus":
            state.overlay_state["manualFocusSlot"] = -1
            state.overlay_state["manualFocusDriver"] = None
            save_settings()
            update_event.set()
            logging.info("[Focus] Manual Focus Cleared. System will now follow Game Focus.")

    except Exception as e:
        logging.error(f"Error processing client command: {e}")

async def update_car_image_cache(f_info):
    """Refined car image cache update logic."""
    import base64
    v_file = f_info.get("vehicleFilename", "")
    if not v_file: return
    
    car_image_cache["pending_file"] = v_file
    try:
        # Use filename as ID for car images in REST API
        filename = os.path.splitext(os.path.basename(v_file))[0]
        url = f"http://localhost:6397/rest/race/car/{filename}/image"
        # Since we don't have a direct image fetcher, let's assume it's available or use a placeholder
        # For now, we'll just store the fact that we have this mapping
        car_image_cache["v_file"] = v_file
        car_image_cache["b64"] = None 
    except Exception:
        pass
    finally:
        car_image_cache["pending_file"] = None

async def process_data_loop():
    """Main Game Loop 2Hz - Optimized for Concurrency"""
    global last_metadata_refresh
    last_json_reload = 0
    last_m_session = -1
    last_m_track = ""
    last_lap_counts = {} # Track laps per driver to trigger REST updates
    metadata_update_event.set() # Trigger initial fetch on startup
    sector_expiry_times = {} # [sector_num: timestamp] for persistent flags
    
    while True:
        try:
            if not await lmu.ensure_connected():
                # 4. Update Event (Settings saved in GUI)
                if update_event.is_set():
                    load_driver_photos(quiet=True)
                    update_event.clear()
                
                await asyncio.sleep(2.0)
                continue
                
            scor_data, tele_data = lmu.get_data()
            if not scor_data or not tele_data:
                # 4. Update Event (Settings saved in GUI)
                if update_event.is_set():
                    load_driver_photos(quiet=True)
                    update_event.clear()

                await asyncio.sleep(1.0)
                continue
            
            # --- DYNAMIC PLAYER DETECTION (CORRIGIDO: mIsPlayer Authoritative) ---
            player_slot_id = -1
            try:
                # We find the player slot ID during the scoring loop now.
                # But we still need the playerVehicleIdx for the fast telemetry loop fallback.
                pass 
            except Exception: pass
            
            # --- METADATA MAPPING REFRESH (Hybrid: API + External + Local) ---
            if time.time() - last_metadata_refresh > 30.0:
                metadata_provider.refresh()
                last_metadata_refresh = time.time()
            
            # --- SESSION & TRACK DETECTION ---
            m_session = scor_data.scoringInfo.mSession
            m_track = scor_data.scoringInfo.mTrackName.decode('utf-8', errors='ignore').strip('\x00')
            
            if m_session != last_m_session or m_track != last_m_track:
                is_new_track = m_track != last_m_track
                last_m_session = m_session
                last_m_track = m_track
                metadata_update_event.set()
                logging.info(f"Session/Track Change: {m_session} | Track: {m_track}")
                
                # Fetch fresh track map data from REST API if track changed
                if is_new_track:
                    try:
                        # Fetch track map coordinates (future-proof)
                        track_map_data = await async_fetch_json("http://localhost:6397/rest/watch/trackmap")
                        if track_map_data:
                            state.shared_data["track_points"] = track_map_data
                            logging.info(f"[TrackMap] Fetched {len(track_map_data)} points for {m_track}")
                            # Broadcast immediately to ensure map is ready
                            await broadcast_json({"type": "track_map_update", "points": track_map_data, "track": m_track})
                    except Exception as e:
                        logging.error(f"[TrackMap] Error fetching track map: {e}")

            # --- GLOBAL FLAGS DETECTION (PRO Parity - Proactive & Persistent) ---
            now = time.time()
            sector_flags = scor_data.scoringInfo.mSectorFlag
            
            # Map official flags to expiry times
            # [PRO FIX] Logic: Session is finished if GamePhase=8 OR the Overall Leader (Pos 1) has finished
            leader_finished = False
            # Iterate only over vehicles active in the session to avoid garbage data in empty slots
            for i in range(scor_data.scoringInfo.mNumVehicles):
                v = scor_data.vehScoringInfo[i]
                # LMU Shared Memory uses mPlace for current overall position
                if v.mPlace == 1 and v.mFinishStatus == 1: # 1 = Finished
                    leader_finished = True
                    break
            
            is_finished = bool(scor_data.scoringInfo.mGamePhase == 8 or leader_finished)

            # Map official flags to expiry times (LMU DEFINITIVE: S1=0, S2=1, S3=2)
            # PRO FIX: Clear and suppress yellow flags if session is finished
            if is_finished:
                sector_expiry_times.clear()
            else:
                if sector_flags[0] in [1, 2]: sector_expiry_times[1] = now + 4.0
                if sector_flags[1] in [1, 2]: sector_expiry_times[2] = now + 4.0
                if sector_flags[2] in [1, 2]: sector_expiry_times[3] = now + 4.0
            
            is_fcy = bool(scor_data.scoringInfo.mGamePhase == 6 or state.overlay_state.get("fcy", False))
            fcy_state = "ACTIVE" if state.overlay_state.get("fcy", False) else ""
            if scor_data.scoringInfo.mGamePhase == 6:
                try:
                    y_state = int.from_bytes(scor_data.scoringInfo.mYellowFlagState, byteorder='little', signed=True)
                    fcy_map = {0: "PENDING", 1: "PITS CLOSED", 2: "PIT LEAD LAP", 3: "PITS OPEN", 4: "LAST LAP", 5: "RESUME"}
                    fcy_state = fcy_map.get(y_state, "ACTIVE")
                except: fcy_state = "ACTIVE"
            
            # Green Flag Duration Logic (12s duration)
            is_green = False
            cur_phase = int(scor_data.scoringInfo.mGamePhase)
            fcy_now = bool(is_fcy) # is_fcy determined above in line 331
            
            # Use state for tracking transitions
            last_phase = state.shared_data.get("last_game_phase", -1)
            last_fcy = state.shared_data.get("last_fcy_active", False)
            
            # --- TRANSITION DETECTION ---
            # Condition 1: Phase transition to Racing (5) from anything else (except app start -1)
            is_new_green = (last_phase != -1 and last_phase != 5 and cur_phase == 5)
            # Condition 2: FCY was active and now it's not, while in Racing phase
            is_green_after_fcy = (last_fcy and not fcy_now and cur_phase == 5)
            
            if is_new_green or is_green_after_fcy:
                state.green_flag_start_et = now
                logging.info(f"--- GREEN FLAG TRIGGERED (New: {is_new_green}, After FCY: {is_green_after_fcy}) ---")

            # Show green for 12 seconds
            if hasattr(state, 'green_flag_start_et'):
                if now - getattr(state, 'green_flag_start_et', 0) < 12.0:
                    is_green = True
                else:
                    delattr(state, 'green_flag_start_et')
            
            # Update state for next loop
            state.shared_data["last_game_phase"] = cur_phase
            state.shared_data["last_fcy_active"] = fcy_now
            
            # --- REPLAY STATUS SYNC (Manual/Logical control only) ---
            # state.overlay_state["replay_active"] = await is_in_replay_mode() # REMOVED: Managed by jumps
            
            is_last_lap = False
            m_end_et = scor_data.scoringInfo.mEndET
            current_et = scor_data.scoringInfo.mCurrentET
            if m_end_et > 0 and (m_end_et - current_et) < 10.0 and m_end_et > current_et:
                is_last_lap = True
            
            # --- SUSPECT DETECTION SECTOR FIX ---
            # (Inside the vehicle loop, around line 440, I will update the mapping)

            
            # --- TELEMETRY MAPPING (CORRIGIDO: Proteção contra ID 0 Duplicado no Server) ---
            tele_map = {}
            for j in range(104):
                t_info = tele_data.telemInfo[j]
                veh_name = t_info.mVehicleName.decode('utf-8', errors='ignore').strip('\x00')
                
                if t_info.mID != -1:
                    # Mapeia primariamente por mID se for seguro
                    if t_info.mID != 0 or j == tele_data.playerVehicleIdx:
                        tele_map[str(t_info.mID)] = (t_info, j)
                
                # Segunda camada de segurança: string Exata mVehicleName
                if veh_name:
                    tele_map[veh_name] = (t_info, j)

            # Standings Loop
            standings = []
            suspect_drivers = [] 
            num_vehicles = scor_data.scoringInfo.mNumVehicles
            time_into_lap = current_et
            
            # Time String (HH:MM:SS)
            s_rem = scor_data.scoringInfo.mEndET - time_into_lap
            if s_rem < 0: s_rem = 0
            time_str = time.strftime('%H:%M:%S', time.gmtime(s_rem))
            
            # Session Type
            s_type_num = scor_data.scoringInfo.mSession
            sess_type = "RACE"
            if s_type_num < 4: sess_type = "PRACTICE"
            elif s_type_num < 10: sess_type = "QUALIFY"

            # --- DYNAMIC CLASS BEST SECTORS (PRO Parity) ---
            current_frame_class_bests = {}
            for i in range(num_vehicles):
                v_score_tmp = scor_data.vehScoringInfo[i]
                v_class_tmp = normalize_class(v_score_tmp.mVehicleClass.decode('utf-8', errors='ignore').strip('\x00'))
                
                # Standalone PBs
                pb_s1_tmp = v_score_tmp.mBestSector1 if v_score_tmp.mBestSector1 > 0 else 0
                pb_s2_raw_tmp = v_score_tmp.mBestSector2 if v_score_tmp.mBestSector2 > 0 else 0
                pb_s2_tmp = pb_s2_raw_tmp - pb_s1_tmp if pb_s2_raw_tmp > pb_s1_tmp else 0
                
                pb_s3_tmp = 0
                if v_score_tmp.mBestLapTime > pb_s2_raw_tmp and pb_s2_raw_tmp > 0:
                    pb_s3_tmp = v_score_tmp.mBestLapTime - pb_s2_raw_tmp

                best_lap_tmp = v_score_tmp.mBestLapTime if v_score_tmp.mBestLapTime > 0 else 0
                
                if v_class_tmp not in current_frame_class_bests:
                    current_frame_class_bests[v_class_tmp] = {"S1": 999.0, "S2": 999.0, "S3": 999.0, "Lap": 999.0}
                
                if 0 < pb_s1_tmp < current_frame_class_bests[v_class_tmp]["S1"]: current_frame_class_bests[v_class_tmp]["S1"] = pb_s1_tmp
                if 0 < pb_s2_tmp < current_frame_class_bests[v_class_tmp]["S2"]: current_frame_class_bests[v_class_tmp]["S2"] = pb_s2_tmp
                if 0 < pb_s3_tmp < current_frame_class_bests[v_class_tmp]["S3"]: current_frame_class_bests[v_class_tmp]["S3"] = pb_s3_tmp
                if 0 < best_lap_tmp < current_frame_class_bests[v_class_tmp]["Lap"]: current_frame_class_bests[v_class_tmp]["Lap"] = best_lap_tmp

            # Standings Loop
            # --- FOCUS DETERMINATION (Authoritative ID-based) ---
            # Priority: Manual Dash Click (ID) > API Game Focus (ID) > Player
            api_focused_slot = state.shared_data.get("api_focused_slot", -1)
            api_focused_time = state.shared_data.get("api_focused_time", 0)
            is_api_fresh = (time.time() - api_focused_time) < 12.0
            
            manual_focus_slot = state.overlay_state.get("manualFocusSlot", -1)
            
            final_focus_slot = -1
            if manual_focus_slot != -1:
                final_focus_slot = manual_focus_slot
            elif is_api_fresh and api_focused_slot != -1:
                final_focus_slot = api_focused_slot
            
            # If game focus matches manual selection, clear override to keep them synced
            if manual_focus_slot != -1 and is_api_fresh and api_focused_slot == manual_focus_slot:
                 state.overlay_state["manualFocusSlot"] = -1
                 state.overlay_state["manualFocusDriver"] = None

            state.shared_data["focused_slot_idx"] = -1
            # Keep clean_focus as fallback for legacy name-checks if needed, but logic is moving to ID
            manual_focus_name = state.overlay_state.get("manualFocusDriver")
            api_focused_name = state.shared_data.get("api_focused_name", "")
            final_focus_name = manual_focus_name if manual_focus_slot != -1 else (api_focused_name if is_api_fresh else None)
            clean_focus = clean_driver_name(final_focus_name).upper().strip() if final_focus_name else None

            # --- INCIDENT BUFFER ---
            new_impacts_this_frame = []
            
            for i in range(num_vehicles):
                v_score = scor_data.vehScoringInfo[i]
                v_class = normalize_class(v_score.mVehicleClass.decode('utf-8', errors='ignore').strip('\x00'))
                
                # --- [FIX] NOME DO PILOTO: Decodificação Strictly UTF-8 (Conforme solicitado) ---
                raw_name = v_score.mDriverName
                d_name_raw = raw_name.decode('utf-8', errors='ignore').strip('\x00')
                d_name = clean_driver_name(d_name_raw)
                
                # --- EXTRACT TEAM NAME ---
                sm_team_name = v_score.mVehicleName.decode('utf-8', errors='ignore').strip('\x00')
                
                # --- 1. BUSCA PADRÃO DE TELEMETRIA ---
                # Tentamos pela primary key (mID), se falhar, apelamos para a perfect match do nome do carro
                t_data_by_id = tele_map.get(str(v_score.mID))
                t_data_by_name = tele_map.get(sm_team_name)
                
                t_data = t_data_by_id or t_data_by_name
                v_tele, v_tele_idx = t_data if t_data else (None, -1)

                # --- 2. TRAVA DE SEGURANÇA PARA O SEU CARRO (PLAYER) ---
                is_player = bool(v_score.mIsPlayer) # ENGINE AUTHORITATIVE FLAG
                
                if is_player:
                    player_slot_id = int(v_score.mID)
                    
                    # Se não achamos v_tele pelo mapa de IDs, forçamos pelo playerVehicleIdx
                    if not v_tele:
                        try:
                            p_idx = tele_data.playerVehicleIdx
                            if 0 <= p_idx < 104:
                                v_tele = tele_data.telemInfo[p_idx]
                                v_tele_idx = p_idx
                        except Exception: pass

                # --- LÓGICA DE 4 RODAS (ESTILO TINYPEDAL) ---
                tyres_dict = {"FL": "?", "FR": "?", "RL": "?", "RR": "?"}
                
                if v_tele:
                    try:
                        # Pega as strings base dos eixos (seguro contra falhas de memória)
                        f_name = v_tele.mFrontTireCompoundName.decode('utf-8', errors='ignore').strip('\x00')
                        r_name = v_tele.mRearTireCompoundName.decode('utf-8', errors='ignore').strip('\x00')
                        
                        f_base = get_short_name(f_name)
                        r_base = get_short_name(r_name)

                        # Mapa de IDs numéricos internos (LMU Física Real)
                        id_map = {0: "S", 1: "M", 2: "H", 3: "W"}
                        
                        def get_wheel_compound(wheel_obj, fallback_letter):
                            # Se o wrapper (pyLMUSharedMemory) estiver atualizado, tenta ler a roda individual
                            if hasattr(wheel_obj, 'mCompoundType'):
                                return id_map.get(wheel_obj.mCompoundType, fallback_letter)
                            return fallback_letter

                        # Monta o dicionário testando cada roda
                        tyres_dict = {
                            "FL": get_wheel_compound(v_tele.mWheels[0], f_base),
                            "FR": get_wheel_compound(v_tele.mWheels[1], f_base),
                            "RL": get_wheel_compound(v_tele.mWheels[2], r_base),
                            "RR": get_wheel_compound(v_tele.mWheels[3], r_base)
                        }
                    except Exception as e:
                        # Se algo der errado na física da roda, usa a letra global do eixo
                        f_s = get_short_name(v_tele.mFrontTireCompoundName if hasattr(v_tele, 'mFrontTireCompoundName') else "")
                        r_s = get_short_name(v_tele.mRearTireCompoundName if hasattr(v_tele, 'mRearTireCompoundName') else "")
                        tyres_dict = {"FL": f_s, "FR": f_s, "RL": r_s, "RR": r_s}
                
                # --- [NOVO] FALLBACK PARA API REST (Se a memória falhar para carros distantes) ---
                rest_driver = state.rest_standings_data.get(int(v_score.mID))
                if tyres_dict["FL"] == "?" and rest_driver:
                    f_rest = get_short_name(rest_driver.get("frontTireCompound", ""))
                    r_rest = get_short_name(rest_driver.get("rearTireCompound", ""))
                    if f_rest != "?" or r_rest != "?":
                        tyres_dict = {"FL": f_rest, "FR": f_rest, "RL": r_rest, "RR": r_rest}
                
                speed_kph = 0
                front_tire = ""
                rear_tire = ""
                damage_dents = []
                is_detached = False
                has_detached_wheel = False

                if v_tele:
                    vx, vy, vz = v_tele.mLocalVel.x, v_tele.mLocalVel.y, v_tele.mLocalVel.z
                    speed_kph = math.sqrt(vx*vx + vy*vy + vz*vz) * 3.6
                    
                    try:
                        front_tire = v_tele.mFrontTireCompoundName.decode('utf-8', errors='ignore').strip('\x00')
                        rear_tire = v_tele.mRearTireCompoundName.decode('utf-8', errors='ignore').strip('\x00')
                    except: pass
                    
                    damage_dents = list(v_tele.mDentSeverity)
                    is_detached = bool(v_tele.mDetached)
                    
                    if hasattr(v_tele, 'mWheels'):
                        for w in v_tele.mWheels:
                            if hasattr(w, 'mDetached') and w.mDetached:
                                has_detached_wheel = True
                                break

                # --- NEW REST ID-BASED MANUFACTURER LOOKUP ---
                slot_id = str(v_score.mID)
                car_id = state.standings_slot_map.get(slot_id)
                veh_file = v_score.mVehFilename.decode('utf-8', errors='ignore').strip('\x00')
                clean_file = os.path.splitext(os.path.basename(veh_file))[0]
                
                # Try by car_id (REST-based)
                manufacturer = state.vehicle_metadata.get(car_id, "") if car_id else ""
                
                # Fallback 1: Try by Name Map (REST-based)
                if not manufacturer:
                    car_id_from_name = state.standings_name_map.get(d_name.lower())
                    if car_id_from_name:
                        manufacturer = state.vehicle_metadata.get(car_id_from_name, "")

                # Fallback 2: Try by Filename (Local-based)
                if not manufacturer:
                    manufacturer = state.vehicle_metadata.get(clean_file, "")
                
                if not manufacturer and i == 0:
                    logging.warning(f"[Logos] All mappings failed for {d_name}: slotID={slot_id}, carId={car_id}, file={clean_file}")

                # --- PIT & STATS LOGIC (PRO PARITY) ---
                is_in_pit_lane = bool(v_score.mInPits)
                is_in_garage = bool(v_score.mInGarageStall)
                rest_driver = state.rest_standings_data.get(slot_id)
                
                # [NEW] Track entry to start the timer
                if is_in_pit_lane and d_name not in state.shared_data["driver_pit_start_et"]:
                    state.shared_data["driver_pit_start_et"][d_name] = time_into_lap

                # Exit Debounce & Transition
                if not is_in_pit_lane and d_name in state.shared_data["driver_pit_start_et"]:
                    # Stay "In Pits" until we gain enough speed (28.8 km/h = 8.0 m/s)
                    # [PRO FIX] Don't stay in Pits if we are in Garage!
                    if speed_kph < 28.8 and not is_in_garage:
                        is_in_pit_lane = True
                    else:
                        # REAL EXIT: Save duration and start outlap tracker
                        pit_start_et = state.shared_data["driver_pit_start_et"].get(d_name, time_into_lap)
                        total_dur = time_into_lap - pit_start_et
                        state.shared_data["driver_pit_total_durations"][d_name] = total_dur
                        state.shared_data["driver_outlap_tracker"][d_name] = v_score.mTotalLaps
                        del state.shared_data["driver_pit_start_et"][d_name]

                # API state override
                # API state override (USAR APENAS SE SM FOR INCONCLUSIVO - EVITA DELAY)
                if rest_driver and not is_in_pit_lane and not is_in_garage:
                    api_pit_state = rest_driver.get("pitState", "NONE")
                    # Só forçamos "True" se o REST disser que está PARADO ou ENTRANDO, 
                    # mas nunca forçamos "True" se o SM já diz que você SAIU.
                    if api_pit_state in ["STOPPED", "PIT"]:
                        is_in_pit_lane = True
                    if api_pit_state == "GARAGE":
                        is_in_garage = True

                pit_timer_str = ""
                stat_string = ""

                # --- SUSPECT DETECTION (PRO Parity) ---
                # Match PRO: Speed < 30 km/h (approx 8.3 m/s) and NOT in pits/garage
                # [FINISH FIX] Only track suspects if session is NOT finished
                is_suspect = False
                in_paddock_or_pits = bool(is_in_garage or is_in_pit_lane)
                if not in_paddock_or_pits and speed_kph < 30.0 and v_score.mFinishStatus == 0 and not is_finished:
                    is_suspect = True
                    if d_name not in suspect_drivers:
                        suspect_drivers.append(d_name)
                    # Add sector to global warning for reactive banners (with 4s persistence)
                    # LMU Sector Mapping Fix: 1=S1, 2=S2, 0=S3
                    sm_sector = v_score.mSector
                    actual_display_sector = sm_sector if sm_sector != 0 else 3
                    sector_expiry_times[actual_display_sector] = time.time() + 4.0

                # Status string logic (Priority: DNF > GARAGE > REQ > PITS)
                if v_score.mFinishStatus == 2: 
                    stat_string = "DNF"
                elif is_in_garage:
                    stat_string = "GARAGE"
                elif v_score.mPitState == 1 or (rest_driver and rest_driver.get("pitState") == "REQUESTED"):
                    stat_string = "REQ"
                elif is_in_pit_lane:
                    # Timer logic
                    pit_entry_et = state.shared_data["driver_pit_start_et"].get(d_name, time_into_lap)
                    if d_name not in state.shared_data["driver_pit_start_et"]:
                        state.shared_data["driver_pit_start_et"][d_name] = time_into_lap
                    
                    elapsed = time_into_lap - pit_entry_et
                    pit_timer_str = f" ({round(elapsed, 1):.1f}s)"
                    
                    # Status detail from API (REST-based fallback)
                    api_state = rest_driver.get("pitState", "IN") if rest_driver else "IN"
                    
                    # [PRO REAL-TIME SYNC] Use Shared Memory for Zero Latency
                    sm_pit_state = int(v_score.mPitState)
                    if sm_pit_state == 4: api_state = "STOPPED"
                    elif sm_pit_state == 5: api_state = "EXITING"
                    elif sm_pit_state in [2, 3]: api_state = "ENTERING"
                    
                    # [PRO PARITY] BLOCK STALE API DATA: If we just entered (< 4.0s), ignore "EXITING"
                    if elapsed < 4.0 and api_state == "EXITING":
                        api_state = "ENTERING"

                    if api_state == "STOPPED": stat_string = f"PIT{pit_timer_str}"
                    elif api_state == "EXITING": stat_string = f"OUT{pit_timer_str}"
                    else: stat_string = f"IN{pit_timer_str}"
                    
                elif d_name in state.shared_data["driver_outlap_tracker"]:
                    # [FORMATION FIX] Suppress OUT LAP during formation lap in RACE
                    is_race_session = (sess_type == "RACE")
                    is_before_green = (cur_phase < 5)
                    
                    if is_race_session and is_before_green:
                        # Clear tracker if we are in formation lap to avoid it appearing immediately at start
                        del state.shared_data["driver_outlap_tracker"][d_name]
                        stat_string = ""
                    elif v_score.mTotalLaps == state.shared_data["driver_outlap_tracker"][d_name]:
                        duration = state.shared_data["driver_pit_total_durations"].get(d_name, 0)
                        stat_string = f"OUT LAP ({round(duration, 1):.1f}s)" if duration > 0 else "OUT LAP"
                    else:
                        # Outlap finished
                        del state.shared_data["driver_outlap_tracker"][d_name]
                        if d_name in state.shared_data["driver_pit_total_durations"]:
                            del state.shared_data["driver_pit_total_durations"][d_name]

                # --- LÓGICA DE COMBUSTÍVEL CENTRALIZADA (SINGLE SOURCE OF TRUTH) ---
                fuel_fraction = v_score.mFuelFraction / 255.0  # 0.0 a 1.0
                
                # Capacidade padrão por classe (Fonte única para Dash e Overlay)
                capacity = 1.0
                if v_tele and v_tele.mFuelCapacity > 0:
                    capacity = v_tele.mFuelCapacity
                else:
                    cls_f = v_score.mVehicleClass.decode('utf-8', errors='ignore').strip('\x00').upper()
                    if "GTE" in cls_f: capacity = 90.0
                    elif "LMP2" in cls_f: capacity = 75.0
                    elif "LMP3" in cls_f: capacity = 80.0
                    elif "HYP" in cls_f or "HYPERCAR" in cls_f: capacity = 110.0
                    else: capacity = 100.0

                fuel_liters = fuel_fraction * capacity
                
                # --- [NOVO] FALLBACK FUEL DA API REST ---
                if (fuel_liters <= 0.1 or not v_tele) and rest_driver:
                     rest_fuel = rest_driver.get("fuel", 0)
                     if rest_fuel > 0:
                         fuel_liters = float(rest_fuel)
                         fuel_fraction = fuel_liters / capacity if capacity > 0 else 0
                
                # --- ENERGY / FUEL LOGIC (SEPARADO E PURO) ---
                if v_tele:
                    # Hypercars: Lê diretamente a Energia Virtual (0.0 a 1.0) e converte para %
                    ve_value = getattr(v_tele, 'mVirtualEnergy', 0.0)
                    if ve_value <= 0.0:
                        ve_value = fuel_fraction
                    
                    # SoC e Regen (Bateria do Hypercar)
                    # Usamos a nova mStateOfCharge nativa que fornece a bateria % exata (0-100), fallback para fraction
                    soc_value = getattr(v_tele, 'mStateOfCharge', 0.0) 
                    if soc_value == 0:
                        soc_value = getattr(v_tele, 'mBatteryChargeFraction', 0.0) * 100.0
                    regen_value = getattr(v_tele, 'mRegen', 0.0)
                else:
                    ve_value = 0.0
                    soc_value = 0.0
                    regen_value = 0.0

                # --- INCIDENT DETECTION (Contact & Overtakes) ---
                slot_id = v_score.mID
                cls_lower = v_class.lower()
                driver_sector_num = v_score.mSector + 1 # 1-indexed sector

                # 1. Contact Detection (PRE-PROCESS)
                last_et = state.last_impacts.get(slot_id, 0.0)
                curr_impact_et = v_tele.mLastImpactET if v_tele else 0.0
                
                # --- HYBRID DENT TRACKING ---
                last_dent_sum = state.last_damage_state.get(slot_id, 0.0)
                curr_dent_sum = sum(damage_dents) if damage_dents else 0.0
                
                # Check 1: Physical collision string with sensible 20.0 network threshold
                impact_mag = v_tele.mLastImpactMagnitude if v_tele else 0.0
                has_impact_event = (impact_mag > 20.0) and (curr_impact_et > last_et + 0.1)
                
                # Check 2: Visual panel dent calculation (Hybrid approach)
                # Prevents a single dent from repeating via +0.01 threshold
                has_dent_event = (curr_dent_sum > last_dent_sum + 0.01)
                
                state.last_damage_state[slot_id] = curr_dent_sum
                state.last_impacts[slot_id] = curr_impact_et

                if has_impact_event or has_dent_event:
                    # Provide an ET for the pairing system
                    trigger_et = curr_impact_et if has_impact_event else scor_data.scoringInfo.mCurrentET
                    
                    new_impacts_this_frame.append({
                        "type": "Possible Contact",
                        "driverA": d_name,
                        "slotA": int(v_score.mID),
                        "driverB": "Unknown", 
                        "slotB": -1,
                        "lap": v_score.mTotalLaps,
                        "sector": driver_sector_num,
                        "time": scor_data.scoringInfo.mCurrentET,
                        "timestamp": trigger_et,
                        "magnitude": impact_mag if has_impact_event else 999.0, # Visual dmg maxes log
                        "cls": f"cls-{cls_lower}"
                    })
                    cause = "Sensor" if has_impact_event else "Lataria"
                    logging.info(f"[Incidents] Impact potential detected ({cause}): {d_name} | Mag/Danos: {impact_mag:.1f}/{curr_dent_sum:.2f}")

                # 2. Overtake Detection
                prev_pos = state.last_positions.get(d_name)
                curr_pos = v_score.mPlace
                if prev_pos is not None and curr_pos < prev_pos and curr_pos > 0:
                     # Overtake! (Position improved)
                     # Only log if it's a real position change (not just someone pitting)
                     if not is_in_pit_lane and not is_in_garage and v_score.mTotalLaps > 0 and sess_type == "RACE":
                        ov_incident = {
                            "type": "Overtake",
                            "driverA": d_name,
                            "slotA": int(v_score.mID),
                            "driverB": "Pos Change",
                            "lap": v_score.mTotalLaps,
                            "sector": driver_sector_num,
                            "time": scor_data.scoringInfo.mCurrentET,
                            "cls": f"cls-{cls_lower} overtake-item"
                        }
                        # Check if we already logged this recently to avoid flicker
                        # (Simple de-bounce: don't log same driver in same lap/sector twice for same type)
                        last_inc = state.shared_data["incidents"][0] if state.shared_data["incidents"] else None
                        if not last_inc or not (last_inc["driverA"] == d_name and last_inc["type"] == "Overtake" and last_inc["lap"] == v_score.mTotalLaps):
                            state.shared_data["incidents"].insert(0, ov_incident)
                            if len(state.shared_data["incidents"]) > 30:
                                state.shared_data["incidents"].pop()

                state.last_positions[d_name] = curr_pos

                # 3. ADVANCED Yellow Flag Detection (Improved for Local Yellows)
                was_under_yellow = state.shared_data["driver_yellow_active"].get(d_name, False)
                
                # Check 1: FCY (Full Course Yellow)
                fcy_active = bool(v_score.mUnderYellow)
                
                # Check 2: Individual Yellow Flag state from the engine
                # Phase 10 is usually assigned to cars experiencing/causing a local yellow
                individual_yellow = bool(v_score.mIndividualPhase == 10)
                
                # Check 3: Local Sector Yellow + Dangerous Speed
                # If a sector is yellow and this car is slow (spinning/stopped), it's the probable cause
                sector_idx = int(v_score.mSector)
                sector_yellow = False
                if 0 <= sector_idx < 3:
                    sector_yellow = bool(scor_data.scoringInfo.mSectorFlag[sector_idx])
                
                is_slow_on_track = (speed_kph < 40.0) and not is_in_pit_lane and not is_in_garage and v_score.mTotalLaps > 0
                
                # FINAL TRIGGER: Combined logic to catch spins that don't trigger FCY
                is_under_yellow = fcy_active or individual_yellow or (sector_yellow and is_slow_on_track)

                if is_under_yellow and not was_under_yellow:
                    # Trigger Yellow Flag Incident
                    yf_incident = {
                        "type": "Yellow Flag",
                        "driverA": d_name,
                        "slotA": int(v_score.mID),
                        "driverB": "Yellow Zone",
                        "lap": v_score.mTotalLaps,
                        "sector": driver_sector_num,
                        "time": scor_data.scoringInfo.mCurrentET,
                        "cls": f"cls-{cls_lower} yellow-flag-item"
                    }
                    state.shared_data["incidents"].insert(0, yf_incident)
                    if len(state.shared_data["incidents"]) > 30:
                        state.shared_data["incidents"].pop()
                    state.shared_data["driver_yellow_active"][d_name] = True
                    logging.info(f"[Incidents] Yellow Flag for {d_name} (Type: FCY:{fcy_active}/Ind:{individual_yellow}/Sec:{sector_yellow})")
                elif not is_under_yellow and was_under_yellow:
                    state.shared_data["driver_yellow_active"][d_name] = False

                # --- STATUS & FOCUS (Restore PRO Parity) ---
                is_pit_requested = bool(v_score.mPitState == 1)
                
                # Identify if this is the local player's car
                is_player = bool(player_slot_id != -1 and v_score.mID == player_slot_id)

                # [PRO FOCUS] Resolve focus priority
                is_focused = False
                is_broadcaster = (state.overlay_state.get("guiMode") == "broadcast")
                
                if final_focus_slot != -1:
                    if v_score.mID == final_focus_slot:
                        is_focused = True
                elif clean_focus:
                    # Fallback to driver name match
                    if d_name.upper().strip() == clean_focus:
                        is_focused = True
                else:
                    # Only fallback to player if NOT in broadcaster mode
                    # Broadcasters are spectators, they usually aren't looking at their own 'spectator' car
                    is_focused = is_player and not is_broadcaster
                    
                if is_focused:
                    state.shared_data["focused_slot_idx"] = v_tele_idx
                    state.shared_data["focused_scoring_idx"] = i if (v_score.mID != 0 or v_score.mVehicleName.decode('utf-8').strip('\x00') == state.shared_data.get("focused_veh_name")) else -1
                    
                    if d_name:
                        state.shared_data["api_focused_name"] = d_name
                    state.shared_data["focused_ve"] = ve_value
                    state.shared_data["focused_telem_idx"] = v_tele_idx
                    # [V2.1] Persist metadata for high-frequency telemetry loop
                    state.shared_data["focused_class"] = v_class
                    state.shared_data["focused_fuel_cap"] = capacity
                    state.shared_data["focused_veh_name"] = v_score.mVehicleName.decode('utf-8').strip('\x00')

                # --- CAR NUMBER EXTRACTION ---
                car_number = extract_car_number(rest_driver, v_score.mVehicleName.decode('utf-8').strip('\x00'), veh_file)

                # --- TEAM NAME EXTRACTION (REST API > SHARED MEMORY) ---
                final_team_name = ""
                real_meta = metadata_provider.get_metadata(d_name)
                
                if real_meta:
                    # 1. Team Name from REST API
                    final_team_name = real_meta.get("teamName")
                    # 2. Nationality & Car Number
                    nationality = real_meta.get("nationality") or nationality
                    if car_number == "397" or not car_number:
                        car_number = real_meta.get("carNumber") or car_number

                # 3. Fallback to Shared Memory
                if not final_team_name or "Custom Team" in final_team_name or "GROUP" in final_team_name.upper():
                    # Check if SM name is better than a placeholder
                    is_sm_placeholder = (not sm_team_name or "#" in sm_team_name or "GROUP" in sm_team_name.upper())
                    if not is_sm_placeholder or not final_team_name:
                        final_team_name = sm_team_name if sm_team_name else final_team_name

                # Final standardized cleaning (Remove years, #Number, etc.)
                sm_team_name = clean_team_name(final_team_name)

                # --- SECTOR & QUALY DATA ---
                # S2 from Shared Memory is Cumulative (S1 + S2)
                cur_s1 = v_score.mCurSector1 if v_score.mCurSector1 > 0 else 0
                cur_s2_raw = v_score.mCurSector2 if v_score.mCurSector2 > 0 else 0
                cur_s2 = cur_s2_raw - cur_s1 if cur_s2_raw > cur_s1 else 0
                
                # Last Lap Sectors (also cumulative for S2)
                last_s1 = v_score.mLastSector1 if v_score.mLastSector1 > 0 else 0
                last_s2_raw = v_score.mLastSector2 if v_score.mLastSector2 > 0 else 0
                last_s2 = last_s2_raw - last_s1 if last_s2_raw > last_s1 else 0
                last_lap = v_score.mLastLapTime if v_score.mLastLapTime > 0 else 0
                last_s3 = last_lap - last_s2_raw if last_lap > last_s2_raw else 0

                # PB Sectors (Cumulative in LMU Shared Memory, same as Cur/Last)
                pb_s1 = v_score.mBestSector1 if v_score.mBestSector1 > 0 else 0
                pb_s2_raw = v_score.mBestSector2 if v_score.mBestSector2 > 0 else 0
                pb_s2 = pb_s2_raw - pb_s1 if pb_s2_raw > pb_s1 else 0
                
                pb_s3 = 0
                if v_score.mBestLapTime > pb_s2_raw and pb_s2_raw > 0:
                    pb_s3 = v_score.mBestLapTime - pb_s2_raw

                # Class Best Logic (Dynamic computation per frame for strict consistency)
                cb_s1 = current_frame_class_bests.get(v_class, {}).get("S1", 0.0)
                cb_s2 = current_frame_class_bests.get(v_class, {}).get("S2", 0.0)
                cb_s3 = current_frame_class_bests.get(v_class, {}).get("S3", 0.0)
                
                if cb_s1 == 999.0: cb_s1 = 0.0
                if cb_s2 == 999.0: cb_s2 = 0.0
                if cb_s3 == 999.0: cb_s3 = 0.0

                # Class Best Lap logic
                class_best_lap = current_frame_class_bests.get(v_class, {}).get("Lap", 999.0)
                is_class_best = (v_score.mBestLapTime > 0 and v_score.mBestLapTime <= class_best_lap + 0.0001)

                # --- SISTEMA DE FOTOS (DUPLA CAMADA) ---
                custom_photo = state.shared_data.get("driver_photos", {}).get(d_name, "")
                
                if custom_photo:
                    # 1. Foto customizada do narrador (GUI / AppData) - Normalmente PNG/JPG
                    final_photo = custom_photo 
                else:
                    # 2. Puxa do servidor nativo do LMU!
                    import urllib.parse
                    # Transforma espaços e acentos em minúsculo e formato de link com underscore (V3 Style)
                    safe_name_v3 = urllib.parse.quote(d_name.lower().replace(' ', '_'))
                    
                    # Usa a extensão .webp oficial do jogo (Alinhado com novo padrão JS)
                    final_photo = f"http://localhost:6397/start/images/drivers/{safe_name_v3}.webp"

                # --- TRACK DATA FOR POST-PROCESSING ---
                
                # 1. Puxamos a "gaveta" com os dados do espião para este piloto
                ws_info = state.lmu_ws_data.get(int(v_score.mID), {})
                
                # 2. Substitui as variáveis antigas pelas perfeitas do espião (se existirem)
                real_car_number = ws_info.get("carNumber") or car_number
                real_team_name = ws_info.get("fullTeamName") or sm_team_name

                # --- SECTOR STATUS & DELTA (NEW) ---
                s1_status = "NONE"
                s2_status = "NONE"
                s3_status = "NONE"
                delta = 0.0

                # Determine which status to show based on current sector
                # Mapping: 1=S1, 2=S2, 0=S3
                if v_score.mSector == 1: # In S1
                    # During S1, we show last lap's whole results for persistence
                    s1_status = get_sec_status(last_s1, pb_s1, cb_s1)
                    s2_status = get_sec_status(last_s2, pb_s2, cb_s2)
                    s3_status = get_sec_status(last_s3, pb_s3, cb_s3)
                    if v_score.mTotalLaps > 0:
                        delta = v_score.mLastLapTime - v_score.mBestLapTime if v_score.mBestLapTime > 0 else 0.0
                elif v_score.mSector == 2: # In S2
                    s1_status = get_sec_status(cur_s1, pb_s1, cb_s1)
                    delta = cur_s1 - pb_s1 if pb_s1 > 0 else 0.0
                elif v_score.mSector == 0: # In S3
                    s1_status = get_sec_status(cur_s1, pb_s1, cb_s1)
                    s2_status = get_sec_status(cur_s2, pb_s2, cb_s2)
                    delta = cur_s2_raw - (pb_s1 + pb_s2) if (pb_s1 > 0 and pb_s2_raw > 0) else 0.0

                # --- POSITIONS GAINED/LOST ---
                pos_change = 0
                if sess_type == "RACE" and v_score.mQualification > 0:
                    pos_change = int(v_score.mQualification) - int(v_score.mPlace)

                entry = {
                    "DriverName": d_name,
                    "PosChange": pos_change,
                    "StartPosOverall": int(v_score.mQualification),
                    "DriverPhoto": final_photo,
                    "Class": v_class,
                    "Tyres": tyres_dict,
                    "Position": v_score.mPlace,
                    "ClassPosition": 0,
                    "Laps": v_score.mTotalLaps + 1,
                    "LastLapTime": v_score.mLastLapTime,
                    "BestLapTime": v_score.mBestLapTime,
                    # Raw values for secondary calculation
                    "_mTimeBehindLeader": v_score.mTimeBehindLeader,
                    "_mLapsBehindLeader": int(v_score.mLapsBehindLeader),
                    "_mTimeBehindNext": v_score.mTimeBehindNext,
                    "_mLapsBehindNext": int(v_score.mLapsBehindNext),
                    "Gap": "", # To be filled after sorting
                    "Interval": "",
                    "InPits": is_in_pit_lane,
                    "InGarage": is_in_garage,
                    "NumStops": v_score.mNumPitstops,
                    "SlotID": v_score.mID,
                    "CarNumber": real_car_number,
                    "VirtualEnergy": float(ve_value),
                    "FuelLiters": round(float(fuel_liters), 1),
                    "TeamName": real_team_name,     # <--- AQUI ESTÁ A MUDANÇA
                    "CarName": v_score.mVehicleName.decode('utf-8').strip('\x00'),
                    "vehicleFilename": veh_file,
                    "Manufacturer": manufacturer,
                    "IsInvalidLap": bool(getattr(v_tele, 'mLapInvalidated', v_score.mCountLapFlag == 0)) if v_tele else bool(v_score.mCountLapFlag == 0),
                    "SoC": float(soc_value),

                    "Regen": float(regen_value),
                    
                    # New Electronics, Gaps, and Assists
                    "ABSActive": bool(getattr(v_tele, 'mABSActive', False)) if v_tele else False,
                    "TCActive": bool(getattr(v_tele, 'mTCActive', False)) if v_tele else False,
                    "AbsLevel": int(getattr(v_tele, 'mABS', 0)) if v_tele else 0,
                    "TcLevel": int(getattr(v_tele, 'mTC', 0)) if v_tele else 0,
                    "OptimalTemp": float(getattr(v_tele.mWheels[0], 'mOptimalTemp', 90.0)) if v_tele and hasattr(v_tele, 'mWheels') else 90.0,
                    "FrontTire": front_tire,
                    "RearTire": rear_tire,
                    "SpeedKPH": speed_kph,
                    # Usamos a nova mSpeedLimiterActive se disponivel
                    "IsLimiterOn": bool(getattr(v_tele, 'mSpeedLimiterActive', getattr(v_tele, 'mSpeedLimiter', False))) if v_tele else False,
                    "Stats": stat_string,
                    "PitRequested": is_pit_requested,
                    "IsInPits": bool(is_in_pit_lane or is_in_garage),
                    "IsFocused": is_focused,
                    "IsPlayer": is_player, # ADICIONADO PARA DEBUG FRONTPAGE
                    "IsClassBestLap": is_class_best,
                    "IsSuspect": bool(d_name in suspect_drivers),
                    "IsFinished": bool(v_score.mFinishStatus == 1),
                    "Penalties": int(v_score.mNumPenalties),
                    "FinishStatus": int(v_score.mFinishStatus),
                    # Sector Data
                    "CurS1": cur_s1,
                    "CurS2": cur_s2,
                    "LastLapS1": last_s1,
                    "LastLapS2": last_s2,
                    "LastLapS3": last_s3,
                    "PersBestS1": pb_s1,
                    "PersBestS2": pb_s2,
                    "PersBestS3": pb_s3,
                    "ClassBestS3": cb_s3,
                    "S1Status": s1_status,
                    "S2Status": s2_status,
                    "S3Status": s3_status,
                    "Delta": delta,
                    "CurSectorIdx": int(v_score.mSector),
                    "TimeIntoLap": float(v_score.mTimeIntoLap),
                    # [V1.3 Raw Gaps]
                    "RawGapToAhead": abs(float(v_tele.mTimeGapCarAhead)) if v_tele else 0,
                    "RawGapToPlaceAhead": abs(float(v_tele.mTimeGapPlaceAhead)) if v_tele else 0,
                    # Damage and State
                    "DamageDents": damage_dents,
                    "IsDetached": is_detached,
                    "HasDetachedWheel": has_detached_wheel,
                    "worldX": float(v_score.mPos.x),
                    "worldZ": float(v_score.mPos.z)
                }
                standings.append(entry)

            # --- POST-PROCESS INCIDENTS (Pairing logic) ---
            if new_impacts_this_frame:
                paired_slots = set()
                for idx, incA in enumerate(new_impacts_this_frame):
                    if incA["slotA"] in paired_slots: continue
                    
                    # Look for a partner in this frame with matching timestamp
                    for j in range(idx + 1, len(new_impacts_this_frame)):
                        incB = new_impacts_this_frame[j]
                        if incB["slotA"] in paired_slots: continue
                        
                        # Timestamp match (0.05s tolerance for async differences)
                        if abs(incA["timestamp"] - incB["timestamp"]) < 0.05:
                            incA["driverB"] = incB["driverA"]
                            incA["slotB"] = incB["slotA"]
                            incB["driverB"] = incA["driverA"]
                            incB["slotB"] = incA["slotA"]
                            paired_slots.add(incA["slotA"])
                            paired_slots.add(incB["slotA"])
                            logging.info(f"[Incidents] PAIRED CONTACT: {incA['driverA']} & {incB['driverA']}")
                            break
                    
                    # Add to global list (Always prioritize A, the pairing updates both but A remains the primary entry)
                    state.shared_data["incidents"].insert(0, incA)
                    if len(state.shared_data["incidents"]) > 30:
                        state.shared_data["incidents"].pop()

            # --- POST-PROCESS STANDINGS ---
            # 1. Group by Class
            classes = {}
            for d in standings:
                cls = d["Class"]
                if cls not in classes: classes[cls] = []
                classes[cls].append(d)
            # Build positional gaps dictionary using only the official SCORING ENGINE gaps. 
            # We must ignore live telemetry (RawGapToAhead) because it points to the physical traffic car, not the scoring car!
            overall_time_gaps = {}
            for d in standings:
                if d["Position"] > 0:
                    overall_time_gaps[int(d["Position"])] = float(d.get("_mTimeBehindNext", -1.0))
            
            overall_laps_gaps = { int(d["Position"]): int(d.get("_mLapsBehindNext", 0)) for d in standings if d["Position"] > 0 }
            
            def get_time_gap_between(pos_behind, pos_ahead):
                pb = int(pos_behind)
                pa = int(pos_ahead)
                if pb <= pa or pa <= 0: return -1.0
                total = 0.0
                for p in range(pa + 1, pb + 1):
                    val = overall_time_gaps.get(p, -1.0)
                    if val < 0: return -1.0 # Incomplete chain
                    total += val
                return total

            def get_laps_gap_between(pos_behind, pos_ahead):
                pb = int(pos_behind)
                pa = int(pos_ahead)
                if pb <= pa or pa <= 0: return 0
                total = 0
                for p in range(pa + 1, pb + 1):
                    total += overall_laps_gaps.get(p, 0)
                return total

            for cls, drivers in classes.items():
                
                # --- CALCULATE CLASS STARTING GRID ---
                # Sort drivers by their starting grid position (StartPosOverall) to find out their initial class rank.
                qualified_drivers = [d for d in drivers if d.get("StartPosOverall", 0) > 0]
                qualified_drivers.sort(key=lambda x: x["StartPosOverall"])
                start_ranks = { d["SlotID"]: i+1 for i, d in enumerate(qualified_drivers) }
                
                # 2. Sort within Class and Calculate Gaps (V1.3 Raw Logic)
                drivers.sort(key=lambda x: (x["Position"] if x["Position"] > 0 else 999, x["SlotID"]))
                is_race = sess_type == "RACE"
                for idx, d in enumerate(drivers):
                    d["ClassPosition"] = idx + 1
                    
                    if is_race and d.get("SlotID") in start_ranks:
                        d["PosChange"] = start_ranks[d["SlotID"]] - d["ClassPosition"]
                    else:
                        d["PosChange"] = 0
                    
                    if not is_race:
                        # --- PRACTICE / QUALIFY (Class Best Lap Diff) ---
                        class_leader_best = drivers[0]["BestLapTime"] if drivers else 0
                        if d["BestLapTime"] > 0:
                            if class_leader_best > 0:
                                d["Gap"] = f"+{d['BestLapTime'] - class_leader_best:.3f}"
                            else: d["Gap"] = "---"
                            
                            # Fallback to lap time diff
                            d_ahead = drivers[idx-1] if idx > 0 else None
                            if d_ahead and d_ahead["BestLapTime"] > 0:
                                d["Interval"] = f"+{d['BestLapTime'] - d_ahead['BestLapTime']:.3f}"
                            else: d["Interval"] = "---"
                        else:
                            d["Gap"] = "---"
                            d["Interval"] = "---"
                    else:
                        # --- RACE MODE (CLASS GAPS & INTERVALS) ---
                        if idx == 0:
                            # 1. Class Leader
                            d["Gap"] = "LEADER"
                            d["Interval"] = "LEADER"
                            d["IntervalValue"] = 999
                        else:
                            class_leader = drivers[0]
                            d_ahead = drivers[idx-1]
                            
                            # ---- GAP TO CLASS LEADER ----
                            laps_diff = get_laps_gap_between(d.get("Position", 0), class_leader.get("Position", 0))
                            
                            if laps_diff > 0:
                                d["Gap"] = f"+{laps_diff} LAP" if laps_diff == 1 else f"+{laps_diff} LAPS"
                            else:
                                time_diff = get_time_gap_between(d.get("Position", 0), class_leader.get("Position", 0))
                                if time_diff >= 0:
                                    d["Gap"] = f"+{time_diff:.3f}"
                                else:
                                    d["Gap"] = "---"

                            # ---- INTERVAL TO CLASS AHEAD ----
                            laps_diff_int = get_laps_gap_between(d.get("Position", 0), d_ahead.get("Position", 0))
                            
                            if laps_diff_int > 0:
                                d["Interval"] = f"+{laps_diff_int} LAP" if laps_diff_int == 1 else f"+{laps_diff_int} LAPS"
                                d["IntervalValue"] = 999
                            else:
                                time_diff_int = get_time_gap_between(d.get("Position", 0), d_ahead.get("Position", 0))
                                if time_diff_int >= 0:
                                    d["Interval"] = f"+{time_diff_int:.3f}"
                                    d["IntervalValue"] = time_diff_int
                                else:
                                    d["Interval"] = "---"
                                    d["IntervalValue"] = 999

                    # Battle Highlight Value
                    if "IntervalValue" not in d:
                        d["IntervalValue"] = 999
            
            # 3. Detect Eminent Battles & Active 1v1 Focus (PRO Parity)
            battles = []
            one_vs_one_data = None
            
            for cls, drivers in classes.items():
                for idx, d in enumerate(drivers):
                    # Battle Detection (Sidebar List)
                    if idx > 0:
                        try:
                            # Parse Interval if numeric (string checks needed due to "---")
                            int_str = d.get("Interval", "---").replace("+", "").split(" ")[0]
                            gap_val = float(int_str) if int_str.replace(".", "").isdigit() else 999
                            
                            if 0 < gap_val < 2.0:
                                battles.append({
                                    "class": cls,
                                    "gap": d.get("Interval"),
                                    "attacker": d.get("DriverName"),
                                    "attackerPos": d.get("ClassPosition"),
                                    "defender": drivers[idx-1].get("DriverName"),
                                    "defenderPos": drivers[idx-1].get("ClassPosition")
                                })
                        except: pass
                    
                    # Manage Active 1v1 Widget Data
                    if d.get("IsFocused"):
                        # If focused, compare with car ahead (or behind if Leader)
                        rival = None
                        if idx > 0: rival = drivers[idx-1]
                        elif len(drivers) > 1: rival = drivers[idx+1]
                        
                        if rival:
                            one_vs_one_data = {
                                "driverA": d,
                                "driverB": rival,
                                "gap": d.get("Interval") if idx > 0 else rival.get("Interval")
                            }
            
            # --- FINAL SORTING BY CLASS PRIORITY ---
            class_order = ["HYPERCAR", "LMP2", "LMP3", "GTE", "LMGT3"]
            def get_cls_priority(c):
                c_up = str(c).upper()
                for i, pref in enumerate(class_order):
                    if pref in c_up: return i
                return 99
            
            # Reconstruct standings in prioritized order
            prioritized_standings = []
            sorted_class_names = sorted(classes.keys(), key=get_cls_priority)
            for cls_name in sorted_class_names:
                for d in classes[cls_name]:
                    # Clean up temporary fields safely here
                    d.pop("_mTimeBehindLeader", None)
                    d.pop("_mLapsBehindLeader", None)
                    d.pop("_mTimeBehindNext", None)
                    d.pop("_mLapsBehindNext", None)
                    # We are KEEPING RawGapToAhead and RawGapToPlaceAhead for the new Frontend logic
                    prioritized_standings.append(d)
            
            standings = prioritized_standings

            # --- BROADCAST ---
            payload = {
                "type": "broadcast_data",
                "session": {
                    "track": scor_data.scoringInfo.mTrackName.decode('utf-8').strip('\x00'),
                    "currentTime": scor_data.scoringInfo.mCurrentET,
                    "timeString": time_str,
                    "leaderLaps": prioritized_standings[0].get("Laps", 1) if prioritized_standings else 1,
                    "type": sess_type,
                    "isFinished": is_finished,
                    "isGreen": is_green,
                    "isLastLap": is_last_lap,
                    "isFCY": is_fcy,
                    "fcyState": fcy_state,
                    "yellowSectors": sorted([s for s, t in sector_expiry_times.items() if time.time() < t]),
                    "weather": {
                        "airTemp": round(scor_data.scoringInfo.mAmbientTemp, 1),
                        "trackTemp": round(scor_data.scoringInfo.mTrackTemp, 1),
                        "rainValue": round(scor_data.scoringInfo.mRaining * 100, 0),
                        "wetness": round(scor_data.scoringInfo.mAvgPathWetness * 100, 0)
                    }
                },
                "standings": standings,
                "incidents": state.shared_data["incidents"],
                "battles": battles,
                "oneVsOne": one_vs_one_data,
                "events": state.shared_data["events"],
                "overlay_state": state.overlay_state
            }
            
            # Persist standings in shared memory for external tasks (like camera focus handlers)
            state.shared_data["standings"] = standings
            
            await broadcast_json(payload)
            
            # Yield control for the event loop
            try:
                await asyncio.wait_for(update_event.wait(), timeout=0.5)
                update_event.clear()
            except asyncio.TimeoutError:
                await asyncio.sleep(0)
                
        except Exception as e:
            logging.error(f"Error in data loop: {e}")
            await asyncio.sleep(1.0)

async def broadcast_fast_telemetry():
    """High-frequency telemetry loop (30Hz) with Latency Compensation Buffer."""
    tele_queue = deque()
    while True:
        try:
            if not await lmu.ensure_connected():
                await asyncio.sleep(1.0)
                continue

            info = lmu.info
            if not info or not connected_clients:
                await asyncio.sleep(0.5)
                continue

            tele_data = info.LMUData.telemetry
            
            # --- FOCUS SYNC (PRO Parity) ---
            # Use the physical telemetry buffer index provided by the main loop
            focused_telem_idx = state.shared_data.get("focused_telem_idx", -1)
            
            # Fallback to local player if no focus found or slot invalid
            if 0 <= focused_telem_idx < 104:
                v_tele = tele_data.telemInfo[focused_telem_idx]
                vx, vy, vz = v_tele.mLocalVel.x, v_tele.mLocalVel.y, v_tele.mLocalVel.z
                speed_ms = math.sqrt(vx*vx + vy*vy + vz*vz)
                speed_kph = speed_ms * 3.6
                
                # [V2.1] Enriched payload for dynamic labels / fuel classes
                f_class = state.shared_data.get("focused_class", "")
                f_cap = state.shared_data.get("focused_fuel_cap", 0)
                f_ve = state.shared_data.get("focused_ve", 0.0) # Correctly mapped to fuel if non-hybrid
                
                payload = {
                    "type": "telemetry",
                    "data": {
                        "Throttle": v_tele.mUnfilteredThrottle,
                        "Brake": v_tele.mUnfilteredBrake,
                        "RPM": v_tele.mEngineRPM,
                        "MaxRPM": v_tele.mEngineMaxRPM,
                        "Gear": v_tele.mGear,
                        "SpeedKPH": speed_kph,
                        "SpeedMPH": speed_kph / 1.609,
                        "VirtualEnergy": float(f_ve),
                        "soc": float(getattr(v_tele, 'mBatteryChargeFraction', 0.0)),
                        "Class": f_class,
                        "FuelCapacity": f_cap
                    }
                }
                
                # [V5] Latency Buffer: Store telemetry and delay broadcast to match video
                tele_queue.append((time.time() + state.BROADCAST_LATENCY_DELAY, payload))
                
                # Flush the queue: Send all payloads that have waited enough
                now = time.time()
                while tele_queue and tele_queue[0][0] <= now:
                    _, ready_payload = tele_queue.popleft()
                    await broadcast_json(ready_payload)

            await asyncio.sleep(0.033) # 30Hz
        except Exception as e:
            logging.error(f"Error in fast telemetry: {e}")
            await asyncio.sleep(1.0)

async def auto_cycle_tower_modes_task():
    """Cycles tower modes if enabled."""
    elapsed = 0
    while True:
        if state.overlay_state.get("autoCycle", False):
            target = state.overlay_state.get("autoCycleTime", 30)
            if elapsed >= target:
                modes = TOWER_MODES
                curr = state.overlay_state.get("towerMode", "GAP")
                idx = (modes.index(curr) + 1) % len(modes) if curr in modes else 0
                state.overlay_state["towerMode"] = modes[idx]
                update_event.set()
                elapsed = 0
            else:
                elapsed += 1
        else:
            elapsed = 0
        await asyncio.sleep(1.0)

async def auto_cycle_classes_task():
    """Cycles through classes if enabled."""
    elapsed = 0
    while True:
        if state.overlay_state.get("classCycle", False) and state.overlay_state.get("_lastChangeSource") != "manual":
            target = state.overlay_state.get("classCycleTime", 120)
            if elapsed >= target:
                # We need to know the available classes in the race right now
                standings = state.shared_data.get("standings", [])
                available_classes = sorted(list(set([d.get("Class") for d in standings if d.get("Class")])))
                
                if available_classes:
                    options = ["ALL"] + available_classes
                    curr = state.overlay_state.get("focusedClass", "ALL")
                    idx = (options.index(curr) + 1) % len(options) if curr in options else 0
                    new_class = options[idx]
                    
                    state.overlay_state["focusedClass"] = new_class
                    state.overlay_state["_lastChangeSource"] = "auto"
                    logging.info(f"[AutoCycle] Cycling to Class: {new_class}")
                    update_event.set()
                elapsed = 0
            else:
                elapsed += 1
        else:
            elapsed = 0
        await asyncio.sleep(1.0)

async def broadcast_fast_positions():
    """
    High-frequency loop (10Hz) for vehicle coordinates only.
    Essential for smooth track map movement via extrapolation.
    """
    from broadcaster import broadcast_json
    from lmu_reader import lmu
    
    while True:
        try:
            # Throttle to 10Hz (100ms)
            await asyncio.sleep(0.1)
            
            # 1. Get raw data from Shared Memory
            scor_data, tele_data = lmu.get_data()
            if not scor_data or not tele_data:
                continue
                
            # --- TELEMETRY MAPPING (CORRIGIDO: Proteção contra ID 0) ---
            tele_map = {}
            for j in range(104):
                t_info = tele_data.telemInfo[j]
                if t_info.mID != -1:
                    if t_info.mID == 0 and j != tele_data.playerVehicleIdx:
                        continue
                    tele_map[t_info.mID] = t_info

            positions = []
            num_vehicles = scor_data.scoringInfo.mNumVehicles
            
            # 2. Extract only IDs and World Coordinates
            for i in range(num_vehicles):
                v_score = scor_data.vehScoringInfo[i]
                v_tele = tele_map.get(v_score.mID)
                
                if v_tele:
                    positions.append({
                        "id": int(v_score.mID),
                        "x": float(v_tele.mPos.x),
                        "z": float(v_tele.mPos.z)
                    })
            
            if positions:
                # 3. Broadcast to all overlays
                await broadcast_json({
                    "type": "pos_update",
                    "data": positions,
                    "server_time": time.time()
                })
                
        except Exception as e:
            logging.error(f"[FastPos] Error: {e}")
            await asyncio.sleep(1.0) # Error cooldown

async def enforce_replay_mode_task():
    """Background task that ensures the game stays in Replay mode for zero-flash transitions."""
    from lmu_reader import ensure_replay_active
    import state
    
    while True:
        try:
            # [V5] Re-enabled Gambiarra 2.0: Forced Replay for speed/flicker-free use
            if state.shared_data.get("intelligent_replay_enabled"):
                await ensure_replay_active()
            
            await asyncio.sleep(5.0)
        except Exception:
            # Silent retry (likely in menus)
            await asyncio.sleep(10.0)