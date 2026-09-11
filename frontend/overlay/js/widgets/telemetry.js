import { state } from '../state.js';
import * as utils from '../utils.js';

export function updateOnBoardTelemetry(driver) {
    const kphEl = document.getElementById('onboard-kph');
    const mphEl = document.getElementById('onboard-mph');
    if (kphEl) kphEl.innerText = Math.round(driver.SpeedKPH || 0);
    if (mphEl) mphEl.innerText = Math.round(driver.SpeedMPH || 0);

    const gearEl = document.getElementById('onboard-gear');
    if (gearEl) {
        let g = driver.Gear;
        if (g === 0) g = 'N';
        else if (g === -1) g = 'R';
        gearEl.innerText = g;
    }

    const throttleFill = document.getElementById('pedal-throttle-fill');
    const brakeFill = document.getElementById('pedal-brake-fill');
    if (throttleFill) throttleFill.style.width = `${(driver.Throttle || 0) * 100}%`;
    if (brakeFill) brakeFill.style.width = `${(driver.Brake || 0) * 100}%`;

const energyEl = document.getElementById('onboard-energy');
    const energyUnitEl = document.getElementById('onboard-energy-unit');
    const energyLabelEl = document.getElementById('onboard-energy-label');

    if (energyEl) {
        const clsLower = (driver.Class || "").toLowerCase();
        const isFuelClass = clsLower.includes('gte') || clsLower.includes('lmp2') || clsLower.includes('lmp3');
        const isHypercarOrGT3 = clsLower.includes('hyper') || clsLower.includes('gt3');

        if (energyLabelEl) {
            if (isFuelClass) {
                energyLabelEl.innerHTML = 'FUEL<br>TANK';
            } else if (isHypercarOrGT3) {
                energyLabelEl.innerHTML = 'VIRTUAL<br>ENERGY TANK';
            } else {
                // Fallback for unknown classes
                energyLabelEl.innerHTML = 'FUEL<br>TANK';
            }
        }
        
        if (isFuelClass || (!isHypercarOrGT3 && clsLower !== "")) {
            let maxCap = driver.FuelCapacity || 0;
            // Fallbacks for common capacities if not provided by SM
            if (maxCap < 10) {
                if (clsLower.includes('lmp2')) maxCap = 75;
                else if (clsLower.includes('gte')) maxCap = 90;
                else if (clsLower.includes('lmp3')) maxCap = 85;
                else maxCap = 60; // Default sedan/GT
            }
            
            // If the value is already in Liters (calculated by backend main loop), use it directly
            // Otherwise, multiply fraction by capacity.
            const val = (driver.VirtualEnergy > 1.0) ? driver.VirtualEnergy : (driver.VirtualEnergy * maxCap);
            energyEl.innerText = Math.round(val);
            if (energyUnitEl) energyUnitEl.innerText = 'L';
        } else {
            energyEl.innerText = Math.round((driver.VirtualEnergy || 0) * 100);
            if (energyUnitEl) energyUnitEl.innerText = '%';
        }
    }

    const rpmBar = document.getElementById('rpm-bar');
    if (rpmBar) {
        const segments = rpmBar.querySelectorAll('.rpm-segment');
        const rpmPct = (driver.RPM || 0) / (driver.MaxRPM || 8000);
        const activeCount = Math.floor(rpmPct * segments.length);
        segments.forEach((seg, idx) => {
            if (idx < activeCount) seg.classList.add('active');
            else seg.classList.remove('active');
        });
    }

    const batteryBar = document.getElementById('battery-bar');
    if (batteryBar) {
        const segments = batteryBar.querySelectorAll('.battery-segment');
        const socPct = driver.soc || 0;
        const activeCount = Math.floor(socPct * segments.length);
        segments.forEach((seg, idx) => {
            if (idx < activeCount) seg.classList.add('active');
            else seg.classList.remove('active');
        });
    }
}

