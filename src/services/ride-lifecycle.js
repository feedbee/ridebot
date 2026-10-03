export const RIDE_ARCHIVE_AFTER_HOURS = 1;
export const RIDE_ARCHIVE_AFTER_MS = RIDE_ARCHIVE_AFTER_HOURS * 60 * 60 * 1000;

/**
 * Determine whether a ride is archived (its start was at least one hour ago).
 * @param {Object} ride
 * @param {Date} [now]
 * @returns {boolean}
 */
export function isRideArchived(ride, now = new Date()) {
  const startTime = new Date(ride?.date).getTime();
  const currentTime = new Date(now).getTime();
  return Number.isFinite(startTime) && Number.isFinite(currentTime) &&
    currentTime >= startTime + RIDE_ARCHIVE_AFTER_MS;
}

/**
 * Determine whether a date is strictly in the future.
 * @param {Date|string|number} date
 * @param {Date} [now]
 * @returns {boolean}
 */
export function isFutureRideDate(date, now = new Date()) {
  const startTime = new Date(date).getTime();
  const currentTime = new Date(now).getTime();
  return Number.isFinite(startTime) && Number.isFinite(currentTime) && startTime > currentTime;
}
