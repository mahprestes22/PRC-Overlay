import { state } from './state.js';
import * as utils from './utils.js';

/**
 * Shows a screen-wide class transition effect.
 * Matches PRO aesthetics with loop guarding and proper gradients.
 * @param {string} className The class name (e.g. 'HYPERCAR', 'ALL')
 * @param {string} source Source of the trigger ('dashboard', 'auto_focus')
 */
export function showClassTransition(className, source = 'dashboard') {
    const overlay = document.getElementById('class-transition-overlay');
    if (overlay) overlay.classList.add('tower-mode');
    
    const transitionBg = overlay ? overlay.querySelector('.transition-bg') : null;
    const bgLogo = document.getElementById('transition-bg-logo');
    const text = document.getElementById('transition-class-name');

    if (!overlay || !text) {
        console.warn("[Overlay] Class transition elements not found in DOM.");
        return;
    }

    // GUARD: Only trigger if the requested class is DIFFERENT from what's currently shown or being shown.
    if (overlay.dataset.currentTransition === className) {
        return;
    }

    console.log(`[Transition] Triggering: ${className} (Source: ${source})`);
    overlay.dataset.currentTransition = className;

    // Use configurable duration (default 2.5s)
    const totalDuration = state.currentOverlayState.transitionDuration || 2500;
    const hideDelay = Math.max(500, totalDuration - 600); 

    // Resolve Class Color for Background
    let bgColor = utils.getWecClassColor(className);
    const transColor = utils.hexToRgba(bgColor, 1.0); 

    if (transitionBg) {
        // [MOD] Tower transitions are OPAQUE (no transparency)
        const alpha = overlay.classList.contains('tower-mode') ? 1.0 : 0.85;
        const gradient = `linear-gradient(135deg, ${transColor} 0%, rgba(0,0,0,${alpha}) 100%)`;
        transitionBg.style.backgroundImage = gradient;
        transitionBg.style.background = gradient;
        transitionBg.style.backgroundColor = 'transparent'; 
    }

    // Resolve Image/Logo
    let logoSrc = `http://localhost:6397/webdata/logo/${className.toLowerCase()}.png`;
    const customLogos = state.currentOverlayState.customLogos || {};

    const clsKey = className.toUpperCase();
    if (customLogos[clsKey]) {
        const v = (state.currentOverlayState && state.currentOverlayState.mediaVersion) ? state.currentOverlayState.mediaVersion : '1.0';
        logoSrc = `../media/logos/${customLogos[clsKey]}?v=${v}`;
    } else if (customLogos['default']) {
        const v = (state.currentOverlayState && state.currentOverlayState.mediaVersion) ? state.currentOverlayState.mediaVersion : '1.0';
        logoSrc = `../media/logos/${customLogos['default']}?v=${v}`;
    }

    if (bgLogo) bgLogo.src = logoSrc;

    let displayText = className.toUpperCase();
    if (displayText.includes('ALL')) {
        displayText = "SPLIT CLASSES";
    }
    text.innerText = displayText;

    // [MOD] Defer measurement and visibility to let DOM and Layout catch up
    setTimeout(() => {
        if (overlay.classList.contains('tower-mode')) {
            const stdTower = document.getElementById('standings-tower-container');
            const wecTower = document.getElementById('wec-tower-container');
            const tower = (wecTower && !wecTower.classList.contains('hidden')) ? wecTower : stdTower;

            if (tower && !tower.classList.contains('hidden')) {
                const rect = tower.getBoundingClientRect();
                overlay.style.top = rect.top + 'px';
                overlay.style.left = rect.left + 'px';
                overlay.style.width = rect.width + 'px';
                overlay.style.height = rect.height + 'px';
                overlay.style.borderRadius = window.getComputedStyle(tower).borderRadius;
            } else {
                // Fallback safe defaults if tower hidden
                overlay.style.top = '180px';
                overlay.style.left = '20px';
                overlay.style.width = '520px';
                overlay.style.height = '60vh'; 
            }
        }

        // Trigger Animation
        overlay.classList.remove('hidden');
        setTimeout(() => overlay.classList.add('active'), 10);

        // Auto-hide after calculated duration
        setTimeout(() => {
            overlay.classList.remove('active');
            setTimeout(() => {
                overlay.classList.add('hidden');
            }, 600);
        }, hideDelay);
    }, 50); 
}

/**
 * Shows a specialized ONBOARD transition wipe.
 * @param {Object} driver The driver data object
 */
