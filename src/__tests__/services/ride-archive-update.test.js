import { jest } from '@jest/globals';
import { RideService } from '../../services/RideService.js';
import { t } from '../../i18n/index.js';

describe.each(['en', 'ru'])('archived ride updates (%s)', language => {
  const now = new Date('2026-09-13T12:00:00.000Z');
  const archivedRide = {
    id: 'archived',
    date: new Date('2026-09-13T10:00:00.000Z'),
    settings: { notifyParticipation: true, allowReposts: false }
  };
  let storage;
  let service;

  beforeEach(() => {
    storage = {
      getRide: jest.fn().mockResolvedValue(archivedRide),
      updateRide: jest.fn(async (id, updates) => ({ ...archivedRide, ...updates }))
    };
    service = new RideService(storage, {});
  });

  it('rejects content changes without a new future date', async () => {
    const result = await service.updateRideContent(
      archivedRide.id,
      { title: 'Changed' },
      42,
      { language, now }
    );

    expect(result).toEqual({
      ride: null,
      error: t(language, 'services.ride.archivedUpdate', { hours: 1 }, { fallbackLanguage: 'en' })
    });
    expect(storage.updateRide).not.toHaveBeenCalled();
  });

  it('allows content changes together with a new future date', async () => {
    const futureDate = new Date('2026-09-14T10:00:00.000Z');
    const result = await service.updateRideContent(
      archivedRide.id,
      { title: 'Changed', date: futureDate },
      42,
      { language, now }
    );

    expect(result.error).toBeNull();
    expect(result.ride).toEqual(expect.objectContaining({ title: 'Changed', date: futureDate }));
  });

  it('allows settings-only changes without rescheduling', async () => {
    const result = await service.updateRideContent(
      archivedRide.id,
      { settings: { allowReposts: true } },
      42,
      { language, now }
    );

    expect(result.error).toBeNull();
    expect(storage.updateRide).toHaveBeenCalled();
  });

  it('rejects creation when the date is no longer in the future at save time', async () => {
    const result = await service.createRideContent(
      { title: 'Stale', date: now, createdBy: 42 },
      null,
      { language, now }
    );

    expect(result).toEqual({
      ride: null,
      error: t(language, 'parsers.date.pastDate', {}, { fallbackLanguage: 'en' })
    });
    expect(storage.updateRide).not.toHaveBeenCalled();
  });
});
