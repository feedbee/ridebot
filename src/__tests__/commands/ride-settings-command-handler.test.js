/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { RideSettingsCommandHandler } from '../../commands/RideSettingsCommandHandler.js';
import { t } from '../../i18n/index.js';

describe.each(['en', 'ru'])('RideSettingsCommandHandler (%s)', (language) => {
  let handler;
  let mockRideService;
  let mockSettingsService;
  let mockMessageFormatter;
  let mockRideMessagesService;
  let mockCtx;

  const tr = (key, params = {}) => t(language, key, params, { fallbackLanguage: 'en' });

  beforeEach(() => {
    mockRideService = {
      getRide: jest.fn(),
      updateRide: jest.fn()
    };

    mockSettingsService = {
      getUserRideDefaults: jest.fn().mockResolvedValue({ notifyParticipation: true, allowReposts: false }),
      getParticipationNotificationLevel: jest.fn().mockResolvedValue('all'),
      updateParticipationNotificationLevel: jest.fn().mockResolvedValue({}),
      updateUserRideDefaults: jest.fn().mockResolvedValue({
        settings: {
          rideDefaults: {
            notifyParticipation: false,
            allowReposts: false
          }
        }
      })
    };

    mockMessageFormatter = {};
    mockRideMessagesService = {
      extractRideId: jest.fn()
    };

    mockCtx = {
      match: ['rideowner:settings:123', '123'],
      message: { text: '/settings' },
      lang: language,
      from: { id: 123, username: 'user123', first_name: 'User', last_name: 'One' },
      reply: jest.fn().mockResolvedValue({}),
      replyWithRichMessage: jest.fn().mockResolvedValue({}),
      answerCallbackQuery: jest.fn().mockResolvedValue({}),
      deleteMessage: jest.fn().mockResolvedValue({}),
      editMessageText: jest.fn().mockResolvedValue({})
    };

    handler = new RideSettingsCommandHandler(
      mockRideService,
      mockMessageFormatter,
      mockRideMessagesService,
      mockSettingsService
    );
  });

  describe('handle', () => {
    it('renders the user defaults screen for plain /settings', async () => {
      await handler.handle(mockCtx);

      expect(mockSettingsService.getUserRideDefaults).toHaveBeenCalledWith(123);
      expect(mockCtx.replyWithRichMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining(`<h3>${tr('commands.settings.userTitle')}</h3>`)
        }),
        expect.objectContaining({
          reply_markup: expect.any(Object)
        })
      );
      const richHtml = mockCtx.replyWithRichMessage.mock.calls[0][0].html;
      expect(richHtml.match(/<table bordered striped compact>/g)).toHaveLength(2);
      expect(richHtml).toContain(`<td>${tr('commands.settings.allowRepostsLabel')}</td>`);
      expect(richHtml).toContain(`<td><b>${tr('common.yes')}</b></td>`);
      expect(richHtml).toContain(`<td><b>${tr('common.no')}</b></td>`);
      expect(richHtml).toContain(tr('commands.settings.notificationPreferencesTitle'));
      expect(richHtml).toContain(
        `<td><b>${tr('commands.settings.notificationLevel.all')}</b></td>`
      );
      expect(richHtml).not.toContain('<tg-button');
      expect(richHtml).toContain('<code>/shareride</code>');
      const keyboard = mockCtx.replyWithRichMessage.mock.calls[0][1].reply_markup.inline_keyboard;
      expect(keyboard.at(-1)).toEqual([{
        text: tr('buttons.close'),
        callback_data: 'settings:close'
      }]);
    });

    it('renders ride settings for /settings #rideId when the user is the creator', async () => {
      const mongoRideId = '69ee04380b928bcfcbb112a0';
      mockCtx.message = { text: `/settings #${mongoRideId}` };
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: mongoRideId, error: null });
      mockRideService.getRide.mockResolvedValue({
        id: mongoRideId,
        title: 'Morning Ride',
        createdBy: 123,
        settings: { notifyParticipation: true, allowReposts: false }
      });

      await handler.handle(mockCtx);

      expect(mockCtx.replyWithRichMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining(`<h3>${tr('commands.settings.rideTitle')}</h3>`)
        }),
        expect.objectContaining({
          reply_markup: expect.any(Object)
        })
      );
      expect(mockSettingsService.getUserRideDefaults).not.toHaveBeenCalled();
      const [richMessage, options] = mockCtx.replyWithRichMessage.mock.calls[0];
      expect(richMessage.html).toContain('<table bordered striped compact>');
      expect(richMessage.html).toContain('Morning Ride');
      expect(richMessage.html).toContain(`<td><b>${tr('common.yes')}</b></td>`);
      expect(richMessage.html).toContain(`<td><b>${tr('common.no')}</b></td>`);
      expect(richMessage.html).toContain(`<td>${tr('commands.settings.allowRepostsLabel')}</td>`);
      expect(richMessage.html).not.toContain(tr('commands.settings.notificationPreferencesTitle'));
      expect(richMessage.html).not.toContain('<tg-button');
      const callbackData = options.reply_markup.inline_keyboard[0][0].callback_data;
      expect(callbackData).toBe(`settings:ride:bool:np:off:${mongoRideId}`);
      expect(options.reply_markup.inline_keyboard[1][0].callback_data).toBe(`settings:ride:bool:repost:on:${mongoRideId}`);
      expect(options.reply_markup.inline_keyboard.at(-1)).toEqual([{
        text: tr('buttons.close'),
        callback_data: 'settings:close'
      }]);
      expect(Buffer.byteLength(callbackData, 'utf8')).toBeLessThanOrEqual(64);
    });

    it('escapes a user-provided ride title in Rich HTML', async () => {
      mockCtx.message = { text: '/settings #abc123' };
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: 'abc123', error: null });
      mockRideService.getRide.mockResolvedValue({
        id: 'abc123',
        title: '<b>Untrusted & Ride</b>',
        createdBy: 123,
        settings: { notifyParticipation: true, allowReposts: false }
      });

      await handler.handle(mockCtx);

      const richHtml = mockCtx.replyWithRichMessage.mock.calls[0][0].html;
      expect(richHtml).toContain('&lt;b&gt;Untrusted &amp; Ride&lt;/b&gt;');
      expect(richHtml).not.toContain('<b>Untrusted & Ride</b>');
    });

    it('renders ride settings for /settings when replying to a ride message', async () => {
      mockCtx.message = {
        text: '/settings',
        reply_to_message: { text: 'Ride message' }
      };
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: 'abc123', error: null });
      mockRideService.getRide.mockResolvedValue({
        id: 'abc123',
        title: 'Morning Ride',
        createdBy: 123,
        settings: { notifyParticipation: true, allowReposts: false }
      });

      await handler.handle(mockCtx);

      expect(mockRideMessagesService.extractRideId).toHaveBeenCalledWith(
        mockCtx.message,
        { language }
      );
      expect(mockCtx.replyWithRichMessage).toHaveBeenCalledWith(
        expect.objectContaining({ html: expect.stringContaining(tr('commands.settings.rideTitle')) }),
        expect.objectContaining({ reply_markup: expect.any(Object) })
      );
    });

    it('returns the creator-only error for ride-scoped command usage by another user', async () => {
      mockCtx.message = { text: '/settings #abc123' };
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: 'abc123', error: null });
      mockRideService.getRide.mockResolvedValue({
        id: 'abc123',
        title: 'Morning Ride',
        createdBy: 999,
        settings: { notifyParticipation: true, allowReposts: false }
      });

      await handler.handle(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        tr('commands.common.onlyCreatorAction')
      );
    });
  });

  describe('handleUserNotificationLevelCallback', () => {
    it('persists membership level and marks it in the redrawn keyboard', async () => {
      mockCtx.match = ['settings:user:notification-level:membership', 'membership'];

      await handler.handleUserNotificationLevelCallback(mockCtx);

      expect(mockSettingsService.updateParticipationNotificationLevel).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 123 }),
        'membership'
      );
      const keyboard = mockCtx.editMessageText.mock.calls[0][1].reply_markup.inline_keyboard;
      expect(keyboard[3][0].text).toContain('✓');
      expect(keyboard[3][0].callback_data).toBe('settings:user:notification-level:membership');
    });

    it('rejects an unknown level without persistence', async () => {
      mockCtx.match = ['settings:user:notification-level:nope', 'nope'];

      await handler.handleUserNotificationLevelCallback(mockCtx);

      expect(mockSettingsService.updateParticipationNotificationLevel).not.toHaveBeenCalled();
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith(tr('errors.generic'));
    });
  });

  describe('handleUserBooleanCallback', () => {
    it('sets the user default from callback data and updates the settings message', async () => {
      mockCtx.match = ['settings:user:bool:np:off', 'np', 'off'];

      await handler.handleUserBooleanCallback(mockCtx);

      expect(mockSettingsService.getUserRideDefaults).toHaveBeenCalledWith(123);
      expect(mockSettingsService.updateUserRideDefaults).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 123,
          username: 'user123',
          firstName: 'User',
          lastName: 'One'
        }),
        { notifyParticipation: false }
      );
      expect(mockCtx.editMessageText).toHaveBeenCalledWith(
        expect.objectContaining({ html: expect.stringContaining(tr('commands.settings.userTitle')) }),
        expect.objectContaining({ reply_markup: expect.any(Object) })
      );
      expect(mockCtx.editMessageText.mock.calls[0][0].html).toContain(
        `<td><b>${tr('common.no')}</b></td>`
      );
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith(
        tr('commands.settings.updated')
      );
    });

    it('treats setting an already-current user default as a successful no-op', async () => {
      mockCtx.match = ['settings:user:bool:np:on', 'np', 'on'];

      await handler.handleUserBooleanCallback(mockCtx);

      expect(mockSettingsService.updateUserRideDefaults).not.toHaveBeenCalled();
      expect(mockCtx.editMessageText).toHaveBeenCalledWith(
        expect.objectContaining({ html: expect.stringContaining(tr('commands.settings.userTitle')) }),
        expect.objectContaining({ reply_markup: expect.any(Object) })
      );
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith(
        tr('commands.settings.updated')
      );
    });

    it('ignores Telegram not-modified errors for stale user settings callbacks', async () => {
      mockCtx.match = ['settings:user:bool:np:on', 'np', 'on'];
      mockCtx.editMessageText.mockRejectedValue({
        error_code: 400,
        description: 'Bad Request: message is not modified'
      });

      await handler.handleUserBooleanCallback(mockCtx);

      expect(mockSettingsService.updateUserRideDefaults).not.toHaveBeenCalled();
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith(
        tr('commands.settings.updated')
      );
    });

    it('sets the user repost default from callback data and updates the settings message', async () => {
      mockCtx.match = ['settings:user:bool:repost:on', 'repost', 'on'];
      mockSettingsService.updateUserRideDefaults.mockResolvedValue({
        settings: {
          rideDefaults: {
            notifyParticipation: true,
            allowReposts: true
          }
        }
      });

      await handler.handleUserBooleanCallback(mockCtx);

      expect(mockSettingsService.updateUserRideDefaults).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 123 }),
        { allowReposts: true }
      );
      expect(mockCtx.editMessageText).toHaveBeenCalledWith(
        expect.objectContaining({ html: expect.stringContaining(tr('commands.settings.allowRepostsLabel')) }),
        expect.objectContaining({ reply_markup: expect.any(Object) })
      );
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith(
        tr('commands.settings.updated')
      );
    });

    it('answers with a generic error for unknown user setting callback keys', async () => {
      mockCtx.match = ['settings:user:bool:unknown:on', 'unknown', 'on'];

      await handler.handleUserBooleanCallback(mockCtx);

      expect(mockSettingsService.getUserRideDefaults).not.toHaveBeenCalled();
      expect(mockSettingsService.updateUserRideDefaults).not.toHaveBeenCalled();
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith(tr('errors.generic'));
    });
  });

  describe('handleCallback', () => {
    it('opens ride settings for the ride creator from the owner button', async () => {
      mockRideService.getRide.mockResolvedValue({
        id: '123',
        title: 'Morning Ride',
        createdBy: 123,
        settings: { notifyParticipation: true, allowReposts: false }
      });

      await handler.handleCallback(mockCtx);

      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith();
      expect(mockCtx.replyWithRichMessage).toHaveBeenCalledWith(
        expect.objectContaining({ html: expect.stringContaining(tr('commands.settings.rideTitle')) }),
        expect.objectContaining({ reply_markup: expect.any(Object) })
      );
    });

    it('returns the creator-only error popup for non-creators', async () => {
      mockRideService.getRide.mockResolvedValue({ id: '123', createdBy: 999 });

      await handler.handleCallback(mockCtx);

      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith(
        tr('commands.common.onlyCreatorAction')
      );
    });

    it('propagates callback delivery errors to the callback boundary', async () => {
      mockRideService.getRide.mockResolvedValue({
        id: '123',
        title: 'Morning Ride',
        createdBy: 123,
        settings: { notifyParticipation: true, allowReposts: false }
      });
      mockCtx.replyWithRichMessage.mockRejectedValue(new Error('Reply send failed'));

      await expect(handler.handleCallback(mockCtx)).rejects.toThrow('Reply send failed');
    });
  });

  describe('handleClose', () => {
    it('acknowledges the callback and deletes the settings message', async () => {
      await handler.handleClose(mockCtx);

      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith();
      expect(mockCtx.deleteMessage).toHaveBeenCalledWith();
    });
  });

  describe('handleRideBooleanCallback', () => {
    it('sets ride settings from callback data and updates the ride settings message', async () => {
      mockCtx.match = ['settings:ride:bool:np:off:123', 'np', 'off', '123'];
      mockRideService.getRide.mockResolvedValue({
        id: '123',
        title: 'Morning Ride',
        createdBy: 123,
        settings: { notifyParticipation: true, allowReposts: false }
      });
      mockRideService.updateRide.mockResolvedValue({
        id: '123',
        title: 'Morning Ride',
        createdBy: 123,
        settings: { notifyParticipation: false, allowReposts: false }
      });

      await handler.handleRideBooleanCallback(mockCtx);

      expect(mockRideService.updateRide).toHaveBeenCalledWith(
        '123',
        {
          settings: {
            notifyParticipation: false
          }
        },
        123
      );
      expect(mockCtx.editMessageText).toHaveBeenCalledWith(
        expect.objectContaining({ html: expect.stringContaining(tr('commands.settings.rideTitle')) }),
        expect.objectContaining({ reply_markup: expect.any(Object) })
      );
      expect(mockCtx.editMessageText.mock.calls[0][0].html).toContain(
        `<td><b>${tr('common.no')}</b></td>`
      );
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith(
        tr('commands.settings.rideUpdated')
      );
    });

    it('sets ride repost settings from callback data and updates the ride settings message', async () => {
      mockCtx.match = ['settings:ride:bool:repost:on:123', 'repost', 'on', '123'];
      mockRideService.getRide.mockResolvedValue({
        id: '123',
        title: 'Morning Ride',
        createdBy: 123,
        settings: { notifyParticipation: true, allowReposts: false }
      });
      mockRideService.updateRide.mockResolvedValue({
        id: '123',
        title: 'Morning Ride',
        createdBy: 123,
        settings: { notifyParticipation: true, allowReposts: true }
      });

      await handler.handleRideBooleanCallback(mockCtx);

      expect(mockRideService.updateRide).toHaveBeenCalledWith(
        '123',
        {
          settings: {
            allowReposts: true
          }
        },
        123
      );
      expect(mockCtx.editMessageText).toHaveBeenCalledWith(
        expect.objectContaining({ html: expect.stringContaining(tr('commands.settings.allowRepostsLabel')) }),
        expect.objectContaining({ reply_markup: expect.any(Object) })
      );
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith(
        tr('commands.settings.rideUpdated')
      );
    });

    it('treats setting an already-current ride setting as a successful no-op', async () => {
      mockCtx.match = ['settings:ride:bool:np:on:123', 'np', 'on', '123'];
      mockRideService.getRide.mockResolvedValue({
        id: '123',
        title: 'Morning Ride',
        createdBy: 123,
        settings: { notifyParticipation: true, allowReposts: false }
      });

      await handler.handleRideBooleanCallback(mockCtx);

      expect(mockRideService.updateRide).not.toHaveBeenCalled();
      expect(mockCtx.editMessageText).toHaveBeenCalledWith(
        expect.objectContaining({ html: expect.stringContaining(tr('commands.settings.rideTitle')) }),
        expect.objectContaining({ reply_markup: expect.any(Object) })
      );
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith(
        tr('commands.settings.rideUpdated')
      );
    });

    it('ignores Telegram not-modified errors for stale ride settings callbacks', async () => {
      mockCtx.match = ['settings:ride:bool:np:on:123', 'np', 'on', '123'];
      mockRideService.getRide.mockResolvedValue({
        id: '123',
        title: 'Morning Ride',
        createdBy: 123,
        settings: { notifyParticipation: true, allowReposts: false }
      });
      mockCtx.editMessageText.mockRejectedValue({
        error_code: 400,
        description: 'Bad Request: message is not modified'
      });

      await handler.handleRideBooleanCallback(mockCtx);

      expect(mockRideService.updateRide).not.toHaveBeenCalled();
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith(
        tr('commands.settings.rideUpdated')
      );
    });

    it('returns the creator-only error for ride settings toggles by another user', async () => {
      mockCtx.match = ['settings:ride:bool:np:off:123', 'np', 'off', '123'];
      mockRideService.getRide.mockResolvedValue({ id: '123', createdBy: 999 });

      await handler.handleRideBooleanCallback(mockCtx);

      expect(mockRideService.updateRide).not.toHaveBeenCalled();
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith(
        tr('commands.common.onlyCreatorAction')
      );
    });

    it('answers with a generic error for unknown ride setting callback keys', async () => {
      mockCtx.match = ['settings:ride:bool:unknown:on:123', 'unknown', 'on', '123'];

      await handler.handleRideBooleanCallback(mockCtx);

      expect(mockRideService.getRide).not.toHaveBeenCalled();
      expect(mockRideService.updateRide).not.toHaveBeenCalled();
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith(tr('errors.generic'));
    });
  });
});
