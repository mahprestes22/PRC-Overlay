import { state } from '../state.js';
import * as utils from '../utils.js';

const COUNTRY_FLAGS = {
    "Bahrain": "BH",
    "Belgium": "BE",
    "Brazil": "BR",
    "France": "FR",
    "Italy": "IT",
    "Japan": "JP",
    "Netherlands": "NL",
    "Portugal": "PT",
    "Qatar": "QA",
    "Spain": "ES",
    "United Kingdom": "GB",
    "United States of America": "US"
};

const FLAG_BASE_URL = "https://rf2-ui-images-prod.s3.eu-west-1.amazonaws.com/nation-flags/";

const MESES_PT = [
    'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
];

/**
 * Converte "07/05/2026" → "7 de Maio"
 * Aceita também formatos ISO "2026-05-07"
 */
function formatDatePT(dateStr) {
    if (!dateStr) return '';
    let day, month;
    if (dateStr.includes('/')) {
        // DD/MM/YYYY
        const parts = dateStr.split('/');
        day   = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10);
    } else if (dateStr.includes('-')) {
        // YYYY-MM-DD
        const parts = dateStr.split('-');
        day   = parseInt(parts[2], 10);
        month = parseInt(parts[1], 10);
    } else {
        return dateStr; // fallback
    }
    const nomeMes = MESES_PT[month - 1] || '';
    return `${day} de ${nomeMes}`;
}

export function updateCalendarLogic(data) {
    const container = document.getElementById('calendar-container');
    if (!container) return;

    const isVisible = !!state.currentOverlayState.calendarInfo; // Use a chave correta do state.py
    
    // SÓ EXECUTA O TOGGLE SE O ESTADO MUDOU
    if (container.dataset.currentlyVisible !== String(isVisible)) {
        utils.toggleWidgetAnimation(container, isVisible);
        container.dataset.currentlyVisible = String(isVisible);
    }

    if (!isVisible) return;
    
    // ... resto do seu código (Update Header, Sponsor, etc)

    // Update Header
    const titleEl = document.getElementById('calendar-main-title');
    if (titleEl) {
        titleEl.innerText = (state.currentOverlayState.championshipName || "CHAMPIONSHIP").toUpperCase();
    }

    // Update Sponsor
    const sponsorImg = document.getElementById('calendar-sponsor-logo');
    if (sponsorImg) {
        const logo = state.currentOverlayState.sponsorLogo;
        if (logo) {
            const v = state.currentOverlayState.mediaVersion || Date.now();
            sponsorImg.src = `../media/logos/${logo}?v=${v}`;
            sponsorImg.style.display = 'block';
        } else {
            sponsorImg.style.display = 'none';
        }
    }

    // Update Socials
    const instagramEl = document.getElementById('calendar-social-instagram');
    if (instagramEl) {
        let handle = state.currentOverlayState.instagramHandle || "@SHERMINATOR";
        if (handle && !handle.startsWith('@')) handle = '@' + handle;
        instagramEl.innerText = handle;
    }
    const youtubeEl = document.getElementById('calendar-social-youtube');
    if (youtubeEl) {
        let handle = state.currentOverlayState.youtubeHandle || "@SHERMINATOR";
        if (handle && !handle.startsWith('@')) handle = '@' + handle;
        youtubeEl.innerText = handle;
    }

    // Render Rows
    const list = document.getElementById('calendar-list');
    if (!list) return;

    const calendar = state.currentOverlayState.eventCalendar || [];
    
    // Only re-render if count or current round changed to avoid animation flickering
    const currentHash = JSON.stringify(calendar);
    if (list.dataset.lastHash === currentHash) return;
    list.dataset.lastHash = currentHash;

    let html = '';
    calendar.forEach((round, idx) => {
        const isoCode = COUNTRY_FLAGS[round.country] || "";
        const flagUrl = isoCode ? `${FLAG_BASE_URL}${isoCode}.svg` : "";
        const isCurrent = round.current === true;

        // Dentro do calendar.forEach no calendar.js
		html += `
			<div class="calendar-row ${isCurrent ? 'current-round' : ''}" style="animation-delay: ${idx * 0.1}s">
				<div class="cal-col-round">R${round.round.padStart(2, '0')}</div>
				<div class="cal-col-flag">
					${flagUrl ? `<img src="${flagUrl}" class="cal-flag-img" alt="${round.country}">` : ''}
				</div>
				<div class="cal-col-event">${round.name.toUpperCase()}</div>
				<div class="cal-col-date">${formatDatePT(round.date)}</div>
				<div class="cal-col-status">${isCurrent ? 'LIVE' : ''}</div>
			</div>
		`;
    });

    list.innerHTML = html;
}
