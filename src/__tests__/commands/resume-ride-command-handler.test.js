/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { ResumeRideCommandHandler } from '../../commands/ResumeRideCommandHandler.js';

describe('ResumeRideCommandHandler', () => {
  let resumeRideCommandHandler;
  let mockRideService;
  let mockMessageFormatter;
  let mockCtx;
  
  beforeEach(() => {
    // Create mock RideService
    mockRideService = {
      extractRideId: jest.fn(),
      getRide: jest.fn(),
      isRideCreator: jest.fn(),
      resumeRide: jest.fn(),
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
      message: { text: '/resumeride 456' }
    };
    
    // Create ResumeRideCommandHandler instance with mocks
    resumeRideCommandHandler = new ResumeRideCommandHandler(mockRideService, mockMessageFormatter);
    
    // Mock the extractRide method to isolate tests
    resumeRideCommandHandler.extractRide = jest.fn();
  });
  
  describe('handle', () => {
    it('should reply with error when ride extraction fails', async () => {
      // Setup
      resumeRideCommandHandler.extractRide.mockResolvedValue({ 
        ride: null, 
        error: 'No ride ID found' 
      });
      
      // Execute
      await resumeRideCommandHandler.handle(mockCtx);
      
      // Verify
      expect(resumeRideCommandHandler.extractRide).toHaveBeenCalledWith(mockCtx);
      expect(mockCtx.reply).toHaveBeenCalledWith('No ride ID found');
      expect(mockRideService.resumeRide).not.toHaveBeenCalled();
    });
    
    it('should reply with message when ride is not cancelled', async () => {
      // Setup
      const mockRide = { id: '456', cancelled: false };
      resumeRideCommandHandler.extractRide.mockResolvedValue({ 
        ride: mockRide, 
        error: null 
      });
      
      // Mock isRideCreator to return true
      jest.spyOn(resumeRideCommandHandler, 'isRideCreator').mockReturnValue(true);
      
      // Execute
      await resumeRideCommandHandler.handle(mockCtx);
      
      // Verify
      expect(resumeRideCommandHandler.extractRide).toHaveBeenCalledWith(mockCtx);
      expect(resumeRideCommandHandler.isRideCreator).toHaveBeenCalledWith(mockRide, mockCtx.from.id);
      expect(mockCtx.reply).toHaveBeenCalledWith('This ride is not cancelled.');
      expect(mockRideService.resumeRide).not.toHaveBeenCalled();
    });
    
    it('should resume ride and update messages when successful', async () => {
      // Setup
      const mockRide = { id: '456', cancelled: true };
      const updatedRide = { id: '456', cancelled: false };
      
      resumeRideCommandHandler.extractRide.mockResolvedValue({ 
        ride: mockRide, 
        error: null 
      });
      
      // Mock isRideCreator
      jest.spyOn(resumeRideCommandHandler, 'isRideCreator').mockReturnValue(true);
      
      mockRideService.resumeRide.mockResolvedValue(updatedRide);
      
      // Mock the updateRideMessage method
      resumeRideCommandHandler.updateRideMessage = jest.fn().mockResolvedValue({
        success: true,
        updatedCount: 1,
        removedCount: 0
      });
      
      // Execute
      await resumeRideCommandHandler.handle(mockCtx);
      
      // Verify
      expect(resumeRideCommandHandler.extractRide).toHaveBeenCalledWith(mockCtx);
      expect(resumeRideCommandHandler.isRideCreator).toHaveBeenCalledWith(mockRide, mockCtx.from.id);
      expect(mockRideService.resumeRide).toHaveBeenCalledWith('456', mockCtx.from.id);
      expect(resumeRideCommandHandler.updateRideMessage).toHaveBeenCalledWith(updatedRide, mockCtx);
      expect(mockCtx.reply).toHaveBeenCalledWith('Ride resumed successfully. Updated 1 message(s).');
    });
    
    it('should handle case when no messages were updated', async () => {
      // Setup
      const mockRide = { id: '456', cancelled: true };
      const updatedRide = { id: '456', cancelled: false };
      
      resumeRideCommandHandler.extractRide.mockResolvedValue({ 
        ride: mockRide, 
        error: null 
      });
      
      // Mock isRideCreator
      jest.spyOn(resumeRideCommandHandler, 'isRideCreator').mockReturnValue(true);
      
      mockRideService.resumeRide.mockResolvedValue(updatedRide);
      mockRideService.updateRideMessages.mockResolvedValue({ success: true, updatedCount: 0, removedCount: 0 });
      
      // Mock the updateRideMessage method to return no updates
      resumeRideCommandHandler.updateRideMessage = jest.fn().mockResolvedValue({
        success: true,
        updatedCount: 0,
        removedCount: 0
      });
      
      // Execute
      await resumeRideCommandHandler.handle(mockCtx);
      
      // Verify
      expect(resumeRideCommandHandler.extractRide).toHaveBeenCalledWith(mockCtx);
      expect(resumeRideCommandHandler.isRideCreator).toHaveBeenCalledWith(mockRide, mockCtx.from.id);
      expect(mockRideService.resumeRide).toHaveBeenCalledWith('456', mockCtx.from.id);
      expect(resumeRideCommandHandler.updateRideMessage).toHaveBeenCalledWith(updatedRide, mockCtx);
      expect(mockCtx.reply).toHaveBeenCalledWith('Ride has been resumed, but no messages were updated. You may want to /postride the ride in the chats of your choice again, they could have been removed.');
    });

    it('should handle unauthorized user', async () => {
      // Setup
      const mockRide = { id: '456', cancelled: true };
      
      resumeRideCommandHandler.extractRide.mockResolvedValue({ 
        ride: mockRide, 
        error: null 
      });
      
      // Mock isRideCreator to return false
      jest.spyOn(resumeRideCommandHandler, 'isRideCreator').mockReturnValue(false);
      
      // Execute
      await resumeRideCommandHandler.handle(mockCtx);
      
      // Verify
      expect(resumeRideCommandHandler.extractRide).toHaveBeenCalledWith(mockCtx);
      expect(resumeRideCommandHandler.isRideCreator).toHaveBeenCalledWith(mockRide, mockCtx.from.id);
      expect(mockCtx.reply).toHaveBeenCalledWith('Only the ride creator can resume this ride.');
      expect(mockRideService.resumeRide).not.toHaveBeenCalled();
    });
  });
});
