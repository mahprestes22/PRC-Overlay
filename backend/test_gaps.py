import asyncio
import server

async def test_gaps():
    eng = server.LMUBackendEngine()
    await eng.init_memory()
    eng.mmap_ctrl.update()
    sc = eng.mmap_ctrl.data.scoring.scoringInfo
    session_num = sc.mSession
    is_race = (session_num >= 5)
    cars = sc.mNumVehicles
    
    standings = []
    for i in range(cars):
        v = eng.mmap_ctrl.data.scoring.vehScoringInfo[i]
        d_name = v.mDriverName.decode('utf-8', errors='ignore').strip('\x00')
        v_class_raw = v.mVehicleClass.decode('utf-8', errors='ignore').strip('\x00')
        standings.append({
            'place': v.mPlace,
            'driver': d_name,
            'carClass': server.normalize_class(v_class_raw),
            'bestLapTime': float(v.mBestLapTime),
            'lap': int(v.mTotalLaps),
            'gapToLeader': float(v.mTimeBehindLeader),
            'gapToNext': float(v.mTimeBehindNext),
        })
    
    standings.sort(key=lambda x: x['place'])
    
    class_counters = {}
    class_leaders = {}
    class_prev_car = {}
    
    for i, car in enumerate(standings):
        c_cls = car['carClass']
        class_counters[c_cls] = class_counters.get(c_cls, 0) + 1
        car['classPlace'] = class_counters[c_cls]
        
        if c_cls not in class_leaders:
            class_leaders[c_cls] = car
            car['gapClass'] = 'LIDER'
        else:
            leader_car = class_leaders[c_cls]
            gap = car['gapToLeader'] - leader_car['gapToLeader']
            car['gapClass'] = f"+{gap:.3f}s" if gap > 0 else "—"
        
        if c_cls not in class_prev_car or car['bestLapTime'] <= 0:
            car['gapInterval'] = '—'
        else:
            prev_best = class_prev_car[c_cls]['bestLapTime']
            if prev_best > 0 and car['bestLapTime'] > 0:
                diff = car['bestLapTime'] - prev_best
                car['gapInterval'] = f"+{diff:.3f}" if diff >= 0 else f"{diff:.3f}"
            else:
                car['gapInterval'] = '—'
        
        class_prev_car[c_cls] = car
    
    print(f"=== SESSAO: {session_num} (Corrida: {is_race}) ===")
    print(f"{'P':>3} {'CLAS':>5} {'PC':>3} {'PILOTO':<22} {'BEST':>9} {'INT (classe)':>14}")
    print("-" * 70)
    for c in standings:
        print(f"P{c['place']:>2} {c['carClass']:>5} P{c['classPlace']:<2} {c['driver']:<22} {c['bestLapTime']:>9.3f} {c['gapInterval']:>14}")

if __name__ == '__main__':
    asyncio.run(test_gaps())
