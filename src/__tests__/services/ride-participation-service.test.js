/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { RideParticipationService } from '../../services/RideParticipationService.js';
import { UserProfile } from '../../models/UserProfile.js';
import { MemoryStorage } from '../../storage/memory.js';
import { RideService } from '../../services/RideService.js';

it('keeps group membership consistent when leaving during an application acceptance', async () => {
  const rides = new RideService(new MemoryStorage());
  const profile = { userId: 2, firstName: 'Applicant' };
  const ride = await rides.createRide({
    title: 'Ride', date: new Date('2099-01-01'), createdBy: 1,
    groupId: -100123, settings: { requireParticipationApproval: true }
  });
  await rides.setParticipation(ride.id, profile, 'thinking');
  let entered, release;
  const started = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  let member = false;
  const service = new RideParticipationService(rides, null, {
    addParticipant: async () => { entered(); await gate; member = true; },
    removeParticipant: async () => { member = false; }
  });
  const accepted = service.decideApplication({
    rideId: ride.id, applicantUserId: 2, actorUserId: 1, decision: 'accept', api: {}
  });
  await started;
  const leaving = service.changeParticipation({
    rideId: ride.id, participantProfile: profile, targetState: 'skipped', api: {}
  });
  // Allow the competing transition to run while invitation delivery is paused.
  await new Promise(resolve => setImmediate(resolve));
  release();
  await Promise.all([accepted, leaving]);
  expect(await rides.storage.getParticipation(ride.id, 2)).toBe('skipped');
  expect(member).toBe(false);
  expect(service.participantOperations.size).toBe(0);
});

it('continues queued participation actions after an earlier operation fails', async () => {
  const rides = new RideService(new MemoryStorage());
  const ride = await rides.createRide({ title: 'Ride', date: new Date('2099-01-01'), createdBy: 1 });
  jest.spyOn(rides, 'getRide').mockRejectedValueOnce(new Error('Storage unavailable'));
  const service = new RideParticipationService(rides);
  const params = { rideId: ride.id, participantProfile: { userId: 2 }, targetState: 'joined', api: {} };
  const failed = service.changeParticipation(params);
  const next = service.changeParticipation(params);
  await expect(failed).rejects.toThrow('Storage unavailable');
  await expect(next).resolves.toMatchObject({ status: 'changed' });
  expect(service.participantOperations.size).toBe(0);
  jest.restoreAllMocks();
});

it.each(['change', 'decide'])('rejects %s when the archive boundary is crossed before storage writes', async operation => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-03T12:00:00Z'));
  try {
    const storage = new MemoryStorage();
    const rides = new RideService(storage);
    const profile = { userId: 2, firstName: 'Applicant' };
    const ride = await rides.createRide({
      title: 'Ride', date: new Date('2026-10-03T11:00:00.001Z'), createdBy: 1,
      groupId: -100123, settings: { requireParticipationApproval: operation === 'decide' }
    });
    if (operation === 'decide') await rides.setParticipation(ride.id, profile, 'thinking');
    const method = operation === 'decide' ? 'setParticipationIfCurrent' : 'setParticipationForRideMode';
    const original = storage[method].bind(storage);
    jest.spyOn(storage, method).mockImplementation((...args) => {
      jest.setSystemTime(new Date('2026-10-03T12:00:00.001Z'));
      return original(...args);
    });
    const groups = { addParticipant: jest.fn(), removeParticipant: jest.fn() };
    const notifications = {
      scheduleParticipationNotification: jest.fn(),
      deleteApplicationNotifications: jest.fn(),
      sendApplicationNotification: jest.fn(),
      sendApplicationDecisionNotification: jest.fn()
    };
    const service = new RideParticipationService(rides, notifications, groups);
    const result = operation === 'decide'
      ? await service.decideApplication({ rideId: ride.id, applicantUserId: 2, actorUserId: 1, decision: 'accept', api: {} })
      : await service.changeParticipation({ rideId: ride.id, participantProfile: profile, targetState: 'joined', api: {} });
    expect(result.status).toBe('ride_archived');
    expect(await storage.getParticipation(ride.id, 2)).toBe(operation === 'decide' ? 'thinking' : null);
    expect(groups.addParticipant).not.toHaveBeenCalled();
    for (const notification of Object.values(notifications)) expect(notification).not.toHaveBeenCalled();
    expect(groups.removeParticipant).not.toHaveBeenCalled();
  } finally {
    jest.restoreAllMocks();
    jest.useRealTimers();
  }
});

