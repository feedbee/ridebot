/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { NotificationService } from '../../services/NotificationService.js';
import { t } from '../../i18n/index.js';
import { config } from '../../config.js';

const tr = (key, params = {}) =>
  t(config.i18n.defaultLanguage, key, params, { fallbackLanguage: config.i18n.fallbackLanguage });

describe('NotificationService', () => {
  let service;
  let mockApi;
  const ride = {
    id: 'ride-1',
    title: 'Morning Ride',
    createdBy: 100,
    notifyOnParticipation: true
  };
  const participant = {
    userId: 200,
    username: 'alice',
    firstName: 'Alice',
    lastName: 'Smith'
  };

  beforeEach(() => {
    jest.useFakeTimers();
    service = new NotificationService();
    mockApi = { sendMessage: jest.fn().mockResolvedValue({}) };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('scheduleParticipationNotification', () => {
    it('sends notification after 30s', async () => {
      service.scheduleParticipationNotification(ride, participant, 'joined', mockApi);
      expect(mockApi.sendMessage).not.toHaveBeenCalled();

      await jest.runAllTimersAsync();

      expect(mockApi.sendMessage).toHaveBeenCalledTimes(1);
      expect(mockApi.sendMessage).toHaveBeenCalledWith(
        ride.createdBy,
        expect.stringContaining(ride.title),
        { parse_mode: 'HTML' }
      );
    });

    it('debounces rapid state changes — only final state fires', async () => {
      service.scheduleParticipationNotification(ride, participant, 'joined', mockApi);
      service.scheduleParticipationNotification(ride, participant, 'thinking', mockApi);
      service.scheduleParticipationNotification(ride, participant, 'skipped', mockApi);

      await jest.runAllTimersAsync();

      expect(mockApi.sendMessage).toHaveBeenCalledTimes(1);
      const sentText = mockApi.sendMessage.mock.calls[0][1];
      // The final state was 'skipped' — the message should use the skipped template
      const expectedText = tr('commands.notifications.skipped', {
        name: 'Alice Smith (@alice)',
        title: ride.title
      });
      expect(sentText).toBe(expectedText);
    });

    it('does not send when notifyOnParticipation is false', async () => {
      const silentRide = { ...ride, notifyOnParticipation: false };
      service.scheduleParticipationNotification(silentRide, participant, 'joined', mockApi);

      await jest.runAllTimersAsync();

      expect(mockApi.sendMessage).not.toHaveBeenCalled();
    });

    it('does not send when participant is the ride creator', async () => {
      const creatorParticipant = { ...participant, userId: ride.createdBy };
      service.scheduleParticipationNotification(ride, creatorParticipant, 'joined', mockApi);

      await jest.runAllTimersAsync();

      expect(mockApi.sendMessage).not.toHaveBeenCalled();
    });

    it('sends independently for two different participants', async () => {
      const bob = { userId: 300, username: 'bob', firstName: 'Bob', lastName: '' };
      service.scheduleParticipationNotification(ride, participant, 'joined', mockApi);
      service.scheduleParticipationNotification(ride, bob, 'thinking', mockApi);

      await jest.runAllTimersAsync();

      expect(mockApi.sendMessage).toHaveBeenCalledTimes(2);
    });

    it('uses correct message template for each state', async () => {
      for (const state of ['joined', 'thinking', 'skipped']) {
        service = new NotificationService();
        service.scheduleParticipationNotification(ride, participant, state, mockApi);
        await jest.runAllTimersAsync();

        const sentText = mockApi.sendMessage.mock.calls[mockApi.sendMessage.mock.calls.length - 1][1];
        const expectedText = tr(`commands.notifications.${state}`, {
          name: 'Alice Smith (@alice)',
          title: ride.title
        });
        expect(sentText).toBe(expectedText);
      }
    });

    it('handles API failure gracefully — logs error, does not throw', async () => {
      const apiError = new Error('Telegram error');
      mockApi.sendMessage.mockRejectedValueOnce(apiError);
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      service.scheduleParticipationNotification(ride, participant, 'joined', mockApi);
      await jest.runAllTimersAsync();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('NotificationService'),
        apiError
      );
      consoleErrorSpy.mockRestore();
    });

    it('defaults notifyOnParticipation to true when undefined', async () => {
      const rideWithoutFlag = { ...ride };
      delete rideWithoutFlag.notifyOnParticipation;
      service.scheduleParticipationNotification(rideWithoutFlag, participant, 'joined', mockApi);

      await jest.runAllTimersAsync();

      expect(mockApi.sendMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe('_formatName', () => {
    it('formats full name with username', () => {
      expect(service._formatName({ firstName: 'Alice', lastName: 'Smith', username: 'alice' }))
        .toBe('Alice Smith (@alice)');
    });

    it('formats just first name with username', () => {
      expect(service._formatName({ firstName: 'Alice', username: 'alice' }))
        .toBe('Alice (@alice)');
    });

    it('formats username-only as "username (@username)"', () => {
      expect(service._formatName({ username: 'alice' }))
        .toBe('alice (@alice)');
    });

    it('falls back to "Someone" when no name data', () => {
      expect(service._formatName({})).toBe('Someone');
    });
  });
});