export function showOnboardTransition(driver) {
    console.log("[Overlay] Triggering Onboard Transition for:", driver?.Name);
    console.log("[Overlay] Driver object received:", driver);
    
    const overlay = document.getElementById('class-transition-overlay');
    if (overlay) {
        overlay.classList.remove('tower-mode');
        // Reset dynamic styles for full-screen mode
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.borderRadius = '0';
    }

    const transitionBg = overlay ? overlay.querySelector('.transition-bg') : null;
    const bgLogo = document.getElementById('transition-bg-logo');
    const text = document.getElementById('transition-class-name');

    if (!overlay || !text) {
        console.error("[Overlay] Transition elements not found!");
        return;
    }

    // Resolve Car Class Color
    const className = driver?.Class || 'ALL';
    const bgColor = utils.getWecClassColor(className);
    const transColor = utils.hexToRgba(bgColor, 1.0); 

    if (transitionBg) {
        const gradient = `linear-gradient(135deg, ${transColor} 0%, rgba(0,0,0,0.80) 100%)`;
        transitionBg.style.backgroundImage = gradient;
        transitionBg.style.background = gradient;
    }

    // Resolve Logo: PRIORIDADE MÁXIMA PARA A MARCA DO CARRO
    const v = (state.currentOverlayState && state.currentOverlayState.mediaVersion) ? state.currentOverlayState.mediaVersion : '1.0';
    const customLogos = state.currentOverlayState.customLogos || {};
    
    let logoSrc = null;
    if (driver) {
        // Se houver um piloto focado, puxa a fabricante DELE (Ferrari, Porsche, etc)
        const brand = utils.getManufacturerName(driver.CarName, driver.Class, driver.vehicleFilename, driver.Manufacturer);
        if (brand && brand !== "Unknown") {
            logoSrc = `http://localhost:6397/start/images/manufacturer/Brand=${encodeURIComponent(brand)}.svg`;
        } else {
            logoSrc = `http://localhost:6397/webdata/logo/${className.toLowerCase()}.png`;
        }
    } else if (customLogos['camera_transicao']) {
        // Se não houver carro, puxa o que estiver configurado no Dashboard
        logoSrc = `../media/logos/${customLogos['camera_transicao']}?v=${v}`;
    } else {
        logoSrc = `../media/logos/transicao.png?v=${v}`;
    }

    if (bgLogo && logoSrc) {
        bgLogo.src = logoSrc;
    }
    
    text.innerText = "ONBOARD";

    // Trigger Animation
    overlay.style.display = 'flex'; // Explicitly ensure visible
    overlay.classList.remove('hidden');
    setTimeout(() => overlay.classList.add('active'), 10);

    const totalDuration = state.currentOverlayState.transitionDuration || 2500;
    const hideDelay = Math.max(500, totalDuration - 600);

    setTimeout(() => {
        overlay.classList.remove('active');
        setTimeout(() => {
            overlay.classList.add('hidden');
            // Do not force display:none here because showClassTransition might rely on defaults
        }, 600);
    }, hideDelay);
}

/**
 * Shows a specialized REPLAY transition wipe.
 * Mirrors Onboard but with RED theme and custom text.
 */
