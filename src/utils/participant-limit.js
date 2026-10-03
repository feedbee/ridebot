export const MIN_PARTICIPANT_LIMIT = 0;
export const MAX_PARTICIPANT_LIMIT = 1000;

/**
 * Parse a participant limit without accepting alternate numeric notation.
 * @param {string|number} value
 * @returns {number|null}
 */
export function parseParticipantLimit(value) {
  if (typeof value === 'number') {
    return Number.isInteger(value)
      && value >= MIN_PARTICIPANT_LIMIT
      && value <= MAX_PARTICIPANT_LIMIT
      ? value
      : null;
  }

  if (typeof value !== 'string') return null;

  const normalized = value.trim();
  if (!/^(?:0|[1-9]\d{0,2}|1000)$/.test(normalized)) return null;
  return Number(normalized);
}
