import urllib.request
import time

def test_replay_jump():
    print("Testando pulo de replay...")
    # 1. Pega lista de incidentes
    with urllib.request.urlopen("http://127.0.0.1:6397/rest/watch/getIncidentsList/5", timeout=2) as r:
        import json
        incidents = json.loads(r.read().decode('utf-8'))
        print(f"Total de incidentes encontrados no jogo: {len(incidents)}")
        if incidents:
            last = incidents[-1]
            print(f"Último incidente: {last['player']} vs {last['contactWith']} em {last['et']}s")
            
            # Pula para 5 segundos antes
            target_time = max(0, round(last['et'] - 5.0, 1))
            print(f"Enviando pulo de replay para {target_time}s...")
            
            url = f"http://127.0.0.1:6397/rest/watch/replaytime/{target_time}"
            req = urllib.request.Request(url, data=b"", method="PUT")
            req.add_header('Content-Length', '0')
            with urllib.request.urlopen(req, timeout=2) as res:
                print(f"Pulo replay time: {res.status}")
                
            url_play = "http://127.0.0.1:6397/rest/watch/replayCommand/play"
            req2 = urllib.request.Request(url_play, data=b"", method="PUT")
            req2.add_header('Content-Length', '0')
            with urllib.request.urlopen(req2, timeout=2) as res2:
                print(f"Replay play command: {res2.status}")

test_replay_jump()