export function showReplayTransition(driver = null) {
    console.log("[Overlay] Triggering Replay Transition Animation");
    
    // TRUQUE DE SEGURANÇA: Se não vier piloto, usamos o último que estava focado na tela!
    const activeDriver = driver || window.lastFocusedDriverData;

    const overlay = document.getElementById('class-transition-overlay');
    if (overlay) {
        overlay.classList.remove('tower-mode');
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.borderRadius = '0';
    }

    const transitionBg = overlay ? overlay.querySelector('.transition-bg') : null;
    const bgLogo = document.getElementById('transition-bg-logo');
    const text = document.getElementById('transition-class-name');

    if (!overlay || !text) return;

    // Tema Vermelho para o Replay
    const className = activeDriver?.Class || 'ALL';
    const bgColor = activeDriver ? utils.getWecClassColor(className) : "#cc0000"; 
    const transColor = utils.hexToRgba(bgColor, 1.0); 

    if (transitionBg) {
        const gradient = `linear-gradient(135deg, ${transColor} 0%, rgba(0,0,0,0.85) 100%)`;
        transitionBg.style.backgroundImage = gradient;
        transitionBg.style.background = gradient;
    }

    // --- LÓGICA DE LOGO IDÊNTICA AO ONBOARD ---
    const customLogos = state.currentOverlayState?.customLogos || {};
    const v = state.currentOverlayState?.mediaVersion || '1.0';
    let logoSrc = null;

    // Prioridade MÁXIMA: Logo do fabricante do carro (Ferrari, Porsche, etc)
    if (activeDriver) {
        const brand = utils.getManufacturerName(activeDriver.CarName, activeDriver.Class, activeDriver.vehicleFilename, activeDriver.Manufacturer);
        if (brand && brand !== "Unknown") {
            logoSrc = `http://localhost:6397/start/images/manufacturer/Brand=${encodeURIComponent(brand)}.svg`;
        } else {
            logoSrc = `http://localhost:6397/webdata/logo/${className.toLowerCase()}.png`;
        }
    } 
    
    // Se falhar (ex: não tem carro), usa o fallback
    if (!logoSrc) {
        if (customLogos['camera_transicao']) {
            logoSrc = `../media/logos/${customLogos['camera_transicao']}?v=${v}`;
        } else {
            logoSrc = `http://localhost:6397/webdata/logo/hypercar.png`;
        }
    }

    if (bgLogo && logoSrc) {
        bgLogo.src = logoSrc;
    }
    
    text.innerText = "REPLAY";

    // Trigger Animation
    overlay.style.display = 'flex';
    overlay.classList.remove('hidden');
    setTimeout(() => overlay.classList.add('active'), 10);

    const totalDuration = 2000; 
    const hideDelay = Math.max(500, totalDuration - 600);

    setTimeout(() => {
        overlay.classList.remove('active');
        setTimeout(() => {
            overlay.classList.add('hidden');
        }, 600);
    }, hideDelay);
}

/**
 * Shows a specialized LIVE transition wipe.
 * Mirrors Replay but with GREEN/CLASS theme and text "LIVE".
 */
export function showLiveTransition(driver = null) {
    console.log("[Overlay] Triggering Live Transition Animation");
    
    // TRUQUE DE SEGURANÇA: Se não vier piloto, usamos o último que estava focado na tela!
    const activeDriver = driver || window.lastFocusedDriverData;
    
    const overlay = document.getElementById('class-transition-overlay');
    if (overlay) {
        overlay.classList.remove('tower-mode');
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.borderRadius = '0';
    }

    const transitionBg = overlay ? overlay.querySelector('.transition-bg') : null;
    const bgLogo = document.getElementById('transition-bg-logo');
    const text = document.getElementById('transition-class-name');

    if (!overlay || !text) return;

    // Tema Verde para o Live
    const className = activeDriver?.Class || 'ALL';
    const bgColor = activeDriver ? utils.getWecClassColor(className) : "#00b33c"; 
    const transColor = utils.hexToRgba(bgColor, 1.0); 

    if (transitionBg) {
        const gradient = `linear-gradient(135deg, ${transColor} 0%, rgba(0,0,0,0.85) 100%)`;
        transitionBg.style.backgroundImage = gradient;
        transitionBg.style.background = gradient;
    }

    // --- LÓGICA DE LOGO IDÊNTICA AO ONBOARD ---
    const customLogos = state.currentOverlayState?.customLogos || {};
    const v = state.currentOverlayState?.mediaVersion || '1.0';
    let logoSrc = null;

    // Prioridade MÁXIMA: Logo do fabricante do carro
    if (activeDriver) {
        const brand = utils.getManufacturerName(activeDriver.CarName, activeDriver.Class, activeDriver.vehicleFilename, activeDriver.Manufacturer);
        if (brand && brand !== "Unknown") {
            logoSrc = `http://localhost:6397/start/images/manufacturer/Brand=${encodeURIComponent(brand)}.svg`;
        } else {
            logoSrc = `http://localhost:6397/webdata/logo/${className.toLowerCase()}.png`;
        }
    } 
    
    // Se falhar (ex: não tem carro), usa o fallback
    if (!logoSrc) {
        if (customLogos['camera_transicao']) {
            logoSrc = `../media/logos/${customLogos['camera_transicao']}?v=${v}`;
        } else {
            logoSrc = `http://localhost:6397/webdata/logo/hypercar.png`;
        }
    }

    if (bgLogo && logoSrc) {
        bgLogo.src = logoSrc;
    }
    
    text.innerText = "LIVE";

    // Trigger Animation
    overlay.style.display = 'flex';
    overlay.classList.remove('hidden');
    setTimeout(() => overlay.classList.add('active'), 10);

    const totalDuration = 2000; 
    const hideDelay = Math.max(500, totalDuration - 600);

    setTimeout(() => {
        overlay.classList.remove('active');
        setTimeout(() => {
            overlay.classList.add('hidden');
        }, 600);
    }, hideDelay);
}
