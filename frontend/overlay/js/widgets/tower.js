import { state } from '../state.js';
import * as utils from '../utils.js';


export function renderTower(standings) {
    const isWecTheme = document.body.classList.contains("WEC");
    if (isWecTheme) {
        renderWecTower(standings);
        return;
    }

    const modeLabels = {
        "GAP": "GAP",
        "INTERVAL": "INTERVAL",
        "STOPS": "STOPS",
        "POSITIONS": "POS",
        "ENERGY": "ENERGY",
        "TYRE": "TYRE"
    };
    const currentModeLabel = modeLabels[state.currentTowerMode] || "GAP";
    const isQualifyMode = !!(state.currentOverlayState && state.currentOverlayState.qualifyInfo);

    // 1. Improvement Detection & Class Bests (EVERY frame)
    const classBests = {};
    if (isQualifyMode && standings) {
        standings.forEach(d => {
            if (d.isHeader || d.isSeparator) return;
            // Pre-calculate class bests
            const cls = d.Class;
            if (!classBests[cls] || (d.BestLapTime > 0 && d.BestLapTime < classBests[cls])) {
                classBests[cls] = d.BestLapTime;
            }

            // Detect improvements for timers
            if (d.BestLapTime > 0) {
                if (!state.driverLastBestLaps[d.SlotID]) {
                    state.driverLastBestLaps[d.SlotID] = d.BestLapTime; 
                } else if (d.BestLapTime < state.driverLastBestLaps[d.SlotID]) {
                    state.driverLastBestLaps[d.SlotID] = d.BestLapTime;
                    state.driverHighlightTimers[d.SlotID] = Date.now();
                    const isClassLeader = d.ClassPosition === 1;
                    state.driverHighlightTypes[d.SlotID] = (d.IsCB || isClassLeader) ? 'cb' : 'pb';
                }
            }
        });
    }

    // 2. FLIP Animation Part 1: Record old positions
    const oldPositions = {};
    const rows = state.towerRows.querySelectorAll('.tower-row[data-slot-id]');
    for (let i = 0; i < rows.length; i++) {
        const el = rows[i];
        const id = el.dataset.slotId;
        oldPositions[id] = el.getBoundingClientRect().top;
    }

    // 3. DOM Reconciliation: Sync nodes with standings
    const existingNodes = Array.from(state.towerRows.children);
    const nodesByTag = {};
    existingNodes.forEach(node => {
        const id = node.dataset.slotId || node.dataset.headerId || node.innerText;
        nodesByTag[id] = node;
    });

    // Check if we should hide "OUT LAP" (ugly at race start)
    const sessionType = (state.currentSessionData) ? state.currentSessionData.type : "";
    const leaderLaps = (state.currentSessionData) ? state.currentSessionData.leaderLaps : 0;
    const isRaceStart = (sessionType === "RACE" && leaderLaps < 1);

    standings.forEach((d, idx) => {
        const id = d.isHeader ? `H-${d.Class}` : (d.isSeparator ? `SEP-${idx}` : d.SlotID);
        let node = nodesByTag[id];

        if (!node) {
            // Create new node if it doesn't exist
            node = document.createElement('div');
            if (d.isHeader) {
                node.className = 'tower-class-header';
                node.dataset.headerId = id;
            } else if (d.isSeparator) {
                node.className = 'tower-separator';
                node.textContent = '...';
            } else {
                node.className = 'tower-row';
                node.dataset.slotId = id;
                node.innerHTML = `
                    <div class="tower-pos"></div>
                    <div class="tower-logo"></div>
                    <div class="tower-name">
                        <span class="driver-name-text"></span>
                        <div class="pit-wrap"></div>
                    </div>
                    <div class="tower-gap"></div>
                    <div class="tower-sectors hidden">
                        <div class="tower-sector-dash s1"></div>
                        <div class="tower-sector-dash s2"></div>
                        <div class="tower-sector-dash s3"></div>
                    </div>
                `;
            }
        }

        // Move node to correct position in DOM if necessary
        if (state.towerRows.children[idx] !== node) {
            state.towerRows.insertBefore(node, state.towerRows.children[idx] || null);
        }

        // 4. Update Node Content (only changed parts)
        if (d.isHeader) {
            const clsLower = (d.Class || "").toLowerCase();
            let clsMapping = 'cls-unknown';
            if (clsLower.includes('hyper')) clsMapping = 'cls-hyper';
            else if (clsLower.includes('lmp2')) clsMapping = 'cls-lmp2';
            else if (clsLower.includes('lmp3')) clsMapping = 'cls-lmp3';
            else if (clsLower.includes('gte')) clsMapping = 'cls-gte';
            else if (clsLower.includes('lmgt3') || clsLower.includes('gt3')) clsMapping = 'cls-lmgt3';

            node.className = `tower-class-header ${clsMapping}`;
            const cleanClassName = d.Class.replace(/_/g, ' ');
            let headerText = `${cleanClassName} - ${currentModeLabel}`;
            if (isQualifyMode) headerText = `${cleanClassName} QUALIFYING`;
            if (node.textContent !== headerText) node.textContent = headerText;
        } else if (!d.isSeparator) {
            // Driver Row Updates
            const clsLower = (d.Class || "").toLowerCase();
            let clsMapping = 'cls-unknown';
            if (clsLower.includes('hyper')) clsMapping = 'cls-hyper';
            else if (clsLower.includes('lmp2')) clsMapping = 'cls-lmp2';
            else if (clsLower.includes('lmp3')) clsMapping = 'cls-lmp3';
            else if (clsLower.includes('gte')) clsMapping = 'cls-gte';
            else if (clsLower.includes('lmgt3') || clsLower.includes('gt3')) clsMapping = 'cls-lmgt3';

            const isFocused = d.IsFocused || false;
            const qClass = isQualifyMode ? 'qualify-mode-active' : '';
            const highlightActive = isQualifyMode && d.BestLapTime > 0 && state.driverHighlightTimers[d.SlotID] && (Date.now() - state.driverHighlightTimers[d.SlotID] < 10000);
            const latchedType = state.driverHighlightTypes[d.SlotID] || '';
            const improvementClass = highlightActive ? `improvement-${latchedType}` : '';

            // Combine classes carefully
            node.className = `tower-row ${clsMapping} ${isFocused ? 'focused-row' : ''} ${qClass} ${improvementClass}`.trim();

            // Rank/Pos
            const posEl = node.querySelector('.tower-pos');
            if (posEl) {
                let posHtml = '';
                if (d.FinishStatus === 3) {
                    posHtml = '<span class="status-dq">DQ</span>';
                    node.classList.add('is-dq');
                } else if (d.FinishStatus === 2 || d.FinishStatus === 4) {
                    posHtml = '<span class="status-dnf">DNF</span>';
                    node.classList.add('is-dnf');
                } else {
                    const ord = utils.getOrdinal(d.ClassPosition).replace(/[0-9]/g, '');
                    posHtml = `${d.ClassPosition}<sup>${ord}</sup>`;
                    node.classList.remove('is-dq', 'is-dnf');
                }
                if (posEl.innerHTML !== posHtml) posEl.innerHTML = posHtml;
            }

            // Logo
            const logoEl = node.querySelector('.tower-logo');
            if (logoEl) {
                const logoHtml = utils.getManufacturerLogo(d.CarName, d.Class, d.vehicleFilename, "tower-logo-img", d.Manufacturer);
                if (logoEl.innerHTML !== logoHtml) logoEl.innerHTML = logoHtml;
            }

            // Name & Pit
            const nameEl = node.querySelector('.driver-name-text');
            if (nameEl) {
                let displayName = d.DriverName;
                if (state.currentOverlayState && state.currentOverlayState.abbreviateNames) {
                    displayName = utils.formatDriverNameAbbr(d.DriverName);
                }
                if (nameEl.textContent !== displayName) nameEl.textContent = displayName;
                const isRetired = d.Stats === "DNF" || d.FinishStatus === 2 || d.FinishStatus === 4;
                const isInGarage = d.InGarage || false;
                nameEl.className = `driver-name-text ${isRetired ? 'is-retired' : ''} ${isInGarage ? 'is-in-garage' : ''}`.trim();
            }

            const pitWrap = node.querySelector('.pit-wrap');
            if (pitWrap) {
                let pitHtml = '';
                if (d.Penalties > 0) pitHtml += '<div class="penalty-dot"></div>';
                
                if (d.PitRequested) pitHtml += '<div class="pit-indicator pit-flashing">P</div>';
                else if (d.InPits && !d.InGarage) pitHtml += '<div class="pit-indicator">P</div>';
                
                if (pitWrap.innerHTML !== pitHtml) pitWrap.innerHTML = pitHtml;
            }

            // Gap
            const gapEl = node.querySelector('.tower-gap');
            if (gapEl) {
                // Se o modo atual for TYRE, desenha as 4 bolinhas minimalistas
                if (state.currentTowerMode === "TYRE") {
                    const t = d.Tyres && d.Tyres.FL !== "?" ? d.Tyres : { FL: "?", FR: "?", RL: "?", RR: "?" };
                    let tyreHtml = "";
                    
                    if (t.FL !== "?" && t.FL === t.FR && t.FR === t.RL && t.RL === t.RR) {
                        tyreHtml = `
                            <div class="tyre-status-box" style="background-color: transparent !important; padding: 0;">
                                <div class="tyre-single tyre-${t.FL}">${t.FL}</div>
                            </div>
                        `;
                    } else {
                        tyreHtml = `
                            <div class="tyre-grid">
                                <div class="tyre-dot tyre-${t.FL}"></div>
                                <div class="tyre-dot tyre-${t.FR}"></div>
                                <div class="tyre-dot tyre-${t.RL}"></div>
                                <div class="tyre-dot tyre-${t.RR}"></div>
                            </div>
                        `;
                    }
                    
                    // Adiciona uma classe específica para remover paddings/text-align que possam estragar o grid
                    gapEl.classList.add('mode-tyre');
                    if (gapEl.innerHTML !== tyreHtml) gapEl.innerHTML = tyreHtml;
                } 
                // Se for outro modo (Gap, Interval, Energy), usa a sua função normal
                else {
                    gapEl.classList.remove('mode-tyre'); // Remove a classe extra quando muda de modo
                    const cBest = classBests[d.Class] || 0;
                    const val = utils.getRightValueForMode(d, state.currentTowerMode, isQualifyMode, cBest);
                    if (gapEl.innerHTML !== val) gapEl.innerHTML = val;
                }
            }

            // Sectors
            const sectorsWrap = node.querySelector('.tower-sectors');
            if (sectorsWrap) {
                sectorsWrap.classList.toggle('hidden', !isQualifyMode);
                if (isQualifyMode) {
                    const sectors = sectorsWrap.querySelectorAll('.tower-sector-dash');
                    const secIdx = d.CurSectorIdx;
                    const timeIntoLap = d.TimeIntoLap;
                    let sVals = [0, 0, 0];
                    if (secIdx === 1 && timeIntoLap < 20) sVals = [d.LastLapS1 || 0, d.LastLapS2 || 0, d.LastLapS3 || 0];
                    else if (secIdx === 2) sVals[0] = d.CurS1 || 0;
                    else if (secIdx === 0) { sVals[0] = d.CurS1 || 0; sVals[1] = d.CurS2 || 0; }

                    sectors.forEach((sEl, i) => {
                        const val = sVals[i];
                        const status = i===0 ? d.S1Status : (i===1 ? d.S2Status : d.S3Status);
                        let sClass = 'tower-sector-dash';
                        if (val > 0) {
                            if (status === 'PURPLE') sClass += ' cb';
                            else if (status === 'GREEN') sClass += ' pb';
                            else sClass += ' slower';
                        }
                        if (sEl.className !== sClass) sEl.className = sClass;
                    });
                }
            }

            // Last Lap Popup
            const isFinished = !!d.IsFinished;
            const isDNF = d.Stats === "DNF";
            const stats = d.Stats || "";
            const isOutLap = stats.includes('OUT LAP') && !isRaceStart;
            
            // Show logic: recent lap (20s) OR out lap OR finished
            const showLastLap = !isDNF && ( (d.LastLapTime > 0 && d.TimeIntoLap < 20) || isOutLap );
            
            let popup = node.querySelector('.tower-last-lap-popup');

            if (isFinished || showLastLap) {
                let content = "";
                let extraClass = "";

                if (isFinished) {
                    content = '<span class="checkered-icon">🏁</span>';
                    extraClass = "is-finished";
                } else if (isOutLap) {
                    content = stats; 
                } else {
                    content = utils.formatTime(d.LastLapTime);
                }

                if (!popup) {
                    popup = document.createElement('div');
                    popup.className = `tower-last-lap-popup ${extraClass}`;
                    popup.innerHTML = `<span class="ll-time">${content}</span>`;
                    node.appendChild(popup);
                } else {
                    popup.className = `tower-last-lap-popup ${extraClass}`;
                    const timeEl = popup.querySelector('.ll-time');
                    if (timeEl && timeEl.innerHTML !== content) timeEl.innerHTML = content;
                }
            } else if (popup) {
                popup.remove();
            }
        }
    });

    // 5. Cleanup: Remove nodes no longer in standings
    while (state.towerRows.children.length > standings.length) {
        state.towerRows.removeChild(state.towerRows.lastChild);
    }

    // 6. Record Metadata
    state.towerRows.dataset.lastMode = state.currentTowerMode;
    state.towerRows.dataset.lastQualify = isQualifyMode ? "1" : "0";

    // 7. FLIP Animation Part 2: Transition
    const newRows = state.towerRows.querySelectorAll('.tower-row[data-slot-id]');
    for (let i = 0; i < newRows.length; i++) {
        const el = newRows[i];
        const id = el.dataset.slotId;
        if (oldPositions[id] !== undefined) {
            const newRect = el.getBoundingClientRect();
            const deltaY = oldPositions[id] - newRect.top;

            if (deltaY !== 0) {
                // Invert
                el.style.transition = 'none';
                el.style.transform = `translateY(${deltaY}px)`;
                el.offsetHeight; // Force reflow

                // Play
                requestAnimationFrame(() => {
                    el.style.transition = 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
                    el.style.transform = 'translateY(0)';
                    
                    setTimeout(() => {
                        if (el.style.transform === 'translateY(0px)' || el.style.transform === 'translateY(0)') {
                             el.style.transform = '';
                             el.style.transition = '';
                        }
                    }, 600);
                });
            }
        }
    }
}
