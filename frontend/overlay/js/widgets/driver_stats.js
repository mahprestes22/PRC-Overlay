/**
 * WEC Official Driver Stats Lower-Third Banner Widget
 * Shows Rank, Logo, Car Number, Driver Name, Team Name, Photo, Best Lap, Last Lap, Average
 */

import { state } from '../state.js';
import * as utils from '../utils.js';

export function getOrdinalSuffix(n) {
    if (!n || isNaN(n)) return 'th';
    const num = parseInt(n);
    const j = num % 10, k = num % 100;
    if (j === 1 && k !== 11) return 'st';
    if (j === 2 && k !== 12) return 'nd';
    if (j === 3 && k !== 13) return 'rd';
    return 'th';
}

function formatTime(seconds) {
    if (!seconds || seconds <= 0) return '—:—.—';
    const m = Math.floor(seconds / 60);
    const s = (seconds % 60).toFixed(3).padStart(6, '0');
    return `${m}:${s}`;
}

export function renderDriverStatsBanner(focusedCar) {
    const banner = document.getElementById('driver-stats-banner');
    if (!banner) return;

    const overlayState = state.currentOverlayState || {};
    const showDriverBanner = overlayState.driverStatsBanner !== undefined ? !!overlayState.driverStatsBanner : true;

    if (!showDriverBanner || !focusedCar) {
        banner.classList.add('hidden');
        return;
    }

    banner.classList.remove('hidden');

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

    // 6. Foto do Piloto (Regra 1: Jogo LMU .webp | Regra 2: Pasta Media/fotos/)
    const photoEl = banner.querySelector('.dsb-driver-photo');
    if (photoEl) {
        const cleanAscii = fullName.toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\s\-]/g, '')
            .trim();

        const withHyphen = cleanAscii.replace(/\s+/g, '_');
        const withUnderscore = cleanAscii.replace(/[\s\-]+/g, '_');
        const lastNorm = lastName.toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]/g, '');

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
