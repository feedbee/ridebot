import { jest } from '@jest/globals';
import { MemoryStorage } from '../../storage/memory.js';
import { RideService } from '../../services/RideService.js';
import { RideParticipationService } from '../../services/RideParticipationService.js';
import { MessageFormatter } from '../../formatters/MessageFormatter.js';

describe('pace group participation', () => {
  let storage, rides, participation, ride, notifications, chatMembership;
  const user = { userId: 7, firstName: 'Rider <&>' };
  beforeEach(async () => {
    storage = new MemoryStorage();
    rides = new RideService(storage);
    notifications = { scheduleParticipationNotification: jest.fn(), sendApplicationNotification: jest.fn(),
      deleteApplicationNotifications: jest.fn(), sendApplicationDecisionNotification: jest.fn() };
    chatMembership = { addParticipant: jest.fn(), removeParticipant: jest.fn() };
    participation = new RideParticipationService(rides, notifications, chatMembership);
    ride = (await rides.createRideFromParams({ title: 'Ride', when: '2099-01-01T10:00:00Z',
      speed: ['25', '20'], cruisingSpeed: ['30', '25', '15'] }, null, { userId: 1 }, { language: 'en' })).ride;
  });
  const choose = group => participation.selectPaceGroup({ rideId: ride.id, userId: user.userId, group });
  const state = targetState => participation.changeParticipation({ rideId: ride.id, participantProfile: user, targetState, api: {} });

  it('requires participation, preserves selection between active states, and clears it on exit', async () => {
    expect((await choose('A')).status).toBe('not_participating');
    await state('thinking');
    await choose('B');
    const original = (await storage.getRide(ride.id)).participation.thinking[0];
    notifications.scheduleParticipationNotification.mockClear();
    expect((await choose('B')).status).toBe('already_in_group');
    await choose('C');
    expect(notifications.scheduleParticipationNotification).not.toHaveBeenCalled();
    expect(chatMembership.addParticipant).not.toHaveBeenCalled();
    expect((await storage.getRide(ride.id)).participation.thinking[0]).toMatchObject({ createdAt: original.createdAt, paceGroup: 'C' });
    await state('joined');
    expect((await storage.getRide(ride.id)).participation.joined.find(p => p.userId === 7).paceGroup).toBe('C');
    await state('skipped');
    expect((await storage.getRide(ride.id)).participation.skipped[0].paceGroup).toBeUndefined();
    await state('joined');
    expect((await storage.getRide(ride.id)).participation.joined.find(p => p.userId === 7).paceGroup).toBeUndefined();
  });

  it('preserves selection on acceptance and allows changes without renewed moderation', async () => {
    await rides.updateRide(ride.id, { settings: { requireParticipationApproval: true } });
    await state('joined');
    await choose('A');
    await participation.decideApplication({ rideId: ride.id, applicantUserId: 7, actorUserId: 1, decision: 'accept', api: {} });
    notifications.sendApplicationNotification.mockClear();
    await choose('B');
    expect((await storage.getRide(ride.id)).participation.joined.find(p => p.userId === 7).paceGroup).toBe('B');
    expect(notifications.sendApplicationNotification).not.toHaveBeenCalled();
  });

  it('retains existing letters, clears removed ones, and never restores a deleted choice', async () => {
    await state('joined'); await choose('C');
    await rides.updateRideFromParams(ride.id, { cruisingSpeed: ['35', '30'] }, 1);
    expect((await storage.getRide(ride.id)).participation.joined.find(p => p.userId === 7).paceGroup).toBeUndefined();
    await rides.updateRideFromParams(ride.id, { cruisingSpeed: ['35', '30', '20'] }, 1);
    expect((await storage.getRide(ride.id)).participation.joined.find(p => p.userId === 7).paceGroup).toBeUndefined();
    await choose('B');
    await rides.updateRideFromParams(ride.id, { speed: '25', cruisingSpeed: '-' }, 1);
    expect((await choose('B')).status).toBe('group_not_found');
    expect((await storage.getRide(ride.id)).participation.joined.find(p => p.userId === 7).paceGroup).toBeUndefined();
  });

  it('copies speed lists but no people when duplicating and validates replacements atomically', async () => {
    const copy = (await rides.duplicateRide(ride.id, { when: '2099-01-03T10:00:00Z' }, { userId: 1 })).ride;
    expect(copy.speedGroups).toEqual(ride.speedGroups);
    expect(copy.cruisingSpeedGroups).toEqual(ride.cruisingSpeedGroups);
    expect(copy.participation.joined).toHaveLength(1);
    const result = await rides.updateRideFromParams(ride.id, { speed: ['25', 'invalid'] }, 1, { language: 'en' });
    expect(result.ride).toBeNull();
    expect(result.error).toContain('2');
    expect((await storage.getRide(ride.id)).speedGroups).toEqual(ride.speedGroups);
  });

  it('formats both eligible statuses with accurate counts and escaped names', async () => {
    await state('thinking'); await choose('B');
    const current = await storage.getRide(ride.id);
    const formatter = new MessageFormatter();
    const text = formatter.formatPaceGroupParticipants(current, current.participation.thinking, 'en');
    expect(text).toMatch(/^<ul><li>A \(0\): —<\/li>/);
    expect(text).toContain('<li>B (1):');
    expect(text).toContain('A (0): —');
    expect(text).toContain('B (1):');
    expect(text).toContain('Rider &lt;&amp;&gt;');
    expect(formatter.formatRidePreview(current, 'en')).toContain('<li>C: ~15 km/h</li>');
  });

  it('rejects changes on missing, cancelled and archived rides without mutation', async () => {
    await state('joined'); await choose('A');
    await rides.updateRide(ride.id, { cancelled: true });
    expect((await choose('B')).status).toBe('ride_cancelled');
    expect((await storage.getRide(ride.id)).participation.joined.find(p => p.userId === 7).paceGroup).toBe('A');
    await rides.updateRide(ride.id, { cancelled: false, date: new Date('2000-01-01') });
    expect((await choose('B')).status).toBe('ride_archived');
    await storage.deleteRide(ride.id);
    expect((await choose('B')).status).toBe('ride_not_found');
  });

  it('serializes concurrent choices with withdrawal and releases a failed operation queue', async () => {
    await state('joined');
    await Promise.all([choose('A'), choose('B'), state('skipped')]);
    expect((await storage.getRide(ride.id)).participation.skipped[0].paceGroup).toBeUndefined();
    await state('joined');
    const select = jest.spyOn(storage, 'setPaceGroup').mockRejectedValueOnce(new Error('Temporary failure'));
    await expect(choose('A')).rejects.toThrow('Temporary failure');
    expect((await choose('B')).status).toBe('changed');
    select.mockRestore();
  });

  it('does not let concurrent speed edits restore removed selections or lose other users', async () => {
    await state('joined'); await choose('C');
    await storage.setParticipation(ride.id, 'thinking', { userId: 8, firstName: 'Other' });
    await storage.setPaceGroup(ride.id, 8, 'A');
    await Promise.all([
      rides.updateRideFromParams(ride.id, { cruisingSpeed: ['35', '30'] }, 1),
      choose('C'),
      storage.setParticipation(ride.id, 'joined', { userId: 9, firstName: 'Third' })
    ]);
    const current = await storage.getRide(ride.id);
    expect(current.participation.joined.find(p => p.userId === 7).paceGroup).toBeUndefined();
    expect(current.participation.thinking[0]).toMatchObject({ userId: 8, paceGroup: 'A' });
    expect(current.participation.joined.find(p => p.userId === 9)).toBeDefined();
  });

  it('persists, edits and duplicates decimal lists without introducing exponent input', async () => {
    const result = await rides.createRideFromParams({ title: 'Decimals', when: '2099-01-02T10:00:00Z',
      speed: ['0.0000001', '25'], cruisingSpeed: ['1000000000000000000000', '-0.0000002'] }, null, { userId: 1 });
    expect(result.error).toBeNull();
    expect(result.ride.speedGroups).toEqual([{ min: 1e-7, max: 1e-7 }, { min: 25, max: 25 }]);
    const edited = await rides.updateRideFromParams(result.ride.id, { speed: ['0.0000002+', '25'] }, 1);
    expect(edited.ride.speedGroups[0]).toEqual({ min: 2e-7, max: null });
    const copy = await rides.duplicateRide(result.ride.id, { when: '2099-01-03T10:00:00Z' }, { userId: 1 });
    expect(copy.error).toBeNull();
    expect(copy.ride.speedGroups).toEqual(edited.ride.speedGroups);
    expect(copy.ride.cruisingSpeedGroups).toEqual(result.ride.cruisingSpeedGroups);
  });
});
