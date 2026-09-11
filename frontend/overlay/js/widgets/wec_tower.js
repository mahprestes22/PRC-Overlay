import { state } from '../state.js';
import * as utils from '../utils.js';

function extractCompoundLetter(tireObj) {
    if (!tireObj) return '?';
    if (typeof tireObj === 'string') return tireObj.charAt(0).toUpperCase();
    if (typeof tireObj === 'object') {
        const c = tireObj.compound || tireObj.Compound || '?';
        const str = String(c).trim();
        if (str.toLowerCase().includes('soft')) return 'S';
        if (str.toLowerCase().includes('med')) return 'M';
        if (str.toLowerCase().includes('hard')) return 'H';
        if (str.toLowerCase().includes('wet')) return 'W';
        return str.charAt(0).toUpperCase() || '?';
    }
    return '?';
}

export function renderWecTower(standings) {
    const wecLeaderboard = document.getElementById('wec-leaderboard');
    if (!wecLeaderboard) return;

    // FLIP Animation Part 1: Record current positions
    const rows = wecLeaderboard.querySelectorAll('.wec-row[data-slot-id]');
    const oldPositions = {};
    rows.forEach(el => {
        const id = el.dataset.slotId;
        if (id) oldPositions[id] = el.getBoundingClientRect().top;
    });

    const isSessionFinished = document.body.classList.contains('state-session-finished');
    const isQualifyMode = !!(state.currentOverlayState && state.currentOverlayState.qualifyInfo);

    if (isQualifyMode) wecLeaderboard.classList.add('qualify-mode-active');
    else wecLeaderboard.classList.remove('qualify-mode-active');

    let structuredHtml = '';
    if (isSessionFinished) structuredHtml += '<div class="wec-finish-banner"></div>';

    let lastCls = null;
    let currentClassBest = Infinity;

    standings.forEach(d => {
        if (d.isHeader) {
            if (lastCls) structuredHtml += '</div></div>';
            const clsMapping = utils.getWecClassMapping(d.Class);
            const mode = state.currentTowerMode || 'GAP';

            let classText = d.Class.toUpperCase();
            if (clsMapping === 'lmp2-elms') classText = 'LMP2 ELMS';
            else if (clsMapping === 'lmp2') classText = d.Class.toUpperCase().includes('WEC') ? 'LMP2 WEC' : 'LMP2';
            else if (clsMapping === 'gte') classText = 'LMGTE';

            if (isQualifyMode)         classText = `${classText} QUALIFYING`;
            else if (mode === 'ENERGY') classText = 'VIRTUAL ENERGY';
            else if (mode === 'STOPS')  classText = 'STOPS';
            else if (mode === 'TYRE')   classText = 'TIRE';

            const isGreenFlagActive = document.body.classList.contains('state-green-flag');
            const showGreenFlagText  = isGreenFlagActive && lastCls === null;

            let secondaryText = window.currentWecSessionName || 'RACE';
            if (isQualifyMode)                secondaryText = 'BEST LAPS';
            else if (mode === 'POSITIONS')    secondaryText = 'GRID PROGRESSION';
            else if (mode === 'GAP' || mode === 'INTERVAL') secondaryText = mode;

            const showRaceClass  = window.wecBadgeFlipState ? 'show-race' : '';
            const greenFlagClass = showGreenFlagText ? 'show-green' : '';

            structuredHtml += `
                <div class="wec-category wec-cat-${clsMapping}">
                    <div class="wec-category-header wec-cat-${clsMapping} ${showRaceClass} ${greenFlagClass}" data-slot-id="header-${clsMapping}">
                        <div class="wec-badge-wrapper">
                            <span class="wec-badge-text class">${classText}</span>
                            <span class="wec-badge-text race">${secondaryText}</span>
                            <span class="wec-badge-text green">GREEN FLAG</span>
                            <span class="wec-badge-text fcy">FCY</span>
                            <span class="wec-badge-text finish">🏁</span>
                        </div>
                    </div>
                    <div class="wec-rows">
            `;
            lastCls = d.Class;

            if (isQualifyMode) {
                currentClassBest = standings
                    .filter(x => utils.getWecClassMapping(x.carClass || x.Class) === clsMapping && (x.bestLapTime || x.BestLapTime) > 0)
                    .reduce((min, x) => (x.bestLapTime || x.BestLapTime) < min ? (x.bestLapTime || x.BestLapTime) : min, Infinity);
            }

        } else if (d.isSeparator) {
            structuredHtml += '<div class="wec-row wec-separator-row"><div class="wec-sep-dots">• • •</div></div>';
        } else {
            const teamName       = d.teamName || d.CarName || '';
            const carClass       = d.carClass || d.Class || '';
            const vehicleFilename= d.vehicleFilename || '';
            const slotID         = d.slotID !== undefined ? d.slotID : d.SlotID;
            const carNum         = d.carNumber || d.CarNumber || '';
            const bestLap        = d.bestLapTime || d.BestLapTime || 0;

            const mName      = utils.getManufacturerName(teamName, carClass, vehicleFilename, d.Manufacturer);
            const manClass   = utils.getManufacturerColorClass(mName);
            const logoClass  = utils.getManufacturerLogoClass(mName);
            const logoHtml   = utils.getManufacturerLogo(teamName, carClass, vehicleFilename, 'wec-logo-img', d.Manufacturer);

            let abbr = '---';
            if (d.driverNameFormatted) {
                const parts = d.driverNameFormatted.split('. ');
                abbr = parts.length > 1 ? parts[1].substring(0, 3) : d.driverNameFormatted.substring(0, 3);
            } else if (d.driverName || d.DriverName) {
                const raw = d.driverName || d.DriverName;
                const parts = raw.trim().split(' ');
                const surname = parts.length > 1 ? parts[parts.length - 1] : parts[0];
                abbr = surname.substring(0, 3).toUpperCase();
            }

            let rankDisplay  = d.place || d.classPosition || d.ClassPosition || '';
            let rowStatusClass = '';

            const statusText = (d.statusText || d.Stats || '').toUpperCase();
            if (statusText === 'DQ' || d.FinishStatus === 3)  { rankDisplay = 'DQ'; rowStatusClass = 'status-dq'; }
            if (statusText === 'DNF' || d.FinishStatus === 2 || d.FinishStatus === 4) { rankDisplay = 'DNF'; rowStatusClass = 'status-dnf'; }

            const isFocused = !!(d.isFocused || d.IsFocused);

            let isP1Row = false;
            if (isQualifyMode && bestLap > 0 && bestLap <= currentClassBest + 0.001) {
                isP1Row = true;
            }

            const secColors = d.sectorColors || ['', '', ''];
            const hasPurple = secColors.some(c => c === 'purple');
            const hasGreen  = secColors.some(c => c === 'green');
            const improvementClass = hasPurple ? 'improvement-cb' : (hasGreen ? 'improvement-pb' : '');
            const p1Class = isP1Row ? 'wec-qualify-p1-bg' : '';

            const isNameMode = !isQualifyMode && (state.currentTowerMode === 'NAME');
            if (isNameMode) {
                let lastName = 'PILOTO';
                if (d.driverNameFormatted) {
                    lastName = d.driverNameFormatted.replace(/^[A-ZÀ-ÿ]\.\s+/i, '').trim().toUpperCase();
                } else if (d.driverName) {
                    const parts = d.driverName.trim().split(/\s+/);
                    lastName = parts.length > 1 ? parts.slice(1).join(' ').toUpperCase() : parts[0].toUpperCase();
                }
                const inGarage = !!(d.inGarage || (d.statusText && d.statusText === 'GARAGE'));
                const inPits = !!(d.inPits && !inGarage);
                const pitHtml = (inPits || inGarage) ? '<div class="wec-pit-circle">P</div>' : '';

                structuredHtml += `
                    <div class="wec-row wec-row-name-mode ${isFocused ? 'focused-row' : ''} ${manClass} ${rowStatusClass}" data-slot-id="${slotID}">
                        <div class="wec-row-name-main">
                            <div class="wec-rank">${rankDisplay}</div>
                            <div class="wec-team-logo man-bg ${manClass} ${logoClass}">${logoHtml}</div>
                            <div class="wec-car-number">${carNum}</div>
                            <div class="wec-number-band ${manClass}"></div>
                            <div class="wec-driver-fullname" title="${lastName}">${lastName}</div>
                        </div>
                        ${pitHtml ? `<div class="wec-name-mode-pit">${pitHtml}</div>` : ''}
                    </div>
                `;
            } else {
                structuredHtml += `
                    <div class="wec-row ${isFocused ? 'focused-row' : ''} ${improvementClass} ${p1Class} ${manClass} ${rowStatusClass}" data-slot-id="${slotID}">
                        <div class="wec-rank">${rankDisplay}</div>
                        <div class="wec-team-logo man-bg ${manClass} ${logoClass}">
                            ${logoHtml}
                        </div>
                        <div class="wec-car-number">${carNum}</div>
                        <div class="wec-number-band ${manClass}"></div>
                        <div class="wec-driver-abbr">
                            <div class="pit-wrap" style="display:inline-flex;align-items:center;">
                                ${abbr}
                            </div>
                        </div>
                        <div class="wec-data-column">
                            ${renderWecDataColumn(d, state.currentTowerMode, isQualifyMode, currentClassBest)}
                        </div>
                        ${renderWecExtraInfo(d)}
                    </div>
                `;
            }
        }
    });

    if (lastCls) structuredHtml += '</div></div>';
    wecLeaderboard.innerHTML = structuredHtml;

    // FLIP Animation Part 2: Animate to new positions
    const newRows = wecLeaderboard.querySelectorAll('.wec-row[data-slot-id]');
    newRows.forEach(el => {
        const id = el.dataset.slotId;
        if (oldPositions[id] !== undefined) {
            const deltaY = oldPositions[id] - el.getBoundingClientRect().top;
            if (deltaY !== 0) {
                el.style.transition = 'none';
                el.style.transform = `translateY(${deltaY}px)`;
                el.offsetHeight;
                requestAnimationFrame(() => {
                    el.style.transition = 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)';
                    el.style.transform = 'translateY(0)';
                    setTimeout(() => {
                        if (el.style.transform === 'translateY(0px)') {
                            el.style.transform = '';
                            el.style.transition = '';
                        }
                    }, 700);
                });
            }
        }
    });
}

