/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { HelpCommandHandler } from '../../commands/HelpCommandHandler.js';
import { en } from '../../i18n/locales/en.js';

describe('HelpCommandHandler', () => {
  let helpCommandHandler;
  let mockRideService;
  let mockMessageFormatter;
  let mockCtx;
  
  beforeEach(() => {
    // Create mock RideService
    mockRideService = {};
    
    // Create mock MessageFormatter
    mockMessageFormatter = {};
    
    // Create mock Grammy context
    mockCtx = {
      api: {
        getMe: jest.fn().mockResolvedValue({ username: 'testbot' })
      },
      t: jest.fn((key) => {
        if (key === 'templates.help1') return en.templates.help1;
        if (key === 'templates.help2') return en.templates.help2;
        return key;
      }),
      reply: jest.fn().mockResolvedValue({})
    };
    
    // Create HelpCommandHandler instance with mocks
    helpCommandHandler = new HelpCommandHandler(mockRideService, mockMessageFormatter);
  });
  
  describe('handle', () => {
    it('should reply with both parts of the help message from config', async () => {
      // Execute
      await helpCommandHandler.handle(mockCtx);
      
      // Verify
      expect(mockCtx.reply).toHaveBeenCalledTimes(2);
      const [helpPart1, options1] = mockCtx.reply.mock.calls[0];
      const [helpPart2, options2] = mockCtx.reply.mock.calls[1];
      expect(helpPart1).toContain('Ride Announcement Bot Help');
      expect(helpPart2).toContain('/shareride@testbot');
      expect(options1).toEqual({ parse_mode: 'HTML' });
      expect(options2).toEqual({ parse_mode: 'HTML' });
      expect(mockCtx.t).toHaveBeenCalledWith('templates.help1');
      expect(mockCtx.t).toHaveBeenCalledWith('templates.help2');
    });
  });
});
