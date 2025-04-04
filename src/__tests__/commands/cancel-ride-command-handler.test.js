/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { CancelRideCommandHandler } from '../../commands/CancelRideCommandHandler.js';

describe('CancelRideCommandHandler', () => {
  let cancelRideCommandHandler;
  let mockRideService;
  let mockMessageFormatter;
  let mockCtx;
  
  beforeEach(() => {
    // Create mock RideService
    mockRideService = {
      extractRideId: jest.fn(),
      getRide: jest.fn(),
      isRideCreator: jest.fn(),
      cancelRide: jest.fn(),
      getParticipants: jest.fn(),
      updateRideMessages: jest.fn().mockResolvedValue({ success: true, updatedCount: 1, removedCount: 0 })
    };
    
    // Create mock MessageFormatter
    mockMessageFormatter = {
      formatRideWithKeyboard: jest.fn()
    };
    
    // Create mock Grammy context
    mockCtx = {
      reply: jest.fn().mockResolvedValue({}),
      api: {
        editMessageText: jest.fn().mockResolvedValue({})
      },
      from: { id: 123 },
      message: { text: '/cancelride 456' }
    };
    
    // Create CancelRideCommandHandler instance with mocks
    cancelRideCommandHandler = new CancelRideCommandHandler(mockRideService, mockMessageFormatter);
    
    // Mock the extractRide method to isolate tests
    cancelRideCommandHandler.extractRide = jest.fn();
  });
  
  describe('handle', () => {
    it('should reply with error when ride extraction fails', async () => {
      // Setup
      cancelRideCommandHandler.extractRide.mockResolvedValue({ 
        ride: null, 
        error: 'No ride ID found' 
      });
      
      // Execute
      await cancelRideCommandHandler.handle(mockCtx);
      
      // Verify
      expect(cancelRideCommandHandler.extractRide).toHaveBeenCalledWith(mockCtx, true);
      expect(mockCtx.reply).toHaveBeenCalledWith('No ride ID found');
      expect(mockRideService.cancelRide).not.toHaveBeenCalled();
    });
    
    it('should reply with message when ride is already cancelled', async () => {
      // Setup
      const mockRide = { id: '456', cancelled: true };
      cancelRideCommandHandler.extractRide.mockResolvedValue({ 
        ride: mockRide, 
        error: null 
      });
      
      // Execute
      await cancelRideCommandHandler.handle(mockCtx);
      
      // Verify
      expect(cancelRideCommandHandler.extractRide).toHaveBeenCalledWith(mockCtx, true);
      expect(mockCtx.reply).toHaveBeenCalledWith('This ride is already cancelled.');
      expect(mockRideService.cancelRide).not.toHaveBeenCalled();
    });
    
    it('should cancel ride and update message when successful', async () => {
      // Setup
      const mockRide = { id: '456', cancelled: false };
      const updatedRide = { id: '456', cancelled: true };
      
      cancelRideCommandHandler.extractRide.mockResolvedValue({ 
        ride: mockRide, 
        error: null 
      });
      
      mockRideService.cancelRide.mockResolvedValue(updatedRide);
      
      // Mock the updateRideMessage method
      cancelRideCommandHandler.updateRideMessage = jest.fn().mockResolvedValue({
        success: true,
        updatedCount: 1,
        removedCount: 0
      });
      
      // Execute
      await cancelRideCommandHandler.handle(mockCtx);
      
      // Verify
      expect(cancelRideCommandHandler.extractRide).toHaveBeenCalledWith(mockCtx, true);
      expect(mockRideService.cancelRide).toHaveBeenCalledWith('456');
      expect(cancelRideCommandHandler.updateRideMessage).toHaveBeenCalledWith(updatedRide, mockCtx);
      expect(mockCtx.reply).toHaveBeenCalledWith('Ride cancelled successfully. Updated 1 message(s).');
    });
  });
  
  describe('updateRideMessage', () => {
    it('should not attempt to update message when messageId or chatId is missing', async () => {
      // Restore the original method for this test
      cancelRideCommandHandler.updateRideMessage = CancelRideCommandHandler.prototype.updateRideMessage;
      
      // Setup
      const mockRide = { id: '456', cancelled: true };
      
      // Execute
      await cancelRideCommandHandler.updateRideMessage(mockRide, mockCtx);
      
      // Verify
      expect(mockRideService.getParticipants).not.toHaveBeenCalled();
      expect(mockMessageFormatter.formatRideWithKeyboard).not.toHaveBeenCalled();
      expect(mockCtx.api.editMessageText).not.toHaveBeenCalled();
    });
    
    it('should update message when messageId and chatId are present', async () => {
      // Restore the original method for this test
      cancelRideCommandHandler.updateRideMessage = CancelRideCommandHandler.prototype.updateRideMessage;
      
      // Setup
      const mockRide = { 
        id: '456', 
        cancelled: true,
        messages: [
          { messageId: 789, chatId: 101112 }
        ]
      };
      
      const mockParticipants = [{ id: 123, name: 'Test User' }];
      const mockFormatResult = {
        message: 'Formatted ride message',
        keyboard: { inline_keyboard: [] },
        parseMode: 'HTML'
      };
      
      mockRideService.getParticipants.mockResolvedValue(mockParticipants);
      mockMessageFormatter.formatRideWithKeyboard.mockReturnValue(mockFormatResult);
      
      // Execute
      await cancelRideCommandHandler.updateRideMessage(mockRide, mockCtx);
      
      // Verify
      expect(mockRideService.updateRideMessages).toHaveBeenCalledWith(mockRide, mockCtx);
    });
    
    it('should handle errors when updating message', async () => {
      // Restore the original method for this test
      cancelRideCommandHandler.updateRideMessage = CancelRideCommandHandler.prototype.updateRideMessage;
      
      // Setup
      const mockRide = { 
        id: '456', 
        cancelled: true,
        messages: [
          { messageId: 789, chatId: 101112 }
        ]
      };
      
      const mockParticipants = [{ id: 123, name: 'Test User' }];
      const mockFormatResult = {
        message: 'Formatted ride message',
        keyboard: { inline_keyboard: [] },
        parseMode: 'HTML'
      };
      
      mockRideService.updateRideMessages.mockResolvedValue({ success: false, error: 'API error' });
      
      // Mock console.error to prevent test output pollution
      const originalConsoleError = console.error;
      console.error = jest.fn();
      
      try {
        // Execute
        await cancelRideCommandHandler.updateRideMessage(mockRide, mockCtx);
        
        // Verify
        expect(mockRideService.updateRideMessages).toHaveBeenCalledWith(mockRide, mockCtx);
        expect(console.error).toHaveBeenCalled();
      } finally {
        // Restore console.error
        console.error = originalConsoleError;
      }
    });
  });
});
