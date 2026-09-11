import { state } from '../state.js';
import * as utils from '../utils.js';

export function updateResultsLogic(data) {
    if (!data.standings || data.standings.length === 0) return;

    const now = Date.now();
    const elapsed = now - state.lastResultsUpdateTime;
    const resultsSlideDuration = 10000; // 10 seconds per slide
    const isWecTheme = document.body.classList.contains('WEC');

    const presentClasses = [...new Set(data.standings.map(d => d.Class))];
    const classPriority = ["hyper", "lmp2", "lmp3", "gte", "lmgt3", "gt3"];
    presentClasses.sort((a, b) => {
        let indexA = classPriority.findIndex(c => a.toLowerCase().includes(c));
        let indexB = classPriority.findIndex(c => b.toLowerCase().includes(c));
        return (indexA === -1 ? 99 : indexA) - (indexB === -1 ? 99 : indexB);
    });

    // Check if we need to advance page/class
    if (state.resultsIsFinalScreen) return; // Stay on final screen

    if (!state.resultsCurrentClass || !presentClasses.includes(state.resultsCurrentClass)) {
        state.resultsCurrentClass = presentClasses[0] || '';
        state.resultsCurrentPage = 0;
    }

    const currentClassDrivers = data.standings.filter(d => d.Class === state.resultsCurrentClass);
    const itemsPerPage = isWecTheme ? 10 : 8;
    const totalPages = Math.ceil(currentClassDrivers.length / itemsPerPage);

    if (elapsed > resultsSlideDuration) {
        // Page finished. Check if we need to switch class or show final logo.
        if (state.resultsCurrentPage < totalPages - 1) {
            state.resultsCurrentPage++;
        } else {
            // End of class. Find next class.
            const curIdx = presentClasses.indexOf(state.resultsCurrentClass);
            if (curIdx < presentClasses.length - 1) {
                state.resultsCurrentClass = presentClasses[curIdx + 1];
                state.resultsCurrentPage = 0;
            } else {
                // All classes done. Final screen.
                state.resultsIsFinalScreen = true;
            }
        }
        state.lastResultsUpdateTime = now;
        console.log(`[Results] Status: ${state.resultsIsFinalScreen ? 'FINAL SCREEN' : `Class ${state.resultsCurrentClass} Page ${state.resultsCurrentPage + 1}`}`);
    }

    if (state.resultsIsFinalScreen) {
        if (isWecTheme) renderWecFinalTransition(data);
        else renderResultsScreen(data, state.resultsCurrentClass, state.resultsCurrentPage, presentClasses.length);
    } else {
        if (isWecTheme) {
            renderWecResultsScreen(data, state.resultsCurrentClass, state.resultsCurrentPage, presentClasses.length);
        } else {
            renderResultsScreen(data, state.resultsCurrentClass, state.resultsCurrentPage, presentClasses.length);
        }
    }
}

export function resetResultsState() {
    state.resultsCurrentClass = '';
    state.resultsCurrentPage = 0;
    state.resultsIsFinalScreen = false;
    state.lastResultsUpdateTime = Date.now();
    
    // Clear dataset to force full re-render
    const list = document.getElementById('wec-results-list');
    if (list) {
        delete list.dataset.renderedClass;
        delete list.dataset.renderedPage;
        list.innerHTML = '';
    }
    const stdList = document.getElementById('results-list');
    if (stdList) stdList.innerHTML = '';

    console.log("[Results] State Reset Triggered.");
}


