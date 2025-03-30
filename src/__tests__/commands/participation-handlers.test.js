/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { ParticipationHandlers } from '../../commands/ParticipationHandlers.js';

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

describe('ParticipationHandlers', () => {
  let participationHandlers;
  let mockRideService;
  let mockMessageFormatter;
  let mockCtx;
  
  beforeEach(() => {
    // Create mock RideService
    mockRideService = {
      getRide: jest.fn(),
      addParticipant: jest.fn(),
      removeParticipant: jest.fn(),
      getParticipants: jest.fn()
    };
    
    // Create mock MessageFormatter
    mockMessageFormatter = {
      formatRideWithKeyboard: jest.fn()
    };
    
    // Create mock Grammy context
    mockCtx = {
      match: ['join:123', '123'],
      from: {
        id: 456,
        username: 'testuser',
        first_name: 'Test',
        last_name: 'User'
      },
      answerCallbackQuery: jest.fn().mockResolvedValue({}),
      api: {
        editMessageText: jest.fn().mockResolvedValue({})
      }
    };
    
    // Create ParticipationHandlers instance with mocks
    participationHandlers = new ParticipationHandlers(mockRideService, mockMessageFormatter);
  });
  
  describe('handleJoinRide', () => {
    it('should handle ride not found', async () => {
      // Setup
      mockRideService.getRide.mockResolvedValue(null);
      
      // Execute
      await participationHandlers.handleJoinRide(mockCtx);
      
      // Verify
      expect(mockRideService.getRide).toHaveBeenCalledWith('123');
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith('Ride not found');
      expect(mockRideService.addParticipant).not.toHaveBeenCalled();
    });
    
    it('should handle cancelled ride', async () => {
      // Setup
      mockRideService.getRide.mockResolvedValue({
        id: '123',
        cancelled: true
      });
      
      // Execute
      await participationHandlers.handleJoinRide(mockCtx);
      
      // Verify
      expect(mockRideService.getRide).toHaveBeenCalledWith('123');
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith('This ride has been cancelled');
      expect(mockRideService.addParticipant).not.toHaveBeenCalled();
    });
    
    it('should add participant successfully', async () => {
      // Setup
      const mockRide = {
        id: '123',
        cancelled: false,
        messageId: 789,
        chatId: 101112
      };
      mockRideService.getRide.mockResolvedValue(mockRide);
      mockRideService.addParticipant.mockResolvedValue(true);
      
      // Mock the updateRideMessage method
      participationHandlers.updateRideMessage = jest.fn().mockResolvedValue({});
      
      // Execute
      await participationHandlers.handleJoinRide(mockCtx);
      
      // Verify
      expect(mockRideService.getRide).toHaveBeenCalledWith('123');
      expect(mockRideService.addParticipant).toHaveBeenCalledWith('123', {
        userId: 456,
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User'
      });
      expect(participationHandlers.updateRideMessage).toHaveBeenCalledWith(mockRide, mockCtx);
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith('You have joined the ride!');
    });
    
    it('should handle already joined ride', async () => {
      // Setup
      mockRideService.getRide.mockResolvedValue({
        id: '123',
        cancelled: false
      });
      mockRideService.addParticipant.mockResolvedValue(false);
      
      // Execute
      await participationHandlers.handleJoinRide(mockCtx);
      
      // Verify
      expect(mockRideService.getRide).toHaveBeenCalledWith('123');
      expect(mockRideService.addParticipant).toHaveBeenCalled();
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith('You are already in this ride');
    });
    
    it('should handle error during join', async () => {
      // Setup
      mockRideService.getRide.mockRejectedValue(new Error('Database error'));
      
      // Temporarily mock console.error
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      // Execute
      await participationHandlers.handleJoinRide(mockCtx);
      
      // Verify
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith('An error occurred');
      
      // Restore console.error
      consoleErrorSpy.mockRestore();
    });
  });
  
  describe('handleLeaveRide', () => {
    beforeEach(() => {
      // Update match for leave ride
      mockCtx.match = ['leave:123', '123'];
    });
    
    it('should handle ride not found', async () => {
      // Setup
      mockRideService.getRide.mockResolvedValue(null);
      
      // Execute
      await participationHandlers.handleLeaveRide(mockCtx);
      
      // Verify
      expect(mockRideService.getRide).toHaveBeenCalledWith('123');
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith('Ride not found');
      expect(mockRideService.removeParticipant).not.toHaveBeenCalled();
    });
    
    it('should handle cancelled ride', async () => {
      // Setup
      mockRideService.getRide.mockResolvedValue({
        id: '123',
        cancelled: true
      });
      
      // Execute
      await participationHandlers.handleLeaveRide(mockCtx);
      
      // Verify
      expect(mockRideService.getRide).toHaveBeenCalledWith('123');
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith('This ride has been cancelled');
      expect(mockRideService.removeParticipant).not.toHaveBeenCalled();
    });
    
    it('should remove participant successfully', async () => {
      // Setup
      const mockRide = {
        id: '123',
        cancelled: false,
        messageId: 789,
        chatId: 101112
      };
      mockRideService.getRide.mockResolvedValue(mockRide);
      mockRideService.removeParticipant.mockResolvedValue(true);
      
      // Mock the updateRideMessage method
      participationHandlers.updateRideMessage = jest.fn().mockResolvedValue({});
      
      // Execute
      await participationHandlers.handleLeaveRide(mockCtx);
      
      // Verify
      expect(mockRideService.getRide).toHaveBeenCalledWith('123');
      expect(mockRideService.removeParticipant).toHaveBeenCalledWith('123', 456);
      expect(participationHandlers.updateRideMessage).toHaveBeenCalledWith(mockRide, mockCtx);
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith('You have left the ride');
    });
    
    it('should handle not in ride', async () => {
      // Setup
      mockRideService.getRide.mockResolvedValue({
        id: '123',
        cancelled: false
      });
      mockRideService.removeParticipant.mockResolvedValue(false);
      
      // Execute
      await participationHandlers.handleLeaveRide(mockCtx);
      
      // Verify
      expect(mockRideService.getRide).toHaveBeenCalledWith('123');
      expect(mockRideService.removeParticipant).toHaveBeenCalled();
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith('You are not in this ride');
    });
    
    it('should handle error during leave', async () => {
      // Setup
      mockRideService.getRide.mockRejectedValue(new Error('Database error'));
      
      // Temporarily mock console.error
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      // Execute
      await participationHandlers.handleLeaveRide(mockCtx);
      
      // Verify
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith('An error occurred');
      
      // Restore console.error
      consoleErrorSpy.mockRestore();
    });
  });
  
  describe('updateRideMessage', () => {
    it('should not update if messageId or chatId is missing', async () => {
      // Setup
      const mockRide = {
        id: '123'
        // No messageId or chatId
      };
      
      // Execute
      await participationHandlers.updateRideMessage(mockRide, mockCtx);
      
      // Verify
      expect(mockRideService.getParticipants).not.toHaveBeenCalled();
      expect(mockCtx.api.editMessageText).not.toHaveBeenCalled();
    });
    
    it('should update ride message successfully', async () => {
      // Setup
      const mockRide = {
        id: '123',
        messageId: 789,
        chatId: 101112
      };
      const mockParticipants = [
        { userId: 456, firstName: 'Test', lastName: 'User' }
      ];
      mockRideService.getParticipants.mockResolvedValue(mockParticipants);
      mockMessageFormatter.formatRideWithKeyboard.mockReturnValue({
        message: 'Updated ride message',
        keyboard: { inline_keyboard: [] },
        parseMode: 'HTML'
      });
      
      // Execute
      await participationHandlers.updateRideMessage(mockRide, mockCtx);
      
      // Verify
      expect(mockRideService.getParticipants).toHaveBeenCalledWith('123');
      expect(mockMessageFormatter.formatRideWithKeyboard).toHaveBeenCalledWith(mockRide, mockParticipants);
      expect(mockCtx.api.editMessageText).toHaveBeenCalledWith(
        101112,
        789,
        'Updated ride message',
        {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [] }
        }
      );
    });
    
    it('should handle error during message update', async () => {
      // Setup
      const mockRide = {
        id: '123',
        messageId: 789,
        chatId: 101112
      };
      mockRideService.getParticipants.mockRejectedValue(new Error('Database error'));
      
      // Spy on console.error
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      // Execute
      await participationHandlers.updateRideMessage(mockRide, mockCtx);
      
      // Verify
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(mockCtx.api.editMessageText).not.toHaveBeenCalled();
      
      // Restore console.error
      consoleErrorSpy.mockRestore();
    });
  });
});
