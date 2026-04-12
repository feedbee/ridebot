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
      setParticipation: jest.fn()
    };
    mockNotificationService = {
      scheduleParticipationNotification: jest.fn()
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
    expect(mockRideService.setParticipation).not.toHaveBeenCalled();
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
    expect(mockRideService.setParticipation).not.toHaveBeenCalled();
  });

  it('returns already_in_state when participation does not change', async () => {
    mockRideService.getRide.mockResolvedValue(ride);
    mockRideService.setParticipation.mockResolvedValue({ success: false, ride: null });

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
    mockRideService.setParticipation.mockResolvedValue({
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
    mockRideService.setParticipation.mockResolvedValue({
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
    mockRideService.setParticipation.mockResolvedValue({
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
});
