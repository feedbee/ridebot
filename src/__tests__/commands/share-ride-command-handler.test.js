/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { ShareRideCommandHandler } from '../../commands/ShareRideCommandHandler.js';

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

describe('ShareRideCommandHandler', () => {
  let shareRideCommandHandler;
  let mockRideService;
  let mockCtx;
  let mockMessageFormatter;
  let mockRideMessagesService;
  
  beforeEach(() => {
    // Create mock RideService
    mockRideService = {
      getRide: jest.fn()
    };

    // Create mock RideMessagesService
    mockRideMessagesService = {
      extractRideId: jest.fn(),
      createRideMessage: jest.fn()
    };
    
    // Create mock MessageFormatter
    mockMessageFormatter = {
      formatRideDetails: jest.fn()
    };
    
    // Create mock Grammy context
    mockCtx = {
      message: {
        text: '/shareride 123',
        message_id: 456,
        message_thread_id: null
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
    shareRideCommandHandler = new ShareRideCommandHandler(mockRideService, mockMessageFormatter, mockRideMessagesService);
    
    // Mock the shareRideToChat method
    jest.spyOn(shareRideCommandHandler, 'shareRideToChat');
  });
  
  describe('handle', () => {
    it('should handle missing ride ID', async () => {
      // Setup
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: null, error: 'Error message' });
      
      // Execute
      await shareRideCommandHandler.handle(mockCtx);
      
      // Verify
      expect(mockRideMessagesService.extractRideId).toHaveBeenCalledWith(mockCtx.message);
      expect(mockCtx.reply).toHaveBeenCalledWith('Error message');
      expect(mockRideService.getRide).not.toHaveBeenCalled();
    });
    
    it('should handle ride not found', async () => {
      // Setup
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: '123', error: null });
      mockRideService.getRide.mockResolvedValue(null);
      
      // Execute
      await shareRideCommandHandler.handle(mockCtx);
      
      // Verify
      expect(mockRideMessagesService.extractRideId).toHaveBeenCalledWith(mockCtx.message);
      expect(mockRideService.getRide).toHaveBeenCalledWith('123');
      expect(mockCtx.reply).toHaveBeenCalledWith('Ride #123 not found.');
    });
    
    it('should handle unauthorized user', async () => {
      // Setup
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: '123', error: null });
      mockRideService.getRide.mockResolvedValue({ id: '123', createdBy: 456 });
      
      // Spy on isRideCreator - return false for unauthorized user
      jest.spyOn(shareRideCommandHandler, 'isRideCreator').mockReturnValue(false);
      
      // Execute
      await shareRideCommandHandler.handle(mockCtx);
      
      // Verify
      expect(shareRideCommandHandler.isRideCreator).toHaveBeenCalledWith({ id: '123', createdBy: 456 }, 789);
      expect(mockCtx.reply).toHaveBeenCalledWith('Only the ride creator can repost this ride.');
    });
    
    it('should handle cancelled ride', async () => {
      // Setup
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: '123', error: null });
      mockRideService.getRide.mockResolvedValue({ id: '123', cancelled: true, createdBy: 789 });
      
      // Spy on isRideCreator - return true for creator
      jest.spyOn(shareRideCommandHandler, 'isRideCreator').mockReturnValue(true);
      
      // Execute
      await shareRideCommandHandler.handle(mockCtx);
      
      // Verify
      expect(mockCtx.reply).toHaveBeenCalledWith('Cannot repost a cancelled ride.');
    });
    
    it('should handle ride already posted in chat', async () => {
      // Setup
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: '123', error: null });
      mockRideService.getRide.mockResolvedValue({ 
        id: '123', 
        cancelled: false,
        createdBy: 789,
        messages: [{ chatId: 101112, messageId: 999 }]
      });
      
      // Spy on isRideCreator - return true for creator
      jest.spyOn(shareRideCommandHandler, 'isRideCreator').mockReturnValue(true);
      
      // Execute
      await shareRideCommandHandler.handle(mockCtx);
      
      // Verify
      expect(mockCtx.reply).toHaveBeenCalledWith('This ride is already posted in this chat.', {
        message_thread_id: null
      });
    });
    
    it('should successfully post ride to chat', async () => {
      // Setup
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: '123', error: null });
      mockRideService.getRide.mockResolvedValue({ 
        id: '123', 
        cancelled: false,
        createdBy: 789,
        messages: [{ chatId: 222222, messageId: 999 }]
      });
      
      // Spy on isRideCreator - return true for creator
      jest.spyOn(shareRideCommandHandler, 'isRideCreator').mockReturnValue(true);
      
      shareRideCommandHandler.shareRideToChat.mockResolvedValue({ success: true, error: null });
      
      // Execute
      await shareRideCommandHandler.handle(mockCtx);
      
      // Verify
      expect(shareRideCommandHandler.shareRideToChat).toHaveBeenCalledWith(
        { id: '123', cancelled: false, createdBy: 789, messages: [{ chatId: 222222, messageId: 999 }] },
        mockCtx
      );
      // No confirmation message is expected now
      expect(mockCtx.reply).not.toHaveBeenCalledWith('Ride #123 successfully posted to this chat.');
    });
    
    it('should handle error when posting ride', async () => {
      // Setup
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: '123', error: null });
      mockRideService.getRide.mockResolvedValue({ 
        id: '123', 
        cancelled: false,
        createdBy: 789,
        messages: []
      });
      
      // Spy on isRideCreator - return true for creator
      jest.spyOn(shareRideCommandHandler, 'isRideCreator').mockReturnValue(true);
      
      shareRideCommandHandler.shareRideToChat.mockResolvedValue({ 
        success: false, 
        error: 'The bot is not a member of this chat or was blocked.' 
      });
      
      // Execute
      await shareRideCommandHandler.handle(mockCtx);
      
      // Verify
      expect(mockCtx.reply).toHaveBeenCalledWith('Failed to post ride: The bot is not a member of this chat or was blocked.');
    });
    
    it('should handle unexpected error', async () => {
      // Setup
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: '123', error: null });
      mockRideService.getRide.mockRejectedValue(new Error('Database error'));
      
      // Execute
      await shareRideCommandHandler.handle(mockCtx);
      
      // Verify
      expect(mockCtx.reply).toHaveBeenCalledWith('An error occurred while posting the ride.');
    });
  });
  
  describe('shareRideToChat', () => {
    it('should successfully post ride to chat', async () => {
      // Setup
      const participants = [
        { userId: 111, firstName: 'User1' },
        { userId: 222, firstName: 'User2' }
      ];
      
      const ride = { 
        id: '123',
        title: 'Test Ride',
        messages: [{ chatId: 222222, messageId: 999 }],
        participants: participants
      };
      
      mockRideMessagesService.createRideMessage.mockResolvedValue({
        sentMessage: { message_id: 131415 },
        updatedRide: {
          ...ride,
          messages: [
            ...ride.messages,
            { chatId: 101112, messageId: 131415 }
          ]
        }
      });
      
      // Execute
      const result = await shareRideCommandHandler.shareRideToChat(ride, mockCtx);
      
      // Verify
      expect(mockRideMessagesService.createRideMessage).toHaveBeenCalledWith(
        ride,
        mockCtx,
        null // messageThreadId
      );
      expect(result).toEqual({ success: true });
    });
    
    it('should respect message_thread_id when posting in a topic', async () => {
      // Setup
      const participants = [
        { userId: 111, firstName: 'User1' },
        { userId: 222, firstName: 'User2' }
      ];
      
      const ride = { 
        id: '123',
        title: 'Test Ride',
        messages: [{ chatId: 222222, messageId: 999 }],
        participants: participants
      };
      
      // Create a context with message_thread_id (topic)
      const topicCtx = {
        ...mockCtx,
        message: {
          ...mockCtx.message,
          message_thread_id: 5678 // This is the topic ID
        }
      };
      
      mockRideMessagesService.createRideMessage.mockResolvedValue({
        sentMessage: { message_id: 131415 },
        updatedRide: {
          ...ride,
          messages: [
            ...ride.messages,
            { 
              chatId: 101112, 
              messageId: 131415, 
              messageThreadId: 5678 
            }
          ]
        }
      });
      
      // Execute
      const result = await shareRideCommandHandler.shareRideToChat(ride, topicCtx);
      
      // Verify
      expect(mockRideMessagesService.createRideMessage).toHaveBeenCalledWith(
        ride,
        topicCtx,
        5678 // messageThreadId
      );
      expect(result).toEqual({ success: true });
    });
    
    it('should allow posting the same ride in different topics of the same chat', async () => {
      // Setup
      const chatId = 101112;
      const ride = { 
        id: '123',
        title: 'Test Ride',
        messages: [
          { 
            chatId: chatId, 
            messageId: 111, 
            messageThreadId: 5678 // Already posted in topic 5678
          }
        ]
      };
      
      const participants = [
        { userId: 111, firstName: 'User1' },
        { userId: 222, firstName: 'User2' }
      ];
      
      // Create a context with a different message_thread_id (different topic in same chat)
      const differentTopicCtx = {
        ...mockCtx,
        chat: {
          ...mockCtx.chat,
          id: chatId
        },
        message: {
          ...mockCtx.message,
          message_thread_id: 9999 // Different topic ID
        }
      };
      
      mockRideMessagesService.createRideMessage.mockResolvedValue({
        sentMessage: { message_id: 222 },
        updatedRide: {
          ...ride,
          messages: [
            ...ride.messages,
            { 
              chatId: chatId, 
              messageId: 222, 
              messageThreadId: 9999 
            }
          ]
        }
      });
      
      // Execute
      const result = await shareRideCommandHandler.shareRideToChat(ride, differentTopicCtx);
      
      // Verify
      expect(mockRideMessagesService.createRideMessage).toHaveBeenCalledWith(
        ride,
        differentTopicCtx,
        9999 // messageThreadId
      );
      expect(result).toEqual({ success: true });
    });
    
    it('should handle bot blocked error', async () => {
      // Setup
      const ride = { id: '123', messages: [] };
      const participants = [];
      
      const botBlockedError = new Error('Bot error');
      botBlockedError.description = 'Forbidden: bot was blocked by the user';
      
      mockRideMessagesService.createRideMessage.mockRejectedValue(botBlockedError);
      
      // Execute
      const result = await shareRideCommandHandler.shareRideToChat(ride, mockCtx);
      
      // Verify
      expect(result).toEqual({ 
        success: false, 
        error: 'The bot is not a member of this chat or was blocked.' 
      });
    });

    it('should handle permission denied error', async () => {
      // Setup
      const ride = { id: '123', messages: [] };
      const permissionError = new Error('Permission error');
      permissionError.description = 'Forbidden: not enough rights to send messages to the chat';
      
      mockRideMessagesService.createRideMessage.mockRejectedValue(permissionError);
      
      // Execute
      const result = await shareRideCommandHandler.shareRideToChat(ride, mockCtx);
      
      // Verify
      expect(result).toEqual({
        success: false,
        error: 'The bot does not have permission to send messages in this chat.'
      });
    });

    it('should handle posting when ride.messages property is missing', async () => {
      // Setup
      const ride = { id: '123', title: 'Test Ride' };
      mockRideMessagesService.createRideMessage.mockResolvedValue({
        sentMessage: { message_id: 131415 },
        updatedRide: {
          ...ride,
          messages: [{ chatId: 101112, messageId: 131415 }]
        }
      });
      // Execute
      const result = await shareRideCommandHandler.shareRideToChat(ride, mockCtx);
      // Verify
      expect(mockRideMessagesService.createRideMessage).toHaveBeenCalledWith(
        ride,
        mockCtx,
        null
      );
      expect(result).toEqual({ success: true });
    });
    
    it('should handle permissions error', async () => {
      // Setup
      const ride = { id: '123', messages: [] };
      const participants = [];
      
      const permissionsError = new Error('Bot error');
      permissionsError.description = 'Bad Request: not enough rights to send text messages to the chat';
      
      mockRideMessagesService.createRideMessage.mockRejectedValue(permissionsError);
      
      // Execute
      const result = await shareRideCommandHandler.shareRideToChat(ride, mockCtx);
      
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
      
      mockRideMessagesService.createRideMessage.mockRejectedValue(new Error('Unexpected error'));
      
      // Execute
      const result = await shareRideCommandHandler.shareRideToChat(ride, mockCtx);
      
      // Verify
      expect(result).toEqual({ 
        success: false, 
        error: 'Failed to post ride'
      });
    });
  });
});
