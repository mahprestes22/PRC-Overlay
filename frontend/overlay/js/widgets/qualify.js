import { state } from '../state.js';
import * as utils from '../utils.js';

export function renderQualifyBox(container, driver, standings) {
    if (!container) return;

    if (!driver) {
        const driverNameEl = container.querySelector('.qualify-driver-name');
        if (driverNameEl) driverNameEl.innerText = "WAITING FOR DATA...";
        return;
    }
    
    // 1. Calculate class mapping for styling
    const clsLower = (driver.Class || "unknown").toLowerCase();
    let clsMapping = 'cls-unknown';
    if (clsLower.includes('hyper')) clsMapping = 'cls-hyper';
    else if (clsLower.includes('lmp2')) clsMapping = 'cls-lmp2';
    else if (clsLower.includes('lmp3')) clsMapping = 'cls-lmp3';
    else if (clsLower.includes('lmgt3') || clsLower.includes('gt3')) clsMapping = 'cls-lmgt3';
    else if (clsLower.includes('gte')) clsMapping = 'cls-gte';

    // 2. Preserve existing classes (like hidden, animate-in, animate-out)
    const preservedClasses = Array.from(container.classList).filter(c => 
        !c.startsWith('cls-') && 
        c !== 'qualify-box-container' && 
        c !== 'overlay-widget'
    );
    
    // 3. Rebuild className without destroying visibility state
    container.className = `qualify-box-container ${clsMapping} ${preservedClasses.join(' ')}`.trim();

    const driverNameEl = container.querySelector('.qualify-driver-name');
    const logoEl = container.querySelector('.qualify-logo');
    const classBestTimeEl = container.querySelector('.qualify-class-best-time');
    const bestTimeEl = container.querySelector('.qualify-best-time');
    const liveTimeEl = container.querySelector('.qualify-live-time');

    if (driverNameEl) driverNameEl.innerText = driver.DriverName.toUpperCase();
    if (logoEl) logoEl.innerHTML = utils.getManufacturerLogo(driver.CarName, driver.Class, driver.vehicleFilename, "dashboard-logo-img", driver.Manufacturer);

    // Calculate Class Best
    if (standings) {
        const classBestLap = standings
            .filter(d => d.Class === driver.Class && d.BestLapTime > 0)
            .reduce((min, d) => d.BestLapTime < min ? d.BestLapTime : min, Infinity);

        if (classBestTimeEl) {
            classBestTimeEl.innerText = classBestLap === Infinity ? "--:--.---" : utils.formatTime(classBestLap);
        }
    }

    if (bestTimeEl) {
        bestTimeEl.innerText = utils.formatTime(driver.BestLapTime);
        if (driver.IsClassBestLap) bestTimeEl.classList.add('class-best');
        else bestTimeEl.classList.remove('class-best');
    }

    if (liveTimeEl) {
        liveTimeEl.innerText = utils.formatTime(driver.TimeIntoLap);
    }

    // Sectors Logic
    const secIdx = driver.CurSectorIdx; // 1=S1, 2=S2, 0=S3
    const timeIntoLap = driver.TimeIntoLap;

    let s1 = 0, s2 = 0, s3 = 0;

    if (secIdx === 1) {
        if (timeIntoLap < 8) {
            s1 = driver.LastLapS1 || 0;
            s2 = driver.LastLapS2 || 0;
            s3 = driver.LastLapS3 || 0;
        } else {
            s1 = 0; s2 = 0; s3 = 0;
        }
    } else if (secIdx === 2) {
        s1 = driver.CurS1;
        s2 = 0; s3 = 0;
    } else if (secIdx === 0) {
        s1 = driver.CurS1;
        s2 = driver.CurS2;
        s3 = 0;
    }

    const updateSectorUI = (num, value, status) => {
        const bar = container.querySelector(`.s${num}-bar`);
        const timeEl = container.querySelector(`.s${num}-time`);
        if (!bar || !timeEl) return;

        if (value > 0) {
            timeEl.innerText = utils.formatSector(value);
            bar.style.width = "100%";
            bar.className = `sector-bar s${num}-bar`;

            if (status === 'PURPLE') bar.classList.add('class-best');
            else if (status === 'GREEN') bar.classList.add('personal-best');
            else bar.classList.add('slower');
            timeEl.style.opacity = "1";
        } else {
            timeEl.innerText = "--.---";
            bar.style.width = "0%";
            bar.className = `sector-bar s${num}-bar`;
            timeEl.style.opacity = "0.3";
        }
    };

    updateSectorUI(1, s1, driver.S1Status);
    updateSectorUI(2, s2, driver.S2Status);
    updateSectorUI(3, s3, driver.S3Status);
}

