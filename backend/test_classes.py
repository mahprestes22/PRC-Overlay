from pyLMUSharedMemory.lmu_mmap import MMapControl
from pyLMUSharedMemory import lmu_data
import math

m = MMapControl(lmu_data.LMUConstants.LMU_SHARED_MEMORY_FILE, lmu_data.LMUObjectOut)
m.create(0)
m.update()
sc = m.data.scoring.scoringInfo
print('Total cars:', sc.mNumVehicles)
for i in range(min(12, sc.mNumVehicles)):
    v = m.data.scoring.vehScoringInfo[i]
    dname = v.mDriverName.decode('utf-8', errors='ignore').strip('\x00')
    vclass = v.mVehicleClass.decode('utf-8', errors='ignore').strip('\x00')
    speed = math.sqrt(v.mLocalVel.x**2 + v.mLocalVel.y**2 + v.mLocalVel.z**2) * 3.6
    print(f'#{i:02d} ID={v.mID:2d} | {dname:<18} | Class="{vclass:<12}" | InGarage={v.mInGarageStall} | InPits={v.mInPits} | PitState={v.mPitState} | Speed={speed:5.1f}km/h | Flag={v.mFlag} | UnderYellow={v.mUnderYellow}')
