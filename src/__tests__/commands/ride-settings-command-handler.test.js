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
      answerCallbackQuery: jest.fn().mockResolvedValue({}),
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
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining(tr('commands.settings.userTitle')),
        expect.objectContaining({
          parse_mode: 'HTML',
          reply_markup: expect.any(Object)
        })
      );
      expect(mockCtx.reply.mock.calls[0][0]).toContain(tr('commands.settings.allowRepostsLabel'));
      expect(mockCtx.reply.mock.calls[0][0]).toContain('<code>/shareride</code>');
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

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining(tr('commands.settings.rideTitle')),
        expect.objectContaining({
          parse_mode: 'HTML',
          reply_markup: expect.any(Object)
        })
      );
      expect(mockSettingsService.getUserRideDefaults).not.toHaveBeenCalled();
      const [, options] = mockCtx.reply.mock.calls[0];
      const callbackData = options.reply_markup.inline_keyboard[0][0].callback_data;
      expect(callbackData).toBe(`settings:ride:bool:np:off:${mongoRideId}`);
      expect(options.reply_markup.inline_keyboard[1][0].callback_data).toBe(`settings:ride:bool:repost:on:${mongoRideId}`);
      expect(Buffer.byteLength(callbackData, 'utf8')).toBeLessThanOrEqual(64);
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
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining(tr('commands.settings.rideTitle')),
        expect.objectContaining({
          parse_mode: 'HTML',
          reply_markup: expect.any(Object)
        })
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
        expect.stringContaining(tr('commands.settings.userTitle')),
        expect.objectContaining({
          parse_mode: 'HTML',
          reply_markup: expect.any(Object)
        })
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
        expect.stringContaining(tr('commands.settings.userTitle')),
        expect.objectContaining({
          parse_mode: 'HTML',
          reply_markup: expect.any(Object)
        })
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
        expect.stringContaining(tr('commands.settings.allowRepostsLabel')),
        expect.objectContaining({
          parse_mode: 'HTML',
          reply_markup: expect.any(Object)
        })
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
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining(tr('commands.settings.rideTitle')),
        expect.objectContaining({
          parse_mode: 'HTML',
          reply_markup: expect.any(Object)
        })
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
      mockCtx.reply.mockRejectedValue(new Error('Reply send failed'));

      await expect(handler.handleCallback(mockCtx)).rejects.toThrow('Reply send failed');
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
        expect.stringContaining(tr('commands.settings.rideTitle')),
        expect.objectContaining({
          parse_mode: 'HTML',
          reply_markup: expect.any(Object)
        })
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
        expect.stringContaining(tr('commands.settings.allowRepostsLabel')),
        expect.objectContaining({
          parse_mode: 'HTML',
          reply_markup: expect.any(Object)
        })
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
        expect.stringContaining(tr('commands.settings.rideTitle')),
        expect.objectContaining({
          parse_mode: 'HTML',
          reply_markup: expect.any(Object)
        })
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
