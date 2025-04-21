/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { CancelRideCommandHandler } from '../../commands/CancelRideCommandHandler.js';

describe('CancelRideCommandHandler', () => {
  let cancelRideCommandHandler;
  let mockRideService;
  let mockMessageFormatter;
  let mockRideMessagesService;
  let mockCtx;
  
  beforeEach(() => {
    // Create mock RideService
    mockRideService = {
      getRide: jest.fn(),
      cancelRide: jest.fn()
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
      reply: jest.fn().mockResolvedValue({}),
      api: {
        editMessageText: jest.fn().mockResolvedValue({})
      },
      from: { id: 123 },
      message: { text: '/cancelride 456' }
    };
    
    // Create CancelRideCommandHandler instance with mocks
    cancelRideCommandHandler = new CancelRideCommandHandler(mockRideService, mockMessageFormatter, mockRideMessagesService);
    
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
      expect(cancelRideCommandHandler.extractRide).toHaveBeenCalledWith(mockCtx);
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
      
      // Mock isRideCreator to return true
      jest.spyOn(cancelRideCommandHandler, 'isRideCreator').mockReturnValue(true);
      
      // Execute
      await cancelRideCommandHandler.handle(mockCtx);
      
      // Verify
      expect(cancelRideCommandHandler.extractRide).toHaveBeenCalledWith(mockCtx);
      expect(cancelRideCommandHandler.isRideCreator).toHaveBeenCalledWith(mockRide, mockCtx.from.id);
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
      
      // Mock isRideCreator
      jest.spyOn(cancelRideCommandHandler, 'isRideCreator').mockReturnValue(true);
      
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
      expect(cancelRideCommandHandler.extractRide).toHaveBeenCalledWith(mockCtx);
      expect(cancelRideCommandHandler.isRideCreator).toHaveBeenCalledWith(mockRide, mockCtx.from.id);
      expect(mockRideService.cancelRide).toHaveBeenCalledWith('456', mockCtx.from.id);
      expect(cancelRideCommandHandler.updateRideMessage).toHaveBeenCalledWith(updatedRide, mockCtx);
      expect(mockCtx.reply).toHaveBeenCalledWith('Ride cancelled successfully. Updated 1 message(s).');
    });

    it('should propagate cancellation to all tracked messages and remove unavailable messages (multi-chat propagation)', async () => {
      // Setup
      const mockRide = {
        id: '456',
        cancelled: false,
        messages: [
          { chatId: 1001, messageId: 2001 },
          { chatId: 1002, messageId: 2002 },
          { chatId: 1003, messageId: 2003 }
        ]
      };
      const updatedRide = {
        ...mockRide,
        cancelled: true,
        messages: [
          { chatId: 1001, messageId: 2001 }, // message 2002 will be removed as unavailable
          { chatId: 1003, messageId: 2003 }
        ]
      };

      cancelRideCommandHandler.extractRide.mockResolvedValue({ ride: mockRide, error: null });
      jest.spyOn(cancelRideCommandHandler, 'isRideCreator').mockReturnValue(true);
      mockRideService.cancelRide.mockResolvedValue({ ...mockRide, cancelled: true });
      // Simulate updateRideMessages returning one removed message
      mockRideMessagesService.updateRideMessages.mockResolvedValue({
        success: true,
        updatedCount: 2,
        removedCount: 1,
        removedMessages: [{ chatId: 1002, messageId: 2002 }]
      });
      // Simulate that updateRideMessage updates the messages array and allow jest to track calls
      cancelRideCommandHandler.updateRideMessage = jest.fn().mockImplementation(async (ride, ctx) => {
        // Remove unavailable message
        ride.messages = ride.messages.filter(
          m => !(m.chatId === 1002 && m.messageId === 2002)
        );
        return { success: true, updatedCount: 2, removedCount: 1 };
      });

      // Execute
      await cancelRideCommandHandler.handle(mockCtx);

      // Verify
      expect(cancelRideCommandHandler.extractRide).toHaveBeenCalledWith(mockCtx);
      expect(cancelRideCommandHandler.isRideCreator).toHaveBeenCalledWith(mockRide, mockCtx.from.id);
      expect(mockRideService.cancelRide).toHaveBeenCalledWith('456', mockCtx.from.id);
      expect(cancelRideCommandHandler.updateRideMessage).toHaveBeenCalled();
      // The reply should mention both updated and removed counts in the same message
      expect(mockCtx.reply).toHaveBeenCalled();
      const replyText = mockCtx.reply.mock.calls[0][0];
      expect(replyText).toContain('Updated 2 message(s)');
      expect(replyText).toContain('Removed 1 unavailable message(s)');
    });

    it('should handle unauthorized user', async () => {
      // Setup
      const mockRide = { id: '456', cancelled: false };
      
      cancelRideCommandHandler.extractRide.mockResolvedValue({ 
        ride: mockRide, 
        error: null 
      });
      
      // Mock isRideCreator to return false
      jest.spyOn(cancelRideCommandHandler, 'isRideCreator').mockReturnValue(false);
      
      // Execute
      await cancelRideCommandHandler.handle(mockCtx);
      
      // Verify
      expect(cancelRideCommandHandler.extractRide).toHaveBeenCalledWith(mockCtx);
      expect(cancelRideCommandHandler.isRideCreator).toHaveBeenCalledWith(mockRide, mockCtx.from.id);
      expect(mockCtx.reply).toHaveBeenCalledWith('Only the ride creator can cancel this ride.');
      expect(mockRideService.cancelRide).not.toHaveBeenCalled();
    });
  });
  
  describe('updateRideMessage', () => {
    it('should not attempt to update message when messageId or chatId is missing', async () => {
      const ride = {
        id: '123',
        title: 'Test Ride'
      };

      mockRideMessagesService.updateRideMessages.mockResolvedValue({ success: true, updatedCount: 0, removedCount: 0 });

      await cancelRideCommandHandler.updateRideMessage(ride, mockCtx);

      expect(mockRideMessagesService.updateRideMessages).toHaveBeenCalledWith(ride, mockCtx);
    });

    it('should update message when messageId and chatId are present', async () => {
      const ride = {
        id: '123',
        title: 'Test Ride',
        messages: [{ messageId: 456, chatId: 789 }]
      };

      mockRideMessagesService.updateRideMessages.mockResolvedValue({ success: true, updatedCount: 1, removedCount: 0 });

      await cancelRideCommandHandler.updateRideMessage(ride, mockCtx);

      expect(mockRideMessagesService.updateRideMessages).toHaveBeenCalledWith(ride, mockCtx);
    });

    it('should handle errors when updating message', async () => {
      const ride = {
        id: '123',
        title: 'Test Ride',
        messages: [{ messageId: 456, chatId: 789 }]
      };

      mockRideMessagesService.updateRideMessages.mockResolvedValue({ success: false, error: 'Failed to update' });

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      await cancelRideCommandHandler.updateRideMessage(ride, mockCtx);

      expect(mockRideMessagesService.updateRideMessages).toHaveBeenCalledWith(ride, mockCtx);
      expect(consoleErrorSpy).toHaveBeenCalled();
      
      consoleErrorSpy.mockRestore();
    });
  });
});
