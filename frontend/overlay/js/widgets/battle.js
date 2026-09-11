import { state } from '../state.js';
import * as utils from '../utils.js';

    
export function renderWecHeadToHead(data) {
    const container = document.getElementById('wec-one-vs-one-container');
    if (!data || !data.driverA || !data.driverB) {
        // We don't hide the container here anymore because the user wants it visible 
        // even when no battle is active (showing fallback data from server).
        // If server data is truly missing, just return without error.
        return;
    }
    //if (container) container.classList.remove('hidden');

    const { driverA, driverB, gap } = data;

    // Update Side A (Left/Focused)
    const rankA = document.getElementById('wec-h2h-rank-left');
    if (rankA) {
        const pos = driverA.ClassPosition || driverA.Position;
        const suffix = utils.getOrdinal(pos).replace(/\d+/g, '');
        rankA.innerHTML = `${pos}<sup>${suffix}</sup>`;
    }

    const nameA = document.getElementById('wec-h2h-driver-left');
    if (nameA) nameA.innerText = utils.formatDriverNameAbbr(driverA.DriverName || "");

    const numA = document.getElementById('wec-h2h-number-left');
    if (numA) numA.innerText = driverA.CarNumber || utils.extractCarNumber(driverA.VehicleName || driverA.CarName);

    const mNameA_El = document.getElementById('wec-h2h-m-name-left');
    const sNameA_El = document.getElementById('wec-h2h-s-name-left');
    if (mNameA_El && sNameA_El) {
        const mName = driverA.Manufacturer || utils.getManufacturerName(driverA.VehicleName || driverA.CarName, driverA.Class, driverA.vehicleFilename);
        mNameA_El.innerText = mName.toUpperCase();
        const fullTeam = utils.getTeamDisplayName(driverA);
        const sponsorText = fullTeam.toUpperCase().replace(mName.toUpperCase(), '').trim();
        sNameA_El.innerText = sponsorText;
    }

    const badgeA = document.getElementById('wec-h2h-badge-left');
    if (badgeA) {
        const mName = driverA.Manufacturer || utils.getManufacturerName(driverA.VehicleName || driverA.CarName, driverA.Class, driverA.vehicleFilename);
        const mColorClass = utils.getManufacturerColorClass(mName);
        const logoColorClass = utils.getManufacturerLogoClass(mName);
        badgeA.className = `wec-h2h-badge man-bg ${mColorClass} ${logoColorClass}`;
    }

    const logoA = document.getElementById('wec-h2h-logo-left');
    if (logoA) {
        logoA.innerHTML = utils.getManufacturerLogo(driverA.VehicleName || driverA.CarName, driverA.Class, driverA.vehicleFilename, "wec-h2h-logo-img", driverA.Manufacturer);
    }

    const flagA = document.getElementById('wec-h2h-flag-left');
    if (flagA) {
        const flagUrl = driverA.flag || "";
        if (flagUrl) {
            flagA.src = flagUrl;
            flagA.style.display = 'block';
        } else {
            flagA.style.display = 'none';
        }
    }

    // Update Side B (Right/Challenger)
    const rankB = document.getElementById('wec-h2h-rank-right');
    if (rankB) {
        const pos = driverB.ClassPosition || driverB.Position;
        const suffix = utils.getOrdinal(pos).replace(/\d+/g, '');
        rankB.innerHTML = `${pos}<sup>${suffix}</sup>`;
    }

    const nameB = document.getElementById('wec-h2h-driver-right');
    if (nameB) nameB.innerText = utils.formatDriverNameAbbr(driverB.DriverName || "");

    const numB = document.getElementById('wec-h2h-number-right');
    if (numB) numB.innerText = driverB.CarNumber || utils.extractCarNumber(driverB.VehicleName || driverB.CarName);

    const mNameB_El = document.getElementById('wec-h2h-m-name-right');
    const sNameB_El = document.getElementById('wec-h2h-s-name-right'); 
    if (mNameB_El && sNameB_El) {
        const mName = driverB.Manufacturer || utils.getManufacturerName(driverB.VehicleName || driverB.CarName, driverB.Class, driverB.vehicleFilename);
        mNameB_El.innerText = mName.toUpperCase();
        const fullTeam = utils.getTeamDisplayName(driverB);
        const sponsorText = fullTeam.toUpperCase().replace(mName.toUpperCase(), '').trim();
        sNameB_El.innerText = sponsorText;
    }

    const badgeB = document.getElementById('wec-h2h-badge-right');
    if (badgeB) {
        const mName = driverB.Manufacturer || utils.getManufacturerName(driverB.VehicleName || driverB.CarName, driverB.Class, driverB.vehicleFilename);
        const mColorClass = utils.getManufacturerColorClass(mName);
        const logoColorClass = utils.getManufacturerLogoClass(mName);
        badgeB.className = `wec-h2h-badge man-bg ${mColorClass} ${logoColorClass}`;
    }

    const logoB = document.getElementById('wec-h2h-logo-right');
    if (logoB) {
        logoB.innerHTML = utils.getManufacturerLogo(driverB.VehicleName || driverB.CarName, driverB.Class, driverB.vehicleFilename, "wec-h2h-logo-img", driverB.Manufacturer);
    }

    const flagB = document.getElementById('wec-h2h-flag-right');
    if (flagB) {
        const flagUrl = driverB.flag || "";
        if (flagUrl) {
            flagB.src = flagUrl;
            flagB.style.display = 'block';
        } else {
            flagB.style.display = 'none';
        }
    }

    // Update Gap
    const gapEl = document.getElementById('wec-h2h-main-delta');
    if (gapEl) {
        let displayGap = gap.toString();
        if (!isNaN(parseFloat(displayGap)) && !displayGap.startsWith('+') && !displayGap.startsWith('-')) {
            displayGap = `+${displayGap}`;
        }
        gapEl.innerText = `${displayGap}s`;
    }

    // Update Recent Laps
    const lapsList = document.getElementById('wec-h2h-laps-list');
    if (lapsList) {
        lapsList.innerHTML = `
            <div class="wec-h2h-lap-row">
                <span class="wec-h2h-lap-time">${utils.formatTime(driverA.LastLapTime || 0)}</span>
                <span class="wec-h2h-lap-label">LAST LAP</span>
                <span class="wec-h2h-lap-time">${utils.formatTime(driverB.LastLapTime || 0)}</span>
            </div>
        `;
    }
}

