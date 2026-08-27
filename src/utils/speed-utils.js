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
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  const number = '(\\d+(?:\\.\\d+)?)';
  let match = trimmed.match(new RegExp(`^-${number}$`));
  if (match) return { speedMax: Number(match[1]) };

  match = trimmed.match(new RegExp(`^${number}[+-]$`));
  if (match) return { speedMin: Number(match[1]) };

  match = trimmed.match(new RegExp(`^${number}-${number}$`));
  if (match) {
    const speedMin = Number(match[1]);
    const speedMax = Number(match[2]);
    return speedMin <= speedMax ? { speedMin, speedMax } : null;
  }

  match = trimmed.match(new RegExp(`^~?${number}$`));
  if (match) {
    const speed = Number(match[1]);
    return { speedMin: speed, speedMax: speed };
  }

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