export function renderWecDataColumn(car, mode, isQualifyMode = false, classBestLap = 0) {
    const statusText = (car.statusText || car.Stats || '').toUpperCase();
    const bestLap    = car.bestLapTime || car.BestLapTime || 0;

    // Qualify Mode
    if (isQualifyMode) {
        let qTimeTxt = '';
        if (bestLap > 0) {
            if (bestLap <= classBestLap + 0.001) {
                qTimeTxt = utils.formatTime(bestLap);
            } else {
                const gap = bestLap - classBestLap;
                qTimeTxt = `+${gap.toFixed(3)}`;
            }
        } else {
            qTimeTxt = statusText.includes('OUT LAP') ? 'OUT LAP' : 'NO TIME';
        }

        const secColors = car.sectorColors || ['', '', ''];
        let sectorsHtml = '<div class="wec-row-sectors">';
        for (let i = 0; i < 3; i++) {
            let colorCls = '';
            if (secColors[i] === 'purple') colorCls = 'cb';
            else if (secColors[i] === 'green') colorCls = 'pb';
            else if (secColors[i] === 'yellow') colorCls = 'slower';
            sectorsHtml += `<div class="wec-sector-dash ${colorCls}"></div>`;
        }
        sectorsHtml += '</div>';

        return `<div class="wec-data-content has-sectors">
                    <span class="val">${qTimeTxt}</span>
                    ${sectorsHtml}
               </div>`;
    }

    // Pit / Garage status
    if (car.inGarage || car.InGarage || statusText === 'GARAGE') {
        return `<span class="val" style="color:#ff4444;font-weight:700;">GARAGE</span>`;
    }
    if (car.inPits || car.InPits || statusText === 'PIT' || statusText === 'PIT IN') {
        return `<span class="val" style="color:#ffcc00;font-weight:700;">PIT</span>`;
    }

    let content = '';
    const gap = car.gapToLeader !== undefined ? car.gapToLeader : car.Gap;
    const interval = car.gapToNext !== undefined ? car.gapToNext : car.Interval;

    switch (mode) {
        case 'INTERVAL':
            content = `<span class="val">${interval && interval !== '0' && interval !== 'LEADER' && interval !== 0 ? (typeof interval === 'number' ? `+${interval.toFixed(3)}` : interval) : 'LDR'}</span>`;
            break;

        case 'GAP':
        default:
            content = `<span class="val">${gap && gap !== '0' && gap !== 'LEADER' && gap !== 0 ? (typeof gap === 'number' ? `+${gap.toFixed(3)}` : gap) : 'LDR'}</span>`;
            break;

        case 'STOPS':
            content = `<span class="val">${car.numStops || car.NumStops || 0} STOPS</span>`;
            break;

        case 'POSITIONS':
            const diff = car.posChange || car.PosChange || 0;
            if (diff === 0) content = `<span class="val">-</span>`;
            else content = `<span class="progress-val ${diff > 0 ? 'gain' : 'loss'}">
                                ${diff > 0 ? '▲' : '▼'} ${Math.abs(diff)}
                            </span>`;
            break;

        case 'ENERGY':
            const pctNum = Math.round(((car.virtualEnergy || car.VirtualEnergy || car.fuelPct || 0)) * 100);
            let eColor = '#00ff66';
            if (pctNum <= 10) eColor = '#ff3333';
            else if (pctNum <= 30) eColor = '#ff8800';

            content = `<div class="energy-container">
                        <div class="energy-bar-wrap">
                            <div class="energy-bar-fill" style="width:${pctNum}%;background-color:${eColor}"></div>
                        </div>
                        <span class="energy-pct" style="color:${eColor}">${pctNum}<small>%</small></span>
                       </div>`;
            break;

        case 'TYRE_INFO':
        case 'TYRES':
        case 'TYRE':
            const t = car.tires || car.Tyres || {};
            const fl = extractCompoundLetter(t.FL);
            const fr = extractCompoundLetter(t.FR);
            const rl = extractCompoundLetter(t.RL);
            const rr = extractCompoundLetter(t.RR);

            if (fl !== '?' && fl === fr && fr === rl && rl === rr) {
                content = `<div class="tyre-status-box" style="background:transparent;padding:0;">
                                <div class="tyre-single tyre-${fl.toLowerCase()}">${fl}</div>
                           </div>`;
            } else {
                content = `<div class="tyre-grid">
                                <div class="tyre-dot tyre-${fl.toLowerCase()}"></div>
                                <div class="tyre-dot tyre-${fr.toLowerCase()}"></div>
                                <div class="tyre-dot tyre-${rl.toLowerCase()}"></div>
                                <div class="tyre-dot tyre-${rr.toLowerCase()}"></div>
                           </div>`;
            }
            break;

        case 'NAME':
            const teamDisplay = utils.getTeamDisplayName(car);
            const driverUpper = (car.driverNameFormatted || car.driverName || car.DriverName || 'UNKNOWN').toUpperCase();
            content = `<div class="wec-data-content-name">
                            <span class="val name">${driverUpper}</span>
                            <span class="val team">${teamDisplay}</span>
                       </div>`;
            break;
    }

    let statusIndicatorHtml = '';
    const inPits     = !!(car.inPits || car.InPits);
    const inGarage   = !!(car.inGarage || car.InGarage);
    const isFinished = statusText === 'FINISH' || statusText === 'CHECKERED' || !!car.isFinished || !!car.IsFinished || car.finishStatus === 1;

    if (isFinished) {
        statusIndicatorHtml = '<div class="wec-finish-indicator">🏁</div>';
    } else if (inGarage) {
        statusIndicatorHtml = '<div class="wec-pit-indicator" style="color:#ff4444">G</div>';
    } else if (inPits) {
        statusIndicatorHtml = '<div class="wec-pit-indicator">P</div>';
    }

    return `<div class="wec-data-content ${(inPits || isFinished) ? 'has-indicator' : ''}">
                ${content}
                ${statusIndicatorHtml}
            </div>`;
}