describe('RideParticipationService', () => {
  let service;
  let mockRideService;
  let mockNotificationService;
  let mockGroupManagementService;

  const ride = {
    id: 'ride-1',
    createdBy: 999,
    groupId: -100123,
    cancelled: false
  };

  const participantProfile = new UserProfile({
    userId: 123,
    username: 'rider',
    firstName: 'Road',
    lastName: 'Cyclist'
  });

  const api = { sendMessage: jest.fn() };

  beforeEach(() => {
    mockRideService = {
      getRide: jest.fn(),
      setParticipationForRideMode: jest.fn(),
      decideParticipation: jest.fn()
    };
    mockNotificationService = {
      scheduleParticipationNotification: jest.fn(),
      deleteApplicationNotifications: jest.fn(),
      sendApplicationNotification: jest.fn(),
      sendApplicationDecisionNotification: jest.fn()
    };
    mockGroupManagementService = {
      addParticipant: jest.fn().mockResolvedValue({}),
      removeParticipant: jest.fn().mockResolvedValue({})
    };

    service = new RideParticipationService(
      mockRideService,
      mockNotificationService,
      mockGroupManagementService
    );
  });

  it('returns ride_not_found when ride does not exist', async () => {
    mockRideService.getRide.mockResolvedValue(null);

    const result = await service.changeParticipation({
      rideId: 'ride-1',
      participantProfile,
      targetState: 'joined',
      language: 'en',
      api
    });

    expect(result).toEqual({ status: 'ride_not_found', targetState: 'joined' });
    expect(mockRideService.setParticipationForRideMode).not.toHaveBeenCalled();
  });

  it('returns ride_cancelled when ride is cancelled', async () => {
    mockRideService.getRide.mockResolvedValue({ ...ride, cancelled: true });

    const result = await service.changeParticipation({
      rideId: 'ride-1',
      participantProfile,
      targetState: 'joined',
      language: 'en',
      api
    });

    expect(result).toEqual({
      status: 'ride_cancelled',
      ride: { ...ride, cancelled: true },
      targetState: 'joined'
    });
    expect(mockRideService.setParticipationForRideMode).not.toHaveBeenCalled();
  });

  it('returns ride_archived before other participation checks and side effects', async () => {
    const archivedRide = {
      ...ride,
      cancelled: true,
      date: new Date(Date.now() - 60 * 60 * 1000)
    };
    mockRideService.getRide.mockResolvedValue(archivedRide);

    const result = await service.changeParticipation({
      rideId: 'ride-1',
      participantProfile,
      targetState: 'joined',
      language: 'en',
      api
    });

    expect(result).toEqual({ status: 'ride_archived', ride: archivedRide, targetState: 'joined' });
    expect(mockRideService.setParticipationForRideMode).not.toHaveBeenCalled();
    expect(mockNotificationService.scheduleParticipationNotification).not.toHaveBeenCalled();
    expect(mockGroupManagementService.addParticipant).not.toHaveBeenCalled();
  });

  it('returns already_in_state when participation does not change', async () => {
    mockRideService.getRide.mockResolvedValue(ride);
    mockRideService.setParticipationForRideMode.mockResolvedValue({ success: false, ride: null, reason: 'already_in_state' });

    const result = await service.changeParticipation({
      rideId: 'ride-1',
      participantProfile,
      targetState: 'joined',
      language: 'en',
      api
    });

    expect(result).toEqual({ status: 'already_in_state', targetState: 'joined' });
    expect(mockNotificationService.scheduleParticipationNotification).not.toHaveBeenCalled();
  });

  it('returns participant_limit_reached without running side effects', async () => {
    mockRideService.getRide.mockResolvedValue(ride);
    mockRideService.setParticipationForRideMode.mockResolvedValue({
      success: false,
      status: 'participant_limit_reached',
      reason: 'participant_limit_reached',
      ride: null
    });

    const result = await service.changeParticipation({
      rideId: 'ride-1',
      participantProfile,
      targetState: 'joined',
      language: 'en',
      api
    });

    expect(result).toEqual({ status: 'participant_limit_reached', targetState: 'joined' });
    expect(mockNotificationService.scheduleParticipationNotification).not.toHaveBeenCalled();
    expect(mockGroupManagementService.addParticipant).not.toHaveBeenCalled();
  });

  it('schedules notification and adds participant to group on join', async () => {
    mockRideService.getRide.mockResolvedValue(ride);
    mockRideService.setParticipationForRideMode.mockResolvedValue({
      success: true,
      ride,
      previousState: null
    });

    const result = await service.changeParticipation({
      rideId: 'ride-1',
      participantProfile,
      targetState: 'joined',
      language: 'ru',
      api
    });

    expect(result).toEqual({
      status: 'changed',
      ride,
      previousState: null,
      targetState: 'joined'
    });
    expect(mockNotificationService.scheduleParticipationNotification).toHaveBeenCalledWith(
      ride,
      participantProfile,
      null,
      'joined',
      api
    );
    expect(mockGroupManagementService.addParticipant).toHaveBeenCalledWith(
      api,
      ride.groupId,
      participantProfile.userId,
      'ru',
      ride.createdBy
    );
  });

  it('removes participant from group when leaving after joined', async () => {
    mockRideService.getRide.mockResolvedValue(ride);
    mockRideService.setParticipationForRideMode.mockResolvedValue({
      success: true,
      ride,
      previousState: 'joined'
    });

    await service.changeParticipation({
      rideId: 'ride-1',
      participantProfile,
      targetState: 'skipped',
      language: 'en',
      api
    });

    expect(mockGroupManagementService.removeParticipant).toHaveBeenCalledWith(
      api,
      ride.groupId,
      participantProfile.userId
    );
    expect(mockGroupManagementService.addParticipant).not.toHaveBeenCalled();
  });

  it('does not remove participant from group when previous state was not joined', async () => {
    mockRideService.getRide.mockResolvedValue(ride);
    mockRideService.setParticipationForRideMode.mockResolvedValue({
      success: true,
      ride,
      previousState: 'thinking'
    });

    await service.changeParticipation({
      rideId: 'ride-1',
      participantProfile,
      targetState: 'skipped',
      language: 'en',
      api
    });

    expect(mockGroupManagementService.removeParticipant).not.toHaveBeenCalled();
  });

  it('turns a non-creator join into an immediate pending application on moderated rides', async () => {
    const moderatedRide = {
      ...ride,
      settings: { requireParticipationApproval: true },
      participation: { joined: [], thinking: [], skipped: [] }
    };
    mockRideService.getRide.mockResolvedValue(moderatedRide);
    mockRideService.setParticipationForRideMode.mockResolvedValue({ success: true, ride: moderatedRide, previousState: null });

    const result = await service.changeParticipation({
      rideId: ride.id,
      participantProfile,
      targetState: 'joined',
      language: 'en',
      api
    });

    expect(mockRideService.setParticipationForRideMode).toHaveBeenCalledWith(
      ride.id,
      participantProfile,
      'thinking',
      true,
      null
    );
    expect(mockNotificationService.sendApplicationNotification).toHaveBeenCalledWith(moderatedRide, participantProfile, api);
    expect(mockNotificationService.scheduleParticipationNotification).not.toHaveBeenCalled();
    expect(result).toMatchObject({ targetState: 'thinking', moderationOutcome: 'application_submitted' });
  });

  it('keeps an accepted participant joined when apply is pressed again', async () => {
    const moderatedRide = {
      ...ride,
      settings: { requireParticipationApproval: true },
      participation: { joined: [{ userId: participantProfile.userId }], thinking: [], skipped: [] }
    };
    mockRideService.getRide.mockResolvedValue(moderatedRide);
    mockRideService.setParticipationForRideMode.mockResolvedValue({ success: false, reason: 'already_in_state' });

    const result = await service.changeParticipation({
      rideId: ride.id,
      participantProfile,
      targetState: 'joined',
      language: 'en',
      api
    });

    expect(mockRideService.setParticipationForRideMode).toHaveBeenCalledWith(
      ride.id,
      participantProfile,
      'joined',
      true,
      'joined'
    );
    expect(result).toEqual({
      status: 'already_in_state',
      targetState: 'joined',
      moderationOutcome: 'already_accepted'
    });
  });

  it('lets the creator rejoin a moderated ride without approval', async () => {
    const creatorProfile = new UserProfile({ userId: ride.createdBy, username: 'creator' });
    const moderatedRide = {
      ...ride,
      settings: { requireParticipationApproval: true },
      participation: { joined: [], thinking: [], skipped: [creatorProfile] }
    };
    mockRideService.getRide.mockResolvedValue(moderatedRide);
    mockRideService.setParticipationForRideMode.mockResolvedValue({ success: true, ride: moderatedRide, previousState: 'skipped' });

    const result = await service.changeParticipation({
      rideId: ride.id,
      participantProfile: creatorProfile,
      targetState: 'joined',
      language: 'en',
      api
    });

    expect(result.targetState).toBe('joined');
    expect(mockNotificationService.sendApplicationNotification).not.toHaveBeenCalled();
  });

  it('reports an idempotent moderated skip as already not participating', async () => {
    const moderatedRide = {
      ...ride,
      settings: { requireParticipationApproval: true },
      participation: { joined: [], thinking: [], skipped: [participantProfile] }
    };
    mockRideService.getRide.mockResolvedValue(moderatedRide);
    mockRideService.setParticipationForRideMode.mockResolvedValue({
      success: false,
      reason: 'already_in_state'
    });

    const result = await service.changeParticipation({
      rideId: ride.id,
      participantProfile,
      targetState: 'skipped',
      language: 'en',
      api
    });

    expect(result.moderationOutcome).toBe('already_not_participating');
  });

  it('accepts a current application and notifies the applicant', async () => {
    const moderatedRide = {
      ...ride,
      settings: { requireParticipationApproval: true },
      participation: { joined: [], thinking: [participantProfile], skipped: [] }
    };
    const acceptedRide = {
      ...moderatedRide,
      participation: { joined: [participantProfile], thinking: [], skipped: [] }
    };
    mockRideService.getRide.mockResolvedValue(moderatedRide);
    mockRideService.decideParticipation.mockResolvedValue({ success: true, ride: acceptedRide });

    const result = await service.decideApplication({
      rideId: ride.id,
      applicantUserId: participantProfile.userId,
      actorUserId: ride.createdBy,
      decision: 'accept',
      language: 'en',
      api
    });

    expect(result).toMatchObject({ status: 'changed', targetState: 'joined' });
    expect(mockGroupManagementService.addParticipant).toHaveBeenCalled();
    expect(mockNotificationService.sendApplicationDecisionNotification).toHaveBeenCalledWith(
      acceptedRide,
      participantProfile.userId,
      'accepted',
      api
    );
  });

  it.each(['accept', 'reject'])('does not %s an application on an archived ride', async decision => {
    const archivedRide = {
      ...ride,
      date: new Date(Date.now() - 60 * 60 * 1000),
      settings: { requireParticipationApproval: true },
      participation: { joined: [], thinking: [participantProfile], skipped: [] }
    };
    mockRideService.getRide.mockResolvedValue(archivedRide);

    const result = await service.decideApplication({
      rideId: ride.id,
      applicantUserId: participantProfile.userId,
      actorUserId: ride.createdBy,
      decision,
      language: 'en',
      api
    });

    expect(result).toEqual({ status: 'ride_archived' });
    expect(mockRideService.decideParticipation).not.toHaveBeenCalled();
    expect(mockGroupManagementService.addParticipant).not.toHaveBeenCalled();
    expect(mockGroupManagementService.removeParticipant).not.toHaveBeenCalled();
    expect(mockNotificationService.sendApplicationDecisionNotification).not.toHaveBeenCalled();
  });

  it('rejects a current application and removes attached-group access', async () => {
    const moderatedRide = {
      ...ride,
      settings: { requireParticipationApproval: true },
      participation: { joined: [], thinking: [participantProfile], skipped: [] }
    };
    const rejectedRide = {
      ...moderatedRide,
      participation: { joined: [], thinking: [], skipped: [participantProfile] }
    };
    mockRideService.getRide.mockResolvedValue(moderatedRide);
    mockRideService.decideParticipation.mockResolvedValue({ success: true, ride: rejectedRide });

    await service.decideApplication({
      rideId: ride.id,
      applicantUserId: participantProfile.userId,
      actorUserId: ride.createdBy,
      decision: 'reject',
      language: 'en',
      api
    });

    expect(mockGroupManagementService.removeParticipant).toHaveBeenCalledWith(
      api,
      ride.groupId,
      participantProfile.userId
    );
  });

  it('keeps a current application pending when accepting would exceed the participant limit', async () => {
    const moderatedRide = {
      ...ride,
      settings: { requireParticipationApproval: true, participantLimit: 1 },
      participation: { joined: [{ userId: 456 }], thinking: [participantProfile], skipped: [] }
    };
    mockRideService.getRide.mockResolvedValue(moderatedRide);
    mockRideService.decideParticipation.mockResolvedValue({
      success: false,
      reason: 'participant_limit_reached'
    });

    const result = await service.decideApplication({
      rideId: ride.id,
      applicantUserId: participantProfile.userId,
      actorUserId: ride.createdBy,
      decision: 'accept',
      language: 'en',
      api
    });

    expect(result).toEqual({ status: 'participant_limit_reached' });
    expect(mockGroupManagementService.addParticipant).not.toHaveBeenCalled();
    expect(mockNotificationService.sendApplicationDecisionNotification).not.toHaveBeenCalled();
  });
});


