/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { DuplicateRideCommandHandler } from '../../commands/DuplicateRideCommandHandler.js';
import { parseDateTimeInput } from '../../utils/date-input-parser.js';
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

describe('DuplicateRideCommandHandler', () => {
  let duplicateRideCommandHandler;
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
      createRide: jest.fn(),
      updateRide: jest.fn(),
      createRideMessage: jest.fn().mockResolvedValue({
        sentMessage: { message_id: 13579 },
        updatedRide: { id: '456' }
      })
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
        text: '/dupride #123',
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
      reply: jest.fn().mockResolvedValue({ message_id: 13579 })
    };
    
    // Create DuplicateRideCommandHandler instance with mocks
    duplicateRideCommandHandler = new DuplicateRideCommandHandler(mockRideService, mockMessageFormatter, mockWizard);
    
    // Mock the extractRide method
    duplicateRideCommandHandler.extractRide = jest.fn();
  });
  
  describe('handle', () => {
    it('should handle ride not found', async () => {
      // Setup
      duplicateRideCommandHandler.extractRide.mockResolvedValue({
        ride: null,
        error: 'Ride #123 not found'
      });
      
      // Execute
      await duplicateRideCommandHandler.handle(mockCtx);
      
      // Verify
      expect(duplicateRideCommandHandler.extractRide).toHaveBeenCalledWith(mockCtx);
      expect(mockCtx.reply).toHaveBeenCalledWith('Ride #123 not found');
      expect(mockWizard.startWizard).not.toHaveBeenCalled();
    });
    
    it('should start wizard with prefilled data when no parameters are provided', async () => {
      // Setup
      const originalDate = new Date('2025-03-30T10:00:00Z');
      const expectedTomorrow = new Date('2025-03-31T10:00:00Z');
      
      const mockRide = {
        id: '123',
        title: 'Test Ride',
        date: originalDate,
        meetingPoint: 'Test Location',
        routeLink: 'https://example.com/route',
        distance: 50,
        duration: 180,
        speedMin: 25,
        speedMax: 30
      };
      
      duplicateRideCommandHandler.extractRide.mockResolvedValue({
        ride: mockRide,
        error: null
      });
      
      // Execute
      await duplicateRideCommandHandler.handle(mockCtx);
      
      // Verify
      expect(duplicateRideCommandHandler.extractRide).toHaveBeenCalledWith(mockCtx);
      expect(mockWizard.startWizard).toHaveBeenCalledWith(mockCtx, {
        title: 'Test Ride',
        datetime: expectedTomorrow,
        meetingPoint: 'Test Location',
        routeLink: 'https://example.com/route',
        distance: 50,
        duration: 180,
        speedMin: 25,
        speedMax: 30
      });
    });
    
    it('should handle duplication with parameters', async () => {
      // Setup
      const mockRide = {
        id: '123',
        title: 'Test Ride',
        date: new Date('2025-03-30T10:00:00Z'),
        meetingPoint: 'Test Location',
        routeLink: 'https://example.com/route',
        distance: 50,
        duration: 180,
        speedMin: 25,
        speedMax: 30
      };
      
      mockCtx.message.text = '/dupride #123\ntitle: New Ride\nwhen: tomorrow 11:00\nmeet: New Location';
      
      duplicateRideCommandHandler.extractRide.mockResolvedValue({
        ride: mockRide,
        error: null
      });
      
      RideParamsHelper.parseRideParams.mockReturnValue({
        params: {
          title: 'New Ride',
          when: 'tomorrow 11:00',
          meet: 'New Location'
        },
        unknownParams: []
      });
      
      mockRideService.createRide.mockResolvedValue({
        id: '456',
        title: 'New Ride'
      });
      
      mockMessageFormatter.formatRideWithKeyboard.mockReturnValue({
        message: 'New ride message',
        keyboard: { inline_keyboard: [] },
        parseMode: 'HTML'
      });
      
      // Setup the spy for handleWithParams
      duplicateRideCommandHandler.handleWithParams = jest.fn();
      
      // Execute
      await duplicateRideCommandHandler.handle(mockCtx);
      
      // Verify
      expect(duplicateRideCommandHandler.extractRide).toHaveBeenCalledWith(mockCtx);
      expect(RideParamsHelper.parseRideParams).toHaveBeenCalledWith(mockCtx.message.text);
      expect(duplicateRideCommandHandler.handleWithParams).toHaveBeenCalledWith(
        mockCtx,
        mockRide,
        {
          title: 'New Ride',
          when: 'tomorrow 11:00',
          meet: 'New Location'
        }
      );
    });
  });
  
  describe('handleWithParams', () => {
    it('should create a duplicate ride with modified parameters', async () => {
      // Setup
      const originalRide = {
        id: '123',
        title: 'Test Ride',
        date: new Date('2025-03-30T10:00:00Z'),
        meetingPoint: 'Test Location',
        routeLink: 'https://example.com/route',
        distance: 50,
        duration: 180,
        speedMin: 25,
        speedMax: 30
      };
      
      const params = {
        title: 'New Ride',
        when: 'tomorrow 11:00',
        meet: 'New Location',
        speed: '20-28'
      };
      
      const parsedDate = parseDateTimeInput(params.when);
      
      mockRideService.createRide.mockResolvedValue({
        id: '456',
        title: 'New Ride'
      });
      
      mockMessageFormatter.formatRideWithKeyboard.mockReturnValue({
        message: 'New ride message',
        keyboard: { inline_keyboard: [] },
        parseMode: 'HTML'
      });
      
      // Execute
      await duplicateRideCommandHandler.handleWithParams(mockCtx, originalRide, params);
      
      // Verify
      expect(mockRideService.createRide).toHaveBeenCalledWith(expect.objectContaining({
        title: 'New Ride',
        messages: [],
        createdBy: 101112,
        meetingPoint: 'New Location',
        routeLink: 'https://example.com/route',
        distance: 50,
        duration: 180,
        speedMin: 20,
        speedMax: 28,
        date: parsedDate.date
      }));
      
      // Verify that createRideMessage was called with the correct parameters
      expect(mockRideService.createRideMessage).toHaveBeenCalledWith(
        { id: '456', title: 'New Ride' },
        mockCtx
      );
      
      expect(mockCtx.reply).toHaveBeenCalledWith('Ride duplicated successfully!');
    });
    
    it('should create a duplicate ride with message thread ID in topic', async () => {
      // Setup
      const originalRide = {
        id: '123',
        title: 'Test Ride',
        date: new Date('2025-03-30T10:00:00Z'),
        meetingPoint: 'Test Location',
        routeLink: 'https://example.com/route',
        distance: 50,
        duration: 180,
        speedMin: 25,
        speedMax: 30
      };
      
      const params = {
        title: 'Topic Ride',
        when: 'tomorrow 11:00',
        meet: 'Topic Location',
        speed: '20-28'
      };
      
      const parsedDate = parseDateTimeInput(params.when);
      
      mockRideService.createRide.mockResolvedValue({
        id: '789',
        title: 'Topic Ride'
      });
      
      mockMessageFormatter.formatRideWithKeyboard.mockReturnValue({
        message: 'New topic ride message',
        keyboard: { inline_keyboard: [] },
        parseMode: 'HTML'
      });
      
      // Create a context with message_thread_id
      const topicCtx = {
        ...mockCtx,
        message: {
          ...mockCtx.message,
          message_thread_id: 5678 // This is the topic ID
        },
        reply: jest.fn().mockResolvedValue({ message_id: 24680 })
      };
      
      // Execute
      await duplicateRideCommandHandler.handleWithParams(topicCtx, originalRide, params);
      
      // Verify
      expect(mockRideService.createRide).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Topic Ride',
        messages: [],
        createdBy: 101112,
        meetingPoint: 'Topic Location',
        routeLink: 'https://example.com/route',
        distance: 50,
        duration: 180,
        speedMin: 20,
        speedMax: 28,
        date: parsedDate.date
      }));
      
      // Verify that createRideMessage was called with the correct parameters
      expect(mockRideService.createRideMessage).toHaveBeenCalledWith(
        { id: '789', title: 'Topic Ride' },
        topicCtx
      );
      
      expect(topicCtx.reply).toHaveBeenCalledWith('Ride duplicated successfully!');
    });
    
    it('should handle date parsing error', async () => {
      // Setup
      const originalRide = {
        id: '123',
        title: 'Test Ride',
        date: new Date('2025-03-30T10:00:00Z')
      };
      
      const params = {
        when: 'invalid date'
      };
      
      const parsedDate = parseDateTimeInput(params.when);
      
      // Temporarily mock console.error
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      // Execute
      await duplicateRideCommandHandler.handleWithParams(mockCtx, originalRide, params);
      
      // Verify
      expect(mockCtx.reply).toHaveBeenCalledWith(parsedDate.error);
      expect(mockRideService.createRide).not.toHaveBeenCalled();
      
      // Restore console.error
      consoleErrorSpy.mockRestore();
    });
    
    it('should use default values when parameters are not provided', async () => {
      // Setup
      const originalDate = new Date('2025-03-30T10:00:00Z');
      const expectedTomorrow = new Date('2025-03-31T10:00:00Z');
      
      const originalRide = {
        id: '123',
        title: 'Test Ride',
        date: originalDate,
        meetingPoint: 'Test Location',
        routeLink: 'https://example.com/route',
        distance: 50,
        duration: 180,
        speedMin: 25,
        speedMax: 30
      };
      
      const params = {}; // Empty params
      
      mockRideService.createRide.mockResolvedValue({
        id: '456',
        title: 'Test Ride'
      });
      
      mockMessageFormatter.formatRideWithKeyboard.mockReturnValue({
        message: 'New ride message',
        keyboard: { inline_keyboard: [] },
        parseMode: 'HTML'
      });
      
      // Execute
      await duplicateRideCommandHandler.handleWithParams(mockCtx, originalRide, params);
      
      // Verify
      expect(mockRideService.createRide).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Test Ride',
        messages: [],
        createdBy: 101112,
        meetingPoint: 'Test Location',
        routeLink: 'https://example.com/route',
        distance: 50,
        duration: 180,
        date: expectedTomorrow,
        speedMin: 25,
        speedMax: 30
      }));
    });
    
    it('should handle error during ride creation', async () => {
      // Setup
      const originalRide = {
        id: '123',
        title: 'Test Ride',
        date: new Date('2025-03-30T10:00:00Z')
      };
      
      const params = {};
      
      mockRideService.createRide.mockRejectedValue(new Error('Database error'));
      
      // Temporarily mock console.error
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      // Execute
      await duplicateRideCommandHandler.handleWithParams(mockCtx, originalRide, params);
      
      // Verify
      expect(mockCtx.reply).toHaveBeenCalledWith('An error occurred while duplicating the ride.');
      
      // Restore console.error
      consoleErrorSpy.mockRestore();
    });
  });
});
