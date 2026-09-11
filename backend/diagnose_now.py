import urllib.request
import json
from pyLMUSharedMemory.lmu_mmap import MMapControl
from pyLMUSharedMemory import lmu_data

print("=== 1. TESTE DO SWAGGER HTML ===")
try:
    with urllib.request.urlopen("http://localhost:6397/swagger/index.html", timeout=2) as r:
        print(r.read().decode('utf-8'))
except Exception as e:
    print("Swagger HTML:", e)

print("\n=== 2. TESTE DE SESSION INFO VIA REST ===")
try:
    with urllib.request.urlopen("http://localhost:6397/rest/watch/sessionInfo", timeout=2) as r:
        sinfo = json.loads(r.read())
        print(json.dumps(sinfo, indent=2))
except Exception as e:
    print("SessionInfo:", e)

print("\n=== 3. TESTE DE STANDINGS (REST) PARA VER OS SLOTS ===")
try:
    with urllib.request.urlopen("http://localhost:6397/rest/watch/standings", timeout=2) as r:
        st = json.loads(r.read())
        print(f"Total carros no REST: {len(st)}")
        for car in st[:5]:
            print(f"Slot: {car.get('slotID')} | Driver: {car.get('driverName')} | PitState: {car.get('pitState')} | InPits: {car.get('inPits')}")
except Exception as e:
    print("Standings:", e)

print("\n=== 4. TESTE DE SHARED MEMORY (SECTOR FLAGS & PIT STATES) ===")
mmap_ctrl = MMapControl(lmu_data.LMUConstants.LMU_SHARED_MEMORY_FILE, lmu_data.LMUObjectOut)
mmap_ctrl.create(0)
mmap_ctrl.update()
sc = mmap_ctrl.data.scoring.scoringInfo
print("Track:", sc.mTrackName.decode('utf-8', errors='ignore').strip('\x00'))
print("Session:", sc.mSession)
print("GamePhase:", sc.mGamePhase)
print("YellowFlagState:", sc.mYellowFlagState)
print("SectorFlag raw bytes:", [int(b) for b in sc.mSectorFlag])

for i in range(min(5, sc.mNumVehicles)):
    v = mmap_ctrl.data.scoring.vehScoringInfo[i]
    dname = v.mDriverName.decode('utf-8', errors='ignore').strip('\x00')
    print(f"Car #{i}: ID={v.mID}, Name='{dname}', PitState={v.mPitState}, InPits={v.mInPits}, FinishStatus={v.mFinishStatus}")