export function renderResultsScreen(data, cls, page, totalClasses) {
    const list = document.getElementById('results-list');
    const finalScreen = document.getElementById('results-final-screen');
    const resultsCont = document.getElementById('results-container');
    const typeEl = document.getElementById('results-session-type');
    const trackEl = document.getElementById('results-track-name');
    const classEl = document.getElementById('results-class-name');
    const pageEl = document.getElementById('results-page-info');
    const leaderTimeEl = document.getElementById('results-leader-time');
    const sponsorImg = document.getElementById('results-sponsor-logo');
    const eventNameEl = document.getElementById('results-event-name');
    const eventRoundEl = document.getElementById('results-event-round');
    const instagramEl = document.getElementById('results-social-instagram');
    const youtubeEl = document.getElementById('results-social-youtube');

    if (eventNameEl) {
        eventNameEl.innerText = (state.currentOverlayState.eventName || "EVENT NAME").toUpperCase();
    }
    if (eventRoundEl) {
        let roundStr = state.currentOverlayState.eventStage || "ROUND --";
        if (!isNaN(roundStr)) roundStr = "ROUND " + roundStr;
        eventRoundEl.innerText = roundStr.toUpperCase();
    }
    if (instagramEl) {
        let handle = state.currentOverlayState.instagramHandle || "@SHERMINATOR";
        if (handle && !handle.startsWith('@')) handle = '@' + handle;
        instagramEl.innerText = handle;
    }
    if (youtubeEl) {
        let handle = state.currentOverlayState.youtubeHandle || "@SHERMINATOR";
        if (handle && !handle.startsWith('@')) handle = '@' + handle;
        youtubeEl.innerText = handle;
    }

    if (sponsorImg) {
        const logo = state.currentOverlayState.sponsorLogo;
        if (logo) {
            const v = state.currentOverlayState.mediaVersion || Date.now();
            sponsorImg.src = `../media/logos/${logo}?v=${v}`;
            sponsorImg.style.display = 'block';
        } else {
            sponsorImg.style.display = 'none';
        }
    }

    if (!list) return;

    if (state.resultsIsFinalScreen) {
        if (resultsCont) resultsCont.classList.add('view-final');
        if (finalScreen) {
            finalScreen.classList.remove('hidden');
            // Resolve custom logo for final screen
            const customLogos = state.currentOverlayState.customLogos || {};
            const finalLogo = finalScreen.querySelector('img');
            if (finalLogo) {
                if (customLogos['default']) {
                    const v = (state.currentOverlayState && state.currentOverlayState.mediaVersion) ? state.currentOverlayState.mediaVersion : '1.0';
                    finalLogo.src = `../media/logos/${customLogos['default']}?v=${v}`;
                } else {
                    const v = (state.currentOverlayState && state.currentOverlayState.mediaVersion) ? state.currentOverlayState.mediaVersion : '1.0';
                    finalLogo.src = `../media/logos/transicao.png?v=${v}`;
                }
            }
        }
        if (typeEl) typeEl.innerText = (data.session.type || "SESSION").toUpperCase();
        if (trackEl) trackEl.innerText = (data.session.track || "TRACK").toUpperCase();
        
        const subtitle = document.querySelector('.results-subtitle');
        if (subtitle) {
            subtitle.innerHTML = `<span id="results-session-type">${(data.session.type || "SESSION").toUpperCase()}</span> • <span id="results-track-name">${(data.session.track || "TRACK").toUpperCase()}</span>`;
        }
        return;
    } else {
        if (resultsCont) resultsCont.classList.remove('view-final');
        if (finalScreen) finalScreen.classList.add('hidden');
        // Restore standard subtitle structure if we are coming back from final (resetting)
        const subtitle = document.querySelector('.results-subtitle');
        if (subtitle && !subtitle.querySelector('#results-class-name')) {
             subtitle.innerHTML = `<span id="results-session-type"></span> • <span id="results-track-name"></span> • <span id="results-class-name" class="results-class-highlight"></span>`;
        }
    }

    // Header Info
    if (typeEl) typeEl.innerText = (data.session.type || "SESSION").toUpperCase();
    if (trackEl) trackEl.innerText = (data.session.track || "TRACK").toUpperCase();
    if (classEl) {
        classEl.innerText = cls.toUpperCase();
        classEl.style.color = utils.getWecClassColor(cls);
    }

    // Filter & Sort
    let filtered = data.standings.filter(d => d.Class === cls);
    filtered.sort((a, b) => {
        return a.ClassPosition - b.ClassPosition;
    });

    const totalPages = Math.ceil(filtered.length / 8);
    if (pageEl) pageEl.innerText = `PAGE ${page + 1}/${totalPages || 1}`;

    const startIdx = page * 8;
    const pageData = filtered.slice(startIdx, startIdx + 8);

    // Leader Time (Absolute P1 or Class P1)
    const leader = filtered[0];
    if (leaderTimeEl) {
        leaderTimeEl.innerText = leader ? utils.formatTime(leader.BestLapTime) : '--:--.---';
        // Always highlight the leader info with a "class best" visual feel
        const leaderCont = leaderTimeEl.closest('.res-leader-info');
        if (leaderCont) {
            leaderCont.classList.add('res-leader-cb-highlight');
        }
    }

    // Render Rows
    let html = '';
    pageData.forEach(d => {
        const isP1 = d.ClassPosition === 1;
        const timeGap = isP1 ? utils.formatTime(d.BestLapTime) : (d.Gap || "");
        const mLogo = utils.getManufacturerLogo(d.CarName, d.Class, d.vehicleFilename, "res-brand-logo-img", d.Manufacturer);
        const barColor = utils.getClassBarColor(d.Class).replace('h2h-', ''); // uses class-bar-hyper style names

        html += `
            <div class="results-row">
                <div class="res-class-indicator ${barColor}"></div>
                <div class="res-col-pos">${d.ClassPosition}</div>
                <div class="res-col-brand">${mLogo}</div>
                <div class="res-col-driver">${d.DriverName}</div>
                <div class="res-col-time ${isP1 ? 'res-p1-time' : 'res-gap-time'}">${timeGap}</div>
            </div>
        `;
    });

    list.innerHTML = html;
}

