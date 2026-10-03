import { RIDE_ARCHIVE_AFTER_MS } from '../services/ride-lifecycle.js';

export function buildActiveRideFilter(now = new Date()) {
  return { date: { $gt: new Date(now.getTime() - RIDE_ARCHIVE_AFTER_MS) } };
}
