// ==========================================================
// SHERMINATOR WEC OVERLAY — OFICIAL 1:1 LMU BROADCAST
// Caixinha de dados, logos nativas do backend, (P) piscando
// ==========================================================

(function() {
    'use strict';

    const state = {
        currentFocusedClass: 'ALL',
        vehicleMetadata: {},
        currentOverlayState: { is_on_track: true, standingsTower: true },
        currentSessionData: null,
        currentTowerMode: 'GAP',
        lastManualServerClass: null,
        lastAutoTargetClass: null
    };

    // ── Estado das Bandeiras (para uso no header da torre) ──
    const flagState = {
        isFCY: false,
        isGreen: false,        // Temporário — só pisca por ~8s na largada/restart
        isFinished: false,
        prevGamePhase: null,
        greenFlagTimer: null,  // setTimeout handle
    };

    window.currentWecSessionName = 'FREE PRACTICE';

    function formatTime(seconds) {
        if (!seconds || seconds <= 0) return '—:—.—';
        const m = Math.floor(seconds / 60);
        const s = (seconds % 60).toFixed(3).padStart(6, '0');
        return `${m}:${s}`;
    }

    function getDriver3LetterAbbr(driverName, formattedName) {
        let nameToUse = '';
        if (formattedName && formattedName.length >= 3) {
            nameToUse = formattedName;
        } else if (driverName) {
            const parts = driverName.trim().split(' ');
            nameToUse = parts.length > 1 ? parts[parts.length - 1] : parts[0];
        } else {
            return '---';
        }
        return nameToUse.replace(/[^a-zA-ZÀ-ÿ]/g, '').substring(0, 3).toUpperCase();
    }

    function getDriverLastName(car) {
        if (!car) return 'PILOTO';
        let name = (car.driverNameFormatted || '').trim();
        if (name) {
            // Se começar com inicial ex: "A. SURNAME" ou "O. JARVIS", remove a inicial
            name = name.replace(/^[A-ZÀ-ÿ]\.\s+/i, '').trim();
            if (name.length > 0) return name.toUpperCase();
        }
        const raw = (car.driverName || '').trim();
        if (raw) {
            const parts = raw.split(/\s+/);
            if (parts.length > 1) {
                return parts.slice(1).join(' ').toUpperCase();
            }
            return parts[0].toUpperCase();
        }
        return 'PILOTO';
    }

    function getManufacturerLogoUrl(car) {
        if (!car) return '';
        let logo = (car.manufacturerLogo || '').trim();

        // Limpa duplicações se houver (ex: Brand=Brand=... ou .svg.svg)
        if (logo) {
            logo = logo.replace(/^(Brand=)+/gi, 'Brand=');
            logo = logo.replace(/(\.svg)+$/gi, '.svg');
            logo = logo.replace('Brand=Brand=', 'Brand=');
            if (!logo.startsWith('Brand=')) {
                logo = 'Brand=' + logo;
            }
            if (!logo.endsWith('.svg')) {
                logo = logo + '.svg';
            }
            return `http://localhost:6397/start/images/manufacturer/${encodeURIComponent(logo).replace('%3D', '=')}`;
        }

        // Fallback robusto por texto, equipe e classe
        const text = `${car.manufacturer || ''} ${car.teamName || ''} ${car.vehicleFilename || ''} ${car.driverName || ''}`.toUpperCase();
        const cls = (car.carClass || '').toUpperCase();

        if (text.includes('FERRARI')) return 'http://localhost:6397/start/images/manufacturer/Brand=Ferrari.svg';
        if (text.includes('PORSCHE')) return 'http://localhost:6397/start/images/manufacturer/Brand=Porsche.svg';
        if (text.includes('BMW')) return 'http://localhost:6397/start/images/manufacturer/Brand=BMW.svg';
        if (text.includes('CADILLAC')) return 'http://localhost:6397/start/images/manufacturer/Brand=Cadillac%20Dark.svg';
        if (text.includes('TOYOTA')) return 'http://localhost:6397/start/images/manufacturer/Brand=Toyota.svg';
        if (text.includes('ASTON')) return 'http://localhost:6397/start/images/manufacturer/Brand=Aston%20Martin.svg';
        if (text.includes('MCLAREN')) return 'http://localhost:6397/start/images/manufacturer/Brand=McLaren.svg';
        if (text.includes('CORVETTE') || text.includes('CHEVROLET')) return 'http://localhost:6397/start/images/manufacturer/Brand=Corvette.svg';
        if (text.includes('LAMBORGHINI')) return 'http://localhost:6397/start/images/manufacturer/Brand=Lamborghini.svg';
        if (text.includes('LEXUS')) return 'http://localhost:6397/start/images/manufacturer/Brand=Lexus%20Dark.svg';
        if (text.includes('FORD')) return 'http://localhost:6397/start/images/manufacturer/Brand=Ford.svg';
        if (text.includes('PEUGEOT')) return 'http://localhost:6397/start/images/manufacturer/Brand=Peugeot.svg';
        if (text.includes('ALPINE')) return 'http://localhost:6397/start/images/manufacturer/Brand=Alpine.svg';
        if (text.includes('DUQUEINE')) return 'http://localhost:6397/start/images/manufacturer/Brand=Duqueine.svg';
        if (text.includes('GINETTA'))  return 'http://localhost:6397/start/images/manufacturer/Brand=Ginetta.svg';
        if (text.includes('LIGIER') || cls === 'P3' || cls === 'LMP3')   return 'http://localhost:6397/start/images/manufacturer/Brand=Ligier.svg';
        if (text.includes('ORECA') || cls === 'P2' || cls === 'LMP2')    return 'http://localhost:6397/start/images/manufacturer/Brand=Oreca.svg';
        
        return '';
    }


    function getWecClassMapping(cls) {
        if (!cls) return 'unknown';
        const l = String(cls).toLowerCase().trim();
        if (l === 'hy' || l.includes('hyper') || l.includes('pro')) return 'hypercar';
        if (l.includes('elms') && (l.includes('lmp2') || l.includes('p2'))) return 'lmp2-elms';
        if (l === 'p2' || l.includes('lmp2')) return 'lmp2';
        if (l === 'p3' || l.includes('lmp3')) return 'lmp3';
        if (l === 'gt3' || l.includes('lmgt3') || (l.includes('gt3') && !l.includes('gte'))) return 'lmgt3';
        if (l.includes('gte')) return 'gte';
        return 'unknown';
    }

    function getWecClassDisplayName(cls) {
        const mapped = getWecClassMapping(cls);
        if (mapped === 'hypercar') return 'HYPERCAR';
        if (mapped === 'lmp2-elms') return 'LMP2 ELMS';
        if (mapped === 'lmp2') return (String(cls).toUpperCase().includes('WEC') ? 'LMP2 WEC' : 'LMP2');
        if (mapped === 'lmp3') return 'LMP3';
        if (mapped === 'lmgt3') return 'LMGT3';
        if (mapped === 'gte') return 'LMGTE';
        return String(cls).toUpperCase();
    }

    function getWecClassColor(cls) {
        const mapped = getWecClassMapping(cls);
        if (mapped === 'hypercar') return '#e10600';
        if (mapped === 'lmp2-elms') return '#005696';
        if (mapped === 'lmp2') return '#7FB5FF';
        if (mapped === 'lmp3') return '#800080';
        if (mapped === 'lmgt3') return '#00b33c';
        if (mapped === 'gte') return '#e65100';
        return '#333333';
    }

    let previousRanksBySlot = {};
    // Tracks active position-change arrows: {slotID: {dir: 'up'|'down', clearAt: timestamp}}
    const positionChangeMap = {};
    // Blocks innerHTML rebuild while FLIP animation is playing
    let towerRebuildBlockedUntil = 0;
    // Rastreia voltas anteriores para exibir flash da última volta por 3 segundos em modo GAP / INTERVAL
    const previousLapsBySlot = {};
    const lapFlashMap = {};

    const CHECKERED_FLAG_SVG = `<div class="wec-finish-flag-wrap" title="FINISHED"><svg class="wec-checkered-flag-svg" viewBox="0 0 20 14" width="18" height="13"><rect width="20" height="14" fill="#ffffff" rx="1"/><rect x="0" y="0" width="5" height="4.66" fill="#000000"/><rect x="10" y="0" width="5" height="4.66" fill="#000000"/><rect x="5" y="4.66" width="5" height="4.66" fill="#000000"/><rect x="15" y="4.66" width="5" height="4.66" fill="#000000"/><rect x="0" y="9.33" width="5" height="4.66" fill="#000000"/><rect x="10" y="9.33" width="5" height="4.66" fill="#000000"/></svg></div>`;

    function renderWecTower(standings, isRaceSession) {
        const wecLeaderboard = document.getElementById('wec-leaderboard');
        if (!wecLeaderboard) return;

        // Detecta se houve mudança real de posição (ultrapassagem)
        let anyRankChanged = false;
        const currentRanksBySlot = {};
        const now = Date.now();
        standings.forEach(d => {
            if (!d.isHeader && !d.isSeparator && d.slotID !== undefined) {
                const rank = d.classPlace || d.place;
                currentRanksBySlot[d.slotID] = rank;
                if (previousRanksBySlot[d.slotID] !== undefined && previousRanksBySlot[d.slotID] !== rank) {
                    anyRankChanged = true;
                    const dir = rank < previousRanksBySlot[d.slotID] ? 'up' : 'down';
                    positionChangeMap[d.slotID] = { dir, clearAt: now + 4000 };
                }

                // Detecta fechamento de volta (completou nova volta com tempo válido)
                const currentLap = Number(d.lap || 0);
                const prevLap = previousLapsBySlot[d.slotID];
                const lastLapTime = Number(d.lastLapTime || 0);
                if (prevLap !== undefined && currentLap > prevLap && lastLapTime > 0) {
                    lapFlashMap[d.slotID] = {
                        lapTime: formatTime(lastLapTime),
                        lastLapRaw: lastLapTime,
                        clearAt: now + 6000
                    };
                }
                previousLapsBySlot[d.slotID] = currentLap;
            }
        });

        // Expirar setas antigas
        Object.keys(positionChangeMap).forEach(sid => {
            if (positionChangeMap[sid].clearAt <= now) delete positionChangeMap[sid];
        });

        // Expirar flash de volta antigo
        Object.keys(lapFlashMap).forEach(sid => {
            if (lapFlashMap[sid].clearAt <= now) delete lapFlashMap[sid];
        });

        // Só captura posições anteriores se houve ultrapassagem real
        const oldPositions = {};
        if (anyRankChanged) {
            const rows = wecLeaderboard.querySelectorAll('.wec-row[data-slot-id]');
            rows.forEach(el => {
                const id = el.dataset.slotId;
                if (id) oldPositions[id] = el.getBoundingClientRect().top;
            });
        }

        let structuredHtml = '';
        let lastCls = null;
        let classLeaderBest = 0;

        standings.forEach(d => {
            if (d.isHeader) {
                if (lastCls) structuredHtml += '</div></div>';
                const clsMapping = getWecClassMapping(d.Class);
                const classText  = getWecClassDisplayName(d.Class);

                // Detecta se o líder desta classe (P1) ou qualquer carro dela cruzou a linha de chegada
                const allClassCars = standings.filter(c => !c.isHeader && !c.isSeparator && getWecClassMapping(c.carClass) === clsMapping);
                const isClassFinished = allClassCars.some(c => (c.isFinished || c.finishStatus === 1 || (c.statusText && c.statusText.includes('FINISH'))));

                // Texto dinâmico do header conforme estado da bandeira ou modo da torre
                let headerText  = classText;
                let headerExtra = '';
                if (flagState.isFinished || isClassFinished) {
                    headerText  = '';
                    headerExtra = ' flag-finish';
                } else if (flagState.isFCY) {
                    headerText  = 'YELLOW FLAG';
                    headerExtra = ' flag-yellow';
                } else if (flagState.isGreen) {
                    headerText  = 'GREEN FLAG';
                    headerExtra = ' flag-green';
                } else if (isRaceSession && state.currentTowerMode === 'ENERGY') {
                    headerText  = 'VIRTUAL ENERGY TANK';
                }

                const classCarsWithBest = allClassCars.filter(c => c.bestLapTime > 0);
                classLeaderBest = classCarsWithBest.length > 0 ? Math.min(...classCarsWithBest.map(c => c.bestLapTime)) : 0;

                // Ticker: alterna nome da classe ↔ modo da torre a cada 30s
                const isSpecialHeader = (flagState.isFinished || isClassFinished || flagState.isFCY || flagState.isGreen || (isRaceSession && state.currentTowerMode === 'ENERGY'));
                const modeLabelMap = { GAP: 'GAP', INTERVAL: 'INT', NAME: 'PILOTO', ENERGY: 'ENERGIA', STOPS: 'PITSTOPS', POSITIONS: 'POS', LAPS: 'VOLTAS', TYRE: 'PNEUS', TYRES: 'PNEUS', QUALIFY: 'QUALIFY', PRACTICE: 'PRACTICE' };
                const modeLabel = modeLabelMap[state.currentTowerMode] || state.currentTowerMode || (isRaceSession ? 'GAP' : 'MELHOR VOLTA');
                // Negative delay syncs animation phase to wall clock — survives innerHTML rebuilds
                const tickerDelay = -(now % 30000);
                const headerInner = isSpecialHeader
                    ? `<span class="wec-class-title">${headerText}</span>`
                    : `<span class="wec-ticker-class" style="animation-delay:${tickerDelay}ms">${classText}</span><span class="wec-ticker-mode" style="animation-delay:${tickerDelay}ms">${modeLabel}</span>`;

                structuredHtml += `
                    <div class="wec-category wec-cat-${clsMapping}">
                        <div class="wec-category-header wec-cat-${clsMapping}${headerExtra}">
                            ${headerInner}
                        </div>
                        <div class="wec-rows">
                `;
                lastCls = d.Class;

            } else if (d.isSeparator) {
                // Linha separadora entre os primeiros fixos e a janela do focado
                structuredHtml += `
                    <div class="wec-row-separator">
                        <span>···</span>
                    </div>
                `;
            } else {
                const clsMapping = getWecClassMapping(d.carClass);
                const logoUrl = getManufacturerLogoUrl(d);
                const logoHtml = logoUrl ? `<img src="${logoUrl}" class="wec-logo-img" alt="Logo" onerror="this.style.display='none'">` : '';
                const rankDisplay = d.classPlace || d.place || '';
                const isFocused = !!d.isFocused;

                const isInGarage = !!(d.inGarage || (d.statusText && d.statusText === 'GARAGE'));
                const isInPits = !!(d.inPits && !isInGarage);
                const isPitRequested = (d.pitState === 1 || (d.statusText && d.statusText === 'REQ'));
                const manClass = getManufacturerColorClass(d);

                const isCarFinished = !!(d.isFinished || d.finishStatus === 1 || (d.statusText && d.statusText.includes('FINISH')));
                const isNameMode = isRaceSession && (state.currentTowerMode === 'NAME');

                // Líder de classe em qualify → linha roxa
                const isClassLeaderRow = (d.classPlace === 1 || d.gapClass === 'LÍDER');
                const isQualyLeader = !isRaceSession && isClassLeaderRow && (d.bestLapTime > 0);

                // Seta de mudança de posição (visível por 4 segundos)
                const arrowInfo = positionChangeMap[d.slotID];
                const arrowHtml = arrowInfo
                    ? `<span class="wec-pos-arrow ${arrowInfo.dir}">${arrowInfo.dir === 'up' ? '&#9650;' : '&#9660;'}</span>`
                    : '';

                if (isNameMode) {
                    const lastName = getDriverLastName(d);
                    let rightIndicatorHtml = '';
                    if (isCarFinished) {
                        rightIndicatorHtml = CHECKERED_FLAG_SVG;
                    } else if (isPitRequested && !isInGarage) {
                        const isBlinkVisible = (Math.floor(Date.now() / 350) % 2 === 0);
                        const blinkStyle = isBlinkVisible ? '' : 'style="opacity:0;visibility:hidden;"';
                        rightIndicatorHtml = `<div class="wec-pit-circle pit-request-blinking" ${blinkStyle}>P</div>`;
                    } else if (isInPits || isInGarage) {
                        rightIndicatorHtml = `<div class="wec-pit-circle">P</div>`;
                    }

                    structuredHtml += `
                        <div class="wec-row wec-row-name-mode wec-row-${clsMapping} ${manClass} ${isFocused ? 'focused-row' : ''} ${isInGarage ? 'is-in-garage' : ''}${arrowInfo ? ' pos-changing' : ''}" data-slot-id="${d.slotID}">
                            <div class="wec-row-name-main">
                                <div class="wec-rank">${arrowInfo ? '' : rankDisplay}${arrowHtml}</div>
                                <div class="wec-team-logo man-bg ${manClass}">${logoHtml}</div>
                                <div class="wec-car-number">${d.carNumber || ''}</div>
                                <div class="wec-number-band ${manClass}"></div>
                                <div class="wec-driver-fullname" title="${lastName}">${lastName}</div>
                            </div>
                            ${rightIndicatorHtml ? `<div class="wec-name-mode-pit">${rightIndicatorHtml}</div>` : ''}
                        </div>
                    `;
                } else {
                    const abbr = getDriver3LetterAbbr(d.driverName, d.driverNameFormatted);
                    const dataColHtml = renderDataColumnWithSectors(d, isRaceSession, classLeaderBest, isInGarage, isInPits, isPitRequested, isCarFinished);

                    structuredHtml += `
                        <div class="wec-row wec-row-${clsMapping} ${manClass} ${isFocused ? 'focused-row' : ''} ${isInGarage ? 'is-in-garage' : ''}${arrowInfo ? ' pos-changing' : ''}${isQualyLeader ? ' qualy-leader' : ''}" data-slot-id="${d.slotID}">
                            <div class="wec-row-left">
                                <div class="wec-rank">${arrowInfo ? '' : rankDisplay}${arrowHtml}</div>
                                <div class="wec-team-logo man-bg ${manClass}">${logoHtml}</div>
                                <div class="wec-car-number">${d.carNumber || ''}</div>
                                <div class="wec-number-band ${manClass}"></div>
                                <div class="wec-driver-abbr">${abbr}</div>
                            </div>
                            <div class="wec-data-column wec-box-${clsMapping}">
                                ${dataColHtml}
                            </div>
                        </div>
                    `;
                }
            }
        });

        if (lastCls) structuredHtml += '</div></div>';

        // Se o FLIP está rodando, não reconstruir o DOM — a animação CSS seria cancelada
        if (now < towerRebuildBlockedUntil) {
            // Apenas atualiza o mapa de posições para não perder mudanças posteriores
            previousRanksBySlot = currentRanksBySlot;
            return;
        }

        wecLeaderboard.innerHTML = structuredHtml;

        // FLIP Animation: suave e só para carros que de fato mudaram de posição
        if (anyRankChanged) {
            // Bloqueia rebuilds pelo tempo da animação
            towerRebuildBlockedUntil = now + 2200;

            const newRows = wecLeaderboard.querySelectorAll('.wec-row[data-slot-id]');
            newRows.forEach(el => {
                const id = el.dataset.slotId;
                const oldRank = previousRanksBySlot[id];
                const newRank = currentRanksBySlot[id];
                if (oldPositions[id] !== undefined && oldRank !== undefined && oldRank !== newRank) {
                    const deltaY = oldPositions[id] - el.getBoundingClientRect().top;
                    if (Math.abs(deltaY) >= 10) {
                        el.style.transition = 'none';
                        el.style.transform = `translateY(${deltaY}px)`;
                        void el.offsetHeight; // Força reflow síncrono
                        requestAnimationFrame(() => {
                            el.style.transition = 'transform 2s cubic-bezier(0.22, 1, 0.36, 1)';
                            el.style.transform = 'translateY(0)';
                            setTimeout(() => {
                                el.style.transform = '';
                                el.style.transition = '';
                            }, 2050);
                        });
                    }
                }
            });
        }
        previousRanksBySlot = currentRanksBySlot;
    }


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

    function getLapFlashStyles(lapFlash, car, classLeaderBest) {
        if (!lapFlash) return { textStyle: '', boxStyle: '' };
        const rawLt = lapFlash.lastLapRaw || 0;
        const bestLt = Number(car.bestLapTime || 0);

        // 1. Roxo: melhor tempo da classe
        if (classLeaderBest > 0 && rawLt > 0 && rawLt <= (classLeaderBest + 0.005)) {
            return {
                textStyle: ' style="color:#d154ff;font-weight:700;"',
                boxStyle: ''
            };
        }
        // 2. Verde: melhor tempo pessoal do piloto
        if (bestLt > 0 && rawLt > 0 && (rawLt <= bestLt + 0.005 || Math.abs(rawLt - bestLt) < 0.01)) {
            return {
                textStyle: ' style="color:#00e650;font-weight:700;"',
                boxStyle: ''
            };
        }
        // 3. Amarelo: não melhorou o tempo
        return {
            textStyle: ' style="color:#ffd700;font-weight:700;"',
            boxStyle: ''
        };
    }

    function renderDataColumnWithSectors(car, isRaceSession, classLeaderBest, isInGarage, isInPits, isPitRequested, isCarFinished) {
        const isClassLeader = (car.classPlace === 1 || car.gapClass === 'LÍDER');
        const _rawMode = state.currentTowerMode || 'GAP';
        // QUALIFY/PRACTICE modes always use best-lap display regardless of session flag
        const _forceQualify = (_rawMode === 'QUALIFY' || _rawMode === 'PRACTICE');
        const mode = (isRaceSession && !_forceQualify) ? _rawMode : 'GAP';
        const _effectiveIsRace = isRaceSession && !_forceQualify;

        // Indicador de Chegada (🏁), Pit (P) e Pit Request Branco Piscando
        let rightIndicatorHtml = '';
        if (isCarFinished) {
            rightIndicatorHtml = CHECKERED_FLAG_SVG;
        } else if (isPitRequested && !isInGarage) {
            const isBlinkVisible = (Math.floor(Date.now() / 350) % 2 === 0);
            const blinkStyle = isBlinkVisible ? '' : 'style="opacity:0;visibility:hidden;"';
            rightIndicatorHtml = `<div class="wec-pit-circle pit-request-blinking" ${blinkStyle}>P</div>`;
        } else if (isInPits || isInGarage) {
            rightIndicatorHtml = `<div class="wec-pit-circle">P</div>`;
        }

        // 3 tracinhos verticais de setores (| | |) - SOMENTE EM TREINO / QUALI (!isRaceSession)
        let sectorsHtml = '';
        if (!_effectiveIsRace) {
            const sec = (!isInGarage && car.sectorColors) ? car.sectorColors : ['', '', ''];
            sectorsHtml = `<div class="wec-sector-dashes">`;
            for (let i = 0; i < 3; i++) {
                let colorCls = 'sec-off';
                if (sec[i] === 'purple') colorCls = 'sec-purple';
                else if (sec[i] === 'green') colorCls = 'sec-green';
                else if (sec[i] === 'yellow') colorCls = 'sec-yellow';

                sectorsHtml += `<div class="sec-bar ${colorCls}"></div>`;
            }
            sectorsHtml += `</div>`;
        }

        const dataRightHtml = (rightIndicatorHtml || sectorsHtml)
            ? `<div class="wec-data-right">${rightIndicatorHtml}${sectorsHtml}</div>`
            : '';

        // TREINO / QUALIFICAÇÃO: sempre travado no modo de tempos e deltas de classificação
        if (!_effectiveIsRace) {
            let timeOrGapText = '—';
            const lapFlash = lapFlashMap[car.slotID];
            const flashStyles = getLapFlashStyles(lapFlash, car, classLeaderBest);

            if (lapFlash) {
                timeOrGapText = lapFlash.lapTime;
            } else if (isClassLeader) {
                timeOrGapText = car.bestLapTime > 0 ? formatTime(car.bestLapTime) : (car.statusText && car.statusText.includes('OUT') ? 'OUT LAP' : '1ST LAP');
            } else {
                if (car.bestLapTime > 0 && classLeaderBest > 0) {
                    const diff = car.bestLapTime - classLeaderBest;
                    timeOrGapText = diff > 0 ? `+${diff.toFixed(3)}` : formatTime(car.bestLapTime);
                } else if (car.lap >= 1 && (!car.statusText || !car.statusText.includes('OUT'))) {
                    timeOrGapText = '1ST LAP';
                } else if (car.statusText && car.statusText.includes('OUT')) {
                    timeOrGapText = 'OUT LAP';
                } else {
                    timeOrGapText = 'NO TIME';
                }
            }

            return `<div class="wec-data-content-inner"${flashStyles.boxStyle}>
                <span class="wec-time-text"${flashStyles.textStyle}>${timeOrGapText}</span>
                ${dataRightHtml}
            </div>`;
        }

        // CORRIDA: renderiza o modo selecionado na Mesa
        switch (mode) {
            case 'INTERVAL': {
                let timeOrGapText = '—';
                const lapFlash = lapFlashMap[car.slotID];
                const flashStyles = getLapFlashStyles(lapFlash, car, classLeaderBest);

                if (lapFlash) {
                    timeOrGapText = lapFlash.lapTime;
                } else if (isClassLeader) {
                    timeOrGapText = 'LDR';
                } else {
                    timeOrGapText = car.gapInterval && car.gapInterval !== '—' ? car.gapInterval : (car.gapToNext > 0 ? `+${car.gapToNext.toFixed(3)}` : '—');
                }
                return `<div class="wec-data-content-inner"${flashStyles.boxStyle}>
                    <span class="wec-time-text"${flashStyles.textStyle}>${timeOrGapText}</span>
                    ${dataRightHtml}
                </div>`;
            }

            case 'ENERGY': {
                const pct = Math.max(0, Math.min(100, Math.round(car.virtualEnergy !== undefined ? car.virtualEnergy : (car.fuelPct || 0))));
                
                // 5 Barras Segmentadas Oficiais WEC:
                // Seg 1 (0-20%): Vermelho
                // Seg 2 (20-40%): Laranja
                // Seg 3 (40-60%): Amarelo
                // Seg 4 (60-80%): Verde claro / Lima
                // Seg 5 (80-100%): Verde
                const segThresholds = [
                    { min: 1,  cls: 'seg-red' },
                    { min: 21, cls: 'seg-orange' },
                    { min: 41, cls: 'seg-yellow' },
                    { min: 61, cls: 'seg-lime' },
                    { min: 81, cls: 'seg-green' }
                ];

                const barsHtml = segThresholds.map(t => {
                    const isActive = pct >= t.min;
                    return `<div class="wec-energy-seg ${isActive ? t.cls : 'seg-off'}"></div>`;
                }).join('');

                return `<div class="wec-data-content-inner">
                    <div class="wec-energy-tank-row">
                        <div class="wec-energy-bars-group">
                            <div class="wec-energy-segments">
                                ${barsHtml}
                            </div>
                        </div>
                        <span class="wec-energy-pct-text">${pct}<small>%</small></span>
                    </div>
                    ${dataRightHtml}
                </div>`;
            }

            case 'TYRE':
            case 'TYRES':
            case 'TYRE_INFO': {
                const t = car.tires || {};
                const wheels = [
                    extractCompoundLetter(t.FL),
                    extractCompoundLetter(t.FR),
                    extractCompoundLetter(t.RL),
                    extractCompoundLetter(t.RR)
                ];

                const wheelsHtml = wheels.map(compound => {
                    const letter = compound && compound !== '?' ? compound : '—';
                    const cls = compound && compound !== '?' ? `tyre-${compound.toLowerCase()}` : 'tyre-unknown';
                    return `<div class="wec-tyre-circle ${cls}">${letter}</div>`;
                }).join('');

                return `<div class="wec-data-content-inner" style="display:flex;align-items:center;justify-content:space-between;width:100%;">
                    <div class="wec-tyres-inline">
                        ${wheelsHtml}
                    </div>
                    ${dataRightHtml}
                </div>`;
            }

            case 'STOPS': {
                const stopsCount = car.numStops !== undefined ? car.numStops : 0;
                const stopsLabel = stopsCount === 1 ? '1 STOP' : `${stopsCount} STOPS`;
                return `<div class="wec-data-content-inner">
                    <span class="wec-stops-text">${stopsLabel}</span>
                    ${dataRightHtml}
                </div>`;
            }

            case 'POSITIONS': {
                const diff = (car.posChange !== undefined) ? car.posChange : 0;
                let posHtml = '';
                if (diff > 0) {
                    posHtml = `<span class="wec-pos-change gain">▲ ${diff}</span>`;
                } else if (diff < 0) {
                    posHtml = `<span class="wec-pos-change loss">▼ ${Math.abs(diff)}</span>`;
                } else {
                    posHtml = `<span class="wec-pos-change neutral">—</span>`;
                }
                return `<div class="wec-data-content-inner">
                    <div style="display:flex;align-items:center;gap:6px;">
                        <span style="color:#8899ac;font-size:10px;font-weight:800;font-style:italic;">GAIN</span>
                        ${posHtml}
                    </div>
                    ${dataRightHtml}
                </div>`;
            }

            case 'NAME': {
                const lastName = getDriverLastName(car);
                return `<div class="wec-data-content-inner">
                    <span class="wec-driver-fullname" title="${lastName}">${lastName}</span>
                    ${dataRightHtml}
                </div>`;
            }

            case 'GAP':
            default: {
                let timeOrGapText = '—';
                const lapFlash = lapFlashMap[car.slotID];
                const flashStyles = getLapFlashStyles(lapFlash, car, classLeaderBest);

                if (lapFlash) {
                    timeOrGapText = lapFlash.lapTime;
                } else if (isClassLeader) {
                    timeOrGapText = 'LDR';
                } else {
                    let gapStr = car.gapClass;
                    if (!gapStr || gapStr === 'LÍDER') {
                        gapStr = car.gapToLeader > 0 ? `+${car.gapToLeader.toFixed(3)}` : '—';
                    }
                    timeOrGapText = gapStr;
                }
                return `<div class="wec-data-content-inner"${flashStyles.boxStyle}>
                    <span class="wec-time-text"${flashStyles.textStyle}>${timeOrGapText}</span>
                    ${dataRightHtml}
                </div>`;
            }
        }
    }

    function getOrdinalSuffix(n) {
        if (!n || isNaN(n)) return 'th';
        const num = parseInt(n);
        const j = num % 10, k = num % 100;
        if (j === 1 && k !== 11) return 'st';
        if (j === 2 && k !== 12) return 'nd';
        if (j === 3 && k !== 13) return 'rd';
        return 'th';
    }

    function renderDriverStatsBanner(focusedCar) {
        const banner = document.getElementById('driver-stats-banner');
        if (!banner) return;

        const overlayState = state.currentOverlayState || {};
        const showDriverBanner = overlayState.driverStatsBanner !== undefined ? !!overlayState.driverStatsBanner : true;

        // Se o H2H estiver ativo, sempre oculta este banner (prioridade do Duelo)
        const h2hIsActive = !!overlayState.h2h_active;

        if (!showDriverBanner || !focusedCar || h2hIsActive) {
            banner.classList.add('hidden');
            return;
        }

        banner.classList.remove('hidden');

        // Atualiza cor de fundo da montadora no badge box (logo + número)
        const badgeBox = banner.querySelector('.dsb-badge-box');
        if (badgeBox) {
            const mfrClass = getManufacturerColorClass(focusedCar);
            badgeBox.className = `dsb-badge-box man-bg ${mfrClass}`;
        }



        // 1. Posição (Rank) & Sufixo (th/st/nd/rd)
        const rank = focusedCar.classPlace || focusedCar.place || 1;
        const rankEl = banner.querySelector('.dsb-rank-num');
        const suffixEl = banner.querySelector('.dsb-rank-suffix');
        if (rankEl) rankEl.innerText = rank;
        if (suffixEl) suffixEl.innerText = getOrdinalSuffix(rank);

        // 2. Número do Carro
        const numEl = banner.querySelector('.dsb-car-num');
        if (numEl) numEl.innerText = focusedCar.carNumber || '';

        // 3. Logo da Montadora
        const logoImg = banner.querySelector('.dsb-logo-img');
        if (logoImg) {
            const logoUrl = getManufacturerLogoUrl(focusedCar);
            if (logoUrl) {
                logoImg.src = logoUrl;
                logoImg.style.display = 'block';
            } else {
                logoImg.style.display = 'none';
            }
        }

        // 4. Nome e Sobrenome do Piloto
        const fullName = (focusedCar.driverName || 'DRIVER').trim();
        const parts = fullName.split(' ');
        let firstName = '';
        let lastName = fullName;
        if (parts.length > 1) {
            firstName = parts.slice(0, -1).join(' ').toUpperCase();
            lastName = parts[parts.length - 1].toUpperCase();
        }
        const firstEl = banner.querySelector('.dsb-first-name');
        const lastEl = banner.querySelector('.dsb-last-name');
        if (firstEl) firstEl.innerText = firstName;
        if (lastEl) lastEl.innerText = lastName;

        // 5. Nome da Equipe
        const teamEl = banner.querySelector('.dsb-team-name');
        if (teamEl) {
            let team = (focusedCar.teamName || '').toUpperCase();
            team = team.split('#')[0].replace(/:LM|:HE|\b20\d{2}\b/g, '').trim();
            teamEl.innerText = team || 'TEAM';
        }

        // 6. Foto do Piloto (Regra 1: Oficial do Jogo LMU .webp | Regra 2: Pasta local Media/fotos/)
        const photoEl = banner.querySelector('.dsb-driver-photo');
        if (photoEl) {
            // Remove acentos mas preserva letras, números, hífens e espaços
            const cleanAscii = fullName.toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9\s\-]/g, '')
                .trim();

            const withHyphen = cleanAscii.replace(/\s+/g, '_');          // ex: paul-loup_chatin
            const withUnderscore = cleanAscii.replace(/[\s\-]+/g, '_');    // ex: paul_loup_chatin
            const onlyLetters = cleanAscii.replace(/[^a-z0-9]/g, '_');    // fallback
            const lastNorm = lastName.toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9]/g, '');

            const cleanName = fullName.replace(/[\s]+/g, '_');
            const cleanLastName = lastName.replace(/[\s]+/g, '_');
            const carNum = focusedCar.carNumber || '';

            // Monta lista de tentativas sem repetições
            const candidateUrls = Array.from(new Set([
                // 1. Oficial do Jogo LMU (testa com hífen e com underscore)
                `http://localhost:6397/start/images/drivers/${withHyphen}.webp`,
                `http://localhost:6397/start/images/drivers/${withUnderscore}.webp`,
                `http://localhost:6397/start/images/drivers/${lastNorm}.webp`,
                // 2. Pasta local Media/fotos/
                `../../Media/fotos/${cleanName}.png`,
                `../../Media/fotos/${withHyphen}.png`,
                `../../Media/fotos/${withUnderscore}.png`,
                `../../Media/fotos/${cleanName}.webp`,
                `../../Media/fotos/${cleanLastName}.png`,
                `../../Media/fotos/${lastNorm}.png`,
                `../../Media/fotos/${carNum}.png`
            ]));

            const driverKey = `${focusedCar.slotID}_${withHyphen}`;
            if (photoEl.dataset.driverKey !== driverKey) {
                photoEl.dataset.driverKey = driverKey;
                
                let attemptIdx = 0;
                const tryNextPhoto = () => {
                    if (attemptIdx < candidateUrls.length) {
                        const url = candidateUrls[attemptIdx++];
                        photoEl.src = url;
                        photoEl.style.opacity = '1';
                    } else {
                        // Foto genérica quando nenhuma foto específica do piloto for encontrada
                        photoEl.src = 'http://localhost:6397/start/images/drivers/default.webp';
                        photoEl.style.opacity = '1';
                        photoEl.onerror = () => { photoEl.style.opacity = '0'; };
                    }
                };

                photoEl.onerror = () => {
                    tryNextPhoto();
                };

                tryNextPhoto();
            }
        }




        // 7. Estatísticas de Volta (BEST LAP, LAST LAP, AVERAGE)
        const bestEl = banner.querySelector('.dsb-best-lap');
        const lastLapEl = banner.querySelector('.dsb-last-lap');
        const avgEl = banner.querySelector('.dsb-avg-lap');

        if (bestEl) bestEl.innerText = formatTime(focusedCar.bestLapTime);
        if (lastLapEl) lastLapEl.innerText = focusedCar.lastLapTime > 0 ? formatTime(focusedCar.lastLapTime) : '-';
        if (avgEl) {
            if (focusedCar.avg5Laps > 0) {
                avgEl.innerText = formatTime(focusedCar.avg5Laps);
            } else if (focusedCar.bestLapTime > 0) {
                avgEl.innerText = formatTime(focusedCar.bestLapTime);
            } else {
                avgEl.innerText = '-';
            }
        }
    }

    function getManufacturerColorClass(car) {
        if (!car) return 'man-default';
        const text = `${car.manufacturer || ''} ${car.teamName || ''} ${car.vehicleFilename || ''} ${car.carClass || ''}`.toLowerCase();
        if (text.includes('ferrari')) return 'man-ferrari';
        if (text.includes('toyota')) return 'man-toyota';
        if (text.includes('aston')) return 'man-aston';
        if (text.includes('mclaren')) return 'man-mclaren';
        if (text.includes('porsche')) return 'man-porsche';
        if (text.includes('lexus')) return 'man-lexus';
        if (text.includes('alpine')) return 'man-alpine';
        if (text.includes('bmw')) return 'man-bmw';
        if (text.includes('cadillac')) return 'man-cadillac';
        if (text.includes('peugeot')) return 'man-peugeot';
        if (text.includes('lamborghini')) return 'man-lamborghini';
        if (text.includes('corvette') || text.includes('chevrolet')) return 'man-corvette';
        if (text.includes('ford')) return 'man-ford';
        if (text.includes('mercedes') || text.includes('amg')) return 'man-mercedes';
        if (text.includes('genesis')) return 'man-genesis';
        if (text.includes('isotta')) return 'man-isotta';
        if (text.includes('vanwall')) return 'man-vanwall';
        if (text.includes('oreca') || text.includes('lmp2') || text.includes('p2')) {
            if (text.includes('elms')) return 'man-oreca-elms';
            return 'man-oreca';
        }
        if (text.includes('ligier') || text.includes('duqueine') || text.includes('lmp3') || text.includes('p3')) return 'man-ligier';
        if (text.includes('ginetta')) return 'man-ginetta';
        return 'man-default';
    }


    function renderDriverOnboardBanner(focusedCar, isOnboard) {

        const banner = document.getElementById('driver-onboard-banner');
        if (!banner) return false;

        const overlayState = state.currentOverlayState || {};
        const onboardMode = overlayState.driverOnboardMode || 'AUTO';

        // Se o H2H estiver ativo, sempre oculta este banner (prioridade do Duelo)
        const h2hIsActive = !!overlayState.h2h_active;
        
        let shouldShow = false;
        if (onboardMode === 'ON') {
            shouldShow = !!focusedCar;
        } else if (onboardMode === 'OFF') {
            shouldShow = false;
        } else {
            // AUTO mode: aparece quando a câmera for onboard
            shouldShow = !!(isOnboard && focusedCar);
        }

        if (!shouldShow || !focusedCar || h2hIsActive) {
            banner.classList.add('hidden');
            return false;
        }

        banner.classList.remove('hidden');


        // 1. Box Esquerdo: Cor da Montadora + Logo + Número do Carro
        const leftBox = banner.querySelector('.dob-left-box');
        if (leftBox) {
            const mfrClass = getManufacturerColorClass(focusedCar);
            leftBox.className = `dob-left-box ${mfrClass}`;
        }


        const numEl = banner.querySelector('.dob-car-num');
        if (numEl) numEl.innerText = focusedCar.carNumber || '';

        const logoImg = banner.querySelector('.dob-logo-img');
        if (logoImg) {
            const logoUrl = getManufacturerLogoUrl(focusedCar);
            if (logoUrl) {
                logoImg.src = logoUrl;
                logoImg.style.display = 'block';
            } else {
                logoImg.style.display = 'none';
            }
        }

        // 2. Foto do Piloto (Regra 1: Jogo LMU .webp | Regra 2: Pasta Media/fotos/)
        const photoEl = banner.querySelector('.dob-driver-photo');
        if (photoEl) {
            const fullName = (focusedCar.driverName || 'DRIVER').trim();
            const parts = fullName.split(' ');
            const lastName = parts.length > 1 ? parts[parts.length - 1] : fullName;
            const cleanAscii = fullName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s\-]/g, '').trim();
            const withHyphen = cleanAscii.replace(/\s+/g, '_');
            const withUnderscore = cleanAscii.replace(/[\s\-]+/g, '_');
            const lastNorm = lastName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
            const cleanName = fullName.replace(/[\s]+/g, '_');
            const cleanLastName = lastName.replace(/[\s]+/g, '_');
            const carNum = focusedCar.carNumber || '';

            const candidateUrls = Array.from(new Set([
                `http://localhost:6397/start/images/drivers/${withHyphen}.webp`,
                `http://localhost:6397/start/images/drivers/${withUnderscore}.webp`,
                `http://localhost:6397/start/images/drivers/${lastNorm}.webp`,
                `../../Media/fotos/${cleanName}.png`,
                `../../Media/fotos/${withHyphen}.png`,
                `../../Media/fotos/${withUnderscore}.png`,
                `../../Media/fotos/${cleanName}.webp`,
                `../../Media/fotos/${cleanLastName}.png`,
                `../../Media/fotos/${lastNorm}.png`,
                `../../Media/fotos/${carNum}.png`
            ]));

            const driverKey = `${focusedCar.slotID}_${withHyphen}`;
            if (photoEl.dataset.driverKey !== driverKey) {
                photoEl.dataset.driverKey = driverKey;
                let attemptIdx = 0;
                const tryNextPhoto = () => {
                    if (attemptIdx < candidateUrls.length) {
                        const url = candidateUrls[attemptIdx++];
                        photoEl.src = url;
                        photoEl.style.opacity = '1';
                    } else {
                        // Foto genérica quando nenhuma foto específica do piloto for encontrada
                        photoEl.src = 'http://localhost:6397/start/images/drivers/default.webp';
                        photoEl.style.opacity = '1';
                        photoEl.onerror = () => { photoEl.style.opacity = '0'; };
                    }
                };
                photoEl.onerror = () => { tryNextPhoto(); };
                tryNextPhoto();
            }
        }


        // 3. Telemetria em tempo real
        const telem = focusedCar.telemetry || {};
        let rawThrot = telem.throttle !== undefined ? telem.throttle : 0;
        let rawBrk = telem.brake !== undefined ? telem.brake : 0;
        const clsUpper = String(focusedCar.carClass || '').toUpperCase();
        const isHypercar = clsUpper.includes('HY') || clsUpper.includes('HYPER') || clsUpper.includes('LMH') || clsUpper.includes('GTP');

        // Calibração de escala para refletir 100% de curso de pedal real no LMU
        // Hypercar: teto da telemetria do motor é ~0.58
        // GT3 / LMGT3 / LMP2: teto da telemetria do motor é ~0.76 (restritores/mapa)
        const throttleCeiling = isHypercar ? 0.58 : 0.76;
        if (rawThrot >= throttleCeiling) {
            rawThrot = 1.0;
        } else if (rawThrot > 0.02) {
            rawThrot = Math.min(1.0, rawThrot / throttleCeiling);
        }
        const throt = Math.max(0, Math.min(1, rawThrot));

        // Normalização de freio
        if (rawBrk >= 0.82) {
            rawBrk = 1.0;
        } else if (rawBrk > 0.02) {
            rawBrk = Math.min(1.0, rawBrk / 0.82);
        }
        const brk = Math.max(0, Math.min(1, rawBrk));

        const rpm = telem.rpm || 0;
        const maxRpm = telem.maxRpm || 8500;
        const gear = telem.gear !== undefined ? telem.gear : 0;
        const speedKmh = Math.round(focusedCar.speedKmh || 0);
        const speedMph = Math.round(telem.speedMph || (speedKmh * 0.621371));

        // Pedais de Acelerador (Verde) e Freio (Vermelho)
        const brakeEl = banner.querySelector('.dob-pedal-brake');
        const throtEl = banner.querySelector('.dob-pedal-throttle');
        if (brakeEl) brakeEl.style.width = `${brk * 100}%`;
        if (throtEl) throtEl.style.width = `${throt * 100}%`;


        // Tacômetro Ticks & RPM
        const rpmEl = banner.querySelector('.dob-rpm-val');
        if (rpmEl) rpmEl.innerText = rpm;

        const ticks = banner.querySelectorAll('.dob-tick');
        if (ticks.length > 0) {
            const rpmPct = Math.max(0, Math.min(1, rpm / maxRpm));
            const activeCount = Math.round(rpmPct * ticks.length);
            ticks.forEach((tick, idx) => {
                tick.classList.toggle('active', idx < activeCount);
            });
        }

        // Marchas Dinâmicas (conforme o número real de marchas do carro: 6, 7 ou 8)
        const maxGears = telem.maxGears || 7;
        const gearListEl = banner.querySelector('.dob-gear-list');
        if (gearListEl) {
            const currentCount = gearListEl.querySelectorAll('.dob-gear-item').length;
            if (currentCount !== maxGears) {
                let html = '';
                for (let i = 1; i <= maxGears; i++) {
                    html += `<span class="dob-gear-item" data-gear="${i}">${i}</span>`;
                }
                gearListEl.innerHTML = html;
            }

            const gearItems = gearListEl.querySelectorAll('.dob-gear-item');
            gearItems.forEach(item => {
                const g = parseInt(item.dataset.gear);
                item.classList.toggle('active', g === gear);
            });
        }

        // Velocidade KM/H e MPH
        const kmhEl = banner.querySelector('.dob-kmh-val');
        const mphEl = banner.querySelector('.dob-mph-val');
        if (kmhEl) kmhEl.innerText = speedKmh;
        if (mphEl) mphEl.innerText = speedMph;

        return true;
    }

    function setDriverPhoto(photoEl, car) {

        if (!photoEl || !car) return;
        const fullName = (car.driverName || '').trim();
        const parts = fullName.split(' ');
        const lastName = parts.length > 1 ? parts[parts.length - 1] : parts[0];

        const cleanAscii = fullName.toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();

        const withHyphen = cleanAscii.replace(/\s+/g, '_');
        const withUnderscore = cleanAscii.replace(/[\s\-]+/g, '_');
        const lastNorm = lastName.toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]/g, '');

        const cleanName = fullName.replace(/[\s]+/g, '_');
        const cleanLastName = lastName.replace(/[\s]+/g, '_');
        const carNum = car.carNumber || '';

        const candidateUrls = Array.from(new Set([
            `http://localhost:6397/start/images/drivers/${withHyphen}.webp`,
            `http://localhost:6397/start/images/drivers/${withUnderscore}.webp`,
            `http://localhost:6397/start/images/drivers/${lastNorm}.webp`,
            `../../Media/fotos/${cleanName}.png`,
            `../../Media/fotos/${withHyphen}.png`,
            `../../Media/fotos/${withUnderscore}.png`,
            `../../Media/fotos/${cleanName}.webp`,
            `../../Media/fotos/${cleanLastName}.png`,
            `../../Media/fotos/${lastNorm}.png`,
            `../../Media/fotos/${carNum}.png`
        ]));

        const driverKey = `${car.slotID}_${withHyphen}`;
        if (photoEl.dataset.driverKey !== driverKey) {
            photoEl.dataset.driverKey = driverKey;
            let attemptIdx = 0;
            const tryNextPhoto = () => {
                if (attemptIdx < candidateUrls.length) {
                    const url = candidateUrls[attemptIdx++];
                    photoEl.src = url;
                    photoEl.style.opacity = '1';
                } else {
                    // Foto genérica quando nenhuma foto específica do piloto for encontrada
                    photoEl.src = 'http://localhost:6397/start/images/drivers/default.webp';
                    photoEl.style.opacity = '1';
                    photoEl.onerror = () => { photoEl.style.opacity = '0'; };
                }
            };
            photoEl.onerror = () => {
                tryNextPhoto();
            };
            tryNextPhoto();
        }
    }


    function renderHeadToHead(standings, overlayState) {
        const h2hContainer = document.getElementById('wec-h2h-container');
        if (!h2hContainer) return false;

        const isH2HActive = !!overlayState.h2h_active;
        if (!isH2HActive || !standings || standings.length < 2) {
            h2hContainer.classList.add('hidden');
            return false;
        }

        let slotA = overlayState.h2h_slot_a;
        let slotB = overlayState.h2h_slot_b;

        let carA = standings.find(c => c.slotID === slotA);
        let carB = standings.find(c => c.slotID === slotB);

        // Fallbacks inteligentes
        if (!carA) carA = standings[0];
        if (!carB) carB = (standings.length > 1 && standings[1].slotID !== carA.slotID) ? standings[1] : standings[0];

        if (!carA || !carB || carA.slotID === carB.slotID) {
            h2hContainer.classList.add('hidden');
            return false;
        }

        // Garante que o Carro A seja o líder da disputa (menor posição)
        const posAVal = carA.classPlace || carA.place || 99;
        const posBVal = carB.classPlace || carB.place || 99;
        if (posAVal > posBVal) {
            const temp = carA;
            carA = carB;
            carB = temp;
        }

        h2hContainer.classList.remove('hidden');

        // Helper seguro para letra de pneus (FL)
        const getTyreLetter = (car) => {
            if (!car || !car.tires || !car.tires.FL) return 'M';
            const t = car.tires.FL;
            if (typeof t === 'object' && t.compound) return t.compound[0].toUpperCase();
            if (typeof t === 'string' && t.length > 0) return t[0].toUpperCase();
            return 'M';
        };

        // 1. Header
        const clsBadge = document.getElementById('wec-h2h-class-badge');
        if (clsBadge) {
            clsBadge.innerText = (carA.carClass || 'HYPERCAR').toUpperCase();
            clsBadge.style.backgroundColor = getWecClassColor(carA.carClass);
        }

        const battleTitle = document.getElementById('wec-h2h-battle-title');
        if (battleTitle) {
            const pos = carA.classPlace || carA.place || 1;
            battleTitle.innerText = `⚔️ BATTLE FOR P${pos}`;
        }

        // 2. Carro A (Esquerda - Frente)
        const idBlockA = document.getElementById('wec-h2h-id-a');
        if (idBlockA) {
            idBlockA.className = `wec-h2h-id-block man-bg ${getManufacturerColorClass(carA)}`;
        }
        const logoImgA = idBlockA ? idBlockA.querySelector('.wec-h2h-logo-img') : null;
        if (logoImgA) {
            const logoUrlA = getManufacturerLogoUrl(carA);
            if (logoUrlA) {
                logoImgA.src = logoUrlA;
                logoImgA.style.display = 'block';
            } else {
                logoImgA.style.display = 'none';
            }
        }
        const numA = document.getElementById('wec-h2h-num-a');
        if (numA) numA.innerText = carA.carNumber || '';

        const posA = document.getElementById('wec-h2h-pos-a');
        if (posA) posA.innerText = `P${carA.classPlace || carA.place || 1}`;

        const nameA = document.getElementById('wec-h2h-name-a');
        if (nameA) nameA.innerText = (carA.driverNameFormatted || carA.driverName || '').toUpperCase();

        const teamA = document.getElementById('wec-h2h-team-a');
        if (teamA) teamA.innerText = (carA.teamName || '').toUpperCase();

        const tyreA = document.getElementById('wec-h2h-tyre-a');
        if (tyreA) {
            const compA = getTyreLetter(carA);
            tyreA.innerText = compA;
            tyreA.className = `wec-h2h-tyre-dot tyre-${compA.toLowerCase()}`;
        }

        const lapA = document.getElementById('wec-h2h-lap-a');
        if (lapA) {
            lapA.innerText = formatTime(carA.lastLapTime || carA.bestLapTime || 0);
        }

        const photoA = document.getElementById('wec-h2h-photo-a');
        setDriverPhoto(photoA, carA);

        // 3. Carro B (Direita - Perseguidor)
        const idBlockB = document.getElementById('wec-h2h-id-b');
        if (idBlockB) {
            idBlockB.className = `wec-h2h-id-block man-bg ${getManufacturerColorClass(carB)}`;
        }
        const logoImgB = idBlockB ? idBlockB.querySelector('.wec-h2h-logo-img') : null;
        if (logoImgB) {
            const logoUrlB = getManufacturerLogoUrl(carB);
            if (logoUrlB) {
                logoImgB.src = logoUrlB;
                logoImgB.style.display = 'block';
            } else {
                logoImgB.style.display = 'none';
            }
        }
        const numB = document.getElementById('wec-h2h-num-b');
        if (numB) numB.innerText = carB.carNumber || '';

        const posB = document.getElementById('wec-h2h-pos-b');
        if (posB) posB.innerText = `P${carB.classPlace || carB.place || 2}`;

        const nameB = document.getElementById('wec-h2h-name-b');
        if (nameB) nameB.innerText = (carB.driverNameFormatted || carB.driverName || '').toUpperCase();

        const teamB = document.getElementById('wec-h2h-team-b');
        if (teamB) teamB.innerText = (carB.teamName || '').toUpperCase();

        const tyreB = document.getElementById('wec-h2h-tyre-b');
        if (tyreB) {
            const compB = getTyreLetter(carB);
            tyreB.innerText = compB;
            tyreB.className = `wec-h2h-tyre-dot tyre-${compB.toLowerCase()}`;
        }

        const lapB = document.getElementById('wec-h2h-lap-b');
        if (lapB) {
            lapB.innerText = formatTime(carB.lastLapTime || carB.bestLapTime || 0);
        }

        const photoB = document.getElementById('wec-h2h-photo-b');
        setDriverPhoto(photoB, carB);

        // 4. Delta GAP Central
        const gapValEl = document.getElementById('wec-h2h-gap-val');
        if (gapValEl) {
            let displayText = '';

            // Se for a mesma classe e carB estiver exatamente 1 posição atrás de carA na classe
            const sameClass = (carA.carClass || '').toUpperCase() === (carB.carClass || '').toUpperCase();
            const posA = carA.classPlace || carA.place || 1;
            const posB = carB.classPlace || carB.place || 2;

            // 1. Prioridade: Se carros forem da mesma classe e posições adjacentes, usar gapInterval
            if (sameClass && (posB - posA === 1)) {
                if (typeof carB.gapIntervalLaps === 'number' && carB.gapIntervalLaps > 0) {
                    displayText = `+${carB.gapIntervalLaps} LAP${carB.gapIntervalLaps > 1 ? 'S' : ''}`;
                } else if (typeof carB.gapIntervalSeconds === 'number' && carB.gapIntervalSeconds > 0) {
                    displayText = `+${carB.gapIntervalSeconds.toFixed(3)}s`;
                } else if (typeof carB.gapInterval === 'string' && carB.gapInterval !== '—' && carB.gapInterval !== 'LÍDER') {
                    displayText = carB.gapInterval.startsWith('+') ? carB.gapInterval : `+${carB.gapInterval}`;
                }
            }

            // 2. Prioridade: Diferença de gapClassSeconds em relação ao líder da classe
            if (!displayText && sameClass) {
                const secA = typeof carA.gapClassSeconds === 'number' ? carA.gapClassSeconds : null;
                const secB = typeof carB.gapClassSeconds === 'number' ? carB.gapClassSeconds : null;
                if (secA !== null && secB !== null && (secA > 0 || secB > 0)) {
                    const diff = Math.abs(secB - secA);
                    if (diff > 0) {
                        displayText = `+${diff.toFixed(3)}s`;
                    }
                }
            }

            // 3. Prioridade: gapToLeader oficial (se ambos > 0, ou seja, nenhum tomou volta do líder geral)
            if (!displayText) {
                const gapA = typeof carA.gapToLeader === 'number' ? carA.gapToLeader : parseFloat(carA.gapToLeader);
                const gapB = typeof carB.gapToLeader === 'number' ? carB.gapToLeader : parseFloat(carB.gapToLeader);
                if (!isNaN(gapA) && !isNaN(gapB) && gapA > 0 && gapB > 0) {
                    const diff = Math.abs(gapB - gapA);
                    if (diff > 0) {
                        displayText = `+${diff.toFixed(3)}s`;
                    }
                }
            }

            // 4. Prioridade: gapToNext
            if (!displayText) {
                const nextB = typeof carB.gapToNext === 'number' ? carB.gapToNext : parseFloat(carB.gapToNext);
                if (!isNaN(nextB) && nextB > 0) {
                    displayText = `+${nextB.toFixed(3)}s`;
                }
            }

            // Fallback padrão se nada resolveu
            if (!displayText) {
                displayText = '+0.000s';
            }

            gapValEl.innerText = displayText;
        }

        return true;
    }

    let currentOverlayTrackSvg = '';

    // ── 60 FPS Map Interpolation State ──────────────────────────────────────
    const mapCarTargets  = {};   // {slotID: {tx, ty, color, num, isFocused, dotR, focusedR}}
    const mapCarCurrent  = {};   // {slotID: {cx, cy}}
    const mapCarElements = {};   // {slotID: {circle, text, focusRing, focusCircle, focusText}}
    let mapRafRunning    = false;
    let mapActiveCount   = 0;    // last known active car count for countEl update
    let mapCountEl       = null;
    let mapFocusedSlotId = null;
    let mapOverlayStateRef = null; // kept up-to-date by renderTrackMap

    const MAP_CLASS_COLOR = {
        'HY': '#e10600', 'HYPERCAR': '#e10600',
        'LMP2': '#7FB5FF', 'LMP2_WEC': '#7FB5FF', 'LMP2_ELMS': '#005696', 'P2': '#7FB5FF',
        'LMGT3': '#00b33c', 'GT3': '#00b33c',
        'LMGTE': '#f59e0b', 'GTE': '#f59e0b',
        'LMP3': '#800080'
    };

    function startMapRafLoop() {
        if (mapRafRunning) return;
        mapRafRunning = true;

        function loop() {
            requestAnimationFrame(loop);

            const carsLayer   = document.getElementById('wec-map-cars-layer');
            const focusedLayer = document.getElementById('wec-map-focused-layer');
            if (!carsLayer || !focusedLayer) return;

            const use60fps = mapOverlayStateRef && mapOverlayStateRef.map60Fps !== false;
            const alpha = use60fps ? 0.18 : 1.0;

            const activeSlots = new Set(Object.keys(mapCarTargets));

            // Remove DOM elements for cars that are no longer present
            Object.keys(mapCarElements).forEach(sid => {
                if (!activeSlots.has(sid)) {
                    const els = mapCarElements[sid];
                    if (els.circle)      { els.circle.remove();      }
                    if (els.text)        { els.text.remove();        }
                    if (els.focusRing)   { els.focusRing.remove();   }
                    if (els.focusCircle) { els.focusCircle.remove(); }
                    if (els.focusText)   { els.focusText.remove();   }
                    delete mapCarElements[sid];
                    delete mapCarCurrent[sid];
                }
            });

            // Create SVG NS helper
            const SVG_NS = 'http://www.w3.org/2000/svg';

            activeSlots.forEach(sid => {
                const t = mapCarTargets[sid];
                if (!t) return;

                // Initialize current position at target on first appearance (no lerp pop)
                if (!mapCarCurrent[sid]) {
                    mapCarCurrent[sid] = { cx: t.tx, cy: t.ty };
                }
                const cur = mapCarCurrent[sid];

                // Lerp
                cur.cx += (t.tx - cur.cx) * alpha;
                cur.cy += (t.ty - cur.cy) * alpha;

                const cx = cur.cx;
                const cy = cur.cy;
                const isFocused = t.isFocused;
                const dotR    = t.dotR;
                const focusedR = t.focusedR;

                if (isFocused) {
                    // ── Focused car ──────────────────────────────────────────
                    // Remove normal elements if they exist
                    if (mapCarElements[sid] && mapCarElements[sid].circle) {
                        mapCarElements[sid].circle.remove();
                        mapCarElements[sid].text.remove();
                        mapCarElements[sid].circle = null;
                        mapCarElements[sid].text = null;
                    }

                    // Create focused elements if needed
                    if (!mapCarElements[sid]) mapCarElements[sid] = {};
                    const els = mapCarElements[sid];

                    if (!els.focusRing) {
                        // Animated outer ring
                        const ring = document.createElementNS(SVG_NS, 'circle');
                        ring.setAttribute('fill', 'none');
                        ring.setAttribute('stroke', '#00b9ff');
                        ring.setAttribute('stroke-width', dotR * 0.45);
                        ring.setAttribute('opacity', '0.9');
                        const a1 = document.createElementNS(SVG_NS, 'animate');
                        a1.setAttribute('attributeName', 'r');
                        a1.setAttribute('values', `${focusedR*1.8};${focusedR*2.5};${focusedR*1.8}`);
                        a1.setAttribute('dur', '1.2s');
                        a1.setAttribute('repeatCount', 'indefinite');
                        const a2 = document.createElementNS(SVG_NS, 'animate');
                        a2.setAttribute('attributeName', 'opacity');
                        a2.setAttribute('values', '0.9;0.3;0.9');
                        a2.setAttribute('dur', '1.2s');
                        a2.setAttribute('repeatCount', 'indefinite');
                        ring.appendChild(a1);
                        ring.appendChild(a2);
                        focusedLayer.appendChild(ring);
                        els.focusRing = ring;

                        // Solid inner circle
                        const fc = document.createElementNS(SVG_NS, 'circle');
                        fc.setAttribute('r', focusedR);
                        fc.setAttribute('stroke', '#ffffff');
                        fc.setAttribute('stroke-width', dotR * 0.35);
                        focusedLayer.appendChild(fc);
                        els.focusCircle = fc;

                        // Number text
                        const ft = document.createElementNS(SVG_NS, 'text');
                        ft.setAttribute('text-anchor', 'middle');
                        ft.setAttribute('dominant-baseline', 'central');
                        ft.setAttribute('fill', '#ffffff');
                        ft.setAttribute('font-size', dotR * 1.05);
                        ft.setAttribute('font-weight', '900');
                        ft.setAttribute('font-family', "'Rajdhani', sans-serif");
                        ft.textContent = t.num;
                        focusedLayer.appendChild(ft);
                        els.focusText = ft;
                    }

                    // Update positions
                    els.focusRing.setAttribute('cx', cx);
                    els.focusRing.setAttribute('cy', cy);
                    els.focusRing.setAttribute('r', focusedR * 2.2);
                    els.focusCircle.setAttribute('cx', cx);
                    els.focusCircle.setAttribute('cy', cy);
                    els.focusCircle.setAttribute('fill', t.color);
                    els.focusText.setAttribute('x', cx);
                    els.focusText.setAttribute('y', cy);
                    els.focusText.textContent = t.num;

                } else {
                    // ── Normal car ───────────────────────────────────────────
                    // Remove focused elements if they exist
                    if (mapCarElements[sid] && mapCarElements[sid].focusRing) {
                        mapCarElements[sid].focusRing.remove();
                        mapCarElements[sid].focusCircle.remove();
                        mapCarElements[sid].focusText.remove();
                        mapCarElements[sid].focusRing = null;
                        mapCarElements[sid].focusCircle = null;
                        mapCarElements[sid].focusText = null;
                    }

                    if (!mapCarElements[sid]) mapCarElements[sid] = {};
                    const els = mapCarElements[sid];

                    if (!els.circle) {
                        const c = document.createElementNS(SVG_NS, 'circle');
                        c.setAttribute('r', dotR);
                        c.setAttribute('stroke', '#000000');
                        c.setAttribute('stroke-width', dotR * 0.28);
                        carsLayer.appendChild(c);
                        els.circle = c;

                        const tx = document.createElementNS(SVG_NS, 'text');
                        tx.setAttribute('text-anchor', 'middle');
                        tx.setAttribute('dominant-baseline', 'central');
                        tx.setAttribute('fill', '#ffffff');
                        tx.setAttribute('font-size', dotR * 0.95);
                        tx.setAttribute('font-weight', '900');
                        tx.setAttribute('font-family', "'Rajdhani', sans-serif");
                        carsLayer.appendChild(tx);
                        els.text = tx;
                    }

                    els.circle.setAttribute('cx', cx);
                    els.circle.setAttribute('cy', cy);
                    els.circle.setAttribute('fill', t.color);
                    els.text.setAttribute('x', cx);
                    els.text.setAttribute('y', cy);
                    els.text.textContent = t.num;
                }
            });

            if (mapCountEl) mapCountEl.innerText = `${mapActiveCount} CARS`;
        }

        loop();
    }

    function renderTrackMap(data, overlayState) {
        const mapContainer = document.getElementById('wec-track-map-container');
        if (!mapContainer) return;

        // Keep overlayState reference for the RAF loop
        mapOverlayStateRef = overlayState;

        const isMapActive = !!overlayState.trackMap;
        if (!isMapActive) {
            mapContainer.classList.add('hidden');
            mapContainer.style.display = 'none';
            // Clear targets so cars don't persist when map re-opens
            Object.keys(mapCarTargets).forEach(k => delete mapCarTargets[k]);
            return;
        }

        mapContainer.classList.remove('hidden');
        mapContainer.style.display = 'block';

        const tm = data.track_map;
        if (!tm || !tm.main_d) return;

        const svg       = document.getElementById('wec-map-svg');
        const bgPath    = document.getElementById('wec-map-bg-path');
        const fgPath    = document.getElementById('wec-map-fg-path');
        const pitPath   = document.getElementById('wec-map-pit-path');
        const trackTitle = document.getElementById('wec-map-track-name');
        mapCountEl      = document.getElementById('wec-map-cars-count');

        if (trackTitle && data.track_name) {
            trackTitle.innerText = data.track_name.toUpperCase();
        }

        if (tm.main_d !== currentOverlayTrackSvg) {
            currentOverlayTrackSvg = tm.main_d;
            if (svg) svg.setAttribute('viewBox', tm.viewBox || '0 0 1000 1000');
            if (bgPath) bgPath.setAttribute('d', tm.main_d);
            if (fgPath) fgPath.setAttribute('d', tm.main_d);
            if (pitPath) pitPath.setAttribute('d', tm.pit_d || '');
        }

        const vbParts = (tm.viewBox || '0 0 1000 1000').split(' ').map(parseFloat);
        const vbW     = vbParts[2] || 1000;

        const bgStroke  = Math.max(32, vbW * 0.032);
        const fgStroke  = Math.max(20, vbW * 0.020);
        const pitStroke = Math.max(8,  vbW * 0.0085);
        if (bgPath)  bgPath.setAttribute('stroke-width', bgStroke);
        if (fgPath)  fgPath.setAttribute('stroke-width', fgStroke);
        if (pitPath) pitPath.setAttribute('stroke-width', pitStroke);

        const dotR     = Math.max(40, vbW * 0.040);
        const focusedR = dotR * 1.35;

        // Mark all known cars as stale; we'll update or remove them below
        const seenSlots = new Set();
        let activeOnTrack = 0;

        (data.standings || []).forEach(car => {
            if (car.posX === undefined || car.posY === undefined) return;
            if (car.inGarage || (car.posX === 0 && car.posY === 0)) return;
            activeOnTrack++;

            const isFocused = (car.slotID === data.focused_slot_id);
            const rawCls    = (car.carClass || '').toUpperCase();
            const color     = MAP_CLASS_COLOR[rawCls] || getWecClassColor(car.carClass);
            const sid       = String(car.slotID);
            seenSlots.add(sid);

            const posInClass = (car.classPlace !== undefined && car.classPlace !== null && car.classPlace !== '')
                ? car.classPlace
                : (car.place || car.carNumber || '');

            mapCarTargets[sid] = {
                tx: car.posX,
                ty: car.posY,
                color,
                num: String(posInClass),
                isFocused,
                dotR,
                focusedR
            };
        });

        // Remove targets for cars no longer in standings
        Object.keys(mapCarTargets).forEach(sid => {
            if (!seenSlots.has(sid)) delete mapCarTargets[sid];
        });

        mapActiveCount   = activeOnTrack;
        mapFocusedSlotId = data.focused_slot_id;

        // Start the rAF loop once (idempotent)
        startMapRafLoop();
    }

    // =========================================================================
    // WEC MULTI-DRIVER QUALIFY TRACKER (1 a 3 PILOTOS)
    // =========================================================================
    const qualifyLapTracker = {};

    function formatQualifyLiveTime(seconds) {
        if (!seconds || seconds <= 0) return '0:00.000';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 1000);
        return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
    }

    function renderQualifyTracker(standings, overlayState) {
        const container = document.getElementById('wec-qualify-tracker-container');
        if (!container) return false;

        const slots = (overlayState && overlayState.qualifyTrackerSlots) ? overlayState.qualifyTrackerSlots : [];
        if (!slots || slots.length === 0 || !standings || standings.length === 0) {
            container.classList.add('hidden');
            return false;
        }

        // Filtra os carros selecionados na ordem em que foram marcados na mesa (máx 3)
        const selectedCars = [];
        slots.slice(0, 3).forEach(sId => {
            const found = standings.find(c => (c.slotID === sId || c.SlotID === sId));
            if (found) selectedCars.push(found);
        });

        if (selectedCars.length === 0) {
            container.classList.add('hidden');
            return false;
        }

        container.classList.remove('hidden');

        // Calcula melhor volta da classe
        const classBestLaps = {};
        standings.forEach(c => {
            const cls = c.carClass || c.Class || 'HY';
            const bl = c.bestLapTime || c.BestLapTime || 0;
            if (bl > 0) {
                if (!classBestLaps[cls] || bl < classBestLaps[cls]) {
                    classBestLaps[cls] = bl;
                }
            }
        });

        const now = Date.now();
        const activeSlotIds = selectedCars.map(c => c.slotID !== undefined ? c.slotID : c.SlotID);
        const activeKey = activeSlotIds.join('-');

        // Recontrói a estrutura dos cards apenas quando a seleção mudar
        if (container.dataset.activeKey !== activeKey) {
            container.dataset.activeKey = activeKey;
            container.innerHTML = '';
            selectedCars.forEach((car, idx) => {
                const slotId = car.slotID !== undefined ? car.slotID : car.SlotID;
                const cardEl = document.createElement('div');
                cardEl.className = 'wqt-card';
                cardEl.dataset.slotId = slotId;

                // Sponsor slot apenas no Card 0 se houver EXATAMENTE 3 pilotos
                let sponsorSlotHtml = '';
                if (idx === 0 && selectedCars.length === 3) {
                    sponsorSlotHtml = `
                        <div class="wqt-sponsor-slot" style="display:none;">
                            <img src="../../Media/sponsors/sponsor.png" class="wqt-sponsor-img" alt="Sponsor"
                                 onload="this.parentElement.style.display='flex';"
                                 onerror="if(!this.tJpg){this.tJpg=true;this.src='../../Media/sponsors/sponsor.jpg';}else if(!this.tSvg){this.tSvg=true;this.src='../../Media/sponsors/sponsor.svg';}else if(!this.tRoot){this.tRoot=true;this.src='/Media/sponsors/sponsor.png';}else{this.parentElement.style.display='none';}">
                        </div>
                    `;
                }

                cardEl.innerHTML = `
                    ${sponsorSlotHtml}
                    <div class="wqt-top-bar">
                        <div class="wqt-logo"></div>
                        <div class="wqt-num"></div>
                        <div class="wqt-driver-name"></div>
                    </div>
                    <div class="wqt-main-body"></div>
                    <div class="wqt-sectors-bar">
                        <div class="wqt-sector-item" data-sec="1"><span class="wqt-sector-label">S1</span><div class="wqt-sector-line"></div></div>
                        <div class="wqt-sector-item" data-sec="2"><span class="wqt-sector-label">S2</span><div class="wqt-sector-line"></div></div>
                        <div class="wqt-sector-item" data-sec="3"><span class="wqt-sector-label">S3</span><div class="wqt-sector-line"></div></div>
                    </div>
                `;
                container.appendChild(cardEl);
            });
        }

        // Atualiza cada card individualmente mantendo animações estáveis
        selectedCars.forEach((car, idx) => {
            const slotId = car.slotID !== undefined ? car.slotID : car.SlotID;
            const cardEl = container.querySelector(`.wqt-card[data-slot-id="${slotId}"]`);
            if (!cardEl) return;

            let qData = qualifyLapTracker[slotId];
            if (!qData) {
                qData = {
                    lastLapCount: car.lap || 0,
                    finishTimestamp: 0,
                    deltaStr: '+0.000',
                    deltaClass: '',
                    finalLapTime: 0,
                    isLapValid: true,
                    classRank: car.classPlace || car.place || 1,
                    bestLapSeen: car.bestLapTime || 0
                };
                qualifyLapTracker[slotId] = qData;
            }

            // Detecta fechamento de volta
            const currentLapCount = car.lap !== undefined ? car.lap : (car.mTotalLaps || 0);
            const lastLap = car.lastLapTime || car.LastLapTime || 0;
            if (currentLapCount > qData.lastLapCount && qData.lastLapCount > 0 && lastLap > 0) {
                qData.lastLapCount = currentLapCount;
                qData.finishTimestamp = now;
                qData.finalLapTime = lastLap;
                qData.isLapValid = !car.lapInvalidated;
                qData.classRank = car.classPlace || car.place || 1;

                const cls = car.carClass || car.Class || 'HY';
                const clsBest = classBestLaps[cls] || 0;
                let diff = 0;
                if (clsBest > 0 && Math.abs(lastLap - clsBest) > 0.002) {
                    diff = lastLap - clsBest;
                } else if (qData.bestLapSeen > 0 && Math.abs(lastLap - qData.bestLapSeen) > 0.002) {
                    diff = lastLap - qData.bestLapSeen;
                }

                if (diff < -0.005) {
                    qData.deltaStr = diff.toFixed(3);
                    qData.deltaClass = 'purple';
                } else if (diff > 0.005) {
                    qData.deltaStr = `+${diff.toFixed(3)}`;
                    qData.deltaClass = '';
                } else {
                    if (qData.classRank === 1) {
                        qData.deltaStr = '-0.000';
                        qData.deltaClass = 'purple';
                    } else {
                        qData.deltaStr = '+0.000';
                        qData.deltaClass = '';
                    }
                }

                if (car.bestLapTime > 0) qData.bestLapSeen = car.bestLapTime;
            } else {
                qData.lastLapCount = currentLapCount;
                const bestLap = car.bestLapTime || car.BestLapTime || 0;
                if (bestLap > 0 && (qData.bestLapSeen <= 0 || bestLap < qData.bestLapSeen)) {
                    qData.bestLapSeen = bestLap;
                }
            }

            // Atualiza faixa superior
            const topBar = cardEl.querySelector('.wqt-top-bar');
            if (topBar) {
                const manClass = getManufacturerColorClass(car);
                topBar.className = `wqt-top-bar ${manClass}`;
                const logoEl = topBar.querySelector('.wqt-logo');
                const logoUrl = getManufacturerLogoUrl(car);
                if (logoEl && logoUrl && !logoEl.querySelector('img')) {
                    logoEl.innerHTML = `<img src="${logoUrl}" alt="" onerror="this.style.display='none'">`;
                }
                const numEl = topBar.querySelector('.wqt-num');
                if (numEl) numEl.textContent = car.carNumber || car.CarNumber || '';

                let driverDisplayName = 'PILOTO';
                if (car.driverNameFormatted) {
                    driverDisplayName = car.driverNameFormatted.toUpperCase();
                } else if (car.driverName || car.DriverName) {
                    const raw = car.driverName || car.DriverName;
                    const parts = raw.trim().split(/\s+/);
                    if (parts.length > 1) {
                        driverDisplayName = `${parts[0][0].toUpperCase()}. ${parts.slice(1).join(' ').toUpperCase()}`;
                    } else {
                        driverDisplayName = parts[0].toUpperCase();
                    }
                }
                const nameEl = topBar.querySelector('.wqt-driver-name');
                if (nameEl) {
                    nameEl.textContent = driverDisplayName;
                    nameEl.title = driverDisplayName;
                }
            }

            // Atualiza Corpo Principal com Transição 3D
            const mainBody = cardEl.querySelector('.wqt-main-body');
            if (mainBody) {
                const elapsed = now - (qData.finishTimestamp || 0);
                let targetStage = 'live';
                if (elapsed < 3000) targetStage = 'delta';
                else if (elapsed < 6000) targetStage = 'final';

                const currentStage = mainBody.dataset.stage || '';

                if (currentStage !== targetStage) {
                    mainBody.dataset.stage = targetStage;

                    // Transiciona saída do elemento anterior
                    const existingRow = mainBody.querySelector('.wqt-row-layer.active-row');
                    if (existingRow) {
                        existingRow.classList.remove('wqt-roll-in', 'active-row');
                        existingRow.classList.add('wqt-roll-out');
                        setTimeout(() => { if (existingRow && existingRow.parentNode) existingRow.parentNode.removeChild(existingRow); }, 420);
                    }

                    // Cria nova camada com efeito 3D roll in (Foto 3)
                    const newRow = document.createElement('div');
                    newRow.className = 'wqt-row-layer active-row wqt-roll-in';

                    if (targetStage === 'delta') {
                        newRow.classList.add('wqt-delta-layer');
                        newRow.innerHTML = `<span class="wqt-delta-val ${qData.deltaClass}">${qData.deltaStr}</span>`;
                    } else if (targetStage === 'final') {
                        const pos = qData.classRank;
                        const suffix = getOrdinalSuffix(pos);
                        const invalidCls = qData.isLapValid ? '' : 'invalid';
                        const finalTimeStr = formatQualifyLiveTime(qData.finalLapTime);
                        newRow.innerHTML = `
                            <div class="wqt-rank">${pos}<sup class="wqt-rank-suffix">${suffix}</sup></div>
                            <div class="wqt-lap-final-time ${invalidCls}">${finalTimeStr}</div>
                        `;
                    } else {
                        const pos = car.classPlace || car.place || 1;
                        const suffix = getOrdinalSuffix(pos);
                        const liveTimeStr = formatQualifyLiveTime(car.timeIntoLap || 0);
                        newRow.innerHTML = `
                            <div class="wqt-rank">${pos}<sup class="wqt-rank-suffix">${suffix}</sup></div>
                            <div class="wqt-time">${liveTimeStr}</div>
                        `;
                    }

                    mainBody.appendChild(newRow);
                } else {
                    // Mesma fase: atualiza valores dinâmicos sem re-injetar nem reiniciar animação
                    const activeRow = mainBody.querySelector('.wqt-row-layer.active-row');
                    if (activeRow) {
                        if (targetStage === 'live') {
                            const rankEl = activeRow.querySelector('.wqt-rank');
                            const timeEl = activeRow.querySelector('.wqt-time');
                            const pos = car.classPlace || car.place || 1;
                            const suffix = getOrdinalSuffix(pos);
                            if (rankEl) rankEl.innerHTML = `${pos}<sup class="wqt-rank-suffix">${suffix}</sup>`;
                            if (timeEl) timeEl.textContent = formatQualifyLiveTime(car.timeIntoLap || 0);
                        } else if (targetStage === 'delta') {
                            const deltaEl = activeRow.querySelector('.wqt-delta-val');
                            if (deltaEl) {
                                deltaEl.className = `wqt-delta-val ${qData.deltaClass}`;
                                deltaEl.textContent = qData.deltaStr;
                            }
                        }
                    }
                }
            }

            // Atualiza setores S1, S2, S3
            const secColors = car.sectorColors || ['', '', ''];
            for (let s = 1; s <= 3; s++) {
                const secItem = cardEl.querySelector(`.wqt-sector-item[data-sec="${s}"]`);
                if (secItem) {
                    const sc = secColors[s - 1] || '';
                    let secCls = '';
                    if (sc === 'purple') secCls = 'sec-purple';
                    else if (sc === 'green') secCls = 'sec-green';
                    else if (sc === 'yellow') secCls = 'sec-yellow';

                    const lbl = secItem.querySelector('.wqt-sector-label');
                    const line = secItem.querySelector('.wqt-sector-line');
                    if (lbl) lbl.className = `wqt-sector-label ${secCls}`;
                    if (line) line.className = `wqt-sector-line ${secCls}`;
                }
            }
        });

        return true;
    }

    // =========================================================================
    // WEC STARTING GRID (GRADE DE LARGADA)
    // =========================================================================

    function formatOrdinal(n) {
        const s = ['th', 'st', 'nd', 'rd'];
        const v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    }

    const _sgPhotoCache = {};

    function _loadSgPhoto(imgEl, car) {
        if (!imgEl || !car) return;
        const fullName = (car.driverName || '').trim();
        const lastName = fullName.split(' ').pop();
        const cleanAscii = fullName.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s\-]/g, '').trim();
        const withHyphen    = cleanAscii.replace(/\s+/g, '_');
        const withUnderscore = cleanAscii.replace(/[\s\-]+/g, '_');
        const lastNorm = lastName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
        const cleanName = fullName.replace(/[\s]+/g, '_');
        const carNum = car.carNumber || '';

        const key = `${car.slotID}_${withHyphen}`;
        if (imgEl.dataset.driverKey === key) return;
        imgEl.dataset.driverKey = key;

        const urls = Array.from(new Set([
            `http://localhost:6397/start/images/drivers/${withHyphen}.webp`,
            `http://localhost:6397/start/images/drivers/${withUnderscore}.webp`,
            `http://localhost:6397/start/images/drivers/${lastNorm}.webp`,
            `../../Media/fotos/${cleanName}.png`,
            `../../Media/fotos/${withHyphen}.png`,
            `../../Media/fotos/${withUnderscore}.png`,
            `../../Media/fotos/${cleanName}.webp`,
            `../../Media/fotos/${lastNorm}.png`,
            `../../Media/fotos/${carNum}.png`
        ]));

        let idx = 0;
        const tryNext = () => {
            if (idx < urls.length) {
                imgEl.src = urls[idx++];
                imgEl.style.opacity = '1';
            } else {
                // Foto genérica quando nenhuma foto específica do piloto for encontrada
                imgEl.src = 'http://localhost:6397/start/images/drivers/default.webp';
                imgEl.style.opacity = '1';
                imgEl.onerror = () => { imgEl.style.opacity = '0'; };
            }
        };
        imgEl.onerror = tryNext;
        tryNext();
    }


    function _getSgClassBadgeClass(carClass) {
        if (!carClass) return 'cls-default';
        const cl = carClass.toLowerCase();
        if (cl.includes('hypercar') || cl === 'hy') return 'cls-hypercar';
        if (cl.includes('lmp2-elms') || cl.includes('elms')) return 'cls-lmp2-elms';
        if (cl.includes('lmp2')) return 'cls-lmp2';
        if (cl.includes('lmp3')) return 'cls-lmp3';
        if (cl.includes('lmgt3') || cl.includes('gt3')) return 'cls-lmgt3';
        if (cl.includes('gte')) return 'cls-gte';
        return 'cls-default';
    }

    function _getSgClassLabel(carClass) {
        if (!carClass) return '';
        const cl = carClass.toLowerCase();
        if (cl.includes('hypercar') || cl === 'hy') return 'HYPERCAR';
        if (cl.includes('lmp2')) return 'LMP2';
        if (cl.includes('lmp3')) return 'LMP3';
        if (cl.includes('lmgt3') || cl.includes('gt3')) return 'LMGT3';
        if (cl.includes('gte')) return 'GTE';
        return carClass.toUpperCase();
    }

    function _applyWsgPanel(side, car) {
        if (!car) {
            const panel = document.getElementById(`wsg-${side}-panel`);
            if (panel) panel.style.visibility = 'hidden';
            return;
        }
        const panel = document.getElementById(`wsg-${side}-panel`);
        if (panel) {
            panel.style.visibility = 'visible';
            // Manufacturer class
            panel.className = `wsg-side-panel wsg-${side} ${getManufacturerColorClass(car)}`;
        }

        const teamEl = document.getElementById(`wsg-${side}-team`);
        if (teamEl) {
            let team = (car.teamName || '').toUpperCase().split('#')[0]
                .replace(/:LM|:HE|\b20\d{2}\b/g, '').trim();
            teamEl.textContent = team || '';
        }

        const logoEl = document.getElementById(`wsg-${side}-logo`);
        if (logoEl) {
            const logoUrl = getManufacturerLogoUrl(car);
            if (logoUrl) {
                if (logoEl.dataset.src !== logoUrl) {
                    logoEl.dataset.src = logoUrl;
                    logoEl.src = logoUrl;
                }
                logoEl.style.display = 'block';
            } else {
                logoEl.style.display = 'none';
            }
        }

        const photoEl = document.getElementById(`wsg-${side}-photo`);
        if (photoEl) _loadSgPhoto(photoEl, car);

        const posEl = document.getElementById(`wsg-${side}-pos`);
        const displayPos = car.classGridPos || car.gridPosition || 1;
        if (posEl) posEl.textContent = formatOrdinal(displayPos);

        const nameEl = document.getElementById(`wsg-${side}-name`);
        if (nameEl) {
            // Format: "S. BUEMI"
            const parts = (car.driverName || '').trim().split(' ');
            const last = parts.pop() || '';
            const initials = parts.map(p => p.charAt(0).toUpperCase() + '.').join(' ');
            nameEl.textContent = initials ? `${initials} ${last.toUpperCase()}` : last.toUpperCase();
        }

        const clsEl = document.getElementById(`wsg-${side}-class`);
        if (clsEl) {
            clsEl.textContent = _getSgClassLabel(car.carClass);
            clsEl.className = `wsg-driver-class-badge ${_getSgClassBadgeClass(car.carClass)}`;
        }
    }

    let _lastSgClass = null;

    function renderStartingGrid(standings, overlayState, trackName) {
        const container = document.getElementById('wec-starting-grid-container');
        if (!container) return;

        // Atualiza o footer social SEMPRE (independente de o grid estar visível ou ter dados)
        // Isso garante que as redes sociais configuradas apareçam assim que o overlay carrega
        (function _updateSocialFooter() {
            function _renderSocialItem(el, text, iconType, customPath) {
                if (!el) return;
                const cleanText = (text || '').trim();
                const cleanIcon = String(iconType || '').toLowerCase();
                const cleanPath = (customPath || '').trim();
                const signature = `${cleanText}||${cleanIcon}||${cleanPath}`;
                if (el.dataset.socialSig === signature) return;
                el.dataset.socialSig = signature;
                if (!cleanText && (!cleanIcon || cleanIcon === 'none') && !cleanPath) {
                    el.innerHTML = '';
                    return;
                }
                let iconHtml = '';
                if (cleanIcon === 'custom' && cleanPath) {
                    const normPath = cleanPath.replace(/^[\/\\]+/, '');
                    const initialSrc = (window.location.protocol === 'file:') ? `../../${normPath}` : `/${normPath}`;
                    iconHtml = `<img src="${initialSrc}" class="wsg-social-icon-img" alt="" onerror="if(!this._tRel){this._tRel=true;this.src='../../${normPath}';}else{this.style.display='none';}">`;
                } else if (cleanIcon && cleanIcon !== 'none') {
                    const svgs = {
                        instagram: '<svg class="wsg-social-icon-svg" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>',
                        youtube: '<svg class="wsg-social-icon-svg" viewBox="0 0 24 24"><path fill="currentColor" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>',
                        x: '<svg class="wsg-social-icon-svg" viewBox="0 0 24 24"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
                        twitter: '<svg class="wsg-social-icon-svg" viewBox="0 0 24 24"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
                        twitch: '<svg class="wsg-social-icon-svg" viewBox="0 0 24 24"><path fill="currentColor" d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/></svg>',
                        discord: '<svg class="wsg-social-icon-svg" viewBox="0 0 24 24"><path fill="currentColor" d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.893.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>',
                        tiktok: '<svg class="wsg-social-icon-svg" viewBox="0 0 24 24"><path fill="currentColor" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-1.01-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>',
                        facebook: '<svg class="wsg-social-icon-svg" viewBox="0 0 24 24"><path fill="currentColor" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>',
                        website: '<svg class="wsg-social-icon-svg" viewBox="0 0 24 24"><path fill="currentColor" d="M12 0a12 12 0 1 0 12 12A12.013 12.013 0 0 0 12 0zm0 2.07c1.37 0 2.87 2.21 3.5 5.93H8.5c.63-3.72 2.13-5.93 3.5-5.93zm-5.57.98c-1.32.96-2.42 2.3-3.15 3.95H7.3c.48-1.54 1.2-2.9 2.13-3.95zm11.14 0c.93 1.05 1.65 2.41 2.13 3.95h4.02c-.73-1.65-1.83-2.99-3.15-3.95zM2.38 10h5.18a22.25 22.25 0 0 0 0 4H2.38a10.02 10.02 0 0 1 0-4zm6.18 0h6.88c.09.65.14 1.31.14 2s-.05 1.35-.14 2H8.56a18.23 18.23 0 0 1 0-4zm8.94 0h5.18a10.02 10.02 0 0 1 0 4h-5.18a22.25 22.25 0 0 0 0-4zm-2.06 6h4.02c-.73 1.65-1.83 2.99-3.15 3.95-.93-1.05-1.65-2.41-2.13-3.95zm-3.44 5.93c-1.37 0-2.87-2.21-3.5-5.93h7c-.63 3.72-2.13 5.93-3.5 5.93zm-4.5-5.93c-.48 1.54-1.2 2.9-2.13 3.95-1.32-.96-2.42-2.3-3.15-3.95h4.02z"/></svg>'
                    };
                    iconHtml = svgs[cleanIcon] || '';
                }
                el.innerHTML = `${iconHtml}<span class="wsg-social-text">${cleanText}</span>`;
            }
            const ov = overlayState || {};
            _renderSocialItem(document.getElementById('wsg-social-left'),   ov.sgSocialLeft,   ov.sgSocialLeftIcon,   ov.sgSocialLeftCustom);
            _renderSocialItem(document.getElementById('wsg-social-center'), ov.sgSocialCenter, ov.sgSocialCenterIcon, ov.sgSocialCenterCustom);
            _renderSocialItem(document.getElementById('wsg-social-right'),  ov.sgSocialRight,  ov.sgSocialRightIcon,  ov.sgSocialRightCustom);
        })();

        const visible = !!(overlayState && overlayState.startingGridVisible);
        if (!visible || !standings || standings.length === 0) {
            container.classList.add('hidden');
            _lastSgClass = null;
            return;
        }

        // Ordenação das classes da mais rápida para a mais lenta
        const classSpeedOrder = ['hypercar', 'lmp2', 'lmp2-elms', 'lmp3', 'lmgt3', 'gte'];

        // Agrupa todos os carros válidos com gridPosition
        let allValid = standings
            .filter(c => c.gridPosition && c.gridPosition > 0)
            .sort((a, b) => a.gridPosition - b.gridPosition);

        if (allValid.length === 0) {
            const byPlace = standings.slice().sort((a, b) => (a.place || 99) - (b.place || 99));
            byPlace.forEach((c, i) => { c._fakeGrid = i + 1; });
            allValid = byPlace.map(c => ({ ...c, gridPosition: c._fakeGrid }));
        }

        // Detecta classes presentes ordenadas por velocidade
        const presentClasses = [];
        classSpeedOrder.forEach(co => {
            const found = allValid.some(c => {
                const map = getWecClassMapping(c.carClass);
                return map === co || (co === 'lmp2-elms' && String(c.carClass).toLowerCase().includes('elms'));
            });
            if (found) presentClasses.push(co);
        });

        // Adiciona classes não mapeadas ao final
        allValid.forEach(c => {
            const map = getWecClassMapping(c.carClass);
            if (!presentClasses.includes(map)) presentClasses.push(map);
        });

        // Determina classe ativa
        const reqClass = (overlayState.startingGridClass || 'AUTO').toLowerCase();
        let targetClass = reqClass;
        if (reqClass === 'auto') {
            targetClass = presentClasses.length > 0 ? presentClasses[0] : 'hypercar';
        }

        // Filtra os carros da classe selecionada
        let gridCars = allValid.filter(c => {
            const map = getWecClassMapping(c.carClass);
            if (targetClass.includes('elms')) {
                return String(c.carClass).toLowerCase().includes('elms');
            }
            return map === targetClass || String(c.carClass).toLowerCase().includes(targetClass);
        });

        if (gridCars.length === 0) {
            gridCars = allValid; // Fallback se classe vazia
        }

        // Atribui a posição relativa DENTRO da classe (1st, 2nd, 3rd... da classe)
        gridCars.forEach((c, idx) => {
            c.classGridPos = idx + 1;
        });

        // Transição suave ao trocar de classe
        const bodyEl = container.querySelector('.wsg-body');
        if (bodyEl && _lastSgClass && _lastSgClass !== targetClass) {
            bodyEl.classList.add('wsg-class-fading');
            setTimeout(() => {
                if (bodyEl) bodyEl.classList.remove('wsg-class-fading');
            }, 300);
        }
        _lastSgClass = targetClass;

        // Cálculo da linha selecionada (cada linha = 2 carros)
        const totalRows = Math.max(1, Math.ceil(gridCars.length / 2));
        const requestedRow = Math.max(1, (overlayState.startingGridRow) || 1);
        const rowIndex = Math.min(requestedRow, totalRows);

        const leftIdx  = (rowIndex - 1) * 2;      // Carro ímpar da classe (Pole / P3 / P5 da classe)
        const rightIdx = leftIdx + 1;             // Carro par da classe (P2 / P4 / P6 da classe)

        const leftCar  = gridCars[leftIdx]  || null;
        const rightCar = gridCars[rightIdx] || null; // Pode ser null se última linha tiver 1 carro

        // Atualiza header
        const evtEl = document.getElementById('wsg-event-name');
        if (evtEl && trackName) {
            const classTitle = _getSgClassLabel(targetClass);
            const champTitle = (overlayState && overlayState.championshipName) || 'FIA WORLD ENDURANCE CHAMPIONSHIP';
            evtEl.textContent = `${champTitle.toUpperCase()} — ${trackName.toUpperCase()} ${classTitle ? '• ' + classTitle : ''}`;
        }

        // Atualiza label ROW
        const rowLabel = document.getElementById('wsg-row-label');
        if (rowLabel) rowLabel.textContent = `STARTING GRID ROW ${rowIndex}`;

        // Atualiza painéis laterais (o da direita fica oculto se a linha só tiver 1 carro)
        _applyWsgPanel('left',  leftCar);
        _applyWsgPanel('right', rightCar);

        // Atualiza coluna central em Zigue-Zague escalonado
        const listEl = document.getElementById('wsg-grid-list');
        if (listEl) {
            const gridSig = `${targetClass}_${gridCars.length}_${gridCars.map(c => c.carNumber).join(',')}`;
            if (listEl.dataset.gridSig !== gridSig) {
                listEl.innerHTML = '';
                listEl.dataset.gridSig = gridSig;

                // Constrói linhas de 2 carros (zigue-zague)
                for (let r = 0; r < totalRows; r++) {
                    const c1 = gridCars[r * 2];
                    const c2 = gridCars[r * 2 + 1] || null;

                    const rowDiv = document.createElement('div');
                    rowDiv.className = 'wsg-grid-row';
                    rowDiv.dataset.rowNum = String(r + 1);

                    // Coluna Esquerda (Posição Ímpar - mais à frente)
                    const colLeft = document.createElement('div');
                    colLeft.className = 'wsg-col-left';

                    if (c1) {
                        const item1 = document.createElement('div');
                        item1.className = 'wsg-grid-item';
                        item1.dataset.gridPos = String(c1.classGridPos);

                        const pos1 = document.createElement('span');
                        pos1.className = 'wsg-item-pos';
                        const ord1 = formatOrdinal(c1.classGridPos);
                        pos1.innerHTML = `${c1.classGridPos}<sup>${ord1.replace(/\d+/, '')}</sup>`;

                        const badge1 = document.createElement('span');
                        badge1.className = `wsg-item-badge ${_getSgClassBadgeClass(c1.carClass)}`;
                        const logoUrl1 = getManufacturerLogoUrl(c1);
                        if (logoUrl1) {
                            const img1 = document.createElement('img');
                            img1.src = logoUrl1;
                            img1.className = 'wsg-item-badge-logo';
                            img1.alt = '';
                            badge1.appendChild(img1);
                        }
                        const numTxt1 = document.createTextNode(` ${c1.carNumber || '?'}`);
                        badge1.appendChild(numTxt1);

                        item1.appendChild(pos1);
                        item1.appendChild(badge1);
                        colLeft.appendChild(item1);
                    }
                    rowDiv.appendChild(colLeft);

                    // Coluna Direita (Posição Par - ligeiramente recuado)
                    const colRight = document.createElement('div');
                    colRight.className = 'wsg-col-right';

                    if (c2) {
                        const item2 = document.createElement('div');
                        item2.className = 'wsg-grid-item';
                        item2.dataset.gridPos = String(c2.classGridPos);

                        const pos2 = document.createElement('span');
                        pos2.className = 'wsg-item-pos';
                        const ord2 = formatOrdinal(c2.classGridPos);
                        pos2.innerHTML = `${c2.classGridPos}<sup>${ord2.replace(/\d+/, '')}</sup>`;

                        const badge2 = document.createElement('span');
                        badge2.className = `wsg-item-badge ${_getSgClassBadgeClass(c2.carClass)}`;
                        const logoUrl2 = getManufacturerLogoUrl(c2);
                        if (logoUrl2) {
                            const img2 = document.createElement('img');
                            img2.src = logoUrl2;
                            img2.className = 'wsg-item-badge-logo';
                            img2.alt = '';
                            badge2.appendChild(img2);
                        }
                        const numTxt2 = document.createTextNode(` ${c2.carNumber || '?'}`);
                        badge2.appendChild(numTxt2);

                        item2.appendChild(pos2);
                        item2.appendChild(badge2);
                        colRight.appendChild(item2);
                    }
                    rowDiv.appendChild(colRight);

                    listEl.appendChild(rowDiv);
                }
            }

            // Destaca os carros da linha selecionada
            const selectedPositions = new Set();
            if (leftCar)  selectedPositions.add(String(leftCar.classGridPos));
            if (rightCar) selectedPositions.add(String(rightCar.classGridPos));

            listEl.querySelectorAll('.wsg-grid-item').forEach(item => {
                const gp = item.dataset.gridPos;
                if (selectedPositions.has(gp)) {
                    item.classList.add('wsg-selected');
                } else {
                    item.classList.remove('wsg-selected');
                }
            });
        }

        // Função para renderizar cada item social do rodapé com cache de assinatura (evita recarregar a imagem e piscar a cada frame)
        function _renderSocialFooterItem(el, text, iconType, customPath) {
            if (!el) return;
            const cleanText = (text || '').trim();
            const cleanIcon = String(iconType || '').toLowerCase();
            const cleanPath = (customPath || '').trim();

            const signature = `${cleanText}||${cleanIcon}||${cleanPath}`;
            if (el.dataset.socialSig === signature) {
                return; // NÃO toca no DOM se não mudou — mantém a imagem perfeitamente estável sem piscar!
            }
            el.dataset.socialSig = signature;

            if (!cleanText && (!cleanIcon || cleanIcon === 'none') && !cleanPath) {
                el.innerHTML = '';
                return;
            }

            let iconHtml = '';

            if (cleanIcon === 'custom' && cleanPath) {
                const normPath = cleanPath.replace(/^[\/\\]+/, '');
                const initialSrc = (window.location.protocol === 'file:') ? `../../${normPath}` : `/${normPath}`;
                iconHtml = `<img src="${initialSrc}" class="wsg-social-icon-img" alt="" onerror="if(!this._tRel){this._tRel=true;this.src='../../${normPath}';}else{this.style.display='none';}">`;
            } else if (cleanIcon && cleanIcon !== 'none') {
                const svgs = {
                    instagram: '<svg class="wsg-social-icon-svg" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>',
                    youtube: '<svg class="wsg-social-icon-svg" viewBox="0 0 24 24"><path fill="currentColor" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>',
                    x: '<svg class="wsg-social-icon-svg" viewBox="0 0 24 24"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
                    twitter: '<svg class="wsg-social-icon-svg" viewBox="0 0 24 24"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
                    twitch: '<svg class="wsg-social-icon-svg" viewBox="0 0 24 24"><path fill="currentColor" d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/></svg>',
                    discord: '<svg class="wsg-social-icon-svg" viewBox="0 0 24 24"><path fill="currentColor" d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.893.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>',
                    tiktok: '<svg class="wsg-social-icon-svg" viewBox="0 0 24 24"><path fill="currentColor" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-1.01-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>',
                    facebook: '<svg class="wsg-social-icon-svg" viewBox="0 0 24 24"><path fill="currentColor" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>',
                    website: '<svg class="wsg-social-icon-svg" viewBox="0 0 24 24"><path fill="currentColor" d="M12 0a12 12 0 1 0 12 12A12.013 12.013 0 0 0 12 0zm0 2.07c1.37 0 2.87 2.21 3.5 5.93H8.5c.63-3.72 2.13-5.93 3.5-5.93zm-5.57.98c-1.32.96-2.42 2.3-3.15 3.95H7.3c.48-1.54 1.2-2.9 2.13-3.95zm11.14 0c.93 1.05 1.65 2.41 2.13 3.95h4.02c-.73-1.65-1.83-2.99-3.15-3.95zM2.38 10h5.18a22.25 22.25 0 0 0 0 4H2.38a10.02 10.02 0 0 1 0-4zm6.18 0h6.88c.09.65.14 1.31.14 2s-.05 1.35-.14 2H8.56a18.23 18.23 0 0 1 0-4zm8.94 0h5.18a10.02 10.02 0 0 1 0 4h-5.18a22.25 22.25 0 0 0 0-4zm-2.06 6h4.02c-.73 1.65-1.83 2.99-3.15 3.95-.93-1.05-1.65-2.41-2.13-3.95zm-3.44 5.93c-1.37 0-2.87-2.21-3.5-5.93h7c-.63 3.72-2.13 5.93-3.5 5.93zm-4.5-5.93c-.48 1.54-1.2 2.9-2.13 3.95-1.32-.96-2.42-2.3-3.15-3.95h4.02z"/></svg>'
                };
                iconHtml = svgs[cleanIcon] || '';
            }

            el.innerHTML = `${iconHtml}<span class="wsg-social-text">${cleanText}</span>`;
        }

        // Atualiza footer social com ícone e texto
        const socialLeft   = document.getElementById('wsg-social-left');
        const socialCenter = document.getElementById('wsg-social-center');
        const socialRight  = document.getElementById('wsg-social-right');
        _renderSocialFooterItem(socialLeft,   overlayState.sgSocialLeft,   overlayState.sgSocialLeftIcon,   overlayState.sgSocialLeftCustom);
        _renderSocialFooterItem(socialCenter, overlayState.sgSocialCenter, overlayState.sgSocialCenterIcon, overlayState.sgSocialCenterCustom);
        _renderSocialFooterItem(socialRight,  overlayState.sgSocialRight,  overlayState.sgSocialRightIcon,  overlayState.sgSocialRightCustom);

        container.classList.remove('hidden');
    }

    // ============================================================
    // WEC FASTEST LAP BY CLASS WIDGET
    // ============================================================
    let _fastestLapIsActive = false;
    let _fastestLapExitTimer = null;
    let _fastestLapEntranceTimer = null;
    let _lastFastestLapSignature = '';

    function renderFastestLapByClass(standings, overlayState) {
        const container = document.getElementById('wec-fastest-lap-container');
        if (!container) return false;

        const isVisible = !!(overlayState && overlayState.fastestLapVisible);

        if (!isVisible || !standings || standings.length === 0) {
            if (_fastestLapIsActive) {
                _fastestLapIsActive = false;
                if (_fastestLapEntranceTimer) {
                    clearTimeout(_fastestLapEntranceTimer);
                    _fastestLapEntranceTimer = null;
                }
                container.classList.remove('entering');
                container.classList.add('exiting');
                if (_fastestLapExitTimer) clearTimeout(_fastestLapExitTimer);
                _fastestLapExitTimer = setTimeout(() => {
                    container.classList.add('hidden');
                    container.classList.remove('exiting');
                    _fastestLapExitTimer = null;
                    _lastFastestLapSignature = '';
                }, 2250);
            }
            return false;
        }

        const cardsList = document.getElementById('wec-fl-cards-list');
        if (!cardsList) return false;

        // Identifica as classes presentes em ordem de velocidade
        const classOrder = ['HYPERCAR', 'LMP2', 'LMP3', 'LMGT3', 'GTE'];
        const classesMap = new Map();

        standings.forEach(c => {
            const rawCls = c.carClass || '';
            const mappedCls = getWecClassMapping(rawCls).toUpperCase();
            if (!classesMap.has(mappedCls)) {
                classesMap.set(mappedCls, []);
            }
            classesMap.get(mappedCls).push(c);
        });

        const sortedClasses = Array.from(classesMap.keys()).sort((a, b) => {
            let idxA = classOrder.indexOf(a);
            let idxB = classOrder.indexOf(b);
            return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
        });

        // Para cada classe, encontra o carro com o menor bestLapTime (> 0)
        const fastestCars = [];
        sortedClasses.forEach(cls => {
            const cars = classesMap.get(cls);
            const valid = cars.filter(c => typeof c.bestLapTime === 'number' && c.bestLapTime > 0);
            if (valid.length > 0) {
                valid.sort((a, b) => a.bestLapTime - b.bestLapTime);
                fastestCars.push({ classKey: cls, car: valid[0] });
            }
        });

        if (fastestCars.length === 0) {
            if (_fastestLapIsActive) {
                _fastestLapIsActive = false;
                container.classList.add('hidden');
                container.classList.remove('entering', 'exiting');
            }
            return false;
        }

        // Detecta nova ativação (ON)
        const justActivated = !_fastestLapIsActive;
        if (justActivated) {
            _fastestLapIsActive = true;
            if (_fastestLapExitTimer) {
                clearTimeout(_fastestLapExitTimer);
                _fastestLapExitTimer = null;
            }
            container.classList.remove('hidden', 'exiting');
            container.classList.add('entering');
            _lastFastestLapSignature = ''; // força render inicial dos cards
            if (_fastestLapEntranceTimer) clearTimeout(_fastestLapEntranceTimer);
            _fastestLapEntranceTimer = setTimeout(() => {
                container.classList.remove('entering');
                _fastestLapEntranceTimer = null;
            }, 2600);
        }

        const signature = fastestCars.map(item => `${item.classKey}-${item.car.slotID}-${item.car.bestLapTime}`).join('|');

        // Só reconstrói o DOM dos cards se os líderes mudaram ou se acabou de ser acionado
        if (signature !== _lastFastestLapSignature) {
            _lastFastestLapSignature = signature;

            let html = '';
            fastestCars.forEach(item => {
                const c = item.car;
                const cls = item.classKey;
                const classColor = getWecClassColor(c.carClass);
                const mfrColorClass = getManufacturerColorClass(c);
                const mfrLogoUrl = getManufacturerLogoUrl(c);
                const timeStr = formatTime(c.bestLapTime);

                let firstName = '';
                let lastName = '';
                if (c.driverNameFormatted) {
                    const parts = c.driverNameFormatted.split('. ');
                    if (parts.length > 1) {
                        firstName = parts[0] + '.';
                        lastName = parts.slice(1).join(' ');
                    } else {
                        lastName = c.driverNameFormatted;
                    }
                } else if (c.driverName) {
                    const parts = c.driverName.trim().split(' ');
                    if (parts.length > 1) {
                        firstName = parts.slice(0, -1).join(' ');
                        lastName = parts[parts.length - 1];
                    } else {
                        lastName = c.driverName;
                    }
                }

                const teamName = (c.teamName || '').toUpperCase();
                const carNumber = c.carNumber || '';

                html += `
                    <div class="wec-fl-card ${mfrColorClass}">
                        <div class="wec-fl-time-bar">
                            <span class="wec-fl-time-val">${timeStr}</span>
                        </div>
                        <div class="wec-fl-card-body">
                            <div class="wec-fl-bg-layer man-bg ${mfrColorClass}"></div>
                            <div class="wec-fl-ghost-num">${carNumber}</div>
                            <div class="wec-fl-info-col">
                                <div class="wec-fl-mfr-badge">
                                    ${mfrLogoUrl ? `<img src="${mfrLogoUrl}" class="wec-fl-mfr-logo-img" alt="" onerror="this.style.display='none'">` : ''}
                                </div>
                                <div class="wec-fl-driver-wrap">
                                    <span class="wec-fl-first-name">${firstName}</span>
                                    <span class="wec-fl-last-name">${lastName}</span>
                                    <span class="wec-fl-team-name">${teamName}</span>
                                </div>
                            </div>
                            <div class="wec-fl-photo-col">
                                <img class="wec-fl-photo-img" data-fl-slot="${c.slotID}" alt="" onerror="this.style.opacity='0'">
                            </div>
                        </div>
                        <div class="wec-fl-class-footer" style="background-color: ${classColor}">
                            ${cls}
                        </div>
                    </div>
                `;
            });

            cardsList.innerHTML = html;

            // Aplica o sistema completo de fotos (LMU local server + Media/fotos)
            fastestCars.forEach(item => {
                const c = item.car;
                const imgEl = cardsList.querySelector(`.wec-fl-photo-img[data-fl-slot="${c.slotID}"]`);
                if (imgEl) {
                    setDriverPhoto(imgEl, c);
                }
            });

            if (justActivated) {
                void container.offsetWidth;
            }
        }

        container.classList.remove('hidden');
        return true;
    }

    // ============================================================
    // WEC TOWER CLASS WIPE TRANSITION
    // ============================================================
    let _lastTowerClass = null;
    let _towerTransitionTimer = null;

    function playTowerClassTransition(newClass) {
        const transEl = document.getElementById('wec-tower-transition');
        const nameEl  = document.getElementById('wec-tower-trans-name');
        const ghostEl = document.getElementById('wec-tower-trans-ghost');
        if (!transEl || !nameEl) return;

        const raw = (newClass || 'ALL').trim().toUpperCase();
        let displayLabel = raw;
        let classKey = 'all';

        if (raw === 'ALL' || raw.includes('TODAS')) {
            displayLabel = 'OVERALL';
            classKey = 'all';
        } else if (raw.includes('HYPER')) {
            displayLabel = 'HYPERCAR';
            classKey = 'hypercar';
        } else if (raw.includes('LMGT3') || raw.includes('GT3')) {
            displayLabel = 'LMGT3';
            classKey = 'lmgt3';
        } else if (raw.includes('LMP2') || raw.includes('P2')) {
            displayLabel = 'LMP2';
            classKey = 'lmp2';
        } else if (raw.includes('LMP3') || raw.includes('P3')) {
            displayLabel = 'LMP3';
            classKey = 'lmp3';
        } else if (raw.includes('GTE')) {
            displayLabel = 'LMGTE';
            classKey = 'gte';
        }

        // Define textos
        nameEl.innerText = displayLabel;
        if (ghostEl) ghostEl.innerText = displayLabel;

        // Aplica classe de cor do tema
        transEl.className = `wec-tower-transition trans-${classKey}`;

        // Limpa animação anterior se ativa
        if (_towerTransitionTimer) {
            clearTimeout(_towerTransitionTimer);
            transEl.classList.remove('animating');
        }

        // Fixa a cortina ancorada no cabeçalho superior e no rodapé inferior com height: auto.
        // Isso garante que conforme a torre cresce (ex: GT3 com 19 pilotos) ou encolhe,
        // a cortina cubra 100% dos pilotos sem deixar nenhum de fora no final e sem encavalar no rodapé.
        const topSection = document.querySelector('.wec-top-section');
        const footer = document.querySelector('.wec-footer');
        const topOffset = topSection && topSection.offsetHeight > 0 ? topSection.offsetHeight : 72;
        const bottomOffset = footer && footer.offsetHeight > 0 ? footer.offsetHeight : 34;

        transEl.style.top = topOffset + 'px';
        transEl.style.bottom = bottomOffset + 'px';
        transEl.style.height = 'auto';

        // Força reflow para reiniciar keyframe se chamado em sequência
        void transEl.offsetWidth;

        transEl.classList.add('animating');

        _towerTransitionTimer = setTimeout(() => {
            transEl.classList.remove('animating');
            transEl.classList.add('hidden');
            _towerTransitionTimer = null;
        }, 2250);
    }

    function applyLayoutTransforms(overlayState) {


        if (!overlayState) return;
        const positions = overlayState.positions || {};
        const scales = overlayState.scales || {};
        const allIds = new Set([...Object.keys(positions), ...Object.keys(scales)]);
        allIds.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            const pos = positions[id];
            const scale = scales[id];
            const hasManualPos = (pos && typeof pos.x === 'number' && typeof pos.y === 'number');
            if (hasManualPos) {
                const posX = Math.max(10, pos.x);
                const posY = Math.max(20, pos.y);
                el.style.left = `${posX}px`;
                el.style.top = `${posY}px`;
                el.style.bottom = 'auto';
                el.style.right = 'auto';
                el.classList.add('manual-position');
            }

            if (scale !== undefined && scale > 0) {
                el.style.zoom = scale;
                el.style.setProperty('--layout-scale', scale);
                if (id === 'wec-qualify-tracker-container' && !hasManualPos) {
                    el.style.transform = `translateX(-50%) scale(${scale})`;
                    el.style.transformOrigin = 'bottom center';
                } else if (id === 'wec-starting-grid-container' && !hasManualPos) {
                    el.style.transform = `translate(-50%, -50%) scale(${scale})`;
                    el.style.transformOrigin = 'center center';
                } else {
                    el.style.transform = `scale(${scale})`;
                    if (id.includes('banner') || id.includes('stats') || id.includes('box') || id.includes('tracker')) {
                        el.style.transformOrigin = 'bottom left';
                    } else if (id.includes('grid')) {
                        el.style.transformOrigin = 'top left';
                    } else {
                        el.style.transformOrigin = 'top left';
                    }
                }
            }
        });
    }


    function handleMessage(data) {

        try {
            if (data.overlay_state) {
                state.currentOverlayState = { ...state.currentOverlayState, ...data.overlay_state };
            } else if (data.settings) {
                state.currentOverlayState = { ...state.currentOverlayState, ...data.settings };
            }
            const overlayState = state.currentOverlayState || {};


            const waiting = document.getElementById('waiting-server-overlay');
            if (waiting) waiting.classList.add('hidden');

            const isRaceSession = !!data.is_race && !data.is_qualifying;
            let sessionHeaderTitle = (data.session_name || (isRaceSession ? 'RACE' : 'FREE PRACTICE')).toUpperCase();
            if (data.is_qualifying) sessionHeaderTitle = 'QUALIFYING';

            const subHeader = document.getElementById('wec-sub-header');
            if (subHeader) {
                subHeader.innerText = sessionHeaderTitle;
            }

            const locEl = document.getElementById('wec-location');
            if (locEl) {
                locEl.innerText = (data.track_name || 'MONZA').toUpperCase();
            }

            // Garante classe WEC sempre presente para estilo dos widgets oficiais
            document.body.classList.add('WEC');

            // ── Bandeiras: lógica reativa com verde temporário ──
            const flagsData = data.session_flags || {};
            const anyCarFinished = (data.standings && Array.isArray(data.standings))
                ? data.standings.some(c => c.isFinished || c.finishStatus === 1 || (c.statusText && c.statusText.includes('FINISH')))
                : false;
            const rawFCY      = !!(flagsData.isFCY      || data.isFCY      || data.is_fcy);
            const rawFinished = !!(flagsData.isFinished || data.isFinished || data.is_finished || anyCarFinished);
            const gamePhase   = data.game_phase || 0;

            // Bandeira amarela em QUALQUER setor da pista (local ou FCY)
            const sectorYellows = Array.isArray(data.sector_yellows) ? data.sector_yellows : [];
            const hasAnySectorYellow = sectorYellows.some(y => !!y);
            const rawAnyYellow = rawFCY || hasAnySectorYellow;

            flagState.isFCY      = rawAnyYellow;  // Agora reage a amarela local também
            flagState.isFinished = rawFinished;

            const timerEl = document.getElementById('wec-timer');
            if (timerEl) {
                if (flagState.isFinished) {
                    timerEl.innerText = 'FINISH';
                } else {
                    timerEl.innerText = data.session_time_str || '00:00:00';
                }
            }

            // Verde flag: só ativa quando a fase MUDa para corrida (5 ou 6) vindo de outra fase
            // Dura exatamente 8 segundos e apaga sozinha
            if (gamePhase !== flagState.prevGamePhase) {
                const wasRacing  = flagState.prevGamePhase !== null && (flagState.prevGamePhase === 5 || flagState.prevGamePhase === 6);
                const nowRacing  = (gamePhase === 5 || gamePhase === 6);
                const restartCondition = !wasRacing && nowRacing && !rawAnyYellow && !rawFinished;
                if (restartCondition) {
                    flagState.isGreen = true;
                    if (flagState.greenFlagTimer) clearTimeout(flagState.greenFlagTimer);
                    flagState.greenFlagTimer = setTimeout(() => {
                        flagState.isGreen = false;
                        document.body.classList.remove('state-green-flag');
                    }, 8000);
                }
                flagState.prevGamePhase = gamePhase;
            }

            // Qualquer amarela apaga o verde se ainda estiver ativo
            if (rawAnyYellow && flagState.isGreen) {
                flagState.isGreen = false;
                if (flagState.greenFlagTimer) clearTimeout(flagState.greenFlagTimer);
                document.body.classList.remove('state-green-flag');
            }

            document.body.classList.toggle('state-fcy',              flagState.isFCY && !flagState.isFinished);
            document.body.classList.toggle('state-yellow-flag',      flagState.isFCY && !flagState.isFinished);
            document.body.classList.toggle('state-green-flag',       flagState.isGreen);
            document.body.classList.toggle('state-session-finished', flagState.isFinished);

            // Aplica posições e escalas manuais configuradas pelo GUI
            applyLayoutTransforms(overlayState);


            const incomingClass = overlayState.focusedClass || 'ALL';
            if (_lastTowerClass !== null && _lastTowerClass !== incomingClass) {
                playTowerClassTransition(incomingClass);
            }
            _lastTowerClass = incomingClass;

            state.currentTowerMode = overlayState.towerMode || 'GAP';
            state.currentFocusedClass = incomingClass;
            document.body.classList.toggle('tower-mode-NAME', state.currentTowerMode === 'NAME');

            const towerEl = document.getElementById('wec-tower-container');
            const showTower = overlayState.standingsTower !== undefined ? !!overlayState.standingsTower : true;
            if (towerEl) {
                towerEl.classList.toggle('hidden', !showTower);
                towerEl.style.display = showTower ? 'block' : 'none';
            }



            if (data.standings && Array.isArray(data.standings)) {
                let displayStandings = [];
                const focusedClassUpper = (state.currentFocusedClass || 'ALL').toUpperCase();
                const isAllMode = (focusedClassUpper === 'ALL' || focusedClassUpper.includes('TODAS'));

                data.standings.forEach(car => {
                    car.isFocused = (car.slotID === data.focused_slot_id);
                });

                if (!isAllMode) {
                    const targetMapped = getWecClassMapping(state.currentFocusedClass);
                    const clsDriversAll = data.standings
                        .filter(car => {
                            const cls = car.carClass || '';
                            return getWecClassMapping(cls) === targetMapped || cls.toUpperCase().includes(focusedClassUpper);
                        })
                        .sort((a, b) => ((a.classPlace || a.place) - (b.classPlace || b.place)));

                    displayStandings = [{ isHeader: true, Class: state.currentFocusedClass }, ...clsDriversAll];
                } else {
                    const classOrder = ['hypercar', 'lmp2', 'lmp2-elms', 'lmp3', 'lmgt3', 'gte'];
                    const classesFound = new Map();

                    data.standings.forEach(car => {
                        const rawCls = car.carClass || 'HY';
                        const mapped = getWecClassMapping(rawCls);
                        if (!classesFound.has(mapped)) classesFound.set(mapped, []);
                        classesFound.get(mapped).push(car);
                    });

                    const sortedKeys = Array.from(classesFound.keys()).sort((a, b) => {
                        const idxA = classOrder.indexOf(a);
                        const idxB = classOrder.indexOf(b);
                        return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
                    });

                    // 8 linhas por classe com 3+ classes, 11 linhas com 2 classes
                    const limit = sortedKeys.length >= 3 ? 8 : 11;

                    // Detecta piloto focado e sua classe
                    const focusedCar = data.standings.find(c => c.slotID === data.focused_slot_id);
                    const focusedClass = focusedCar ? getWecClassMapping(focusedCar.carClass) : null;

                    sortedKeys.forEach(clsKey => {
                        const clsDriversAll = classesFound.get(clsKey)
                            .sort((a, b) => ((a.classPlace || a.place) - (b.classPlace || b.place)));

                        if (clsDriversAll.length === 0) return;

                        // Verifica se o focado está nessa classe e não está no top 3
                        const focusedInThisClass = focusedCar && focusedClass === clsKey;
                        const focusedIdx = focusedInThisClass
                            ? clsDriversAll.findIndex(c => c.slotID === data.focused_slot_id)
                            : -1;

                        let rows;
                        // JANELA DE FOCO:
                        //  - focado fora do top-N normal (idx >= limit), OU
                        //  - focado é o último visível mas tem alguém atrás (ficaria isolado sem contexto)
                        const hasCarBehind = focusedIdx < clsDriversAll.length - 1;
                        const outsideNormal = focusedInThisClass && focusedIdx >= limit;
                        const lastVisibleWithMore = focusedInThisClass && focusedIdx === limit - 1 && hasCarBehind;

                        if (outsideNormal || lastVisibleWithMore) {
                            // P1, P2, P3 sempre fixos no topo
                            const pinned = clsDriversAll.slice(0, 3);
                            const remainingSlots = limit - 3;

                            // Janela deslizante centrada no focado
                            // Distribui slots: metade antes, metade depois do focado
                            const halfAfter  = Math.floor(remainingSlots / 2);
                            const halfBefore = remainingSlots - 1 - halfAfter;

                            let windowStart = focusedIdx - halfBefore;
                            let windowEnd   = focusedIdx + halfAfter;

                            // Desliza para trás se ultrapassar o fim do grid
                            if (windowEnd > clsDriversAll.length - 1) {
                                const shift = windowEnd - (clsDriversAll.length - 1);
                                windowEnd   = clsDriversAll.length - 1;
                                windowStart = windowStart - shift;
                            }

                            // Garante que não sobrepõe os pinned
                            windowStart = Math.max(3, windowStart);
                            // Garante que não excede remainingSlots
                            windowEnd = Math.min(windowEnd, windowStart + remainingSlots - 1);

                            const window = clsDriversAll.slice(windowStart, windowEnd + 1);

                            // Separador ··· só se houver lacuna entre P3 e início da janela
                            const separator = (windowStart > 3) ? [{ isSeparator: true }] : [];

                            rows = [...pinned, ...separator, ...window];
                        } else {
                            // Modo normal: top N
                            rows = clsDriversAll.slice(0, limit);
                        }

                        if (rows.length > 0) {
                            displayStandings.push({ isHeader: true, Class: clsKey.toUpperCase() });
                            displayStandings.push(...rows);
                        }
                    });
                }

                renderWecTower(displayStandings, isRaceSession);

                const focusedCar = data.standings ? data.standings.find(c => c.slotID === data.focused_slot_id) : null;
                const isOnboard = data.is_onboard !== undefined ? !!data.is_onboard : false;

                // 1. Renderiza o Head-to-Head (Duelo 1v1) se ativo
                const h2hShowing = renderHeadToHead(data.standings, overlayState);

                // 2. Renderiza o Qualify Tracker (1 a 3 pilotos selecionados na mesa)
                const qTrackerShowing = renderQualifyTracker(data.standings, overlayState);

                // 3. Renderiza a Grade de Largada (Starting Grid)
                const startingGridActive = !!(overlayState && overlayState.startingGridVisible);
                renderStartingGrid(data.standings, overlayState, data.track_name);

                // 4. Renderiza a Volta Mais Rápida por Classe (Fastest Lap)
                const fastestLapShowing = renderFastestLapByClass(data.standings, overlayState);

                if (h2hShowing || qTrackerShowing || startingGridActive) {
                    const statsBanner = document.getElementById('driver-stats-banner');
                    if (statsBanner) statsBanner.classList.add('hidden');
                    const onboardBanner = document.getElementById('driver-onboard-banner');
                    if (onboardBanner) onboardBanner.classList.add('hidden');
                } else {
                    // 3. Renderiza o Banner Onboard se estiver em câmera onboard (ou forçado)
                    const onboardShowing = renderDriverOnboardBanner(focusedCar, isOnboard);

                    // 4. Se o banner onboard estiver visível, oculta o banner padrão de stats para não sobrepor
                    if (onboardShowing) {
                        const statsBanner = document.getElementById('driver-stats-banner');
                        if (statsBanner) statsBanner.classList.add('hidden');
                    } else {
                        renderDriverStatsBanner(focusedCar);
                    }
                }
            }

            // Garante que o footer social da grade de largada é sempre atualizado,
            // mesmo quando não há dados do jogo (ex: overlay carregou antes do jogo iniciar)
            if (!data.standings || !Array.isArray(data.standings)) {
                renderStartingGrid(null, overlayState, data.track_name);
            }

            // 4. Renderiza o Radar 2D de Pista (Track Map) se ativo
            renderTrackMap(data, overlayState);


            // 5. Renderiza o Banner de Replay oficial WEC
            const isReplay = !!(data.is_replay || (data.session_flags && data.session_flags.isReplay) || overlayState.replay_active);
            const replayBanner = document.getElementById('replay-banner-container');
            if (replayBanner) {
                if (isReplay) {
                    replayBanner.classList.remove('hidden');
                    replayBanner.style.setProperty('display', 'block', 'important');
                    replayBanner.style.setProperty('opacity', '1', 'important');
                } else {
                    replayBanner.classList.add('hidden');
                    replayBanner.style.setProperty('display', 'none', 'important');
                    replayBanner.style.setProperty('opacity', '0', 'important');
                }
            }


        } catch(err) {
            console.error('[Overlay] Erro no frame:', err);
        }

    }

    const WS_URL = 'ws://127.0.0.1:8989';
    let socket = null;

    function connect() {
        console.log('[Overlay WEC] Conectando ao backend em ' + WS_URL + '...');
        socket = new WebSocket(WS_URL);

        socket.onopen = () => {
            console.log('[Overlay WEC] Conectado com sucesso!');
            const waiting = document.getElementById('waiting-server-overlay');
            if (waiting) waiting.classList.add('hidden');
        };

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleMessage(data);
            } catch(e) {
                console.error('[Overlay WEC] Erro JSON:', e);
            }
        };

        socket.onclose = () => {
            console.log('[Overlay WEC] Desconectado. Reconectando em 2s...');
            setTimeout(connect, 2000);
        };

        socket.onerror = (err) => {
            socket.close();
        };
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        connect();
    } else {
        document.addEventListener('DOMContentLoaded', connect);
    }
})();