export function getClassBadge(className) {
    if (!className) return '';
    const cleanCls = className.toLowerCase().replace(/\s+/g, '-');
    const badgeClass = `cls-${cleanCls}`;

    return `<span class="class-badge ${badgeClass}" style="background-color: ${utils.getWecClassColor(className)}">${className.toUpperCase()}</span>`;
}

export function getClassBarColor(className) {
    if (!className) return 'bar-unknown';
    const cls = className.toLowerCase();
    if (cls.includes('hyper')) return 'bar-hyper';
    if (cls.includes('lmp2')) return 'bar-lmp2';
    if (cls.includes('lmp3')) return 'bar-lmp3';
    if (cls.includes('lmgt3') || cls.includes('gt3')) return 'bar-lmgt3';
    if (cls.includes('gte')) return 'bar-gte';
    return 'bar-unknown';
}

export function renderWecResultsScreen(data, cls, page, totalClasses) {
    const list = document.getElementById('wec-results-list');
    const badge = document.getElementById('wec-results-class-badge');
    const sessionTitle = document.getElementById('wec-results-session-type');
    const eventName = document.getElementById('wec-results-event-name');
    
    if (!list) return;

    // Filter and sort drivers for the current class
    const classDrivers = data.standings.filter(d => d.Class === cls)
        .sort((a, b) => a.ClassPosition - b.ClassPosition);

    // Pagination: 10 rows per page for WEC
    const itemsPerPage = 10;
    const start = page * itemsPerPage;
    const paginatedDrivers = classDrivers.slice(start, start + itemsPerPage);

    // Update Headers
    if (badge) {
        badge.innerText = cls.toUpperCase();
        badge.style.backgroundColor = utils.getWecClassColor(cls);
    }
    
    if (sessionTitle) {
        const sType = (data.session.type || 'RACE').toUpperCase();
        sessionTitle.innerText = `${sType} CLASSIFICATION`;
    }
    
    if (eventName) {
        const name = (state.currentOverlayState.eventName || "EVENT NAME").toUpperCase();
        const stage = state.currentOverlayState.eventStage || "1/1";
        eventName.innerText = `${name} - ${stage}`;
    }

    // Update Sponsor & Social
    const sponsorImg = document.getElementById('wec-results-sponsor-logo');
    const instagramEl = document.getElementById('wec-results-instagram');
    const youtubeEl = document.getElementById('wec-results-youtube');

    if (sponsorImg) {
        const logo = state.currentOverlayState.sponsorLogo;
        if (logo) {
            const v = state.currentOverlayState.mediaVersion || Date.now();
            sponsorImg.src = `../media/logos/${logo}?v=${v}`;
            sponsorImg.style.display = 'block';
        } else {
            sponsorImg.style.display = 'none';
        }
    }

    if (instagramEl) {
        let handle = state.currentOverlayState.instagramHandle || "@SHERMINATOR";
        if (handle && !handle.startsWith('@')) handle = '@' + handle;
        instagramEl.innerText = handle;
    }

    if (youtubeEl) {
        let handle = state.currentOverlayState.youtubeHandle || "@SHERMINATOR";
        if (handle && !handle.startsWith('@')) handle = '@' + handle;
        youtubeEl.innerText = handle;
    }

    // --- SELECTIVE UPDATE LOGIC TO PREVENT ANIMATION FLICKER ---
    const listStyle = window.getComputedStyle(list);
    const isHidden = listStyle.display === 'none' || list.classList.contains('hidden');
    
    // If class or page changed, OR if list was just hidden (now showing), do a full render
    const needsFullRender = list.dataset.renderedClass !== cls || 
                           list.dataset.renderedPage !== String(page) ||
                           isHidden;

    if (!needsFullRender) {
        // Just update existing rows
        const rows = list.querySelectorAll('.wec-results-row');
        paginatedDrivers.forEach((driver, idx) => {
            const row = rows[idx];
            if (!row) return;

            // Update Time
            let timeValue = "";
            const sType = (data.session.type || 'RACE').toUpperCase();
            if (driver.ClassPosition === 1) {
                if (sType === 'RACE') {
                    const laps = data.session.leaderLaps || driver.TotalLaps || 0;
                    timeValue = `${laps} LAPS`;
                } else {
                    timeValue = utils.formatTime(driver.BestLapTime);
                }
            } else {
                timeValue = driver.Gap || (sType === 'RACE' ? "" : "NO TIME");
            }

            const timeEl = row.querySelector('.wec-res-time');
            if (timeEl && timeEl.innerText !== timeValue) {
                timeEl.innerText = timeValue;
            }

            // Update Position (Ordinal for P1)
            const posStr = (page === 0 && idx === 0) ? utils.getOrdinal(driver.ClassPosition) : driver.ClassPosition;
            const posEl = row.querySelector('.wec-res-pos');
            if (posEl && posEl.innerText !== String(posStr)) {
                posEl.innerText = posStr;
            }
        });
        return;
    }

    // Full Render needed
    list.dataset.renderedClass = cls;
    list.dataset.renderedPage = page;

    // Render Rows
    let html = '';
    paginatedDrivers.forEach((driver, idx) => {
        const isP1 = driver.ClassPosition === 1;

        let timeValue = "";
        const sType = (data.session.type || 'RACE').toUpperCase();
        
        if (isP1) {
            if (sType === 'RACE') {
                const laps = data.session.leaderLaps || driver.TotalLaps || 0;
                timeValue = `${laps} LAPS`;
            } else {
                timeValue = utils.formatTime(driver.BestLapTime);
            }
        } else {
            timeValue = driver.Gap || (sType === 'RACE' ? "" : "NO TIME");
        }

        const mName = utils.getManufacturerName(driver.CarName, driver.Class, driver.vehicleFilename);
        const manClass = utils.getManufacturerColorClass(mName);
        const mLogo = utils.getManufacturerLogo(driver.CarName, driver.Class, driver.vehicleFilename, "wec-res-logo-img", driver.Manufacturer);
        const cUpper = cls.toUpperCase();
        let classAbbr = cls.substring(0, 3).toUpperCase();
        if (cUpper.includes('HYPER')) classAbbr = 'HY';
        else if (cUpper.includes('GT3')) classAbbr = 'GT3';
        else if (cUpper.includes('LMP2')) classAbbr = 'P2';
        else if (cUpper.includes('LMP3')) classAbbr = 'P3';
        
        const posStr = (page === 0 && idx === 0) ? utils.getOrdinal(driver.ClassPosition) : driver.ClassPosition;

        html += `
            <div class="wec-results-row ${isP1 ? 'p1' : ''} ${manClass}" style="animation-delay: ${idx * 0.1}s">
                <div class="wec-res-pos">${posStr}</div>
                <div class="wec-res-logo-cell">${mLogo}</div>
                <div class="wec-res-num-cell">${driver.CarNumber || utils.extractCarNumber(driver.CarName)}</div>
                <div class="wec-res-accent-bar"></div>
                <div class="wec-res-driver">${driver.DriverName.toUpperCase()}</div>
                <div class="wec-res-class">${classAbbr}</div>
                <div class="wec-res-time">${timeValue}</div>
            </div>
        `;
    });

    // Find Fastest Lap of the Class (using the pre-filtered classDrivers array)
    const validLaps = classDrivers.filter(d => d.BestLapTime > 0);
    const fastestDriver = validLaps.reduce((prev, current) => (prev.BestLapTime < current.BestLapTime) ? prev : current, validLaps[0]);

    const fastestCont = document.getElementById('wec-results-fastest-cont');
    if (fastestCont) {
        if (fastestDriver) {
            const mNameFastest = utils.getManufacturerName(fastestDriver.CarName, fastestDriver.Class, fastestDriver.vehicleFilename);
            const fastestCarNum = fastestDriver.CarNumber || utils.extractCarNumber(fastestDriver.CarName);
            const fastestLapNum = fastestDriver.BestLapNum || "";

            fastestCont.innerHTML = `
                <div class="wec-res-fastest-lap" style="animation-delay: 1.1s">
                    <div class="wec-fastest-icon">
                        <svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 20a7 7 0 0 1-7-7 7 7 0 0 1 7-7 7 7 0 0 1 7 7 7 7 0 0 1-7 7m0-16a9 9 0 0 0-9 9 9 9 0 0 0 9 9 9 9 0 0 0 9-9c0-2.12-.74-4.07-1.97-5.61l1.42-1.42c.45-.44.45-1.18 0-1.63-.44-.45-1.18-.45-1.63 0l-1.42 1.42C14.07 4.74 12.12 4 12 4m1-1V1h-2v2h2m-1 5c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5m0 2c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3z"/></svg>
                    </div>
                    <div class="wec-fastest-time">${utils.formatTime(fastestDriver.BestLapTime)}</div>
                    <div class="wec-fastest-team">${utils.getTeamDisplayName(fastestDriver).toUpperCase()}</div>
                    <div class="wec-fastest-driver">${fastestDriver.DriverName.toUpperCase()}</div>
                    <div class="wec-fastest-info">${fastestCarNum} | ${mNameFastest.toUpperCase()}</div>
                    <div class="wec-fastest-lap-num">${fastestLapNum ? 'LAP ' + fastestLapNum : ''}</div>
                </div>
            `;
        } else {
            fastestCont.innerHTML = '';
        }
    }

    list.innerHTML = html;
}

export function renderWecFinalTransition(data) {
    const list = document.getElementById('wec-results-list');
    const badge = document.getElementById('wec-results-class-badge');
    
    if (badge) badge.style.display = 'none';
    if (list) {
        list.style.display = 'flex';
        list.style.justifyContent = 'center';
        list.style.alignItems = 'center';
        list.style.height = '600px';
        list.innerHTML = `
            <div class="wec-final-logo-wrap" style="text-align: center; width: 100%;">
                <img src="../media/logos/wec_wec.png" style="max-width: 600px; opacity: 0.9;">
            </div>
        `;
    }
}

