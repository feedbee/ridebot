/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { DeleteRideCommandHandler } from '../../commands/DeleteRideCommandHandler.js';
import { InlineKeyboard } from 'grammy';

// Mock the config module
jest.mock('../../config.js', () => ({
  config: {
    buttons: {
      confirmDelete: 'Yes, delete',
      cancelDelete: 'No, keep it'
    }
  }
}));

describe('DeleteRideCommandHandler', () => {
  let deleteRideCommandHandler;
  let mockRideService;
  let mockMessageFormatter;
  let mockRideMessagesService;
  let mockCtx;
  
  beforeEach(() => {
    // Create mock RideService
    mockRideService = {
      getRide: jest.fn(),
      deleteRide: jest.fn()
    };

    // Create mock RideMessagesService
    mockRideMessagesService = {
      extractRideId: jest.fn()
    };
    
    // Create mock MessageFormatter
    mockMessageFormatter = {
      formatRideDetails: jest.fn(),
      formatDeleteConfirmation: jest.fn().mockReturnValue('Are you sure you want to delete this ride?')
    };
    
    // Create mock Grammy context
    mockCtx = {
      reply: jest.fn().mockResolvedValue({}),
      api: {
        deleteMessage: jest.fn().mockResolvedValue({})
      },
      from: { id: 123 },
      message: { text: '/deleteride 456' }
    };
    
    // Create DeleteRideCommandHandler instance with mocks
    deleteRideCommandHandler = new DeleteRideCommandHandler(mockRideService, mockMessageFormatter, mockRideMessagesService);
    
    // Mock the extractRide method to isolate tests
    deleteRideCommandHandler.extractRide = jest.fn();
  });
  
  describe('handle', () => {
    it('should reply with error when ride extraction fails', async () => {
      // Setup
      deleteRideCommandHandler.extractRide.mockResolvedValue({ 
        ride: null, 
        error: 'No ride ID found' 
      });
      
      // Execute
      await deleteRideCommandHandler.handle(mockCtx);
      
      // Verify
      expect(deleteRideCommandHandler.extractRide).toHaveBeenCalledWith(mockCtx);
      expect(mockCtx.reply).toHaveBeenCalledWith('No ride ID found');
      expect(mockMessageFormatter.formatRideDetails).not.toHaveBeenCalled();
    });
    
    it('should show confirmation dialog when ride is found', async () => {
      // Setup
      const mockRide = { id: '456' };
      deleteRideCommandHandler.extractRide.mockResolvedValue({ 
        ride: mockRide, 
        error: null 
      });
      
      // Mock isRideCreator to return true
      jest.spyOn(deleteRideCommandHandler, 'isRideCreator').mockReturnValue(true);
      
      // Execute
      await deleteRideCommandHandler.handle(mockCtx);
      
      // Verify
      expect(deleteRideCommandHandler.extractRide).toHaveBeenCalledWith(mockCtx);
      expect(deleteRideCommandHandler.isRideCreator).toHaveBeenCalledWith(mockRide, mockCtx.from.id);
      expect(mockMessageFormatter.formatDeleteConfirmation).toHaveBeenCalled();
      expect(mockCtx.reply).toHaveBeenCalledWith(
        'Are you sure you want to delete this ride?',
        expect.objectContaining({
          reply_markup: expect.any(InlineKeyboard)
        })
      );
    });
  });
  
  describe('handleConfirmation', () => {
    beforeEach(() => {
      // Create mock Grammy context for handleConfirmation method
      mockCtx = {
        match: ['delete:confirm:456', 'confirm', '456'],
        editMessageText: jest.fn().mockResolvedValue({}),
        answerCallbackQuery: jest.fn().mockResolvedValue({}),
        api: {
          deleteMessage: jest.fn().mockResolvedValue({})
        },
        from: { id: 123 }
      };
    });
    
    it('should cancel deletion when action is cancel', async () => {
      // Setup
      mockCtx.match = ['delete:cancel:456', 'cancel', '456'];
      
      // Execute
      await deleteRideCommandHandler.handleConfirmation(mockCtx);
      
      // Verify
      expect(mockCtx.editMessageText).toHaveBeenCalledWith('Deletion cancelled.');
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith('Deletion cancelled');
      expect(mockRideService.getRide).not.toHaveBeenCalled();
      expect(mockRideService.deleteRide).not.toHaveBeenCalled();
    });
    
    it('should handle ride not found', async () => {
      // Setup
      mockRideService.getRide.mockResolvedValue(null);
      
      // Execute
      await deleteRideCommandHandler.handleConfirmation(mockCtx);
      
      // Verify
      expect(mockRideService.getRide).toHaveBeenCalledWith('456');
      expect(mockCtx.editMessageText).toHaveBeenCalledWith('Ride not found.');
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith('Ride not found');
      expect(mockRideService.deleteRide).not.toHaveBeenCalled();
    });
    
    it('should handle unauthorized deletion attempt', async () => {
      // Setup
      const mockRide = { id: '456' };
      mockRideService.getRide.mockResolvedValue(mockRide);
      
      // Mock isRideCreator to return false
      jest.spyOn(deleteRideCommandHandler, 'isRideCreator').mockReturnValue(false);
      
      // Execute
      await deleteRideCommandHandler.handleConfirmation(mockCtx);
      
      // Verify
      expect(mockRideService.getRide).toHaveBeenCalledWith('456');
      expect(deleteRideCommandHandler.isRideCreator).toHaveBeenCalledWith(mockRide, mockCtx.from.id);
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith('Only the ride creator can delete this ride.');
      expect(mockRideService.deleteRide).not.toHaveBeenCalled();
    });
    
    it('should handle successful deletion without message ID', async () => {
      // Setup
      const mockRide = { id: '456' };
      mockRideService.getRide.mockResolvedValue(mockRide);
      
      // Mock isRideCreator
      jest.spyOn(deleteRideCommandHandler, 'isRideCreator').mockReturnValue(true);
      
      mockRideService.deleteRide.mockResolvedValue(true);
      
      // Execute
      await deleteRideCommandHandler.handleConfirmation(mockCtx);
      
      // Verify
      expect(mockRideService.getRide).toHaveBeenCalledWith('456');
      expect(deleteRideCommandHandler.isRideCreator).toHaveBeenCalledWith(mockRide, mockCtx.from.id);
      expect(mockRideService.deleteRide).toHaveBeenCalledWith('456');
      expect(mockCtx.editMessageText).toHaveBeenCalledWith('Ride deleted successfully.');
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith('Ride deleted successfully');
      expect(mockCtx.api.deleteMessage).not.toHaveBeenCalled();
    });
    
    it('should handle successful deletion with message ID', async () => {
      // Setup
      const mockRide = { id: '456', messages: [{ messageId: 789, chatId: 101112 }] };
      mockRideService.getRide.mockResolvedValue(mockRide);
      
      // Mock isRideCreator
      jest.spyOn(deleteRideCommandHandler, 'isRideCreator').mockReturnValue(true);
      
      mockRideService.deleteRide.mockResolvedValue(true);
      
      // Execute
      await deleteRideCommandHandler.handleConfirmation(mockCtx);
      
      // Verify
      expect(mockRideService.getRide).toHaveBeenCalledWith('456');
      expect(deleteRideCommandHandler.isRideCreator).toHaveBeenCalledWith(mockRide, mockCtx.from.id);
      expect(mockRideService.deleteRide).toHaveBeenCalledWith('456');
      expect(mockCtx.editMessageText).toHaveBeenCalled();
      const replyText = mockCtx.editMessageText.mock.calls[0][0];
      expect(replyText).toContain('Ride deleted successfully.');
      expect(replyText).toMatch(/Deleted 1 message\(s\)|Removed 1 unavailable message\(s\)/);
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith('Ride deleted successfully');
      expect(mockCtx.api.deleteMessage).toHaveBeenCalledWith(101112, 789);
    });
    
    it('should report deleted and unavailable messages after multi-chat deletion (multi-chat propagation)', async () => {
      // Setup
      const mockRide = {
        id: '456',
        messages: [
          { chatId: 1001, messageId: 2001 },
          { chatId: 1002, messageId: 2002 },
          { chatId: 1003, messageId: 2003 }
        ]
      };
      mockRideService.getRide.mockResolvedValue(mockRide);
      mockRideService.deleteRide.mockResolvedValue(true);
      jest.spyOn(deleteRideCommandHandler, 'isRideCreator').mockReturnValue(true);
      // Simulate deleteMessage: first and third succeed, second throws
      mockCtx.api.deleteMessage
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('Message not found'))
        .mockResolvedValueOnce({});
      mockCtx.match = ['delete:confirm:456', 'confirm', '456'];
      // Execute
      await deleteRideCommandHandler.handleConfirmation(mockCtx);
      // Verify
      expect(mockRideService.getRide).toHaveBeenCalledWith('456');
      expect(mockRideService.deleteRide).toHaveBeenCalledWith('456');
      expect(mockCtx.api.deleteMessage).toHaveBeenCalledTimes(3);
      // The reply should mention both deleted and removed counts
      expect(mockCtx.editMessageText).toHaveBeenCalled();
      const replyText = mockCtx.editMessageText.mock.calls[0][0];
      expect(replyText).toContain('Deleted 2 message(s)');
      expect(replyText).toContain('Removed 1 unavailable message(s)');
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith('Ride deleted successfully');
    });

    it('should handle error when deleting original message', async () => {
      // Setup
      const mockRide = { id: '456', messages: [{ messageId: 789, chatId: 101112 }] };
      mockRideService.getRide.mockResolvedValue(mockRide);
      
      // Mock isRideCreator
      jest.spyOn(deleteRideCommandHandler, 'isRideCreator').mockReturnValue(true);
      
      mockRideService.deleteRide.mockResolvedValue(true);
      mockCtx.api.deleteMessage.mockRejectedValue(new Error('API error'));
      
      // Mock console.error to prevent test output pollution
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      try {
        // Execute
        await deleteRideCommandHandler.handleConfirmation(mockCtx);
        
        // Verify
        expect(mockRideService.getRide).toHaveBeenCalledWith('456');
        expect(deleteRideCommandHandler.isRideCreator).toHaveBeenCalledWith(mockRide, mockCtx.from.id);
        expect(mockRideService.deleteRide).toHaveBeenCalledWith('456');
        expect(mockCtx.editMessageText).toHaveBeenCalled();
        const replyText = mockCtx.editMessageText.mock.calls[0][0];
        expect(replyText).toContain('Ride deleted successfully.');
        expect(replyText).toMatch(/Deleted \d+ message\(s\)|Removed \d+ unavailable message\(s\)/);
        expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith('Ride deleted successfully');
        expect(mockCtx.api.deleteMessage).toHaveBeenCalledWith(101112, 789);
        expect(consoleErrorSpy).toHaveBeenCalled();
      } finally {
        // Restore console.error
        consoleErrorSpy.mockRestore();
      }
    });
    
    it('should handle failed deletion', async () => {
      // Setup
      const mockRide = { id: '456' };
      mockRideService.getRide.mockResolvedValue(mockRide);
      
      // Mock isRideCreator
      jest.spyOn(deleteRideCommandHandler, 'isRideCreator').mockReturnValue(true);
      
      mockRideService.deleteRide.mockResolvedValue(false);
      
      // Execute
      await deleteRideCommandHandler.handleConfirmation(mockCtx);
      
      // Verify
      expect(mockRideService.getRide).toHaveBeenCalledWith('456');
      expect(deleteRideCommandHandler.isRideCreator).toHaveBeenCalledWith(mockRide, mockCtx.from.id);
      expect(mockRideService.deleteRide).toHaveBeenCalledWith('456');
      expect(mockCtx.editMessageText).toHaveBeenCalledWith('Failed to delete ride.');
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith('Failed to delete ride');
    });
  });
});
