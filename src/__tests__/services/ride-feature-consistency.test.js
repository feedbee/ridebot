import { MemoryStorage } from '../../storage/memory.js';
import { RideService } from '../../services/RideService.js';
import { SettingsService } from '../../services/SettingsService.js';

it.each(['cancelRide', 'resumeRide'])('enforces archival through the %s service API', async method => {
  const rides = new RideService(new MemoryStorage());
  const ride = await rides.createRide({
    title: 'Archived', date: new Date('2000-01-01'), createdBy: 1, cancelled: method === 'resumeRide'
  });
  await expect(rides[method](ride.id, 1)).rejects.toMatchObject({ code: 'ride_archived' });
  expect((await rides.getRide(ride.id)).cancelled).toBe(method === 'resumeRide');
});

it.each([true, false])('preserves independent concurrent setting patches (existing defaults: %s)', async existingDefaults => {
  const storage = new MemoryStorage();
  const rides = new RideService(storage);
  const settings = new SettingsService(storage);
  const profile = { userId: 1, firstName: 'Owner' };
  const ride = await rides.createRide({ title: 'Ride', date: new Date('2099-01-01'), createdBy: 1 });
  if (existingDefaults) await settings.ensureUserWithRideDefaults(profile);
  await Promise.all([
    rides.updateRide(ride.id, { settings: { participantLimit: 10 } }),
    rides.updateRide(ride.id, { settings: { requireParticipationApproval: true } }),
    settings.updateUserRideDefaults(profile, { participantLimit: 10 }),
    settings.updateUserRideDefaults(profile, { requireParticipationApproval: true }),
    settings.updateParticipationNotificationLevel(profile, 'membership')
  ]);
  expect((await rides.getRide(ride.id)).settings).toMatchObject({
    participantLimit: 10, requireParticipationApproval: true
  });
  expect((await storage.getUser(1)).settings).toMatchObject({
    rideDefaults: { participantLimit: 10, requireParticipationApproval: true },
    participationNotificationLevel: 'membership'
  });
});

it('copies all settings for an own ride and honors explicit duplicate overrides', async () => {
  const rides = new RideService(new MemoryStorage());
  const profile = { userId: 1, firstName: 'Owner' };
  const ride = await rides.createRide({
    title: 'Ride', date: new Date('2099-01-01'), createdBy: 1,
    settings: { participantLimit: 10, requireParticipationApproval: true }
  });
  const copied = await rides.duplicateRide(ride.id, { when: '2099-01-02T10:00:00Z' }, profile);
  expect(copied.ride.settings).toEqual(ride.settings);
  const changed = await rides.duplicateRide(ride.id, {
    when: '2099-01-02T10:00:00Z',
    settings: { participantLimit: 3, requireParticipationApproval: false }
  }, profile);
  expect(changed.ride.settings).toMatchObject({ participantLimit: 3, requireParticipationApproval: false });
});
