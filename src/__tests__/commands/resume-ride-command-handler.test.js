/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { ResumeRideCommandHandler } from '../../commands/ResumeRideCommandHandler.js';
import { t } from '../../i18n/index.js';

describe.each(['en', 'ru'])('ResumeRideCommandHandler (%s)', (language) => {
  let handler;
  let mockRideService;
  let mockMessageFormatter;
  let mockRideMessagesService;
  let mockCtx;
  const tr = (key, params = {}) => t(language, key, params, { fallbackLanguage: 'en' });

  beforeEach(() => {
    mockRideService = {
      getRide: jest.fn(),
      resumeRide: jest.fn()
    };

    mockRideMessagesService = {
      extractRideId: jest.fn(),
      updateRideMessages: jest.fn()
    };

    mockMessageFormatter = {};

    mockCtx = {
      reply: jest.fn().mockResolvedValue({}),
      lang: language,
      from: { id: 123 },
      message: { text: '/resumeride 456' }
    };

    handler = new ResumeRideCommandHandler(mockRideService, mockMessageFormatter, mockRideMessagesService);
  });

  describe('handle', () => {
    it('replies with extraction error', async () => {
      mockRideMessagesService.extractRideId.mockReturnValue({
        rideId: null,
        error: tr('services.rideMessages.provideRideIdAfterCommand', { commandName: 'resumeride' })
      });

      await handler.handle(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        tr('services.rideMessages.provideRideIdAfterCommand', { commandName: 'resumeride' })
      );
      expect(mockRideService.resumeRide).not.toHaveBeenCalled();
    });

    it('blocks non-creator from resuming', async () => {
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: '456', error: null });
      mockRideService.getRide.mockResolvedValue({ id: '456', createdBy: 999, cancelled: true });

      await handler.handle(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        tr('commands.stateChange.onlyCreator', { action: tr('commands.common.verbs.resume') })
      );
      expect(mockRideService.resumeRide).not.toHaveBeenCalled();
    });

    it('reports non-cancelled ride', async () => {
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: '456', error: null });
      mockRideService.getRide.mockResolvedValue({ id: '456', createdBy: 123, cancelled: false });

      await handler.handle(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.resume.notCancelled'));
      expect(mockRideService.resumeRide).not.toHaveBeenCalled();
    });

    it('resumes ride and reports update count', async () => {
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: '456', error: null });
      mockRideService.getRide.mockResolvedValue({ id: '456', createdBy: 123, cancelled: true });
      mockRideService.resumeRide.mockResolvedValue({ id: '456', cancelled: false });
      mockRideMessagesService.updateRideMessages.mockResolvedValue({
        success: true,
        updatedCount: 1,
        removedCount: 0
      });

      await handler.handle(mockCtx);

      expect(mockRideService.resumeRide).toHaveBeenCalledWith('456', 123);
      const replyText = mockCtx.reply.mock.calls[0][0];
      expect(replyText).toContain(
        tr('commands.common.rideActionUpdatedMessages', {
          action: tr('commands.common.actions.resumed'),
          count: 1
        })
      );
    });

    it('reports when no messages were updated', async () => {
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: '456', error: null });
      mockRideService.getRide.mockResolvedValue({ id: '456', createdBy: 123, cancelled: true });
      mockRideService.resumeRide.mockResolvedValue({ id: '456', cancelled: false });
      mockRideMessagesService.updateRideMessages.mockResolvedValue({
        success: true,
        updatedCount: 0,
        removedCount: 0
      });

      await handler.handle(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        tr('commands.common.rideActionNoMessagesUpdated', {
          action: tr('commands.common.actions.resumed')
        })
      );
    });

    it('reports removed unavailable messages for multi-chat propagation', async () => {
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: '456', error: null });
      mockRideService.getRide.mockResolvedValue({ id: '456', createdBy: 123, cancelled: true });
      mockRideService.resumeRide.mockResolvedValue({ id: '456', cancelled: false });
      mockRideMessagesService.updateRideMessages.mockResolvedValue({
        success: true,
        updatedCount: 2,
        removedCount: 1
      });

      await handler.handle(mockCtx);

      const replyText = mockCtx.reply.mock.calls[0][0];
      expect(replyText).toContain(
        tr('commands.common.rideActionUpdatedMessages', {
          action: tr('commands.common.actions.resumed'),
          count: 2
        })
      );
      expect(replyText).toContain(tr('commands.common.removedUnavailableMessages', { count: 1 }));
    });
  });
});
