import { state } from './state.js';
import * as utils from './utils.js';
import { renderWecTower } from './widgets/wec_tower.js';
import { showClassTransition, showOnboardTransition, showReplayTransition, showLiveTransition } from './ui_effects.js';
import { wecTrackMap } from './widgets/trackmap.js';

export function handleMessage(data) {
    try {
        if (data.type === 'update_status') {
            if (data.hasOwnProperty('is_on_track')) {
                state.currentOverlayState.is_on_track = data.is_on_track;
                syncWidgetVisibility(state.currentOverlayState);
            }
            return;
        }

        if (data.type === 'pos_update') {
            if (wecTrackMap && wecTrackMap.updatePositions) wecTrackMap.updatePositions(data.data);
            return;
        }

        if (data.type === 'onboard_transition') {
            showOnboardTransition(data.driver);
            return;
        }

        if (data.type === 'track_map_update') {
            if (data.points && wecTrackMap && wecTrackMap.setTrackData) wecTrackMap.setTrackData(data.points, data.track);
            return;
        }

        if (data.type === 'replay_transition') {
            showReplayTransition(data.driver);
            return;
        }

        if (data.type === 'live_transition') {
            const driver = data.driver || window.lastFocusedDriverData || null;
            showLiveTransition(driver);

            const banner = document.getElementById('replay-banner-container');
            if (banner) {
                const icon = banner.querySelector('.replay-icon');
                const text = banner.querySelector('.replay-text');
                banner.classList.remove('hidden');
                banner.classList.add('is-live');
                if (icon) icon.innerText = '📡';
                if (text) text.innerText = 'LIVE';
                window._liveBannerActive = true;
                if (window._liveBannerTimer) clearTimeout(window._liveBannerTimer);
                window._liveBannerTimer = setTimeout(() => {
                    banner.classList.add('hidden');
                    window._liveBannerActive = false;
                    setTimeout(() => {
                        banner.classList.remove('is-live');
                        if (icon) icon.innerText = '⏪';
                        if (text) text.innerText = 'REPLAY';
                    }, 600);
                }, 5000);
            }
            if (state.currentOverlayState) state.currentOverlayState.replay_active = false;
            return;
        }

        if (data.overlay_state) {
            state.currentOverlayState = { ...state.currentOverlayState, ...data.overlay_state };
        } else if (data.settings) {
            state.currentOverlayState = { ...state.currentOverlayState, ...data.settings };
        }
        const overlayState = state.currentOverlayState || {};

        const waiting = document.getElementById('waiting-server-overlay');
        if (waiting && !waiting.classList.contains('hidden')) waiting.classList.add('hidden');

        if (data.track_points && data.track_points.length > 0 && wecTrackMap && wecTrackMap.setTrackData) {
            wecTrackMap.setTrackData(data.track_points, data.track_name || 'TRACK');
        }

        window.currentWecSessionName = (data.session_name || data.session_type || 'RACE').toUpperCase();

        const focusedDriver = (data.standings && data.standings.length > 0)
            ? data.standings.find(c => (c.slotID || c.SlotID) === data.focused_slot_id)
            : null;
        if (focusedDriver) window.lastFocusedDriverData = focusedDriver;

        document.body.classList.add('WEC');
        if (overlayState.overlayTheme) {
            const themeClasses = overlayState.overlayTheme.split(' ');
            ['WEC', 'Sherminator', '2025'].forEach(cls => document.body.classList.remove(cls));
            themeClasses.forEach(cls => document.body.classList.add(cls));
        }

        const towerMode = overlayState.towerMode || (overlayState.widgets && overlayState.widgets.tower ? overlayState.widgets.tower.mode : null) || state.currentTowerMode || 'GAP';
        state.currentTowerMode = towerMode;

        if (overlayState.scale) {
            document.documentElement.style.setProperty('--overlay-scale', overlayState.scale);
        }

        const serverClass = overlayState.focusedClass || 'ALL';
        let pendingTransition = null;
        if (serverClass !== state.lastManualServerClass) {
            state.lastManualServerClass = serverClass;
            state.currentFocusedClass = serverClass;
            const isFullScreen = !!overlayState.resultsMode;
            if (!isFullScreen && state.lastManualServerClass !== null) {
                pendingTransition = { className: serverClass, source: overlayState._lastChangeSource || 'dashboard' };
            }
        }

        const autoSwitch = overlayState.autoSwitchClass || false;
        const isServerAll = serverClass.toUpperCase().includes('ALL');
        if (autoSwitch && focusedDriver && isServerAll) {
            const targetClass = focusedDriver.carClass || focusedDriver.Class || 'ALL';
            if (targetClass !== state.lastAutoTargetClass) {
                state.lastAutoTargetClass = targetClass;
                state.currentFocusedClass = targetClass;
            }
        } else {
            state.currentFocusedClass = serverClass;
            state.lastAutoTargetClass = null;
        }

        syncWidgetVisibility(overlayState);

        if (data.standings && Array.isArray(data.standings)) {
            let displayStandings = [];
            const focusedClassUpper = (state.currentFocusedClass || 'ALL').toUpperCase();
            const isAllMode = focusedClassUpper.includes('ALL');

            data.standings.forEach(car => {
                car.isFocused = ((car.slotID || car.SlotID) === data.focused_slot_id);
            });

            if (!isAllMode) {
                const targetMapped = utils.getWecClassMapping(state.currentFocusedClass);
                const clsDriversAll = data.standings
                    .filter(car => {
                        const cls = car.carClass || car.Class || '';
                        const mapped = utils.getWecClassMapping(cls);
                        return mapped === targetMapped || cls.toUpperCase().includes(focusedClassUpper);
                    })
                    .sort((a, b) => ((a.place || a.Place || 0) - (b.place || b.Place || 0)));

                const limit = 18;
                const clsDrivers = utils.getSlicedStandings(clsDriversAll, focusedDriver, limit);
                displayStandings = [{ isHeader: true, Class: state.currentFocusedClass }, ...clsDrivers];
            } else {
                const classOrder = ['hypercar', 'lmp2', 'lmp2-elms', 'lmp3', 'lmgt3', 'gte'];
                const classesFound = new Map();

                data.standings.forEach(car => {
                    const rawCls = car.carClass || car.Class || 'HY';
                    const mapped = utils.getWecClassMapping(rawCls);
                    if (!classesFound.has(mapped)) classesFound.set(mapped, []);
                    classesFound.get(mapped).push(car);
                });

                const sortedKeys = Array.from(classesFound.keys()).sort((a, b) => {
                    const idxA = classOrder.indexOf(a);
                    const idxB = classOrder.indexOf(b);
                    return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
                });

                const numClasses = sortedKeys.length;
                let limit = numClasses >= 3 ? 5 : (numClasses === 2 ? 8 : 18);

                sortedKeys.forEach(clsKey => {
                    const clsDriversAll = classesFound.get(clsKey).sort((a, b) => ((a.place || a.Place || 0) - (b.place || b.Place || 0)));
                    const clsDrivers = utils.getSlicedStandings(clsDriversAll, focusedDriver, limit);
                    if (clsDrivers.length > 0) {
                        displayStandings.push({ isHeader: true, Class: clsKey.toUpperCase() });
                        displayStandings.push(...clsDrivers);
                    }
                });
            }

            renderWecTower(displayStandings);

            if (overlayState.trackMap && wecTrackMap && wecTrackMap.updateData) {
                wecTrackMap.updateData(data.standings);
            }
        }

        if (data.session_time_str !== undefined) {
            const timerEl = document.getElementById('wec-timer');
            if (timerEl) timerEl.innerText = data.session_time_str || '00:00:00';
        }
        if (data.track_name) {
            const locEl = document.getElementById('wec-location');
            if (locEl) locEl.innerText = (data.track_name || '').toUpperCase();
        }

        if (data.session_flags) utils.updateFlags(data.session_flags);

        if (pendingTransition) showClassTransition(pendingTransition.className, pendingTransition.source);

        applyLayoutTransforms(overlayState);
    } catch(err) {
        console.error('[Overlay] Erro no processamento do frame:', err);
    }
}

