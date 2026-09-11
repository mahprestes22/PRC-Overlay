import urllib.request
import time

def focus_car(slot_id):
    print(f"=== FOCANDO NO CARRO SLOT {slot_id} ===")
    
    # 1. Envia Foco do slot
    url_focus = f"http://localhost:6397/rest/watch/focus/{slot_id}"
    req1 = urllib.request.Request(url_focus, data=b"", method="PUT")
    req1.add_header('Content-Length', '0')
    req1.add_header('Content-Type', 'application/json')
    try:
        r1 = urllib.request.urlopen(req1, timeout=2)
        print(f"1. Focus Slot {slot_id} -> {r1.status}")
    except Exception as e:
        print("Erro no focus:", e)
        
    time.sleep(0.05)
    
    # 2. Envia Comando de Câmera TV
    url_cam = "http://localhost:6397/rest/watch/focus/4/1/true"
    req2 = urllib.request.Request(url_cam, data=b"", method="PUT")
    req2.add_header('Content-Length', '0')
    req2.add_header('Content-Type', 'application/json')
    try:
        r2 = urllib.request.urlopen(req2, timeout=2)
        print(f"2. Set TV Cam -> {r2.status}")
    except Exception as e:
        print("Erro no camera:", e)

focus_car(1) # Tom Gamble
time.sleep(1)
focus_car(4) # Sébastien Buemi
