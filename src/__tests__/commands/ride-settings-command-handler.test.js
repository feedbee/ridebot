/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { RideSettingsCommandHandler } from '../../commands/RideSettingsCommandHandler.js';
import { t } from '../../i18n/index.js';

describe.each(['en', 'ru'])('RideSettingsCommandHandler (%s)', (language) => {
  let handler;
  let mockRideService;
  let mockMessageFormatter;
  let mockRideMessagesService;
  let mockCtx;

  const tr = (key, params = {}) => t(language, key, params, { fallbackLanguage: 'en' });

  beforeEach(() => {
    mockRideService = {
      getRide: jest.fn()
    };

    mockMessageFormatter = {};
    mockRideMessagesService = {
      extractRideId: jest.fn()
    };

    mockCtx = {
      match: ['rideowner:settings:123', '123'],
      lang: language,
      from: { id: 123 },
      answerCallbackQuery: jest.fn().mockResolvedValue({})
    };

    handler = new RideSettingsCommandHandler(
      mockRideService,
      mockMessageFormatter,
      mockRideMessagesService
    );
  });

  describe('handleCallback', () => {
    it('returns the coming soon popup for the ride creator', async () => {
      mockRideService.getRide.mockResolvedValue({ id: '123', createdBy: 123 });

      await handler.handleCallback(mockCtx);

      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith(
        tr('commands.ownerActions.settingsComingSoon')
      );
    });

    it('propagates callback delivery errors to the callback boundary', async () => {
      mockRideService.getRide.mockResolvedValue({ id: '123', createdBy: 123 });
      mockCtx.answerCallbackQuery.mockRejectedValue(new Error('Callback send failed'));

      await expect(handler.handleCallback(mockCtx)).rejects.toThrow('Callback send failed');
    });
  });
});