function applyLayoutTransforms(overlayState) {
    if (!overlayState) return;
    const positions = overlayState.positions || {};
    const scales    = overlayState.scales    || {};
    const allIds = new Set([...Object.keys(positions), ...Object.keys(scales)]);
    allIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const pos   = positions[id];
        const scale = scales[id] || 1.0;
        el.style.setProperty('--layout-scale', scale);
        if (pos) {
            el.style.left = `${pos.x}px`;
            el.style.top  = `${pos.y}px`;
            el.classList.add('manual-position');
        }
        el.style.transformOrigin = 'top left';
    });
}

function syncWidgetVisibility(overlayState) {
    const wrapper = document.getElementById('overlay-wrapper');
    if (!wrapper) return;

    if (overlayState && overlayState.hasOwnProperty('is_on_track')) {
        const isOnTrack  = overlayState.is_on_track;
        const isPilotMode = overlayState.guiMode === 'pilot';
        if (isPilotMode && isOnTrack === false) {
            wrapper.style.setProperty('display', 'none', 'important');
            wrapper.style.opacity = '0';
        } else {
            wrapper.style.setProperty('display', 'block', 'important');
            wrapper.style.opacity = '1';
        }
    }

    const resultsActive  = !!overlayState.resultsMode;
    const calendarActive = !!overlayState.calendarInfo;

    const showTower = overlayState.standingsTower !== undefined ? !!overlayState.standingsTower : (overlayState.widgets?.tower?.enabled !== undefined ? !!overlayState.widgets.tower.enabled : true);
    const showMap   = overlayState.trackMap !== undefined ? !!overlayState.trackMap : (overlayState.widgets?.trackmap?.enabled !== undefined ? !!overlayState.widgets.trackmap.enabled : false);

    const mappings = [
        { id: 'wec-tower-container',     show: showTower },
        { id: 'wec-track-map-container', show: showMap },
        { id: 'fcy-banner',             show: !!(overlayState.fcy || (state.currentSessionData && (state.currentSessionData.isFinished || state.currentSessionData.isGreen || overlayState.fcy))) },
        { id: 'replay-banner-container', show: (!!overlayState.replay_active || !!window._liveBannerActive) }
    ];

    mappings.forEach(m => {
        let isVisible = m.show;
        if ((resultsActive || calendarActive) && m.id !== 'wec-results-container' && m.id !== 'calendar-container') {
            isVisible = false;
        }

        const el = document.getElementById(m.id);
        if (el) utils.toggleWidgetAnimation(el, isVisible);
    });
}
