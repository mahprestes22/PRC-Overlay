import { state } from '../state.js';
import * as utils from '../utils.js';

export function renderDriverBox(driver, base64Image, driverPhoto, containerId = 'driver-box-container') {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!driver) {
        const lastEl = container.querySelector('.driver-last-name');
        if (lastEl) lastEl.innerText = "WAITING FOR FOCUS...";
        return;
    }
    if (!container) return;

    const posEl = container.querySelector('.driver-box-pos');
    const suffixEl = container.querySelector('.driver-box-pos-suffix');
    const firstEl = container.querySelector('.driver-first-name');
    const lastEl = container.querySelector('.driver-last-name');
    const carImgEl = container.querySelector('.driver-box-car-img');
    const logoEl = container.querySelector('.driver-box-logo');
    const portraitImgEl = container.querySelector('.driver-portrait-img');

    const clsLower = (driver.Class || "unknown").toLowerCase();
    let clsMapping = 'cls-unknown';
    if (clsLower.includes('hyper')) clsMapping = 'cls-hyper';
    else if (clsLower.includes('lmp2')) clsMapping = 'cls-lmp2';
    else if (clsLower.includes('lmp3')) clsMapping = 'cls-lmp3';
    else if (clsLower.includes('lmgt3') || clsLower.includes('gt3')) clsMapping = 'cls-lmgt3';
    else if (clsLower.includes('gte')) clsMapping = 'cls-gte';

    // Preserve base classes and handle class-specific mapping
    const classesToRemove = Array.from(container.classList).filter(c => c.startsWith('cls-'));
    classesToRemove.forEach(c => container.classList.remove(c));
    container.classList.add(clsMapping);
    
    // Inject Dynamic Class Color for the balloon border
    container.style.setProperty('--side-class-color', utils.getWecClassColor(driver.Class));

    const logoContainer = logoEl;
    if (logoContainer) {
        logoContainer.innerHTML = utils.getManufacturerLogo(driver.CarName, driver.Class, driver.vehicleFilename, "dashboard-logo-img", driver.Manufacturer);
    }

    const classBar = container.querySelector('.driver-box-class-bar');
    if (classBar) {
        classBar.className = `class-bar ${utils.getClassBarColor(driver.Class)}`;
    }

    const teamFirstEl = container.querySelector('.driver-team-first');
    const teamLastEl = container.querySelector('.driver-team-last');
    if (teamFirstEl && teamLastEl) {
        const teamName = utils.getTeamDisplayName(driver);

        const spaceIndex = teamName.lastIndexOf(' ');
        if (spaceIndex !== -1) {
            teamFirstEl.innerText = teamName.substring(0, spaceIndex);
            teamLastEl.innerText = teamName.substring(spaceIndex + 1);
        } else {
             teamFirstEl.innerText = "";
             teamLastEl.innerText = teamName;
        }
    }

    const pos = driver.ClassPosition || "--";
    if (posEl) posEl.innerText = pos;
    if (suffixEl) suffixEl.innerText = pos !== "--" ? utils.getOrdinal(pos).replace(/[0-9]/g, '') : "";

    if (firstEl && lastEl) {
        const fullname = driver.DriverName || "DRV";
        const spaceIndex = fullname.trim().lastIndexOf(' ');
        if (spaceIndex !== -1) {
            firstEl.innerText = fullname.substring(0, spaceIndex).toUpperCase();
            lastEl.innerText = fullname.substring(spaceIndex + 1).toUpperCase();
        } else {
            firstEl.innerText = "";
            lastEl.innerText = fullname.toUpperCase();
        }
    }


    if (carImgEl) {
        const silhouette = "https://raw.githubusercontent.com/Shandalar/TinyPedal/master/resources/images/cars/Oreca_07_LMP2.webp";
        
        let lmuApiUrl = null;
        if (driver.vehicleFilename) {
            const cleanFile = driver.vehicleFilename.replace(/\.veh$/i, '');
            // [V2] Official LMU Formula: /images/cars/FrontThumbnail/Name_frontAngle.webp
            lmuApiUrl = `http://localhost:6397/start/images/cars/FrontThumbnail/${cleanFile}_frontAngle.webp`;
        }

        const tryLoad = (src) => {
            if (!src) return;
            if (carImgEl.src === src) return; 
            
            carImgEl.classList.remove('loaded');
            carImgEl.src = src;
        };

        // Attach listeners once if not already done (or just re-attach for simplicity in this structure)
        carImgEl.onload = () => {
            carImgEl.classList.add('loaded');
        };

        carImgEl.onerror = () => {
            console.warn(`[Overlay] Image Load Failed: ${carImgEl.src}`);
            if (carImgEl.src === base64Image) {
                if (lmuApiUrl) tryLoad(lmuApiUrl);
                else tryLoad(silhouette);
            } else if (carImgEl.src === lmuApiUrl) {
                tryLoad(silhouette);
            } else {
                // Final failure or already silhouette
                carImgEl.style.opacity = '1'; // Force visibility if it's the silhouette
                carImgEl.classList.add('loaded');
            }
        };

        // Start the chain
        if (base64Image) {
            tryLoad(base64Image);
        } else if (lmuApiUrl) {
            tryLoad(lmuApiUrl);
        } else {
            tryLoad(silhouette);
        }
    }

    // Update Driver Portrait
    if (portraitImgEl) {
        const portraitContainer = container.querySelector('.driver-portrait-container');
        if (driverPhoto || driver.DriverName) {
            const v = (state.currentOverlayState && state.currentOverlayState.mediaVersion) ? state.currentOverlayState.mediaVersion : '1.0';
            const name_v3 = driver.DriverName ? encodeURIComponent(driver.DriverName.toLowerCase().replace(/\s+/g, "_")) : null;

            let customLocalUrl = (driverPhoto && !driverPhoto.startsWith('http')) ? `../media/pilotos/${driverPhoto}?v=${v}` : null;
            let automaticLocalPng = name_v3 ? `../media/pilotos/${name_v3}.png?v=${v}` : null;
            let officialWebpUrl = name_v3 ? `http://localhost:6397/start/images/drivers/${name_v3}.webp` : null;

            let currentAttempt = 0;
            const sources = [customLocalUrl, automaticLocalPng, officialWebpUrl].filter(Boolean);

            const portraitTryLoad = () => {
                if (currentAttempt < sources.length) {
                    portraitImgEl.style.opacity = '0';
                    portraitImgEl.src = sources[currentAttempt];
                } else {
                    portraitImgEl.style.opacity = '0';
                }
            };

            portraitImgEl.onload = () => {
                portraitImgEl.style.opacity = '1';
                // Trigger dynamic positioning/background update
                if (updatePosAndBg) updatePosAndBg();
            };

            portraitImgEl.onerror = () => {
                currentAttempt++;
                portraitTryLoad();
            };

            // Start the chain
            portraitTryLoad();

            // DYNAMIC POSITIONING: 5px after LAST NAME specifically as requested
            let updatePosAndBg = null;
            if (portraitContainer) {
                const lastEl = container.querySelector('.driver-last-name');
                const nameContainer = container.querySelector('.driver-name-container');
                
                if (lastEl && nameContainer) {
                    updatePosAndBg = () => {
                        const lastElRect = lastEl.getBoundingClientRect();
                        const rootRect = container.getBoundingClientRect();
                        
                        // Determine the current CSS scale applied by the GUI
                        // offsetWidth ignores transforms, getBoundingClientRect includes them
                        const scale = rootRect.width / container.offsetWidth;
                        
                        // Calculation: (Scaled right edge - scaled left edge) / scale + 5px
                        const offsetLeft = ((lastElRect.right - rootRect.left) / scale) + 5;
                        
                        portraitContainer.style.left = `${offsetLeft}px`;
                        portraitContainer.style.right = 'auto'; // Disable CSS right
                        
                        // DYNAMIC BOX WIDTH: Adjust background to end where the photo ends
                        const bg = container.querySelector('.driver-box-background');
                        const img = portraitContainer.querySelector('.driver-portrait-img');
                        if (bg && img) {
                            const photoWidth = img.offsetWidth;
                            if (photoWidth > 0) {
                                const totalWidth = offsetLeft + photoWidth;
                                bg.style.width = `${totalWidth}px`;
                            } else {
                                const fallbackWidth = offsetLeft + 200; // Estimated photo width
                                bg.style.width = `${fallbackWidth}px`;
                            }
                        }
                    };
                    
                    requestAnimationFrame(() => {
                        updatePosAndBg(); // Try right away (if cached or empty)
                        
                        const img = portraitContainer.querySelector('.driver-portrait-img');
                        if (img) {
                            // Setup once-load listener to recalibrate when the image officially ends loading.
                            img.addEventListener('load', updatePosAndBg, { once: true });
                        }
                    });
                }
            }
        } else {
            portraitImgEl.src = "";
            portraitImgEl.style.opacity = '0';
        }
    }

    // Update Energy Indicator (Mini-Balloon Style)
    const energyBar = container.querySelector('.energy-bar-fill');
    const energyPct = container.querySelector('.energy-pct');
    const energyLabel = container.querySelector('.driver-box-energy-mini .energy-label');

    if (energyBar || energyPct) {
        const isFuelClass = (clsMapping === 'cls-gte' || clsMapping === 'cls-lmp2' || clsMapping === 'cls-lmp3');
        const val = Math.round((driver.VirtualEnergy || 0) * 100);
        
        // Color Logic from Dashboard
        let energyColor = '#37ff8b'; // Default Green
        if (val <= 10) energyColor = '#ff3e3e'; // Red
        else if (val <= 30) energyColor = '#ff8800'; // Orange
        
        if (energyLabel) {
            energyLabel.innerText = isFuelClass ? 'FUEL' : 'ENERGY';
        }

        if (energyBar) {
            energyBar.style.width = `${val}%`;
            energyBar.style.backgroundColor = energyColor;
        }
        if (energyPct) {
            if (isFuelClass) {
                // USA O VALOR FINAL DO BACKEND (Sincronização Total com Overlay e Dash)
                energyPct.innerText = `${Math.round(driver.FuelLiters || 0)}L`;
            } else {
                // Hypercar e LMGT3 continuam com a % de energia
                energyPct.innerText = `${val}%`;
            }
            energyPct.style.color = energyColor;
        }
    }

    // Onboard Indicator
    const onboardLabel = container.querySelector('.driver-box-onboard-label');
    if (onboardLabel) {
        if (containerId.includes('onboard')) onboardLabel.classList.remove('hidden');
        else onboardLabel.classList.add('hidden');
    }

    // Per-Wheel Tyres rendering
    const tyreBox = container.querySelector('.tyre-status-box') || container.querySelector('.wec-tire-dots') || container.querySelector('.tyre-grid');
    if (tyreBox) {
        const t = driver.Tyres && driver.Tyres.FL !== "?" ? driver.Tyres : { FL: "?", FR: "?", RL: "?", RR: "?" };
        const optTemp = driver.OptimalTemp ? Math.round(driver.OptimalTemp) + "°C" : "90°C";
        
        if (t.FL !== "?" && t.FL === t.FR && t.FR === t.RL && t.RL === t.RR) {
            tyreBox.className = 'tyre-status-box'; // Usa status-box para centralizar
            tyreBox.style.backgroundColor = 'transparent';
            tyreBox.style.padding = '0';
            tyreBox.innerHTML = `<div class="tyre-single tyre-${t.FL}" title="Compound: ${t.FL} | Core: ${optTemp}">${t.FL}</div>`;
        } else {
            tyreBox.className = 'tyre-grid'; // Força a usar o CSS correto
            tyreBox.style.backgroundColor = '';
            tyreBox.style.padding = '';
            tyreBox.innerHTML = `
                <div class="tyre-dot tyre-${t.FL}" title="FL: ${t.FL} | Core: ${optTemp}"></div>
                <div class="tyre-dot tyre-${t.FR}" title="FR: ${t.FR} | Core: ${optTemp}"></div>
                <div class="tyre-dot tyre-${t.RL}" title="RL: ${t.RL} | Core: ${optTemp}"></div>
                <div class="tyre-dot tyre-${t.RR}" title="RR: ${t.RR} | Core: ${optTemp}"></div>
            `;
        }
    }

}

