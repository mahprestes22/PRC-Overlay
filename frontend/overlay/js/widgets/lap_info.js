import { state } from '../state.js';
import * as utils from '../utils.js';

export function updateLapInfo(driver) {
    const lapVal = document.getElementById('lap-val');
    const lapLast = document.getElementById('lap-last');
    const lapBest = document.getElementById('lap-best');
    const lapCurrent = document.getElementById('lap-current');
    const lapDelta = document.getElementById('lap-delta');
    const lapDeltaWrap = document.getElementById('lap-delta-wrap');

    const timeIntoLap = driver.TimeIntoLap || 0;
    const isPersistenceActive = timeIntoLap < 8 && (driver.LastLapTime > 0);

    // 1. Lap Count & Times
    if (lapVal) lapVal.innerText = driver.Laps || 0;
    
    if (lapCurrent) {
        if (isPersistenceActive) {
            lapCurrent.innerText = utils.formatTime(driver.LastLapTime, true);
            lapCurrent.classList.add('lap-finish-flash'); 
        } else {
            lapCurrent.innerText = utils.formatTime(timeIntoLap, true);
            lapCurrent.classList.remove('lap-finish-flash');
        }
    }

    if (lapLast) lapLast.innerText = utils.formatTime(driver.LastLapTime || 0);
    
    if (lapBest) {
        lapBest.innerText = utils.formatTime(driver.BestLapTime || 0);
        if (driver.IsClassBestLap) lapBest.classList.add('sec-purple-text');
        else lapBest.classList.remove('sec-purple-text');
    }

    // 2. Delta Logic
    if (lapDelta) {
        const delta = driver.Delta || 0;
        const sign = delta >= 0 ? '+' : '';
        lapDelta.innerText = `${sign}${delta.toFixed(3)}`;
        
        if (lapDeltaWrap) {
            lapDeltaWrap.className = 'delta-wrap';
            if (delta < -0.001) lapDeltaWrap.classList.add('delta-negative'); 
            else if (delta > 0.001) lapDeltaWrap.classList.add('delta-positive'); 
        }
    }

    // 3. Sectors (DYNAMIC LOGIC aligned with Qualify)
    // Indices: 1=S1 running, 2=S2 running (S1 complete), 0=S3 running (S1+S2 complete)
    let s1 = 0, s2 = 0, s3 = 0;
    let st1 = "NONE", st2 = "NONE", st3 = "NONE";

    const secIdx = driver.CurSectorIdx;

    if (secIdx === 1) { // In S1
        if (isPersistenceActive) {
            // Show previous lap results for 8s
            s1 = driver.LastLapS1 || 0;
            s2 = driver.LastLapS2 || 0;
            s3 = driver.LastLapS3 || 0;
            st1 = driver.S1Status;
            st2 = driver.S2Status;
            st3 = driver.S3Status;
        } else {
            s1 = 0; s2 = 0; s3 = 0;
        }
    } else if (secIdx === 2) { // In S2
        s1 = driver.CurS1; st1 = driver.S1Status;
        s2 = 0; s3 = 0;
    } else if (secIdx === 0) { // In S3
        s1 = driver.CurS1; st1 = driver.S1Status;
        s2 = driver.CurS2; st2 = driver.S2Status;
        s3 = 0;
    }

    updateSector('lap-s1-box', 'lap-s1-val', s1, st1);
    updateSector('lap-s2-box', 'lap-s2-val', s2, st2);
    updateSector('lap-s3-box', 'lap-s3-val', s3, st3);
}

function updateSector(boxId, valId, time, status) {
    const box = document.getElementById(boxId);
    const val = document.getElementById(valId);
    if (!box || !val) return;

    val.innerText = time > 0 ? utils.formatSector(time) : '--.---';
    
    box.className = 'sector-box';
    if (status === 'PURPLE') box.classList.add('sec-purple');
    else if (status === 'GREEN') box.classList.add('sec-green');
    else if (status === 'YELLOW') box.classList.add('sec-yellow');
}

export function updateWecLapInfo(driver) {
    const lapVal = document.getElementById('wec-lap-val');
    const lapBest = document.getElementById('wec-lap-best');
    const lapCurrent = document.getElementById('wec-lap-current');
    const lapDelta = document.getElementById('wec-lap-delta-wrap');

    const timeIntoLap = driver.TimeIntoLap || 0;
    const isPersistenceActive = timeIntoLap < 8 && (driver.LastLapTime > 0);

    if (lapVal) lapVal.innerText = driver.Laps || 0;
    
    if (lapBest) {
        lapBest.innerText = utils.formatTime(driver.BestLapTime || 0);
        if (driver.IsClassBestLap) lapBest.classList.add('wec-sec-purple-text');
        else lapBest.classList.remove('wec-sec-purple-text');
    }

    if (lapCurrent) {
        if (isPersistenceActive) {
            lapCurrent.innerText = utils.formatTime(driver.LastLapTime || 0, true);
        } else {
            lapCurrent.innerText = utils.formatTime(timeIntoLap, true);
        }
    }

    if (lapDelta) {
        const delta = driver.Delta || 0;
        const sign = delta >= 0 ? '+' : '';
        lapDelta.innerText = `${sign}${delta.toFixed(3)}`;
        lapDelta.className = 'wec-delta';
        if (delta < -0.001) lapDelta.classList.add('wec-delta-green');
        else if (delta > 0.001) lapDelta.classList.add('wec-delta-yellow'); 
    }

    let st1 = "NONE", st2 = "NONE", st3 = "NONE";
    const secIdx = driver.CurSectorIdx;

    if (secIdx === 1) { // In S1
        if (isPersistenceActive) {
            st1 = driver.S1Status; st2 = driver.S2Status; st3 = driver.S3Status;
        }
    } else if (secIdx === 2) { // In S2
        st1 = driver.S1Status;
    } else if (secIdx === 0) { // In S3
        st1 = driver.S1Status; st2 = driver.S2Status;
    }

    updateWecSector('wec-lap-s1-box', st1);
    updateWecSector('wec-lap-s2-box', st2);
    updateWecSector('wec-lap-s3-box', st3);
}

function updateWecSector(boxId, status) {
    const box = document.getElementById(boxId);
    if (!box) return;
    box.className = 'wec-s-box';
    if (status === 'PURPLE') box.classList.add('wec-sec-purple');
    else if (status === 'GREEN') box.classList.add('wec-sec-green');
    else if (status === 'YELLOW') box.classList.add('wec-sec-yellow');
}