export function renderHeadToHead(data) {
    const container = document.getElementById('one-vs-one-container');
    if (!data || !data.driverA || !data.driverB) {
        // Don't hide, just return
        return;
    }
    //if (container) container.classList.remove('hidden');

    let driverA = data.driverA;
    let driverB = data.driverB;
    const { gap } = data;
	

    // Sorting Logic: Always show the car ahead (better position) on the left (Side A)
    if (driverB.Position < driverA.Position) {
        [driverA, driverB] = [driverB, driverA];
    }

    // Resolve Dynamic Colors for Balloons
    const sideA = container.querySelector('.side-a');
    const sideB = container.querySelector('.side-b');
    if (sideA) sideA.style.setProperty('--side-class-color', utils.getWecClassColor(driverA.Class));
    if (sideB) sideB.style.setProperty('--side-class-color', utils.getWecClassColor(driverB.Class));

    // Update Driver A
    const posA = document.getElementById('h2h-pos-a');
    const suffixA = document.getElementById('h2h-pos-suffix-a');
    if (posA) posA.innerText = driverA.ClassPosition || driverA.Position;
    if (suffixA) suffixA.innerText = utils.getOrdinal(driverA.ClassPosition || driverA.Position).replace(/\d+/g, '');

    const manA = document.getElementById('h2h-man-a');
    if (manA) {
        const mNameA = driverA.Manufacturer || utils.getManufacturerName(driverA.VehicleName || driverA.CarName, driverA.Class, driverA.vehicleFilename);
        manA.innerText = mNameA === "Unknown" ? "" : mNameA.toUpperCase();
    }

    const nameA = document.getElementById('h2h-name-a');
    if (nameA) nameA.innerText = driverA.DriverName;

    const numA = document.getElementById('h2h-num-a');
    if (numA) numA.innerText = driverA.CarNumber || utils.extractCarNumber(driverA.VehicleName || driverA.CarName);

    const logoA = document.getElementById('h2h-logo-a');
    if (logoA) {
        const vNameA = driverA.VehicleName || driverA.CarName || "";
        const mNameA = driverA.Manufacturer || utils.getManufacturerName(vNameA, driverA.Class, driverA.vehicleFilename);
        console.log("1v1 DEBUG A:", vNameA, "->", mNameA);
        logoA.innerHTML = utils.getManufacturerLogo(vNameA, driverA.Class, driverA.vehicleFilename, "dashboard-logo-img", driverA.Manufacturer);
    }

 // Update Energy A
    const energyBarA = document.getElementById('h2h-energy-bar-a');
    const energyValA = document.getElementById('h2h-energy-value-a');
    const energyLabelA = document.getElementById('h2h-energy-label-a');

    if (energyBarA || energyValA) {
        const clsLowerA = (driverA.Class || "").toLowerCase();
        const isFuelClassA = clsLowerA.includes('gte') || clsLowerA.includes('lmp2') || clsLowerA.includes('lmp3');
        const energyPctA = Math.round((driverA.VirtualEnergy !== undefined ? driverA.VirtualEnergy : 0) * 100);
        
        // Define a cor baseada no nível (Verde, Laranja ou Vermelho)
        let colorA = '#37ff8b'; // Verde WEC
        if (energyPctA <= 10) colorA = '#ff3e3e'; // Vermelho
        else if (energyPctA <= 30) colorA = '#ff8800'; // Laranja

        if (energyBarA) {
            energyBarA.style.width = `${energyPctA}%`;
            energyBarA.style.setProperty('--energy-color', colorA);
            energyBarA.style.boxShadow = `0 0 10px ${colorA}44`; // Brilho suave
        }
        
        if (energyLabelA) energyLabelA.innerText = isFuelClassA ? 'FUEL' : 'ENERGY';

        if (energyValA) {
            if (isFuelClassA) {
                let capA = driverA.FuelCapacity || (clsLowerA.includes('lmp2') ? 75 : 90);
                energyValA.innerText = `${Math.round((driverA.VirtualEnergy || 0) * capA)}L`;
            } else {
                energyValA.innerText = `${energyPctA}%`;
            }
            energyValA.style.color = colorA; // Muda a cor do texto também
        }
    }

    // Update Driver B
    const posB = document.getElementById('h2h-pos-b');
    const suffixB = document.getElementById('h2h-pos-suffix-b');
    if (posB) posB.innerText = driverB.ClassPosition || driverB.Position;
    if (suffixB) suffixB.innerText = utils.getOrdinal(driverB.ClassPosition || driverB.Position).replace(/\d+/g, '');

    const manB = document.getElementById('h2h-man-b');
    if (manB) {
        const mNameB = driverB.Manufacturer || utils.getManufacturerName(driverB.VehicleName || driverB.CarName, driverB.Class, driverB.vehicleFilename);
        manB.innerText = mNameB === "Unknown" ? "" : mNameB.toUpperCase();
    }

    const nameB = document.getElementById('h2h-name-b');
    if (nameB) nameB.innerText = driverB.DriverName;

    const numB = document.getElementById('h2h-num-b');
    if (numB) numB.innerText = driverB.CarNumber || utils.extractCarNumber(driverB.VehicleName || driverB.CarName);

    const logoB = document.getElementById('h2h-logo-b');
    if (logoB) {
        const vNameB = driverB.VehicleName || driverB.CarName || "";
        const mNameB = driverB.Manufacturer || utils.getManufacturerName(vNameB, driverB.Class, driverB.vehicleFilename);
        const logoHtml = utils.getManufacturerLogo(vNameB, driverB.Class, driverB.vehicleFilename, "dashboard-logo-img", driverB.Manufacturer);
        console.log("1v1 DEBUG B:", vNameB, "->", mNameB, "HTML:", logoHtml);
        logoB.innerHTML = logoHtml;
    }

// Update Energy B
    const energyBarB = document.getElementById('h2h-energy-bar-b');
    const energyValB = document.getElementById('h2h-energy-value-b');
    const energyLabelB = document.getElementById('h2h-energy-label-b');

    if (energyBarB || energyValB) {
        const clsLowerB = (driverB.Class || "").toLowerCase();
        const isFuelClassB = clsLowerB.includes('gte') || clsLowerB.includes('lmp2') || clsLowerB.includes('lmp3');
        const energyPctB = Math.round((driverB.VirtualEnergy !== undefined ? driverB.VirtualEnergy : 0) * 100);
        
        let colorB = '#37ff8b';
        if (energyPctB <= 10) colorB = '#ff3e3e';
        else if (energyPctB <= 30) colorB = '#ff8800';

        if (energyBarB) {
            energyBarB.style.width = `${energyPctB}%`;
            energyBarB.style.setProperty('--energy-color', colorB);
            energyBarB.style.boxShadow = `0 0 10px ${colorB}44`;
        }
        
        if (energyLabelB) energyLabelB.innerText = isFuelClassB ? 'FUEL' : 'ENERGY';

        if (energyValB) {
            if (isFuelClassB) {
                let capB = driverB.FuelCapacity || (clsLowerB.includes('lmp2') ? 75 : 90);
                energyValB.innerText = `${Math.round((driverB.VirtualEnergy || 0) * capB)}L`;
            } else {
                energyValB.innerText = `${energyPctB}%`;
            }
            energyValB.style.color = colorB;
        }
    }

    // Update Gap
    const gapEl = document.getElementById('h2h-gap-value');
    if (gapEl) {
        let displayGap = (gap !== undefined && gap !== null) ? gap.toString() : "--.---";
        // If it's a number-like string without a prefix, add the plus
        if (!isNaN(parseFloat(displayGap)) && !displayGap.startsWith('+') && !displayGap.startsWith('-')) {
            displayGap = `+${displayGap}`;
        }
        // Ensure it has the "s" suffix if it's a valid number string
        if (!isNaN(parseFloat(displayGap)) && !displayGap.endsWith('s')) {
            displayGap = `${displayGap}s`;
        }
        gapEl.innerText = displayGap;
    }

    // Update Recent Laps
    const table = document.getElementById('h2h-laps-table');
    if (table) {
        let lapsHtml = '';

        // Last Lap
        lapsHtml += `
            <div class="h2h-lap-row">
                <span class="h2h-lap-time">${utils.formatTime(driverA.LastLapTime)}</span>
                <span class="h2h-lap-label">LAST LAP</span>
                <span class="h2h-lap-time">${utils.formatTime(driverB.LastLapTime)}</span>
            </div>
        `;

        // Best Lap
        lapsHtml += `
            <div class="h2h-lap-row">
                <span class="h2h-lap-time">${utils.formatTime(driverA.BestLapTime)}</span>
                <span class="h2h-lap-label">BEST LAP</span>
                <span class="h2h-lap-time">${utils.formatTime(driverB.BestLapTime)}</span>
            </div>
        `;

        table.innerHTML = lapsHtml;
    }
}
