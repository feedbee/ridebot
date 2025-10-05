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
  let mockRideMessagesService;
  let mockCtx;
  
  beforeEach(() => {
    // Create mock RideService
    mockRideService = {
      getRide: jest.fn(),
      setParticipation: jest.fn()
    };

    // Create mock RideMessagesService
    mockRideMessagesService = {
      extractRideId: jest.fn(),
      updateRideMessages: jest.fn()
    };

    // Add RideMessagesService to RideService
    mockRideService.rideMessagesService = mockRideMessagesService;

    // Create mock MessageFormatter
    mockMessageFormatter = {
      formatRideDetails: jest.fn()
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
    participationHandlers = new ParticipationHandlers(mockRideService, mockMessageFormatter, mockRideMessagesService);
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
      expect(mockRideService.setParticipation).not.toHaveBeenCalled();
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
      expect(mockRideService.setParticipation).not.toHaveBeenCalled();
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
      mockRideService.setParticipation.mockResolvedValue({ success: true, ride: mockRide });
      
      // Mock the dependency, not the method under test
      mockRideMessagesService.updateRideMessages.mockResolvedValue({
        success: true,
        updatedCount: 1,
        removedCount: 0
      });
      
      // Execute
      await participationHandlers.handleJoinRide(mockCtx);
      
      // Verify
      expect(mockRideService.getRide).toHaveBeenCalledWith('123');
      expect(mockRideService.setParticipation).toHaveBeenCalledWith('123', {
        userId: 456,
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User'
      }, 'joined');
      expect(mockRideMessagesService.updateRideMessages).toHaveBeenCalledWith(mockRide, mockCtx);
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith('You have joined the ride!');
    });
    
    // Multi-chat propagation: just expect the simple reply
    it('should report join with simple reply even after multi-chat propagation', async () => {
      // Setup
      const mockRide = {
        id: '123',
        cancelled: false
      };
      mockRideService.getRide.mockResolvedValue(mockRide);
      mockRideService.setParticipation.mockResolvedValue({ success: true, ride: mockRide });
      // Mock the dependency, not the method under test
      mockRideMessagesService.updateRideMessages.mockResolvedValue({
        success: true,
        updatedCount: 2,
        removedCount: 1
      });
      // Execute
      await participationHandlers.handleJoinRide(mockCtx);
      // Verify
      expect(mockRideService.getRide).toHaveBeenCalledWith('123');
      expect(mockRideService.setParticipation).toHaveBeenCalledWith('123', {
        userId: 456,
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User'
      }, 'joined');
      expect(mockRideMessagesService.updateRideMessages).toHaveBeenCalledWith(mockRide, mockCtx);
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith('You have joined the ride!');
    });

    it('should handle already joined ride', async () => {
      // Setup
      mockRideService.getRide.mockResolvedValue({
        id: '123',
        cancelled: false
      });
      mockRideService.setParticipation.mockResolvedValue({ success: false, ride: null });
      
      // Execute
      await participationHandlers.handleJoinRide(mockCtx);
      
      // Verify
      expect(mockRideService.getRide).toHaveBeenCalledWith('123');
      expect(mockRideService.setParticipation).toHaveBeenCalled();
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith('You are already joined for this ride');
    });
    
    it('should handle error during join', async () => {
      // Setup
      const dbError = new Error('Database error');
      mockRideService.getRide.mockRejectedValue(dbError);
      
      // Mock console.error to verify it's called with the right error
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      // Execute
      await participationHandlers.handleJoinRide(mockCtx);
      
      // Verify error was logged with proper context
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error updating participation to joined:',
        dbError
      );
      
      // Verify user-facing error message
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith('An error occurred');
      
      // Verify no partial state - setParticipation should not have been called
      expect(mockRideService.setParticipation).not.toHaveBeenCalled();
      
      // Restore console.error
      consoleErrorSpy.mockRestore();
    });
  });
  
  describe('handleThinkingRide', () => {
    beforeEach(() => {
      // Update match for thinking ride
      mockCtx.match = ['thinking:123', '123'];
    });
    
    it('should set thinking state successfully', async () => {
      // Setup
      const mockRide = { id: '123', title: 'Test Ride', cancelled: false };
      mockRideService.getRide.mockResolvedValue(mockRide);
      mockRideService.setParticipation.mockResolvedValue({ success: true, ride: mockRide });
      mockRideMessagesService.updateRideMessages.mockResolvedValue({ success: true });

      // Execute
      await participationHandlers.handleThinkingRide(mockCtx);

      // Verify
      expect(mockRideService.getRide).toHaveBeenCalledWith('123');
      expect(mockRideService.setParticipation).toHaveBeenCalledWith('123', {
        userId: 456,
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User'
      }, 'thinking');
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith('You are thinking about this ride');
    });
  });

  describe('handleSkipRide', () => {
    beforeEach(() => {
      // Update match for skip ride
      mockCtx.match = ['skip:123', '123'];
    });
    
    it('should set skip state successfully', async () => {
      // Setup
      const mockRide = { id: '123', title: 'Test Ride', cancelled: false };
      mockRideService.getRide.mockResolvedValue(mockRide);
      mockRideService.setParticipation.mockResolvedValue({ success: true, ride: mockRide });
      mockRideMessagesService.updateRideMessages.mockResolvedValue({ success: true });

      // Execute
      await participationHandlers.handleSkipRide(mockCtx);

      // Verify
      expect(mockRideService.getRide).toHaveBeenCalledWith('123');
      expect(mockRideService.setParticipation).toHaveBeenCalledWith('123', {
        userId: 456,
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User'
      }, 'skipped');
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith('You have passed on this ride');
    });
  });
  
  describe('updateRideMessage', () => {
    it('should not update if messages array is missing', async () => {
      const ride = {
        id: '123',
        title: 'Test Ride'
      };

      mockRideMessagesService.updateRideMessages.mockResolvedValue({ success: true, updatedCount: 0, removedCount: 0 });
      
      await participationHandlers.updateRideMessage(ride, mockCtx);
      
      expect(mockRideMessagesService.updateRideMessages).toHaveBeenCalledWith(ride, mockCtx);
    });
    
    it('should not update if messages array is empty', async () => {
      const ride = {
        id: '123',
        title: 'Test Ride',
        messages: []
      };

      mockRideMessagesService.updateRideMessages.mockResolvedValue({ success: true, updatedCount: 0, removedCount: 0 });
      
      await participationHandlers.updateRideMessage(ride, mockCtx);
      
      expect(mockRideMessagesService.updateRideMessages).toHaveBeenCalledWith(ride, mockCtx);
    });
    
    it('should update ride message successfully', async () => {
      const ride = {
        id: '123',
        title: 'Test Ride',
        messages: [
          { messageId: 789, chatId: 101112 }
        ]
      };

      mockRideMessagesService.updateRideMessages.mockResolvedValue({ success: true, updatedCount: 1, removedCount: 0 });
      
      await participationHandlers.updateRideMessage(ride, mockCtx);
      
      expect(mockRideMessagesService.updateRideMessages).toHaveBeenCalledWith(ride, mockCtx);
    });
    
    it('should handle error during message update', async () => {
      const ride = {
        id: '123',
        title: 'Test Ride',
        messages: [
          { messageId: 789, chatId: 101112 }
        ]
      };
      
      const errorMessage = 'Database error';
      mockRideMessagesService.updateRideMessages.mockResolvedValue({ 
        success: false, 
        error: errorMessage 
      });
      
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      await participationHandlers.updateRideMessage(ride, mockCtx);
      
      // Verify updateRideMessages was called
      expect(mockRideMessagesService.updateRideMessages).toHaveBeenCalledWith(ride, mockCtx);
      
      // Verify error was logged with the specific error message
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error updating ride messages'),
        errorMessage
      );
      
      consoleErrorSpy.mockRestore();
    });
  });
});
