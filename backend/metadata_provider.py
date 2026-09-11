import logging
import os
from typing import Dict, Any, Optional

from utils import async_fetch_json

logger = logging.getLogger(__name__)

# Fallback path if not provided
LMU_SETTINGS_PATH = r"C:\Program Files (x86)\Steam\steamapps\common\Le Mans Ultimate\UserData\player\Settings.JSON"

class MetadataProvider:
    """
    Metadata Provider for LMU.
    Strictly uses the Native Multiplayer API (/rest/multiplayer/teams).
    """
    
    def __init__(self, lmu_api_url: str = "http://localhost:6397"):
        self.lmu_api_url = lmu_api_url
        self.mapping = {}  # {DRIVER_NAME_UPPER: {car_number, team_name, nationality}}
        
    async def refresh(self):
        """Polls the official LMU API asynchronously to update the mapping."""
        new_mapping = {} 
        
        try:
            # USANDO ASYNC para não bloquear o loop principal (telemetria/websockets)
            data = await async_fetch_json(f"{self.lmu_api_url}/rest/multiplayer/teams", timeout=3.0)
            if data:
                drivers_raw = data.get("drivers", {})
                teams_raw = data.get("teams", {})
                
                for d_name, d_info in drivers_raw.items():
                    utid = d_info.get("uniqueTeamId")
                    team_info = teams_raw.get(utid, {})
                    
                    # Guarda a chave já otimizada (Maiúsculas) para busca instantânea depois
                    clean_key = d_name.upper().strip()
                    
                    if clean_key not in new_mapping: 
                        new_mapping[clean_key] = {}
                        
                    new_mapping[clean_key].update({
                        "carNumber": team_info.get("carNumber"),
                        "teamName": team_info.get("name"),
                        "nationality": d_info.get("nationality")
                    })
        except Exception as e:
            # Falha silenciosa é aceitável, a API do LMU pode estar offline no single player
            pass 
            
        if new_mapping:
            self.mapping = new_mapping

    def get_metadata(self, driver_name: str) -> Optional[Dict[str, Any]]:
        """Returns metadata instantly using direct dictionary lookup."""
        if not driver_name:
            return None
            
        target = driver_name.upper().strip()
        # Busca direta (O(1)) no dicionário, sem usar loops "for" pesados
        return self.mapping.get(target)