describe('Creator participant declines', () => {
  const profile = { userId: 2, firstName: 'Guest', username: 'guest' };

  async function setup(state = 'joined', moderated = false) {
    const storage = new MemoryStorage();
    const rides = new RideService(storage);
    const ride = await rides.createRide({ title: 'Ride', date: new Date('2099-01-01'), createdBy: 1,
      groupId: -100123, settings: { requireParticipationApproval: moderated } });
    await rides.setParticipation(ride.id, profile, state);
    const notifications = {
      scheduleParticipationNotification: jest.fn(),
      deleteApplicationNotifications: jest.fn().mockResolvedValue(),
      sendApplicationDecisionNotification: jest.fn().mockResolvedValue(),
      sendParticipationCancelledNotification: jest.fn().mockResolvedValue()
    };
    const groups = { removeParticipant: jest.fn().mockResolvedValue() };
    const service = new RideParticipationService(rides, notifications, groups);
    const params = { rideId: ride.id, participantUserId: 2, actorUserId: 1, api: {} };
    return { storage, rides, ride, notifications, groups, service, params };
  }

  it.each(['joined', 'thinking'])('declines %s and runs removal only once for concurrent decisions', async state => {
    const { storage, ride, notifications, groups, service, params } = await setup(state, true);
    const results = await Promise.all([service.declineParticipant(params), service.declineParticipant(params)]);
    expect(results.map(r => r.status)).toEqual(['changed', 'stale']);
    expect(await storage.getParticipation(ride.id, 2)).toBe('skipped');
    expect(groups.removeParticipant).toHaveBeenCalledTimes(1);
    expect(groups.removeParticipant).toHaveBeenCalledWith(params.api, -100123, 2);
    expect(notifications.scheduleParticipationNotification).not.toHaveBeenCalled();
    expect(notifications.deleteApplicationNotifications).toHaveBeenCalledTimes(state === 'thinking' ? 1 : 0);
    expect(notifications.sendApplicationDecisionNotification).not.toHaveBeenCalled();
    expect(notifications.sendParticipationCancelledNotification).toHaveBeenCalledTimes(1);
    expect(notifications.sendParticipationCancelledNotification).toHaveBeenCalledWith(expect.objectContaining({ id: ride.id }), 2, params.api);
  });

  it.each(['forbidden', 'ride_not_found', 'ride_cancelled', 'ride_archived', 'stale'])('rejects %s without side effects', async status => {
    const { storage, ride, notifications, groups, service, params } = await setup();
    if (status === 'forbidden') params.actorUserId = 99;
    if (status === 'ride_not_found') params.rideId = 'missing';
    if (status === 'ride_cancelled') await storage.updateRide(ride.id, { cancelled: true });
    if (status === 'ride_archived') await storage.updateRide(ride.id, { date: new Date('2000-01-01') });
    if (status === 'stale') await storage.setParticipation(ride.id, 'skipped', profile);
    expect(await service.declineParticipant(params)).toMatchObject({ status });
    expect(groups.removeParticipant).not.toHaveBeenCalled();
    for (const notification of Object.values(notifications)) expect(notification).not.toHaveBeenCalled();
  });

  it('leaves the current state untouched if it changes before the conditional write', async () => {
    const { storage, ride, notifications, groups, service, params } = await setup();
    const original = storage.setParticipationForRideMode.bind(storage);
    jest.spyOn(storage, 'setParticipationForRideMode').mockImplementation(async (...args) => {
      await storage.setParticipation(ride.id, 'thinking', profile);
      return original(...args);
    });
    expect(await service.declineParticipant(params)).toMatchObject({ status: 'stale' });
    expect(await storage.getParticipation(ride.id, 2)).toBe('thinking');
    expect(groups.removeParticipant).not.toHaveBeenCalled();
    expect(notifications.deleteApplicationNotifications).not.toHaveBeenCalled();
  });

  it('serializes a rejoin behind the decline group removal', async () => {
    const { storage, ride, groups, service, params } = await setup();
    let started, release;
    const entered = new Promise(resolve => { started = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    let member = true;
    groups.removeParticipant.mockImplementation(async () => { started(); await gate; member = false; });
    groups.addParticipant = async () => { member = true; };
    const decline = service.declineParticipant(params);
    await entered;
    const join = service.changeParticipation({ rideId: ride.id, participantProfile: profile, targetState: 'joined', api: {} });
    release();
    await Promise.all([decline, join]);
    expect(await storage.getParticipation(ride.id, 2)).toBe('joined');
    expect(member).toBe(true);
  });

  it('blocks a decline if archival starts between the service read and storage write', async () => {
    const { storage, ride, groups, service, params } = await setup();
    const original = storage.setParticipationForRideMode.bind(storage);
    jest.spyOn(storage, 'setParticipationForRideMode').mockImplementation(async (...args) => {
      await storage.updateRide(ride.id, { date: new Date('2000-01-01') });
      return original(...args);
    });
    expect(await service.declineParticipant(params)).toMatchObject({ status: 'ride_archived' });
    expect(await storage.getParticipation(ride.id, 2)).toBe('joined');
    expect(groups.removeParticipant).not.toHaveBeenCalled();
  });

});