export function renderWecDriverBox(driver, base64Image, driverPhoto, containerId = 'wec-driver-box-container') {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!driver) {
        const fullNameEl = container.querySelector('.wec-db-full-name');
        if (fullNameEl) fullNameEl.innerText = "WAITING FOR DATA...";
        return;
    }
    if (!container) return;

    const logoEl = container.querySelector('.wec-db-logo');
    const numEl = container.querySelector('.wec-db-car-number');
    const portraitImgEl = container.querySelector('.wec-db-portrait-img');
    const classBadge = container.querySelector('.wec-db-class-badge');
    const fullNameEl = container.querySelector('.wec-db-full-name');
    const teamNameEl = container.querySelector('.wec-db-team-name');
    const carImgEl = container.querySelector('.driver-box-car-img');
    const onboardIndicator = container.querySelector('.wec-db-onboard-indicator');

    // Apply Manufacturer Class (for --man-color)
    const manufacturerNameInit = driver.Manufacturer || utils.getManufacturerName(driver.CarName, driver.Class, driver.vehicleFilename);
    const manClassInit = utils.getManufacturerColorClass(manufacturerNameInit);
    
    // Remove old manufacturer classes and apply new one
    const classesToRemove = Array.from(container.classList).filter(c => c.startsWith('man-'));
    classesToRemove.forEach(c => container.classList.remove(c));
    if (manClassInit) container.classList.add(manClassInit);

    // Inject Dynamic Class Color (WEC version)
    container.style.setProperty('--side-class-color', utils.getWecClassColor(driver.Class));

    // Class Badge
    if (classBadge) {
        const cls = driver.Class || "UNKNOWN";
        classBadge.innerText = cls.toUpperCase();
        
        // Apply color based on class (centralized)
        classBadge.style.backgroundColor = utils.getWecClassColor(cls);
    }

    // Driver Full Name
    if (fullNameEl) {
        fullNameEl.innerText = (driver.DriverName || "DRIVER").toUpperCase();
    }

    // Team Name
    if (teamNameEl) {
        teamNameEl.innerText = utils.getTeamDisplayName(driver);
    }

    // Badge: Logo & Number
    if (logoEl) logoEl.innerHTML = utils.getManufacturerLogo(driver.CarName, driver.Class, driver.vehicleFilename, "wec-logo-img", driver.Manufacturer);
    if (numEl) {
        numEl.innerText = driver.CarNumber || utils.extractCarNumber(driver.CarName) || "--";
    }

    // Portrait
    if (portraitImgEl) {
        const portraitFloat = container.querySelector('.wec-db-portrait-float');
        if (driverPhoto || driver.DriverName) {
            const v = (state.currentOverlayState && state.currentOverlayState.mediaVersion) ? state.currentOverlayState.mediaVersion : '1.0';
            const name_v3 = driver.DriverName ? encodeURIComponent(driver.DriverName.toLowerCase().replace(/\s+/g, "_")) : null;

            let customLocalUrl = (driverPhoto && !driverPhoto.startsWith('http')) ? `../media/pilotos/${driverPhoto}?v=${v}` : null;
            let automaticLocalPng = name_v3 ? `../media/pilotos/${name_v3}.png?v=${v}` : null;
            let officialWebpUrl = name_v3 ? `http://localhost:6397/start/images/drivers/${name_v3}.webp` : null;

            let currentAttempt = 0;
            const sources = [customLocalUrl, automaticLocalPng, officialWebpUrl].filter(Boolean);

            const portraitTryLoad = () => {
                if (currentAttempt < sources.length) {
                    portraitImgEl.style.opacity = '0';
                    portraitImgEl.src = sources[currentAttempt];
                } else {
                    portraitImgEl.style.opacity = '0';
                }
            };

            portraitImgEl.onload = () => {
                portraitImgEl.style.opacity = '1';
                if (updatePosAndBg) updatePosAndBg();
            };

            portraitImgEl.onerror = () => {
                currentAttempt++;
                portraitTryLoad();
            };

            // Start the chain
            portraitTryLoad();

            // DYNAMIC POSITIONING: Anchored after the identity divider (logo + car number)
            let updatePosAndBg = null;
            if (portraitFloat) {
                const identityEl = container.querySelector('.wec-db-identity');
                if (identityEl) {
                    updatePosAndBg = () => {
                        const identityRect = identityEl.getBoundingClientRect();
                        const rootRect = container.getBoundingClientRect();
                        
                        // Handle GUI scaling
                        const scale = rootRect.width / container.offsetWidth || 1;
                        
                        // Calculation: (Scaled right edge - scaled left edge) / scale
                        // This puts it exactly after the identity section (the divider)
                        const offsetLeft = ((identityRect.right - rootRect.left) / scale);
                        portraitFloat.style.left = `${offsetLeft}px`;
                    };
                    requestAnimationFrame(updatePosAndBg);
                }
            }
        } else {
            portraitImgEl.src = "";
            portraitImgEl.style.opacity = '0';
        }
    }

    // Update Car Image (Skin/Silhouette)
    if (carImgEl) {
        const silhouette = "https://raw.githubusercontent.com/Shandalar/TinyPedal/master/resources/images/cars/Oreca_07_LMP2.webp";
        
        let lmuApiUrl = null;
        if (driver.vehicleFilename) {
            const cleanFile = driver.vehicleFilename.replace(/\.veh$/i, '');
            // [V2] Official LMU Formula: /images/cars/FrontThumbnail/Name_frontAngle.webp
            lmuApiUrl = `http://localhost:6397/start/images/cars/FrontThumbnail/${cleanFile}_frontAngle.webp`;
        }

        const tryLoad = (src) => {
            if (!src) return;
            if (carImgEl.src === src) return; 
            
            carImgEl.classList.remove('loaded');
            carImgEl.src = src;
        };

        carImgEl.onload = () => {
            carImgEl.classList.add('loaded');
            carImgEl.style.opacity = '1';
        };

        carImgEl.onerror = () => {
            if (carImgEl.src === base64Image) {
                if (lmuApiUrl) tryLoad(lmuApiUrl);
                else tryLoad(silhouette);
            } else if (carImgEl.src === lmuApiUrl) {
                tryLoad(silhouette);
            } else {
                carImgEl.style.opacity = '1'; 
                carImgEl.classList.add('loaded');
            }
        };

        if (base64Image) tryLoad(base64Image);
        else if (lmuApiUrl) tryLoad(lmuApiUrl);
        else tryLoad(silhouette);
    }

    // Onboard Indicator visibility
    if (onboardIndicator) {
        if (containerId.includes('onboard')) onboardIndicator.classList.remove('hidden');
        else onboardIndicator.classList.add('hidden');
    }

    // Per-Wheel Tyres rendering (WEC style)
    const wecTyreBox = container.querySelector('.wec-tire-dots') || container.querySelector('.tyre-status-box') || container.querySelector('.tyre-grid');
    if (wecTyreBox) {
        const t = driver.Tyres && driver.Tyres.FL !== "?" ? driver.Tyres : { FL: "?", FR: "?", RL: "?", RR: "?" };
        const optTemp = driver.OptimalTemp ? Math.round(driver.OptimalTemp) + "°C" : "90°C";
        
        if (t.FL !== "?" && t.FL === t.FR && t.FR === t.RL && t.RL === t.RR) {
            wecTyreBox.className = 'tyre-status-box'; 
            wecTyreBox.style.backgroundColor = 'transparent';
            wecTyreBox.style.padding = '0';
            wecTyreBox.innerHTML = `<div class="tyre-single tyre-${t.FL}" title="Compound: ${t.FL} | Core: ${optTemp}">${t.FL}</div>`;
        } else {
            wecTyreBox.className = 'tyre-grid'; // Força a usar o CSS correto
            wecTyreBox.style.backgroundColor = '';
            wecTyreBox.style.padding = '';
            wecTyreBox.innerHTML = `
                <div class="tyre-dot tyre-${t.FL}" title="FL: ${t.FL} | Core: ${optTemp}"></div>
                <div class="tyre-dot tyre-${t.FR}" title="FR: ${t.FR} | Core: ${optTemp}"></div>
                <div class="tyre-dot tyre-${t.RL}" title="RL: ${t.RL} | Core: ${optTemp}"></div>
                <div class="tyre-dot tyre-${t.RR}" title="RR: ${t.RR} | Core: ${optTemp}"></div>
            `;
        }
    }
}
