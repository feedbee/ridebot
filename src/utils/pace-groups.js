import { escapeHtml } from './html-escape.js';
import { parseSpeedInput, formatSpeed } from './speed-utils.js';
import { t } from '../i18n/index.js';
import { config } from '../config.js';

export const PACE_GROUP_NAMES = ['A', 'B', 'C', 'D', 'E'];
export const SPEED_PREFIXES = ['speed', 'cruisingSpeed'];

/** Render a field-specific validation error consistently across all input modes.
 * @param {string} prefix
 * @param {{error: string, index?: number}} result
 * @param {string} language
 * @returns {string}
 */
export function speedInputError(prefix, result, language = config.i18n.defaultLanguage) {
  const translate = (key, params = {}) => t(language, key, params, { fallbackLanguage: config.i18n.fallbackLanguage });
  return `${translate(`params.validation.${prefix}Invalid`)} ${translate(result.error === 'limit'
    ? 'paceGroups.limit' : 'paceGroups.invalidElement', { index: result.index })}`;
}

/** Normalize optional stored speed patches, including direct wizard/import save paths.
 * @param {Object} fields
 * @returns {Object}
 */
export function normalizeSpeedFields(fields) {
  const normalized = { ...fields };
  for (const prefix of SPEED_PREFIXES) {
    const key = `${prefix}Groups`;
    const groups = fields[key];
    if (groups !== undefined) {
      if (!Array.isArray(groups) || groups.length > PACE_GROUP_NAMES.length) throw new Error('Invalid speed groups');
      if (groups.length) {
        const speeds = groups.map(speed => {
          if (!speed || !['min', 'max'].every(bound => speed[bound] == null
            || (Number.isFinite(speed[bound]) && speed[bound] >= 0))) throw new Error('Invalid speed group bounds');
          const min = speed.min ?? null;
          const max = speed.max ?? null;
          if (min === null && max === null) throw new Error('Empty speed group');
          if (min !== null && max !== null && min > max) throw new Error('Invalid speed group bounds');
          return { min, max };
        });
        const scalar = speeds.length === 1 ? speeds[0] : { min: null, max: null };
        Object.assign(normalized, { [`${prefix}Min`]: scalar.min, [`${prefix}Max`]: scalar.max,
          [key]: speeds.length > 1 ? speeds : [] });
      }
    } else if (fields[`${prefix}Min`] !== undefined || fields[`${prefix}Max`] !== undefined) {
      normalized[key] = [];
    }
  }
  return normalized;
}

/** Parse a scalar, multiline text, or structured speed list using the existing grammar.
 * @param {string|string[]} input
 * @param {string} prefix
 * @param {boolean} isUpdate
 * @returns {{data: Object|null, error: string|null, index?: number}}
 */
export function parseSpeedField(input, prefix = 'speed', isUpdate = false) {
  const values = Array.isArray(input) ? input : typeof input === 'string'
    ? input.split('\n').map(line => line.trim()).filter(Boolean) : [];
  const cleared = values.length === 1 && values[0] === '-' && isUpdate;
  if (values.length > PACE_GROUP_NAMES.length) return { data: null, error: 'limit' };
  if (values.length === 0) return { data: null, error: 'invalid', index: 1 };
  const speeds = [];
  if (!cleared) {
    for (const [index, value] of values.entries()) {
      const parsed = parseSpeedInput(value);
      if (!parsed || Object.values(parsed).some(bound => !Number.isFinite(bound))) {
        return { data: null, error: 'invalid', index: index + 1 };
      }
      speeds.push({ min: parsed.speedMin ?? null, max: parsed.speedMax ?? null });
    }
  }
  const scalar = speeds.length === 1 ? speeds[0] : { min: null, max: null };
  return {
    data: { [`${prefix}Min`]: scalar.min, [`${prefix}Max`]: scalar.max,
      [`${prefix}Groups`]: speeds.length > 1 ? speeds : [] },
    error: null
  };
}

/** Derive valid letters from speed lists; a scalar never creates a group.
 * @param {Object} ride
 * @returns {string[]}
 */
export function getPaceGroups(ride) {
  const count = Math.max(...SPEED_PREFIXES.map(prefix => ride?.[`${prefix}Groups`]?.length || 0));
  return count >= 2 ? PACE_GROUP_NAMES.slice(0, count) : [];
}

/** Encode persisted speeds into the input grammar, without display units.
 * @param {Object} ride
 * @param {string} prefix
 * @returns {string|string[]|undefined}
 */
export function speedFieldToInput(ride, prefix) {
  const encode = ({ min, max }) => {
    if (min != null && max != null) return min === max ? speedNumberToInput(min) : `${speedNumberToInput(min)}-${speedNumberToInput(max)}`;
    if (min != null) return `${speedNumberToInput(min)}+`;
    if (max != null) return `-${speedNumberToInput(max)}`;
    return undefined;
  };
  const groups = ride?.[`${prefix}Groups`];
  if (groups?.length > 1) return groups.map(encode);
  return encode({ min: ride?.[`${prefix}Min`], max: ride?.[`${prefix}Max`] });
}

/** Expand exponent notation so reconstructed input still uses the speed grammar.
 * @param {number} value - A finite, nonnegative speed bound
 * @returns {string}
 */
function speedNumberToInput(value) {
  const [coefficient, exponent] = String(value).split('e');
  if (exponent === undefined) return coefficient;
  const [integer, fraction = ''] = coefficient.split('.');
  const digits = integer + fraction;
  const position = integer.length + Number(exponent);
  if (position <= 0) return `0.${'0'.repeat(-position)}${digits}`;
  if (position >= digits.length) return digits + '0'.repeat(position - digits.length);
  return `${digits.slice(0, position)}.${digits.slice(position)}`;
}

/** Display one speed characteristic, retaining input order and missing positions.
 * @param {Object} ride
 * @param {string} prefix
 * @param {string} language
 * @param {{rich?: boolean}} options
 * @returns {string}
 */
export function formatSpeedField(ride, prefix, language, { rich = false } = {}) {
  const groups = ride?.[`${prefix}Groups`];
  if (groups?.length > 1) {
    const lines = groups.map((speed, index) => `${PACE_GROUP_NAMES[index]}: ${formatSpeed(speed.min, speed.max, language)}`);
    return rich ? `<ul>${lines.map(line => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`
      : lines.map(line => `• ${line}`).join('\n');
  }
  return formatSpeed(ride?.[`${prefix}Min`], ride?.[`${prefix}Max`], language);
}

/** Distribute a participation section; invalid legacy selections are unassigned.
 * @param {Object} ride
 * @param {Object[]} participants
 * @returns {Array<{name: string|null, participants: Object[]}>}
 */
export function groupParticipants(ride, participants) {
  const names = getPaceGroups(ride);
  return [
    ...names.map(name => ({ name, participants: participants.filter(person => person.paceGroup === name) })),
    { name: null, participants: participants.filter(person => !names.includes(person.paceGroup)) }
  ];
}
