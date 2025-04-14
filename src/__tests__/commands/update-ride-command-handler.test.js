/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { UpdateRideCommandHandler } from '../../commands/UpdateRideCommandHandler.js';
import { RideParamsHelper } from '../../utils/RideParamsHelper.js';

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

// Mock RideParamsHelper
jest.mock('../../utils/RideParamsHelper.js');

// Set up the mock implementation
RideParamsHelper.parseRideParams = jest.fn();
RideParamsHelper.VALID_PARAMS = {
  'title': 'Title of the ride',
  'when': 'Date and time of the ride',
  'meet': 'Meeting point',
  'route': 'Route URL',
  'dist': 'Distance in kilometers',
  'duration': 'Duration in minutes',
  'speed': 'Speed range (e.g. 25-28)',
  'info': 'Additional information',
  'category': 'Ride category',
  'id': 'Ride ID (for commands that need it)'
};

describe('UpdateRideCommandHandler', () => {
  let updateRideCommandHandler;
  let mockRideService;
  let mockMessageFormatter;
  let mockWizard;
  let mockCtx;
  
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Create mock RideService
    mockRideService = {
      extractRideId: jest.fn(),
      getRide: jest.fn(),
      isRideCreator: jest.fn(),
      updateRideFromParams: jest.fn(),
      updateRideMessages: jest.fn().mockResolvedValue({ success: true, updatedCount: 1, removedCount: 0 })
    };
    
    // Create mock MessageFormatter
    mockMessageFormatter = {
      formatRideWithKeyboard: jest.fn()
    };
    
    // Create mock Wizard
    mockWizard = {
      startWizard: jest.fn()
    };
    
    // Create mock Grammy context
    mockCtx = {
      message: {
        text: '/updateride #123',
        message_id: 456
      },
      chat: {
        id: 789
      },
      from: {
        id: 101112,
        username: 'testuser',
        first_name: 'Test',
        last_name: 'User'
      },
      reply: jest.fn().mockResolvedValue({}),
      api: {
        editMessageText: jest.fn().mockResolvedValue({})
      }
    };
    
    // Create UpdateRideCommandHandler instance with mocks
    updateRideCommandHandler = new UpdateRideCommandHandler(mockRideService, mockMessageFormatter, mockWizard);
    
    // Mock the extractRide method
    updateRideCommandHandler.extractRide = jest.fn();
  });
  
  describe('handle', () => {
    it('should handle ride not found or unauthorized', async () => {
      // Setup
      updateRideCommandHandler.extractRide.mockResolvedValue({
        ride: null,
        error: 'Ride #123 not found'
      });
      
      // Execute
      await updateRideCommandHandler.handle(mockCtx);
      
      // Verify
      expect(updateRideCommandHandler.extractRide).toHaveBeenCalledWith(mockCtx);
      expect(mockCtx.reply).toHaveBeenCalledWith('Ride #123 not found');
      expect(mockWizard.startWizard).not.toHaveBeenCalled();
    });
    
    it('should handle unauthorized user', async () => {
      // Setup
      const mockRide = { id: '456', cancelled: false };
      updateRideCommandHandler.extractRide.mockResolvedValue({ 
        ride: mockRide, 
        error: null 
      });
      
      // Mock isRideCreator to return false
      jest.spyOn(updateRideCommandHandler, 'isRideCreator').mockReturnValue(false);
      
      // Execute
      await updateRideCommandHandler.handle(mockCtx);
      
      // Verify
      expect(updateRideCommandHandler.extractRide).toHaveBeenCalledWith(mockCtx);
      expect(updateRideCommandHandler.isRideCreator).toHaveBeenCalledWith(mockRide, mockCtx.from.id);
      expect(mockCtx.reply).toHaveBeenCalledWith('Only the ride creator can update this ride.');
      expect(mockWizard.startWizard).not.toHaveBeenCalled();
    });
    
    it('should start wizard when no parameters are provided and user is authorized', async () => {
      // Setup
      const mockRide = { 
        id: '456', 
        title: 'Test Ride',
        category: 'Road',
        date: new Date(),
        meetingPoint: 'Test Point',
        routeLink: 'http://test.com',
        distance: 50,
        duration: 120,
        speedMin: 25,
        speedMax: 30
      };
      updateRideCommandHandler.extractRide.mockResolvedValue({ 
        ride: mockRide, 
        error: null 
      });
      
      // Mock isRideCreator to return true
      jest.spyOn(updateRideCommandHandler, 'isRideCreator').mockReturnValue(true);
      
      // Execute
      await updateRideCommandHandler.handle(mockCtx);
      
      // Verify
      expect(updateRideCommandHandler.extractRide).toHaveBeenCalledWith(mockCtx);
      expect(updateRideCommandHandler.isRideCreator).toHaveBeenCalledWith(mockRide, mockCtx.from.id);
      expect(mockWizard.startWizard).toHaveBeenCalledWith(
        mockCtx,
        expect.objectContaining({
          isUpdate: true,
          originalRideId: mockRide.id,
          title: mockRide.title,
          category: mockRide.category,
          datetime: mockRide.date,
          meetingPoint: mockRide.meetingPoint,
          routeLink: mockRide.routeLink,
          distance: mockRide.distance,
          duration: mockRide.duration,
          speedMin: mockRide.speedMin,
          speedMax: mockRide.speedMax
        })
      );
    });
    
    it('should handle update with parameters', async () => {
      // Setup
      const mockRide = {
        id: '123',
        title: 'Test Ride',
        category: 'Regular/Mixed Ride',
        date: new Date('2025-03-30T10:00:00Z'),
        meetingPoint: 'Test Location',
        routeLink: 'https://example.com/route',
        distance: 50,
        duration: 180,
        speedMin: 25,
        speedMax: 30
      };
      
      mockCtx.message.text = '/updateride #123\ntitle: Updated Ride\nwhen: tomorrow 11:00';
      
      updateRideCommandHandler.extractRide.mockResolvedValue({
        ride: mockRide,
        error: null
      });
      
      // Mock isRideCreator to return true
      jest.spyOn(updateRideCommandHandler, 'isRideCreator').mockReturnValue(true);
      
      RideParamsHelper.parseRideParams.mockReturnValue({
        params: {
          title: 'Updated Ride',
          when: 'tomorrow 11:00'
        },
        unknownParams: []
      });
      
      // Setup the spy for handleWithParams
      updateRideCommandHandler.handleWithParams = jest.fn();
      
      // Execute
      await updateRideCommandHandler.handle(mockCtx);
      
      // Verify
      expect(updateRideCommandHandler.extractRide).toHaveBeenCalledWith(mockCtx);
      expect(updateRideCommandHandler.isRideCreator).toHaveBeenCalledWith(mockRide, mockCtx.from.id);
      expect(RideParamsHelper.parseRideParams).toHaveBeenCalledWith(mockCtx.message.text);
      expect(updateRideCommandHandler.handleWithParams).toHaveBeenCalledWith(
        mockCtx,
        mockRide,
        {
          title: 'Updated Ride',
          when: 'tomorrow 11:00'
        }
      );
    });
  });
  
  describe('handleWithParams', () => {
    it('should update a ride with parameters and update message', async () => {
      // Setup
      const originalRide = {
        id: '123',
        title: 'Test Ride',
        date: new Date('2025-03-30T10:00:00Z'),
        meetingPoint: 'Test Location',
        messageId: 789,
        chatId: 101112
      };
      
      const params = {
        title: 'Updated Ride',
        when: 'tomorrow 11:00'
      };
      
      const updatedRide = {
        id: '123',
        title: 'Updated Ride',
        date: new Date('2025-03-31T11:00:00Z'),
        meetingPoint: 'Test Location',
        messageId: 789,
        chatId: 101112
      };
      
      mockRideService.updateRideFromParams.mockResolvedValue({
        ride: updatedRide,
        error: null
      });
      
      // Mock the updateRideMessage method
      updateRideCommandHandler.updateRideMessage = jest.fn().mockResolvedValue({
        success: true,
        updatedCount: 1,
        removedCount: 0
      });
      
      // Execute
      await updateRideCommandHandler.handleWithParams(mockCtx, originalRide, params);
      
      // Verify
      expect(mockRideService.updateRideFromParams).toHaveBeenCalledWith('123', params, 101112);
      expect(updateRideCommandHandler.updateRideMessage).toHaveBeenCalledWith(updatedRide, mockCtx);
      expect(mockCtx.reply).toHaveBeenCalledWith('Ride updated successfully. Updated 1 message(s).');
    });
    
    it('should handle error during ride update', async () => {
      // Setup
      const originalRide = {
        id: '123',
        title: 'Test Ride'
      };
      
      const params = {
        when: 'invalid date'
      };
      
      mockRideService.updateRideFromParams.mockResolvedValue({
        ride: null,
        error: 'Invalid date format'
      });
      
      // Execute
      await updateRideCommandHandler.handleWithParams(mockCtx, originalRide, params);
      
      // Verify
      expect(mockRideService.updateRideFromParams).toHaveBeenCalledWith('123', params, 101112);
      expect(mockCtx.reply).toHaveBeenCalledWith('Invalid date format');
      expect(mockCtx.reply).not.toHaveBeenCalledWith('Ride updated successfully!');
    });
  });
  
  describe('updateRideMessage', () => {
    it('should not update if messages array is missing', async () => {
      // Setup
      const ride = {
        id: '123',
        title: 'Test Ride'
        // No messages array
      };
      
      // Execute
      await updateRideCommandHandler.updateRideMessage(ride, mockCtx);
      
      // Verify
      expect(mockCtx.api.editMessageText).not.toHaveBeenCalled();
    });
    
    it('should not update if messages array is empty', async () => {
      // Setup
      const ride = {
        id: '123',
        title: 'Test Ride',
        messages: []
      };
      
      // Execute
      await updateRideCommandHandler.updateRideMessage(ride, mockCtx);
      
      // Verify
      expect(mockCtx.api.editMessageText).not.toHaveBeenCalled();
    });
    
    it('should update ride message successfully', async () => {
      // Setup
      const ride = {
        id: '123',
        title: 'Test Ride',
        messages: [
          { messageId: 789, chatId: 101112 }
        ]
      };
      
      const participants = [
        { userId: 456, firstName: 'Test', lastName: 'User' }
      ];
      
      mockMessageFormatter.formatRideWithKeyboard.mockReturnValue({
        message: 'Updated ride message',
        keyboard: { inline_keyboard: [] },
        parseMode: 'HTML'
      });
      
      // Execute
      await updateRideCommandHandler.updateRideMessage(ride, mockCtx);
      
      // Verify
      expect(mockRideService.updateRideMessages).toHaveBeenCalledWith(ride, mockCtx);
    });
    
    it('should handle error during message update', async () => {
      // Setup
      const ride = {
        id: '123',
        title: 'Test Ride',
        messages: [
          { messageId: 789, chatId: 101112 }
        ]
      };
      
      mockRideService.updateRideMessages.mockResolvedValue({ success: false, error: 'Database error' });
      
      // Temporarily mock console.error
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      // Execute
      await updateRideCommandHandler.updateRideMessage(ride, mockCtx);
      
      // Verify
      expect(mockRideService.updateRideMessages).toHaveBeenCalledWith(ride, mockCtx);
      expect(consoleErrorSpy).toHaveBeenCalled();
      
      // Restore console.error
      consoleErrorSpy.mockRestore();
    });
  });
});