export function updateWecTelemetry(driver) {
    const kphEl = document.getElementById('wec-telemet-kph');
    const mphEl = document.getElementById('wec-telemet-mph');
    if (kphEl) kphEl.innerText = Math.round(driver.SpeedKPH || 0);
    if (mphEl) mphEl.innerText = Math.round(driver.SpeedMPH || 0);

    const gearEl = document.getElementById('wec-telemet-gear');
    if (gearEl) {
        let g = driver.Gear;
        if (g === 0) g = 'N';
        else if (g === -1) g = 'R';
        gearEl.innerText = g;
    }

    const energyEl = document.getElementById('wec-telemet-energy');
    const energyUnitEl = document.getElementById('wec-telemet-unit');
    const energyLabelEl = document.getElementById('wec-energy-label');

    if (energyEl) {
        const clsLower = (driver.Class || "").toLowerCase();
        const isFuelClass = clsLower.includes('gte') || clsLower.includes('lmp2') || clsLower.includes('lmp3');
        const isHypercarOrGT3 = clsLower.includes('hyper') || clsLower.includes('gt3');

        if (energyLabelEl) {
            if (isFuelClass) {
                energyLabelEl.innerHTML = '<div class="wec-energy-text">FUEL</div><div class="wec-energy-text">TANK</div>';
            } else if (isHypercarOrGT3) {
                energyLabelEl.innerHTML = '<div class="wec-energy-text">VIRTUAL</div><div class="wec-energy-text">ENERGY TANK</div>';
            } else {
                energyLabelEl.innerHTML = '<div class="wec-energy-text">FUEL</div><div class="wec-energy-text">TANK</div>';
            }
        }

        if (isFuelClass || (!isHypercarOrGT3 && clsLower !== "")) {
            let maxCap = driver.FuelCapacity || 0;
            if (maxCap < 10) {
                if (clsLower.includes('lmp2')) maxCap = 75;
                else if (clsLower.includes('gte')) maxCap = 90;
                else if (clsLower.includes('lmp3')) maxCap = 85;
                else maxCap = 60;
            }
            const val = (driver.VirtualEnergy > 1.0) ? driver.VirtualEnergy : (driver.VirtualEnergy * maxCap);
            energyEl.innerText = Math.round(val);
            if (energyUnitEl) energyUnitEl.innerText = 'L';
        } else {
            energyEl.innerText = Math.round((driver.VirtualEnergy || 0) * 100);
            if (energyUnitEl) energyUnitEl.innerText = '%';
        }
    }

    const throttleFill = document.getElementById('wec-telemet-throttle');
    if (throttleFill) throttleFill.style.width = ((driver.Throttle || 0) * 100) + '%';
    
    const brakeFill = document.getElementById('wec-telemet-brake');
    if (brakeFill) brakeFill.style.width = ((driver.Brake || 0) * 100) + '%';

    const rpmContainer = document.getElementById('wec-telemetry-container');
    const rpmSegments = document.getElementById('wec-rpm-segments');
    if (rpmSegments && rpmContainer) {
        const metadata = window.lastFocusedDriverData || {};
        const mName = utils.getManufacturerName(driver.VehicleName || driver.CarName || metadata.CarName, driver.Class || metadata.Class, driver.vehicleFilename || metadata.vehicleFilename);
        const mColorClass = utils.getManufacturerColorClass(mName);
        
        const classes = rpmContainer.className.split(' ');
        const newClasses = classes.filter(c => !c.startsWith('man-'));
        if (mColorClass) newClasses.push(mColorClass);
        rpmContainer.className = newClasses.join(' ');

        const segments = rpmSegments.querySelectorAll('.wec-rpm-dot');
        const rpmPct = (driver.RPM || 0) / (driver.MaxRPM || 8000);
        const activeCount = Math.floor(rpmPct * segments.length);
        
        segments.forEach((seg, idx) => {
            if (idx < activeCount) {
                seg.classList.add('active');
                if (rpmPct > 0.95 && idx >= 6) seg.classList.add('flash');
                else seg.classList.remove('flash');
            } else {
                seg.classList.remove('active');
                seg.classList.remove('flash');
            }
        });
    }
}
