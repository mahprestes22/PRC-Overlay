import asyncio
import json
import logging
import websockets
import state
from state import connected_clients

async def handle_client_messages(websocket):
    """Loop infinito que escuta mensagens do cliente até que a conexão caia."""
    from data_processor import process_client_command
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                await process_client_command(data)
            except Exception as e:
                logging.error(f"Erro ao processar mensagem do cliente: {e}")
    except websockets.exceptions.ConnectionClosed:
        # Erro normal e esperado quando o cliente fecha a aba ou atualiza o ecrã
        pass
    except Exception as e:
        logging.error(f"Erro inesperado no loop de mensagens do WebSocket: {e}")

async def ws_handler(websocket, path=None):
    """
    Gere novas ligações de clientes (Overlay ou Dashboard).
    """
    logging.info(f"--- NOVA CONEXÃO WEBSOCKET INICIADA ---")
    try:
        connected_clients.add(websocket)
        
        # Envia o estado inicial para o UI arrancar com dados seguros (.get evita KeyErrors)
        init_payload = {
            "type": "broadcast_data",
            "overlay_state": {
                **state.overlay_state,
                "vehicleMetadata": getattr(state, 'vehicle_metadata', {})
            },
            "session": state.shared_data.get("session", {}),
            "track_points": state.shared_data.get("track_points", []),
            "globalEvents": state.shared_data.get("globalEvents", [])
        }
        
        try:
            payload_str = json.dumps(init_payload)
            await websocket.send(payload_str)
            logging.info(f"Payload inicial enviado com sucesso ({len(payload_str)} bytes)")
        except Exception as je:
            logging.error(f"ERRO AO SERIALIZAR PAYLOAD INICIAL: {je}")
            # Fallback para um payload mínimo se o grande falhar
            await websocket.send(json.dumps({"type": "broadcast_data", "overlay_state": {"connected": True}}))

        logging.info(f"Cliente registado. Conexões ativas: {len(connected_clients)}")
        
        # O 'await' aqui mantém a conexão aberta e processa as mensagens. 
        # Quando o cliente desconecta, esta função termina naturalmente, libertando a memória.
        await handle_client_messages(websocket)
        
    except websockets.exceptions.ConnectionClosed:
        logging.info("Conexão fechada normalmente pelo cliente.")
    except Exception as e:
        logging.error(f"ERRO CRÍTICO NO HANDLER WEBSOCKET: {e}")
    finally:
        connected_clients.discard(websocket)
        logging.info(f"Conexão encerrada e memória libertada. Clientes restantes: {len(connected_clients)}")

async def broadcast_json(payload):
    """Envia JSON para todos os clientes conectados instantaneamente."""
    if not connected_clients:
        return
        
    message = json.dumps(payload)
    to_remove = set()
    
    for ws in connected_clients:
        try:
            await ws.send(message)
        except Exception:
            to_remove.add(ws)
            
    # Limpa as conexões presas que falharam ao enviar
    for ws in to_remove:
        connected_clients.discard(ws)