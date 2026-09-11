import urllib.request
import json

print("=== 1. LENDO SWAGGER-INITIALIZER.JS ===")
try:
    with urllib.request.urlopen("http://localhost:6397/swagger/swagger-initializer.js", timeout=2) as r:
        js = r.read().decode('utf-8')
        print(js)
except Exception as e:
    print("Error:", e)

# Testa buscar o json do swagger encontrado
try:
    with urllib.request.urlopen("http://localhost:6397/swagger/v1/swagger.json", timeout=2) as r:
        pass
except Exception as e:
    print("v1 error:", e)

print("\n=== 2. TESTANDO FOCO VIA REST ===")
# Slot 1 (Tom Gamble)
for slot in [1, 2, 3]:
    try:
        url = f"http://localhost:6397/rest/watch/focus/{slot}"
        req = urllib.request.Request(url, data=b"", method="PUT")
        req.add_header('Content-Type', 'application/json')
        req.add_header('Content-Length', '0')
        with urllib.request.urlopen(req, timeout=2) as r:
            res = r.read().decode('utf-8')
            print(f"PUT /rest/watch/focus/{slot} -> {r.status} : '{res}'")
    except Exception as e:
        print(f"PUT focus/{slot} Erro:", e)

# Checa quem está focado agora
try:
    with urllib.request.urlopen("http://localhost:6397/rest/watch/focus", timeout=2) as r:
        print("GET focus atual:", r.read().decode('utf-8'))
except Exception as e:
    print("GET focus erro:", e)
