/**
 * WEC Official Driver Onboard Telemetry Banner Widget
 * Inputs: Throttle (Green), Brake (Red), RPM, Gears, Dual Speed (KMH/MPH), Michelin Telemetry badge
 */

import { state } from '../state.js';
import * as utils from '../utils.js';

export function getManufacturerColorClass(car) {
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
    if (text.includes('oreca') || text.includes('lmp2')) return 'man-oreca';
    if (text.includes('ligier') || text.includes('lmp3')) return 'man-ligier';
    if (text.includes('ford')) return 'man-ford';
    return 'man-default';
}


export function renderDriverOnboardBanner(focusedCar, isOnboard) {
    const banner = document.getElementById('driver-onboard-banner');
    if (!banner) return false;

    const overlayState = state.currentOverlayState || {};
    const onboardMode = overlayState.driverOnboardMode || 'AUTO';
    
    let shouldShow = false;
    if (onboardMode === 'ON') {
        shouldShow = !!focusedCar;
    } else if (onboardMode === 'OFF') {
        shouldShow = false;
    } else {
        // AUTO mode: aparece quando a câmera for onboard
        shouldShow = !!(isOnboard && focusedCar);
    }

    if (!shouldShow || !focusedCar) {
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
        const logoUrl = focusedCar.manufacturerLogo
            ? `http://localhost:6397/start/images/manufacturer/${focusedCar.manufacturerLogo}`
            : '';
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
                    photoEl.style.opacity = '0';
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
