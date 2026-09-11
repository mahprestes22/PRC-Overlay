import urllib.request
import json
import re

print("=== VERIFICANDO ENDPOINTS DO LMU ===")
try:
    with urllib.request.urlopen("http://localhost:6397/swagger/index.html", timeout=3) as r:
        html = r.read().decode('utf-8', errors='ignore')
        print("Encontrado /swagger/index.html!")
        # Procura por swagger json ou spec
        specs = re.findall(r'[\'\"\/a-zA-Z0-9_\-\.]+\.json', html)
        print("Specs encontradas no HTML:", specs)
except Exception as e:
    print("Erro ao acessar swagger HTML:", e)

# Testa caminhos comuns de swagger
for candidate in ["/rest/swagger.json", "/swagger.json", "/api-docs", "/v2/api-docs", "/openapi.json"]:
    try:
        with urllib.request.urlopen(f"http://localhost:6397{candidate}", timeout=1) as r:
            data = json.loads(r.read())
            print(f"Sucesso em {candidate}! Total endpoints: {len(data.get('paths', {}))}")
            for p in sorted(data.get('paths', {}).keys()):
                if any(x in p.lower() for x in ['focus', 'camera', 'watch', 'driver', 'view']):
                    print("  ", p, list(data['paths'][p].keys()))
            break
    except Exception:
        pass

# Testa endpoints de watch conhecidos
print("\n=== TESTANDO GET EM ENDPOINTS CONHECIDOS ===")
for ep in ["/rest/watch/focus", "/rest/watch/standings", "/rest/watch/sessionInfo", "/rest/watch/replaytime"]:
    try:
        req = urllib.request.Request(f"http://localhost:6397{ep}")
        with urllib.request.urlopen(req, timeout=1) as r:
            body = r.read().decode('utf-8', errors='ignore')
            print(f"GET {ep} -> {r.status} : {body[:150]}")
    except Exception as e:
        print(f"GET {ep} -> Erro: {e}")
