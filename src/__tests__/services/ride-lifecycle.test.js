import { RIDE_ARCHIVE_AFTER_MS, isFutureRideDate, isRideArchived } from '../../services/ride-lifecycle.js';

describe('ride lifecycle', () => {
  const start = new Date('2026-09-13T08:00:00.000Z');

  it('archives a ride exactly one hour after its start', () => {
    expect(isRideArchived({ date: start }, new Date(start.getTime() + RIDE_ARCHIVE_AFTER_MS - 1))).toBe(false);
    expect(isRideArchived({ date: start }, new Date(start.getTime() + RIDE_ARCHIVE_AFTER_MS))).toBe(true);
  });

  it('compares absolute instants independently of timezone offsets', () => {
    expect(isRideArchived(
      { date: '2026-09-13T10:00:00+02:00' },
      new Date('2026-09-13T09:00:00Z')
    )).toBe(true);
  });

  it('requires a ride date to be strictly in the future', () => {
    expect(isFutureRideDate(start, start)).toBe(false);
    expect(isFutureRideDate(new Date(start.getTime() + 1), start)).toBe(true);
  });
});
