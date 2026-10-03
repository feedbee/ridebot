/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { RideParticipationService } from '../../services/RideParticipationService.js';
import { UserProfile } from '../../models/UserProfile.js';

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
});
