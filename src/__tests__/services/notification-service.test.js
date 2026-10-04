/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { NotificationService } from '../../services/NotificationService.js';
import { t } from '../../i18n/index.js';
import { MemoryStorage } from '../../storage/memory.js';
import { config } from '../../config.js';

const tr = (key, params = {}) =>
  t(config.i18n.defaultLanguage, key, params, { fallbackLanguage: config.i18n.fallbackLanguage });

describe('NotificationService', () => {
  let service;
  let mockApi;
  let mockSettingsService;
  const ride = {
    id: 'ride-1',
    title: 'Morning Ride',
    createdBy: 100,
    settings: {
      notifyParticipation: true
    }
  };
  const participant = {
    userId: 200,
    username: 'alice',
    firstName: 'Alice',
    lastName: 'Smith'
  };

  beforeEach(() => {
    jest.useFakeTimers();
    mockSettingsService = {
      getParticipationNotificationLevel: jest.fn().mockResolvedValue('all')
    };
    service = new NotificationService(mockSettingsService);
    mockApi = { sendMessage: jest.fn().mockResolvedValue({}) };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('sends an application immediately even when ordinary notifications are disabled', async () => {
    const silentRide = { ...ride, settings: { notifyParticipation: false, requireParticipationApproval: true } };

    await service.sendApplicationNotification(silentRide, participant, mockApi);

    expect(mockApi.sendMessage).toHaveBeenCalledWith(
      ride.createdBy,
      expect.stringContaining('Alice Smith'),
      expect.objectContaining({
        reply_markup: expect.objectContaining({ inline_keyboard: expect.any(Array) })
      })
    );
    expect(mockSettingsService.getParticipationNotificationLevel).not.toHaveBeenCalled();
  });

  it('keeps request tracking across service restarts and isolates other applicants', async () => {
    const storage = new MemoryStorage();
    const persisted = await storage.createRide(ride);
    const api = { sendMessage: jest.fn().mockResolvedValue({ message_id: 10 }), deleteMessage: jest.fn().mockResolvedValue(true) };
    await new NotificationService(mockSettingsService, storage).sendApplicationNotification(persisted, participant, api);
    await storage.addApplicationMessage(persisted.id, { userId: 300, chatId: 100, messageId: 11 });
    await new NotificationService(mockSettingsService, storage).deleteApplicationNotifications(await storage.getRide(persisted.id), 200, api);
    expect(api.deleteMessage).toHaveBeenCalledWith(100, 10);
    expect((await storage.getRide(persisted.id)).applicationMessages).toEqual([{ userId: 300, chatId: 100, messageId: 11 }]);
  });

  it('retains tracking when Telegram deletion fails without failing participation', async () => {
    const storage = new MemoryStorage();
    const persisted = await storage.createRide(ride);
    const message = { userId: 200, chatId: 100, messageId: 10 };
    await storage.addApplicationMessage(persisted.id, message);
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await new NotificationService(mockSettingsService, storage).deleteApplicationNotifications(await storage.getRide(persisted.id), 200, {
        deleteMessage: jest.fn().mockRejectedValue(new Error('Telegram unavailable'))
      });
      expect((await storage.getRide(persisted.id)).applicationMessages).toEqual([message]);
    } finally {
      log.mockRestore();
    }
  });

  it('notifies an excluded participant immediately regardless of notification settings and escapes the title', async () => {
    const silentRide = { ...ride, title: 'Ride <&>', settings: { notifyParticipation: false } };
    mockSettingsService.getParticipationNotificationLevel.mockResolvedValue('off');
    await service.sendParticipationCancelledNotification(silentRide, participant.userId, mockApi);
    expect(mockApi.sendMessage).toHaveBeenCalledWith(participant.userId,
      tr('commands.notifications.participationCancelled', { title: 'Ride &lt;&amp;&gt;', rideId: ride.id }),
      { parse_mode: 'HTML' });
    expect(mockSettingsService.getParticipationNotificationLevel).not.toHaveBeenCalled();
  });

  it('cancels a pending creator notification when participation is cancelled by the creator', async () => {
    service.scheduleParticipationNotification(ride, participant, null, 'joined', mockApi);
    await service.sendParticipationCancelledNotification(ride, participant.userId, mockApi);
    await jest.runAllTimersAsync();
    expect(mockApi.sendMessage).toHaveBeenCalledTimes(1);
    expect(mockApi.sendMessage.mock.calls[0][0]).toBe(participant.userId);
  });

  it('ignores a failure to deliver the cancellation notification', async () => {
    mockApi.sendMessage.mockRejectedValue({ error_code: 403, description: 'Bot blocked' });
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(service.sendParticipationCancelledNotification(ride, participant.userId, mockApi)).resolves.toBeUndefined();
    } finally {
      log.mockRestore();
    }
  });

  it('sends application decisions directly to the applicant', async () => {
    await service.sendApplicationDecisionNotification(ride, participant.userId, 'accepted', mockApi);

    expect(mockApi.sendMessage).toHaveBeenCalledWith(
      participant.userId,
      expect.stringContaining(ride.title),
      { parse_mode: 'HTML' }
    );
  });

  it('cancels a pending ordinary notification when a new application is sent', async () => {
    service.scheduleParticipationNotification(ride, participant, 'joined', 'skipped', mockApi);

    await service.sendApplicationNotification(ride, participant, mockApi);
    await jest.runAllTimersAsync();

    expect(mockApi.sendMessage).toHaveBeenCalledTimes(1);
    expect(mockApi.sendMessage.mock.calls[0][0]).toBe(ride.createdBy);
    expect(mockApi.sendMessage.mock.calls[0][2]).toHaveProperty('reply_markup');
  });

  describe('scheduleParticipationNotification', () => {
    it('sends notification after 20s', async () => {
      service.scheduleParticipationNotification(ride, participant, null, 'joined', mockApi);
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
      service.scheduleParticipationNotification(ride, participant, null, 'joined', mockApi);
      service.scheduleParticipationNotification(ride, participant, 'joined', 'thinking', mockApi);
      service.scheduleParticipationNotification(ride, participant, 'thinking', 'skipped', mockApi);

      await jest.runAllTimersAsync();

      expect(mockApi.sendMessage).toHaveBeenCalledTimes(1);
      const sentText = mockApi.sendMessage.mock.calls[0][1];
      // The final state was 'skipped' — the message should use the skipped template
      const expectedText = tr('commands.notifications.skipped', {
        name: 'Alice Smith (@alice)',
        title: ride.title,
        rideId: ride.id
      });
      expect(sentText).toBe(expectedText);
    });

    it('does not send when notifyParticipation is false', async () => {
      const silentRide = {
        ...ride,
        settings: {
          notifyParticipation: false
        }
      };
      service.scheduleParticipationNotification(silentRide, participant, null, 'joined', mockApi);

      await jest.runAllTimersAsync();

      expect(mockApi.sendMessage).not.toHaveBeenCalled();
    });

    it('does not send when participant is the ride creator', async () => {
      const creatorParticipant = { ...participant, userId: ride.createdBy };
      service.scheduleParticipationNotification(ride, creatorParticipant, null, 'joined', mockApi);

      await jest.runAllTimersAsync();

      expect(mockApi.sendMessage).not.toHaveBeenCalled();
    });

    it('sends independently for two different participants', async () => {
      const bob = { userId: 300, username: 'bob', firstName: 'Bob', lastName: '' };
      service.scheduleParticipationNotification(ride, participant, null, 'joined', mockApi);
      service.scheduleParticipationNotification(ride, bob, null, 'thinking', mockApi);

      await jest.runAllTimersAsync();

      expect(mockApi.sendMessage).toHaveBeenCalledTimes(2);
    });

    it('uses correct message template for each state', async () => {
      for (const state of ['joined', 'thinking', 'skipped']) {
        service = new NotificationService(mockSettingsService);
        service.scheduleParticipationNotification(ride, participant, null, state, mockApi);
        await jest.runAllTimersAsync();

        const sentText = mockApi.sendMessage.mock.calls[mockApi.sendMessage.mock.calls.length - 1][1];
        const expectedText = tr(`commands.notifications.${state}`, {
          name: 'Alice Smith (@alice)',
          title: ride.title,
          rideId: ride.id
        });
        expect(sentText).toBe(expectedText);
      }
    });

    it('handles API failure gracefully — logs error, does not throw', async () => {
      const apiError = new Error('Telegram error');
      mockApi.sendMessage.mockRejectedValueOnce(apiError);
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      service.scheduleParticipationNotification(ride, participant, null, 'joined', mockApi);
      await jest.runAllTimersAsync();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('NotificationService'),
        apiError
      );
      consoleErrorSpy.mockRestore();
    });

    it.each([
      [null, 'thinking'],
      [null, 'skipped'],
      ['thinking', 'skipped'],
      ['skipped', 'thinking']
    ])('suppresses non-membership transition %s -> %s in membership mode', async (previousState, targetState) => {
      mockSettingsService.getParticipationNotificationLevel.mockResolvedValue('membership');
      service.scheduleParticipationNotification(ride, participant, previousState, targetState, mockApi);

      await jest.runAllTimersAsync();

      expect(mockApi.sendMessage).not.toHaveBeenCalled();
    });

    it.each([
      [null, 'joined'],
      ['thinking', 'joined'],
      ['skipped', 'joined'],
      ['joined', 'thinking'],
      ['joined', 'skipped']
    ])('sends membership transition %s -> %s', async (previousState, targetState) => {
      mockSettingsService.getParticipationNotificationLevel.mockResolvedValue('membership');
      service.scheduleParticipationNotification(ride, participant, previousState, targetState, mockApi);

      await jest.runAllTimersAsync();

      expect(mockApi.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('uses the first previous state and suppresses a round trip', async () => {
      mockSettingsService.getParticipationNotificationLevel.mockResolvedValue('all');
      service.scheduleParticipationNotification(ride, participant, 'joined', 'thinking', mockApi);
      service.scheduleParticipationNotification(ride, participant, 'thinking', 'joined', mockApi);

      await jest.runAllTimersAsync();

      expect(mockApi.sendMessage).not.toHaveBeenCalled();
    });

    it('reads the current preference when the timer fires', async () => {
      mockSettingsService.getParticipationNotificationLevel.mockResolvedValue('membership');
      service.scheduleParticipationNotification(ride, participant, null, 'thinking', mockApi);
      mockSettingsService.getParticipationNotificationLevel.mockResolvedValue('all');

      await jest.runAllTimersAsync();

      expect(mockApi.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('falls back to all when preference lookup fails', async () => {
      const error = new Error('storage unavailable');
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockSettingsService.getParticipationNotificationLevel.mockRejectedValue(error);
      service.scheduleParticipationNotification(ride, participant, null, 'thinking', mockApi);

      await jest.runAllTimersAsync();

      expect(mockApi.sendMessage).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('failed to read'), error);
      consoleErrorSpy.mockRestore();
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
