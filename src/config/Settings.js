// Impostazioni persistenti (localStorage) e preset di qualità grafica.
const KEY = 'hn_settings_v1';

export const QUALITY = {
  low:    { trees: 0.45, leaves: 0.25, rain: 500,  pixelRatio: 1,    shadows: false, antialias: false, lamps: 3 },
  medium: { trees: 0.8,  leaves: 0.7,  rain: 1500, pixelRatio: 1.25, shadows: false, antialias: true,  lamps: 6 },
  high:   { trees: 1.0,  leaves: 1.0,  rain: 3000, pixelRatio: 1.75, shadows: true,  antialias: true,  lamps: 6 },
};

export const DEFAULTS = {
  master: 0.8, sfx: 0.9, music: 0.6,
  sensitivity: 1, brightness: 1, fov: 75, hudScale: 1,
  quality: 'medium', rain: false,
  vrLoco: 'smooth', vrTurn: 'snap', vrSnap: 30, vrVig: true, vrVigStr: 0.6,
};

export const settings = { ...DEFAULTS };
try {
  const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (raw && typeof raw === 'object') Object.assign(settings, raw);
} catch { /* impostazioni di default */ }
if (!QUALITY[settings.quality]) settings.quality = 'medium';

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignora */ }
}