export function renderWecQualifyBox(container, driver, standings) {
    if (!container) return;

    if (!driver) {
        const driverEl = container.querySelector('.qb-driver-text');
        if (driverEl) driverEl.innerText = "WAITING FOR DATA...";
        return;
    }

    // Apply manufacturer theme to the container
    const mName = utils.getManufacturerName(driver.CarName, driver.Class, driver.vehicleFilename);
    const mColorClass = utils.getManufacturerColorClass(mName);
    
    // Clean old manufacturer classes but preserve others (like hidden, animate-in)
    const currentClasses = Array.from(container.classList).filter(c => !c.startsWith('man-'));
    container.className = currentClasses.join(' ');
    if (mColorClass) container.classList.add(mColorClass);

    // Update Identity
    const logoEl = container.querySelector('.qb-logo-img');
    const numEl = container.querySelector('.qb-number-text');
    const driverEl = container.querySelector('.qb-driver-text');

    if (logoEl) logoEl.innerHTML = utils.getManufacturerLogo(driver.CarName, driver.Class, driver.vehicleFilename, "wec-qb-logo-img", driver.Manufacturer);
    if (numEl) numEl.innerText = driver.CarNumber || utils.extractCarNumber(driver.CarName);
    if (driverEl) driverEl.innerText = driver.DriverName.toUpperCase();

    // Update Live Time / Finish Time
    const timeEl = container.querySelector('.qb-time-text');
    if (timeEl) {
        const secIdx = driver.CurSectorIdx; // 1=S1, 2=S2, 0=S3
        const timeIntoLap = driver.TimeIntoLap;
        
        if (secIdx === 1 && timeIntoLap < 8 && driver.LastLapTime > 0) {
            timeEl.innerText = formatTimeQualy(driver.LastLapTime);
            timeEl.classList.add('finish-flash');
        } else {
            timeEl.innerText = formatTimeQualy(timeIntoLap || 0);
            timeEl.classList.remove('finish-flash');
        }
    }

    // Sectors Logic
    const secIdx = driver.CurSectorIdx; // 1=S1, 2=S2, 0=S3
    const timeIntoLap = driver.TimeIntoLap;

    let s1 = 0, s2 = 0, s3 = 0;

    if (secIdx === 1) {
        if (timeIntoLap < 8) {
            s1 = driver.LastLapS1 || 0;
            s2 = driver.LastLapS2 || 0;
            s3 = driver.LastLapS3 || 0;
        } else {
            s1 = 0; s2 = 0; s3 = 0;
        }
    } else if (secIdx === 2) {
        s1 = driver.CurS1;
        s2 = 0; s3 = 0;
    } else if (secIdx === 0) {
        s1 = driver.CurS1;
        s2 = driver.CurS2;
        s3 = 0;
    }

    const updateWecSectorUI = (num, value, status) => {
        const sectorCont = container.querySelector(`.qb-s${num}`);
        const bar = container.querySelector(`.qb-s${num}-bar`);
        if (!bar || !sectorCont) return;

        if (value > 0) {
            bar.className = `wec-qb-s-bar qb-s${num}-bar`; 
            sectorCont.className = `wec-qb-sector qb-s${num}`; 

            if (status === 'PURPLE') {
                bar.classList.add('class-best');
                sectorCont.classList.add('class-best');
            } else if (status === 'GREEN') {
                bar.classList.add('personal-best');
                sectorCont.classList.add('personal-best');
            } else {
                bar.classList.add('slower');
                sectorCont.classList.add('slower');
            }
        } else {
            bar.className = `wec-qb-s-bar qb-s${num}-bar`;
            sectorCont.className = `wec-qb-sector qb-s${num}`;
        }
    };

    updateWecSectorUI(1, s1, driver.S1Status);
    updateWecSectorUI(2, s2, driver.S2Status);
    updateWecSectorUI(3, s3, driver.S3Status);
}

export function formatTimeQualy(seconds) {
    if (!seconds || seconds <= 0) return "0:00.000";
    const mins = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${mins}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}
