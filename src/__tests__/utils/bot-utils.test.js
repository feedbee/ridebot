/**
 * @jest-environment node
 */
import { jest } from '@jest/globals';
import { getBotUsername, replaceBotUsername } from '../../utils/botUtils.js';

describe('botUtils', () => {
  describe('getBotUsername', () => {
    it('should return bot username from context', async () => {
      const mockCtx = {
        api: {
          getMe: jest.fn().mockResolvedValue({ username: 'testbot' })
        }
      };

      const result = await getBotUsername(mockCtx);
      expect(result).toBe('testbot');
    });

    it('should return fallback on error', async () => {
      const mockCtx = {
        api: {
          getMe: jest.fn().mockRejectedValue(new Error('API error'))
        }
      };

      const result = await getBotUsername(mockCtx);
      expect(result).toBe('botname');
    });
  });

  describe('replaceBotUsername', () => {
    it('should replace @botname with actual bot username', async () => {
      const text = 'Use /shareride@botname to share a ride';
      const mockCtx = {
        api: {
          getMe: jest.fn().mockResolvedValue({ username: 'mybikebot' })
        }
      };
      const result = await replaceBotUsername(text, mockCtx);
      expect(result).toBe('Use /shareride@mybikebot to share a ride');
    });

    it('should replace multiple occurrences', async () => {
      const text = 'Bot @botname is great. Use @botname for commands.';
      const mockCtx = {
        api: {
          getMe: jest.fn().mockResolvedValue({ username: 'mybikebot' })
        }
      };
      const result = await replaceBotUsername(text, mockCtx);
      expect(result).toBe('Bot @mybikebot is great. Use @mybikebot for commands.');
    });

    it('should replace @botname with @ when API fails', async () => {
      const text = 'Use /shareride@botname to share a ride';
      const mockCtx = {
        api: {
          getMe: jest.fn().mockRejectedValue(new Error('API error'))
        }
      };
      const result = await replaceBotUsername(text, mockCtx);
      expect(result).toBe('Use /shareride@botname to share a ride');
    });
  });
});
