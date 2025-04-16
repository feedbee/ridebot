/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { NewRideCommandHandler } from '../../commands/NewRideCommandHandler.js';
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

describe('NewRideCommandHandler', () => {
  let newRideCommandHandler;
  let mockRideService;
  let mockMessageFormatter;
  let mockRideMessagesService;
  let mockWizard;
  let mockCtx;
  
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock RideService
    mockRideService = {
      createRide: jest.fn(),
      createRideFromParams: jest.fn(),
      updateRide: jest.fn(),
      getRide: jest.fn()
    };
    
    // Create mock MessageFormatter
    mockMessageFormatter = {
      formatRideDetails: jest.fn()
    };
    
    // Create mock RideMessagesService
    mockRideMessagesService = {
      createRideMessage: jest.fn().mockResolvedValue({}),
      extractRideId: jest.fn()
    };
    
    // Create mock Wizard
    mockWizard = {
      startWizard: jest.fn()
    };
    
    // Create mock Grammy context
    mockCtx = {
      message: {
        text: '/newride',
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
      reply: jest.fn().mockResolvedValue({})
    };
    
    // Create NewRideCommandHandler instance with mocks
    newRideCommandHandler = new NewRideCommandHandler(mockRideService, mockMessageFormatter, mockWizard, mockRideMessagesService);
  });
  
  describe('handle', () => {
    it('should start wizard when no parameters are provided', async () => {
      // Execute
      await newRideCommandHandler.handle(mockCtx);
      
      // Verify
      expect(mockWizard.startWizard).toHaveBeenCalledWith(mockCtx, null);
      expect(RideParamsHelper.parseRideParams).not.toHaveBeenCalled();
    });
    
    it('should start wizard with prefill data when provided', async () => {
      // Setup
      const prefillData = {
        title: 'Test Ride',
        datetime: new Date('2025-03-31T10:00:00Z')
      };
      
      // Execute
      await newRideCommandHandler.handle(mockCtx, prefillData);
      
      // Verify
      expect(mockWizard.startWizard).toHaveBeenCalledWith(mockCtx, prefillData);
      expect(RideParamsHelper.parseRideParams).not.toHaveBeenCalled();
    });
    
    it('should handle creation with parameters', async () => {
      // Setup
      mockCtx.message.text = '/newride\ntitle: Test Ride\nwhen: tomorrow 11:00\nmeet: Test Location';
      
      RideParamsHelper.parseRideParams.mockReturnValue({
        params: {
          title: 'Test Ride',
          when: 'tomorrow 11:00',
          meet: 'Test Location'
        },
        unknownParams: []
      });
      
      // Setup the spy for handleWithParams
      newRideCommandHandler.handleWithParams = jest.fn();
      
      // Execute
      await newRideCommandHandler.handle(mockCtx);
      
      // Verify
      expect(RideParamsHelper.parseRideParams).toHaveBeenCalledWith(mockCtx.message.text);
      expect(newRideCommandHandler.handleWithParams).toHaveBeenCalledWith(
        mockCtx,
        {
          title: 'Test Ride',
          when: 'tomorrow 11:00',
          meet: 'Test Location'
        }
      );
      expect(mockWizard.startWizard).not.toHaveBeenCalled();
    });

    it('should handle unknown parameters', async () => {
      // Setup
      mockCtx.message.text = '/newride\ntitle: Test Ride\nwhen: tomorrow 11:00\nlocation: Test Location';
      
      RideParamsHelper.parseRideParams.mockReturnValue({
        params: {
          title: 'Test Ride',
          when: 'tomorrow 11:00'
        },
        unknownParams: ['location']
      });
      
      // Setup spy for handleWithParams
      jest.spyOn(newRideCommandHandler, 'handleWithParams');
      
      // Execute
      await newRideCommandHandler.handle(mockCtx);
      
      // Verify
      expect(RideParamsHelper.parseRideParams).toHaveBeenCalledWith(mockCtx.message.text);
      expect(mockCtx.reply).toHaveBeenCalled();
      expect(newRideCommandHandler.handleWithParams).not.toHaveBeenCalled();
      expect(mockWizard.startWizard).not.toHaveBeenCalled();
    });
  });
  
  describe('handleWithParams', () => {
    it('should create a ride with parameters', async () => {
      // Setup
      mockCtx.message.text = '/newride\ntitle: Test Ride\nwhen: tomorrow 10:00';
      
      const createdRide = {
        id: '123',
        title: 'Test Ride',
        date: new Date('2025-03-30T10:00:00Z')
      };
      
      mockRideService.createRideFromParams.mockResolvedValue({
        ride: createdRide,
        error: null
      });
      
      // Execute
      await newRideCommandHandler.handleWithParams(mockCtx, {
        title: 'Test Ride',
        when: 'tomorrow 10:00'
      });
      
      // Verify
      expect(mockRideService.createRideFromParams).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Test Ride',
          when: 'tomorrow 10:00'
        }),
        789,
        101112
      );
      
      // Verify that createRideMessage was called with the correct parameters
      expect(mockRideMessagesService.createRideMessage).toHaveBeenCalledWith(createdRide, mockCtx);
    });

    it('should create a ride with parameters and include message thread ID in topic', async () => {
      // Setup
      const params = {
        title: 'Topic Test Ride',
        when: 'tomorrow 11:00',
        meet: 'Topic Location'
      };
      
      const createdRide = {
        id: '456',
        title: 'Topic Test Ride',
        date: new Date('2025-03-31T11:00:00Z'),
        meetingPoint: 'Topic Location'
      };
      
      mockRideService.createRideFromParams.mockResolvedValue({
        ride: createdRide,
        error: null
      });
      
      mockMessageFormatter.formatRideDetails.mockReturnValue({
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
      await newRideCommandHandler.handleWithParams(topicCtx, params);
      
      // Verify
      expect(mockRideService.createRideFromParams).toHaveBeenCalledWith(
        params,
        789, // chat.id
        101112 // from.id
      );
      
      // Verify that createRideMessage was called with the correct parameters
      expect(mockRideMessagesService.createRideMessage).toHaveBeenCalledWith(createdRide, topicCtx);
    });
    
    it('should handle error during ride creation', async () => {
      // Setup
      const params = {
        title: 'Test Ride',
        when: 'invalid date'
      };
      
      mockRideService.createRideFromParams.mockResolvedValue({
        ride: null,
        error: 'Invalid date format'
      });
      
      // Execute
      await newRideCommandHandler.handleWithParams(mockCtx, params);
      
      // Verify
      expect(mockRideService.createRideFromParams).toHaveBeenCalledWith(
        params,
        789, // chat.id
        101112 // from.id
      );
      
      expect(mockCtx.reply).toHaveBeenCalledWith('Invalid date format');
      expect(mockRideMessagesService.createRideMessage).not.toHaveBeenCalled();
    });

    it('should create ride message with thread ID when in a topic', async () => {
      // Setup
      const params = {
        title: 'Test Ride',
        when: 'tomorrow 10:00'
      };
      
      const createdRide = {
        id: '123',
        title: 'Test Ride',
        date: new Date('2025-03-30T10:00:00Z')
      };
      
      mockRideService.createRideFromParams.mockResolvedValue({
        ride: createdRide,
        error: null
      });
      
      const threadCtx = {
        ...mockCtx,
        message: {
          ...mockCtx.message,
          message_thread_id: 999
        }
      };
      
      // Execute
      await newRideCommandHandler.handleWithParams(threadCtx, params);
      
      // Verify
      expect(mockRideService.createRideFromParams).toHaveBeenCalledWith(
        params,
        789,
        101112
      );
      
      expect(mockRideMessagesService.createRideMessage).toHaveBeenCalledWith(createdRide, threadCtx);
    });
  });
});
