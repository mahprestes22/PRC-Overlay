import { state } from './state.js';

export function hexToRgba(hex, alpha = 1.0) {
    if (!hex || typeof hex !== 'string') return `rgba(0,0,0,${alpha})`;
    let r = 0, g = 0, b = 0;
    try {
        if (hex.length === 4) {
            r = parseInt(hex[1] + hex[1], 16);
            g = parseInt(hex[2] + hex[2], 16);
            b = parseInt(hex[3] + hex[3], 16);
        } else if (hex.length >= 7) {
            r = parseInt(hex.slice(1, 3), 16);
            g = parseInt(hex.slice(3, 5), 16);
            b = parseInt(hex.slice(5, 7), 16);
        }
    } catch (e) {}
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function formatTime(seconds) {
    if (!seconds || seconds <= 0) return '--:--.---';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

export function formatGap(gap) {
    if (gap === undefined || gap === null || gap === 0) return '';
    if (typeof gap === 'string') return gap;
    if (gap < 0) return '';
    return `+${gap.toFixed(3)}`;
}

export function formatSector(seconds) {
    if (!seconds || seconds <= 0) return '--.---';
    const s = Math.floor(seconds);
    const ms = Math.round((seconds % 1) * 1000);
    if (ms === 1000) return `${(s + 1).toString().padStart(2, '0')}.000`;
    return `${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

const LOGO_MAP = {
    'ALPINE':       'Alpine',
    'ASTON':        'Aston Martin',
    'BMW':          'BMW',
    'CADILLAC':     'Cadillac',
    'CHEVROLET':    'Chevrolet',
    'CORVETTE':     'Corvette',
    'FERRARI':      'Ferrari',
    'FORD':         'Ford',
    'GINETTA':      'Ginetta',
    'GLICKENHAUS':  'Glickenhaus',
    'ISOTTA':       'Isotta',
    'LAMBORGHINI':  'Lamborghini',
    'LEXUS':        'Lexus',
    'LIGIER':       'Ligier',
    'MCLAREN':      'McLaren',
    'MERCEDES':     'Mercedes-AMG',
    'ORECA':        'Oreca',
    'PEUGEOT':      'Peugeot',
    'PORSCHE':      'Porsche',
    'TOYOTA':       'Toyota',
    'VANWALL':      'Vanwall'
};

export function getManufacturerName(teamName, carClass, vehicleFilename, providedManufacturer = null) {
    if (providedManufacturer) {
        const mfr = providedManufacturer.trim().toUpperCase();
        for (const key in LOGO_MAP) {
            if (mfr.includes(key)) return LOGO_MAP[key];
        }
        return providedManufacturer;
    }

    const searchText = `${teamName || ''} ${vehicleFilename || ''}`.toUpperCase();
    for (const key in LOGO_MAP) {
        if (searchText.includes(key)) return LOGO_MAP[key];
    }

    const cls = (carClass || '').toUpperCase();
    if (cls.includes('LMP2') || cls === 'P2') return 'Oreca';
    if (cls.includes('LMP3') || cls === 'P3') return 'Ligier';

    return 'Unknown';
}

export function getManufacturerLogo(teamName, carClass, vehicleFilename, className = 'wec-logo-img', manufacturer = null) {
    const brand = manufacturer || getManufacturerName(teamName, carClass, vehicleFilename, null);
    if (brand && brand !== 'Unknown') {
        const logoPath = `http://localhost:6397/start/images/manufacturer/Brand=${encodeURIComponent(brand)}.svg`;
        return `<img src="${logoPath}" class="${className}" alt="${brand}" onerror="this.style.display='none'">`;
    }
    return '';
}

export function getWecClassMapping(cls) {
    if (!cls) return 'unknown';
    const l = cls.toLowerCase().trim();
    if (l === 'hy' || l.includes('hyper') || l.includes('pro')) return 'hypercar';
    if (l.includes('elms') && (l.includes('lmp2') || l.includes('p2'))) return 'lmp2-elms';
    if (l === 'p2' || l.includes('lmp2')) return 'lmp2';
    if (l === 'p3' || l.includes('lmp3')) return 'lmp3';
    if (l === 'gt3' || l.includes('lmgt3') || (l.includes('gt3') && !l.includes('gte'))) return 'lmgt3';
    if (l.includes('gte')) return 'gte';
    return 'unknown';
}

export function getWecClassColor(className) {
    if (!className) return '#888';
    const raw = String(className).toUpperCase().trim();
    if (state.currentOverlayState && state.currentOverlayState.classColors) {
        const custom = state.currentOverlayState.classColors;
        const direct = Object.keys(custom).find(k => k.toUpperCase() === raw);
        if (direct) return custom[direct];
    }
    const cls = getWecClassMapping(className);
    const fallbacks = { hypercar: '#e10600', lmp2: '#7FB5FF', 'lmp2-elms': '#005696', lmp3: '#800080', gte: '#ffd700', lmgt3: '#00b33c' };
    if (fallbacks[cls]) return fallbacks[cls];
    if (raw.includes('HY')) return '#e10600';
    if (raw.includes('ELMS')) return '#005696';
    if (raw.includes('P2')) return '#7FB5FF';
    if (raw.includes('GT')) return '#00b33c';
    if (raw === 'ALL') return '#aaaaaa';
    return '#888';
}

export function getManufacturerColorClass(mName) {
    if (!mName) return '';
    const n = mName.toLowerCase();
    if (n.includes('alpine'))      return 'man-alpine';
    if (n.includes('peugeot'))     return 'man-peugeot';
    if (n.includes('porsche'))     return 'man-porsche';
    if (n.includes('cadillac'))    return 'man-cadillac';
    if (n.includes('ferrari'))     return 'man-ferrari';
    if (n.includes('toyota'))      return 'man-toyota';
    if (n.includes('bmw'))         return 'man-bmw';
    if (n.includes('lamborghini')) return 'man-lamborghini';
    if (n.includes('aston'))       return 'man-aston';
    if (n.includes('ford'))        return 'man-ford';
    if (n.includes('mclaren'))     return 'man-mclaren';
    if (n.includes('lexus'))       return 'man-lexus';
    if (n.includes('mercedes') || n.includes('amg')) return 'man-mercedes';
    if (n.includes('corvette') || n.includes('chevrolet')) return 'man-chevrolet';
    if (n.includes('oreca-elms') || (n.includes('oreca') && n.includes('elms'))) return 'man-oreca-elms';
    if (n.includes('oreca'))       return 'man-oreca';
    if (n.includes('ligier'))      return 'man-ligier';
    if (n.includes('vanwall'))     return 'man-vanwall';
    return '';
}

export function getManufacturerLogoClass(mName) {
    if (!mName) return '';
    const n = mName.toLowerCase();
    if (['mclaren', 'mercedes'].some(b => n.includes(b))) return 'logo-white';
    if (['lexus', 'cadillac'].some(b => n.includes(b))) return 'logo-black';
    return '';
}

export function getOrdinal(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function getClassBarColor(className) {
    if (!className) return 'bar-unknown';
    const cls = className.toLowerCase().trim();
    if (cls === 'hy' || cls.includes('hyper')) return 'bar-hyper';
    if (cls.includes('elms') && (cls.includes('lmp2') || cls.includes('p2'))) return 'bar-lmp2-elms';
    if (cls === 'p2' || cls.includes('lmp2')) return 'bar-lmp2';
    if (cls === 'p3' || cls.includes('lmp3')) return 'bar-lmp3';
    if (cls === 'gt3' || cls.includes('lmgt3') || (cls.includes('gt3') && !cls.includes('gte'))) return 'bar-lmgt3';
    if (cls.includes('gte')) return 'bar-gte';
    return 'bar-unknown';
}

export function getSlicedStandings(allInClass, focused, limit) {
    if (!allInClass || allInClass.length <= limit) return allInClass || [];
    const focusedIdx = focused ? allInClass.findIndex(d => (d.slotID || d.SlotID) === (focused.slotID || focused.SlotID)) : -1;
    if (focusedIdx === -1 || focusedIdx < limit) return allInClass.slice(0, limit);
    const topSlots = 3;
    const windowSize = limit - topSlots;
    const padding = Math.floor((windowSize - 1) / 2);
    let wStart = focusedIdx - padding;
    let wEnd = wStart + windowSize;
    if (wStart < topSlots) { wStart = topSlots; wEnd = wStart + windowSize; }
    if (wEnd > allInClass.length) { wEnd = allInClass.length; wStart = Math.max(topSlots, wEnd - windowSize); }
    return [...allInClass.slice(0, topSlots), ...allInClass.slice(wStart, wEnd)];
}

export function cleanTeamName(name) {
    if (!name) return 'TEAM';
    let cleaned = name.split('#')[0].trim();
    cleaned = cleaned.split(':')[0].trim();
    cleaned = cleaned.replace(/\b20\d{2}\b/g, '').trim();
    return cleaned.replace(/\s+/g, ' ').toUpperCase();
}

export function getTeamDisplayName(car) {
    if (!car) return 'TEAM';
    return car.teamName ? cleanTeamName(car.teamName) : (car.TeamName ? cleanTeamName(car.TeamName) : 'TEAM');
}

export function toggleWidgetAnimation(el, show, duration = 600) {
    if (!el) return;
    if (show) {
        el.classList.remove('hidden', 'animate-out');
        el.classList.add('animate-in');
    } else {
        if (!el.classList.contains('hidden') && !el.classList.contains('animate-out')) {
            el.classList.remove('animate-in');
            el.classList.add('animate-out');
            setTimeout(() => {
                if (el.classList.contains('animate-out')) {
                    el.classList.add('hidden');
                    el.classList.remove('animate-out');
                }
            }, duration - 50);
        }
    }
}

export function updateFlags(session) {
    if (!session) return;
    const isFCY      = !!session.isFCY;
    const isGreen    = !!session.isGreen;
    const isFinished = !!session.isFinished;
    const hasYellow  = !!(session.yellowSectors && session.yellowSectors.length > 0);

    document.body.classList.toggle('state-fcy',              isFCY);
    document.body.classList.toggle('state-yellow-flag',      hasYellow && !isFCY && !isFinished);
    document.body.classList.toggle('state-green-flag',       isGreen && !hasYellow && !isFCY && !isFinished);
    document.body.classList.toggle('state-session-finished', isFinished);

    const fcyBanner = document.getElementById('fcy-banner');
    if (fcyBanner) {
        const textEl = fcyBanner.querySelector('#fcy-text');
        const iconEl = fcyBanner.querySelector('.fcy-icon');
        if (isFinished) {
            fcyBanner.classList.add('banner-checkered');
            fcyBanner.classList.remove('banner-green');
            if (textEl) textEl.innerText = 'CHECKERED FLAG';
            if (iconEl) iconEl.innerText = '🏁';
        } else if (isFCY) {
            fcyBanner.classList.remove('banner-checkered', 'banner-green');
            if (textEl) textEl.innerText = session.fcyType || 'FULL COURSE YELLOW';
            if (iconEl) iconEl.innerText = '⚠️';
        } else if (isGreen) {
            fcyBanner.classList.remove('banner-checkered');
            fcyBanner.classList.add('banner-green');
            if (textEl) textEl.innerText = 'GREEN FLAG';
            if (iconEl) iconEl.innerText = '🟢';
        } else {
            fcyBanner.classList.remove('banner-checkered', 'banner-green');
        }
    }
}
