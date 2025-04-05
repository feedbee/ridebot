/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { PostRideCommandHandler } from '../../commands/PostRideCommandHandler.js';

// Mock the grammy module
jest.mock('grammy', () => {
  return {
    InlineKeyboard: jest.fn().mockImplementation(() => {
      return {
        text: jest.fn().mockReturnThis(),
        row: jest.fn().mockReturnThis()
      };
    })
  };
});

describe('PostRideCommandHandler', () => {
  let postRideCommandHandler;
  let mockRideService;
  let mockMessageFormatter;
  let mockCtx;
  
  beforeEach(() => {
    // Create mock RideService
    mockRideService = {
      getRide: jest.fn(),
      isRideCreator: jest.fn(),
      getParticipants: jest.fn(),
      updateRide: jest.fn(),
      extractRideId: jest.fn()
    };
    
    // Create mock MessageFormatter
    mockMessageFormatter = {
      formatRideWithKeyboard: jest.fn()
    };
    
    // Create mock Grammy context
    mockCtx = {
      message: {
        text: '/postride 123',
        message_id: 456
      },
      from: {
        id: 789,
        first_name: 'Test',
        username: 'testuser'
      },
      chat: {
        id: 101112
      },
      reply: jest.fn().mockResolvedValue({
        message_id: 131415
      })
    };
    
    // Create the handler
    postRideCommandHandler = new PostRideCommandHandler(mockRideService, mockMessageFormatter);
    
    // Mock the postRideToChat method
    jest.spyOn(postRideCommandHandler, 'postRideToChat');
  });
  

  
  describe('handle', () => {
    it('should handle missing ride ID', async () => {
      // Setup
      mockRideService.extractRideId.mockReturnValue({ rideId: null, error: 'Error message' });
      
      // Execute
      await postRideCommandHandler.handle(mockCtx);
      
      // Verify
      expect(mockRideService.extractRideId).toHaveBeenCalledWith(mockCtx.message);
      expect(mockCtx.reply).toHaveBeenCalledWith('Error message');
      expect(mockRideService.getRide).not.toHaveBeenCalled();
    });
    
    it('should handle ride not found', async () => {
      // Setup
      mockRideService.extractRideId.mockReturnValue({ rideId: '123', error: null });
      mockRideService.getRide.mockResolvedValue(null);
      
      // Execute
      await postRideCommandHandler.handle(mockCtx);
      
      // Verify
      expect(mockRideService.extractRideId).toHaveBeenCalledWith(mockCtx.message);
      expect(mockRideService.getRide).toHaveBeenCalledWith('123');
      expect(mockCtx.reply).toHaveBeenCalledWith('Ride #123 not found.');
    });
    
    it('should handle unauthorized user', async () => {
      // Setup
      mockRideService.extractRideId.mockReturnValue({ rideId: '123', error: null });
      mockRideService.getRide.mockResolvedValue({ id: '123' });
      mockRideService.isRideCreator.mockReturnValue(false);
      
      // Execute
      await postRideCommandHandler.handle(mockCtx);
      
      // Verify
      expect(mockRideService.isRideCreator).toHaveBeenCalledWith({ id: '123' }, 789);
      expect(mockCtx.reply).toHaveBeenCalledWith('Only the ride creator can repost this ride.');
    });
    
    it('should handle cancelled ride', async () => {
      // Setup
      mockRideService.extractRideId.mockReturnValue({ rideId: '123', error: null });
      mockRideService.getRide.mockResolvedValue({ id: '123', cancelled: true });
      mockRideService.isRideCreator.mockReturnValue(true);
      
      // Execute
      await postRideCommandHandler.handle(mockCtx);
      
      // Verify
      expect(mockCtx.reply).toHaveBeenCalledWith('Cannot repost a cancelled ride.');
    });
    
    it('should handle ride already posted in chat', async () => {
      // Setup
      mockRideService.extractRideId.mockReturnValue({ rideId: '123', error: null });
      mockRideService.getRide.mockResolvedValue({ 
        id: '123', 
        cancelled: false,
        messages: [{ chatId: 101112, messageId: 999 }]
      });
      mockRideService.isRideCreator.mockReturnValue(true);
      
      // Execute
      await postRideCommandHandler.handle(mockCtx);
      
      // Verify
      expect(mockCtx.reply).toHaveBeenCalledWith('This ride is already posted in this chat.');
    });
    
    it('should successfully post ride to chat', async () => {
      // Setup
      mockRideService.extractRideId.mockReturnValue({ rideId: '123', error: null });
      mockRideService.getRide.mockResolvedValue({ 
        id: '123', 
        cancelled: false,
        messages: [{ chatId: 222222, messageId: 999 }]
      });
      mockRideService.isRideCreator.mockReturnValue(true);
      postRideCommandHandler.postRideToChat.mockResolvedValue({ success: true, error: null });
      
      // Execute
      await postRideCommandHandler.handle(mockCtx);
      
      // Verify
      expect(postRideCommandHandler.postRideToChat).toHaveBeenCalledWith(
        { id: '123', cancelled: false, messages: [{ chatId: 222222, messageId: 999 }] },
        101112,
        mockCtx
      );
      // No confirmation message is expected now
      expect(mockCtx.reply).not.toHaveBeenCalledWith('Ride #123 successfully posted to this chat.');
    });
    
    it('should handle error when posting ride', async () => {
      // Setup
      mockRideService.extractRideId.mockReturnValue({ rideId: '123', error: null });
      mockRideService.getRide.mockResolvedValue({ 
        id: '123', 
        cancelled: false,
        messages: []
      });
      mockRideService.isRideCreator.mockReturnValue(true);
      postRideCommandHandler.postRideToChat.mockResolvedValue({ 
        success: false, 
        error: 'The bot is not a member of this chat or was blocked.' 
      });
      
      // Execute
      await postRideCommandHandler.handle(mockCtx);
      
      // Verify
      expect(mockCtx.reply).toHaveBeenCalledWith('Failed to post ride: The bot is not a member of this chat or was blocked.');
    });
    
    it('should handle unexpected error', async () => {
      // Setup
      mockRideService.extractRideId.mockReturnValue({ rideId: '123', error: null });
      mockRideService.getRide.mockRejectedValue(new Error('Database error'));
      
      // Execute
      await postRideCommandHandler.handle(mockCtx);
      
      // Verify
      expect(mockCtx.reply).toHaveBeenCalledWith('An error occurred while posting the ride.');
    });
  });
  
  describe('postRideToChat', () => {
    it('should successfully post ride to chat', async () => {
      // Setup
      const ride = { 
        id: '123',
        title: 'Test Ride',
        messages: [{ chatId: 222222, messageId: 999 }]
      };
      
      const participants = [
        { userId: 111, firstName: 'User1' },
        { userId: 222, firstName: 'User2' }
      ];
      
      mockRideService.getParticipants.mockResolvedValue(participants);
      mockMessageFormatter.formatRideWithKeyboard.mockReturnValue({
        message: 'Formatted ride message',
        keyboard: { inline_keyboard: [] },
        parseMode: 'HTML'
      });
      
      mockRideService.updateRide.mockResolvedValue({
        ...ride,
        messages: [
          ...ride.messages,
          { chatId: 101112, messageId: 131415 }
        ]
      });
      
      // Execute
      const result = await postRideCommandHandler.postRideToChat(ride, 101112, mockCtx);
      
      // Verify
      expect(mockRideService.getParticipants).toHaveBeenCalledWith('123');
      expect(mockMessageFormatter.formatRideWithKeyboard).toHaveBeenCalledWith(ride, participants);
      expect(mockCtx.reply).toHaveBeenCalledWith('Formatted ride message', {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [] }
      });
      expect(mockRideService.updateRide).toHaveBeenCalledWith('123', {
        messages: [
          { chatId: 222222, messageId: 999 },
          { chatId: 101112, messageId: 131415 }
        ]
      });
      expect(result).toEqual({ success: true, error: null });
    });
    
    it('should handle bot blocked error', async () => {
      // Setup
      const ride = { id: '123', messages: [] };
      const participants = [];
      
      mockRideService.getParticipants.mockResolvedValue(participants);
      mockMessageFormatter.formatRideWithKeyboard.mockReturnValue({
        message: 'Formatted ride message',
        keyboard: { inline_keyboard: [] },
        parseMode: 'HTML'
      });
      
      const botBlockedError = new Error('Bot error');
      botBlockedError.description = 'Forbidden: bot was blocked by the user';
      mockCtx.reply.mockRejectedValue(botBlockedError);
      
      // Execute
      const result = await postRideCommandHandler.postRideToChat(ride, 101112, mockCtx);
      
      // Verify
      expect(result).toEqual({ 
        success: false, 
        error: 'The bot is not a member of this chat or was blocked.' 
      });
    });
    
    it('should handle permissions error', async () => {
      // Setup
      const ride = { id: '123', messages: [] };
      const participants = [];
      
      mockRideService.getParticipants.mockResolvedValue(participants);
      mockMessageFormatter.formatRideWithKeyboard.mockReturnValue({
        message: 'Formatted ride message',
        keyboard: { inline_keyboard: [] },
        parseMode: 'HTML'
      });
      
      const permissionsError = new Error('Bot error');
      permissionsError.description = 'Bad Request: not enough rights to send text messages to the chat';
      mockCtx.reply.mockRejectedValue(permissionsError);
      
      // Execute
      const result = await postRideCommandHandler.postRideToChat(ride, 101112, mockCtx);
      
      // Verify
      expect(result).toEqual({ 
        success: false, 
        error: 'The bot does not have permission to send messages in this chat.' 
      });
    });
    
    it('should handle unexpected error', async () => {
      // Setup
      const ride = { id: '123', messages: [] };
      const participants = [];
      
      mockRideService.getParticipants.mockResolvedValue(participants);
      mockMessageFormatter.formatRideWithKeyboard.mockReturnValue({
        message: 'Formatted ride message',
        keyboard: { inline_keyboard: [] },
        parseMode: 'HTML'
      });
      
      mockCtx.reply.mockRejectedValue(new Error('Unexpected error'));
      
      // Execute
      const result = await postRideCommandHandler.postRideToChat(ride, 101112, mockCtx);
      
      // Verify
      expect(result).toEqual({ 
        success: false, 
        error: 'An unexpected error occurred.' 
      });
    });
  });
});
