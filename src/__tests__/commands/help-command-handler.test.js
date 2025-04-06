/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { HelpCommandHandler } from '../../commands/HelpCommandHandler.js';
import { config } from '../../config.js';

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
      expect(mockCtx.reply).toHaveBeenCalledWith(
        config.messageTemplates.help1,
        { parse_mode: 'HTML' }
      );
      expect(mockCtx.reply).toHaveBeenCalledWith(
        config.messageTemplates.help2,
        { parse_mode: 'HTML' }
      );
    });
  });
});