export function renderWecExtraInfo(car) {
    const lastLap = car.lastLapTime || car.LastLapTime || 0;
    const timeIntoLap = car.timeIntoLap || car.TimeIntoLap || 0;
    const statusText = (car.statusText || car.Stats || '').toUpperCase();
    const isOutLap = statusText.includes('OUT LAP');
    const showLastLap = lastLap > 0 && (timeIntoLap < 15 || isOutLap);

    if (!showLastLap) return '';

    const content = utils.formatTime(lastLap);
    return `
        <div class="wec-extra-info-wrap">
            <div class="wec-extra-info no-label">
                <div class="wec-extra-value">${content}</div>
            </div>
        </div>
    `;
}

let wecBadgeInterval;
window.wecBadgeFlipState = false;

function startWecBadgeAnimation() {
    if (wecBadgeInterval) clearInterval(wecBadgeInterval);
    wecBadgeInterval = setInterval(() => {
        if (document.body.classList.contains('state-fcy')) return;
        if (document.body.classList.contains('state-session-finished')) return;
        window.wecBadgeFlipState = !window.wecBadgeFlipState;
        document.querySelectorAll('.wec-category-header').forEach(h => {
            h.classList.toggle('show-race', window.wecBadgeFlipState);
        });
    }, 14000);
}

document.addEventListener('DOMContentLoaded', () => { startWecBadgeAnimation(); });
