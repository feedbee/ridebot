import { t } from '../i18n/index.js';
import { config } from '../config.js';

function tr(language, key, params = {}) {
  return t(language, key, params, {
    fallbackLanguage: config.i18n.fallbackLanguage,
    withMissingMarker: config.isDev
  });
}

/**
 * Parse speed input text into speedMin/speedMax fields.
 * Returns null for invalid/non-numeric input.
 *
 * Supported forms:
 *   "25-28"        → { speedMin: 25, speedMax: 28 }   range
 *   "25+" or "25-" → { speedMin: 25 }                 minimum
 *   "-28"          → { speedMax: 28 }                 maximum
 *   "25" or "~25"  → { speedMin: 25, speedMax: 25 }   average
 *
 * @param {string} text - Raw user input
 * @returns {{ speedMin?: number, speedMax?: number } | null}
 */
export function parseSpeedInput(text) {
  const trimmed = text.trim().replace(/^~/, '');

  if (/^-\d/.test(trimmed)) {
    const max = parseFloat(trimmed.slice(1));
    if (isNaN(max)) return null;
    return { speedMax: max };
  }

  if (/\d[+-]$/.test(trimmed)) {
    const min = parseFloat(trimmed);
    if (isNaN(min)) return null;
    return { speedMin: min };
  }

  if (/^\d/.test(trimmed) && trimmed.includes('-')) {
    const [minStr, maxStr] = trimmed.split('-');
    const min = parseFloat(minStr);
    const max = parseFloat(maxStr);
    if (isNaN(min) || isNaN(max)) return null;
    return { speedMin: min, speedMax: max };
  }

  const avg = parseFloat(trimmed);
  if (!isNaN(avg)) return { speedMin: avg, speedMax: avg };

  return null;
}

/**
 * Format speed values for display.
 *
 * Display forms:
 *   speedMin === speedMax  → "~25 km/h"         average
 *   both set               → "25-28 km/h"        range
 *   min only               → "25+ km/h"          minimum
 *   max only               → "up to 28 km/h"     maximum (localised)
 *
 * @param {number|null} speedMin
 * @param {number|null} speedMax
 * @param {string} language
 * @returns {string}
 */
export function formatSpeed(speedMin, speedMax, language = config.i18n.defaultLanguage) {
  const kmh = tr(language, 'formatter.units.kmh');

  if (speedMin && speedMax && speedMin === speedMax) return `~${speedMin} ${kmh}`;
  if (speedMin && speedMax) return `${speedMin}-${speedMax} ${kmh}`;
  if (speedMin) return `${speedMin}+ ${kmh}`;
  if (speedMax) return tr(language, 'formatter.upToSpeed', { max: speedMax });
  return '';
}
