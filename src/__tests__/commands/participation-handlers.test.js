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
      addParticipant: jest.fn(),
      removeParticipant: jest.fn(),
      addMaybe: jest.fn(),
      removeMaybe: jest.fn(),
      joinRide: jest.fn(),
      leaveRide: jest.fn()
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
      expect(mockRideService.joinRide).not.toHaveBeenCalled();
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
      expect(mockRideService.joinRide).not.toHaveBeenCalled();
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
      mockRideService.joinRide.mockResolvedValue({ success: true, ride: mockRide });
      
      // Mock the updateRideMessage method
      participationHandlers.updateRideMessage = jest.fn().mockResolvedValue({
        success: true,
        updatedCount: 1,
        removedCount: 0
      });
      
      // Execute
      await participationHandlers.handleJoinRide(mockCtx);
      
      // Verify
      expect(mockRideService.getRide).toHaveBeenCalledWith('123');
      expect(mockRideService.joinRide).toHaveBeenCalledWith('123', {
        userId: 456,
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User'
      });
      expect(participationHandlers.updateRideMessage).toHaveBeenCalledWith(mockRide, mockCtx);
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
      mockRideService.joinRide.mockResolvedValue({ success: true, ride: mockRide });
      participationHandlers.updateRideMessage = jest.fn().mockResolvedValue({
        success: true,
        updatedCount: 2,
        removedCount: 1
      });
      // Execute
      await participationHandlers.handleJoinRide(mockCtx);
      // Verify
      expect(mockRideService.getRide).toHaveBeenCalledWith('123');
      expect(mockRideService.joinRide).toHaveBeenCalledWith('123', {
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
      mockRideService.joinRide.mockResolvedValue({ success: false, ride: null });
      
      // Execute
      await participationHandlers.handleJoinRide(mockCtx);
      
      // Verify
      expect(mockRideService.getRide).toHaveBeenCalledWith('123');
      expect(mockRideService.joinRide).toHaveBeenCalled();
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
      expect(mockRideService.leaveRide).not.toHaveBeenCalled();
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
      expect(mockRideService.leaveRide).not.toHaveBeenCalled();
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
      mockRideService.leaveRide.mockResolvedValue({ success: true, ride: mockRide });
      
      // Mock the updateRideMessage method
      participationHandlers.updateRideMessage = jest.fn().mockResolvedValue({
        success: true,
        updatedCount: 1,
        removedCount: 0
      });
      
      // Execute
      await participationHandlers.handleLeaveRide(mockCtx);
      
      // Verify
      expect(mockRideService.getRide).toHaveBeenCalledWith('123');
      expect(mockRideService.leaveRide).toHaveBeenCalledWith('123', 456);
      expect(participationHandlers.updateRideMessage).toHaveBeenCalledWith(mockRide, mockCtx);
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith('You have left the ride');
    });
    
    it('should handle not in ride', async () => {
      // Setup
      mockRideService.getRide.mockResolvedValue({
        id: '123',
        cancelled: false
      });
      mockRideService.leaveRide.mockResolvedValue({ success: false, ride: null });
      
      // Execute
      await participationHandlers.handleLeaveRide(mockCtx);
      
      // Verify
      expect(mockRideService.getRide).toHaveBeenCalledWith('123');
      expect(mockRideService.leaveRide).toHaveBeenCalled();
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
      
      mockRideMessagesService.updateRideMessages.mockResolvedValue({ success: false, error: 'Database error' });
      
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      await participationHandlers.updateRideMessage(ride, mockCtx);
      
      expect(mockRideMessagesService.updateRideMessages).toHaveBeenCalledWith(ride, mockCtx);
      expect(consoleErrorSpy).toHaveBeenCalled();
      
      consoleErrorSpy.mockRestore();
    });
  });
});
