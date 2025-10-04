/**
 * @jest-environment node
 */
import { jest } from '@jest/globals';
import { StartCommandHandler } from '../../commands/StartCommandHandler.js';
import { config } from '../../config.js';

describe('StartCommandHandler', () => {
  let startHandler;
  let mockRideService;
  let mockMessageFormatter;
  let mockRideMessagesService;
  let mockCtx;

  beforeEach(() => {
    // Create mock services (required by BaseCommandHandler)
    mockRideService = {
      getRide: jest.fn()
    };

    mockMessageFormatter = {
      formatRideDetails: jest.fn()
    };

    mockRideMessagesService = {
      updateRideMessages: jest.fn()
    };

    // Create mock Grammy context
    mockCtx = {
      reply: jest.fn().mockResolvedValue({
        message_id: 123,
        chat: { id: 456 }
      }),
      message: {
        from: {
          id: 789,
          username: 'testuser'
        },
        chat: {
          id: 456,
          type: 'private'
        }
      }
    };

    // Create handler instance
    startHandler = new StartCommandHandler(
      mockRideService,
      mockMessageFormatter,
      mockRideMessagesService
    );
  });

  describe('handle', () => {
    it('should send the start message with HTML formatting', async () => {
      // Execute
      await startHandler.handle(mockCtx);

      // Verify
      expect(mockCtx.reply).toHaveBeenCalledTimes(1);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        config.messageTemplates.start,
        { parse_mode: 'HTML' }
      );
    });

    it('should handle reply failures gracefully', async () => {
      // Setup - make reply throw an error
      const error = new Error('Network error');
      mockCtx.reply.mockRejectedValue(error);

      // Execute and verify it throws
      await expect(startHandler.handle(mockCtx)).rejects.toThrow('Network error');
    });

    it('should work in private chats', async () => {
      // Setup - private chat
      mockCtx.message.chat.type = 'private';

      // Execute
      await startHandler.handle(mockCtx);

      // Verify message was sent
      expect(mockCtx.reply).toHaveBeenCalled();
    });

    it('should work in group chats', async () => {
      // Setup - group chat
      mockCtx.message.chat.type = 'group';

      // Execute
      await startHandler.handle(mockCtx);

      // Verify message was sent
      expect(mockCtx.reply).toHaveBeenCalled();
    });

    it('should use the configured start message template', async () => {
      // Execute
      await startHandler.handle(mockCtx);

      // Verify the exact message from config was used
      const callArgs = mockCtx.reply.mock.calls[0];
      expect(callArgs[0]).toContain('🚲 Welcome to Ride Announcement Bot!');
      expect(callArgs[0]).toContain('I am a <b>Telegram bot for organizing bike rides</b>');
      expect(callArgs[0]).toContain('Happy cycling!');
    });

    it('should include HTML parse mode in options', async () => {
      // Execute
      await startHandler.handle(mockCtx);

      // Verify
      const callArgs = mockCtx.reply.mock.calls[0];
      expect(callArgs[1]).toEqual({ parse_mode: 'HTML' });
    });
  });
});

