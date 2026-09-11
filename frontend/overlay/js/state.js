export const state = {
    // Mutable State
    currentFocusedClass: 'ALL',
    vehicleMetadata: {},
    lastResultsUpdateTime: 0,
    resultsCurrentPage: 0,
    resultsCurrentClass: '',
    resultsIsFinalScreen: false,
    currentOverlayState: { is_on_track: true },
    currentSessionData: null,
    driverLastBestLaps: {},
    driverHighlightTimers: {},
    driverHighlightTypes: {},
    currentTowerMode: 'GAP',
    lastResultsMode: false,

    // Transition Tracking
    lastManualServerClass: null,
    lastAutoTargetClass: null
};

export const RESULTS_PAGE_TIME = 8000;
