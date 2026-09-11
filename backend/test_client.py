import asyncio
import json
import websockets

async def test():
    uri = "ws://127.0.0.1:8989"
    print(f"Tentando conectar em {uri}...")
    try:
        async with websockets.connect(uri) as websocket:
            print("Conectado! Aguardando o primeiro pacote de telemetria...")
            message = await websocket.recv()
            data = json.loads(message)
            print("\n=== DADOS CAPTURADOS COM SUCESSO ===")
            print(f"Pista: {data.get('track_name')}")
            print(f"Sessão: {data.get('session_name')}")
            print(f"Fase: {data.get('game_phase_name')}")
            print(f"Foco Atual (Slot ID): {data.get('focused_slot_id')}")
            print(f"Bandeiras de Setor: {data.get('sector_yellows')}")
            print(f"Total de Carros: {len(data.get('standings', []))}")
            
            standings = data.get('standings', [])
            if standings:
                print("\n======================== GRID COMPLETO ========================")
                print(f"{'POS':<4} | {'Nº':<4} | {'PILOTO':<22} | {'STATUS':<15} | {'VE/COMB':<7} | {'PNEUS (FL/FR/RL/RR)':<32} | {'FOCO':<4}")
                print("-" * 115)
                for car in standings:
                    t = car.get('tires', {})
                    tires_str = f"{t.get('FL',{}).get('compound','?')}({int(t.get('FL',{}).get('wear_pct',0))}%) " \
                                f"{t.get('FR',{}).get('compound','?')}({int(t.get('FR',{}).get('wear_pct',0))}%) " \
                                f"{t.get('RL',{}).get('compound','?')}({int(t.get('RL',{}).get('wear_pct',0))}%) " \
                                f"{t.get('RR',{}).get('compound','?')}({int(t.get('RR',{}).get('wear_pct',0))}%)"
                    
                    pos_str = f"P{car.get('place')}"
                    car_num = car.get('carNumber', '')
                    driver = car.get('driverName', '')[:22]
                    status = car.get('statusText', 'ON TRACK')[:15]
                    ve = f"{car.get('virtualEnergy', 0):.1f}%"
                    focused = "SIM" if car.get('isFocused') else "NÃO"
                    
                    print(f"{pos_str:<4} | #{car_num:<3} | {driver:<22} | {status:<15} | {ve:<7} | {tires_str:<32} | {focused:<4}")
            else:
                print("\nNenhum carro listado nos standings no momento.")
            print("================================================================")
    except Exception as e:
        print(f"Erro ao conectar ou ler do WebSocket: {e}")

if __name__ == "__main__":
    asyncio.run(test())
