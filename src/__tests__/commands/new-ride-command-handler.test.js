/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { NewRideCommandHandler } from '../../commands/NewRideCommandHandler.js';

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

describe('NewRideCommandHandler', () => {
  let newRideCommandHandler;
  let mockRideService;
  let mockMessageFormatter;
  let mockWizard;
  let mockCtx;
  
  beforeEach(() => {
    // Create mock RideService
    mockRideService = {
      parseRideParams: jest.fn(),
      createRideFromParams: jest.fn(),
      getParticipants: jest.fn(),
      updateRide: jest.fn(),
      createRideMessage: jest.fn().mockResolvedValue({
        sentMessage: { message_id: 13579 },
        updatedRide: { id: '123' }
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
      reply: jest.fn().mockResolvedValue({ message_id: 13579 })
    };
    
    // Create NewRideCommandHandler instance with mocks
    newRideCommandHandler = new NewRideCommandHandler(mockRideService, mockMessageFormatter, mockWizard);
  });
  
  describe('handle', () => {
    it('should start wizard when no parameters are provided', async () => {
      // Execute
      await newRideCommandHandler.handle(mockCtx);
      
      // Verify
      expect(mockWizard.startWizard).toHaveBeenCalledWith(mockCtx, null);
      expect(mockRideService.parseRideParams).not.toHaveBeenCalled();
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
      expect(mockRideService.parseRideParams).not.toHaveBeenCalled();
    });
    
    it('should handle creation with parameters', async () => {
      // Setup
      mockCtx.message.text = '/newride\ntitle: Test Ride\nwhen: tomorrow 11:00\nmeet: Test Location';
      
      mockRideService.parseRideParams.mockReturnValue({
        title: 'Test Ride',
        when: 'tomorrow 11:00',
        meet: 'Test Location'
      });
      
      // Setup the spy for handleWithParams
      newRideCommandHandler.handleWithParams = jest.fn();
      
      // Execute
      await newRideCommandHandler.handle(mockCtx);
      
      // Verify
      expect(mockRideService.parseRideParams).toHaveBeenCalledWith(mockCtx.message.text);
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
  });
  
  describe('handleWithParams', () => {
    it('should create a ride with parameters and send message', async () => {
      // Setup
      const params = {
        title: 'Test Ride',
        when: 'tomorrow 11:00',
        meet: 'Test Location'
      };
      
      const createdRide = {
        id: '123',
        title: 'Test Ride',
        date: new Date('2025-03-31T11:00:00Z'),
        meetingPoint: 'Test Location'
      };
      
      mockRideService.createRideFromParams.mockResolvedValue({
        ride: createdRide,
        error: null
      });
      
      mockRideService.getParticipants.mockResolvedValue([]);
      
      mockMessageFormatter.formatRideWithKeyboard.mockReturnValue({
        message: 'New ride message',
        keyboard: { inline_keyboard: [] },
        parseMode: 'HTML'
      });
      
      // Execute
      await newRideCommandHandler.handleWithParams(mockCtx, params);
      
      // Verify
      expect(mockRideService.createRideFromParams).toHaveBeenCalledWith(
        params,
        789, // chat.id
        101112 // from.id
      );
      
      // Verify that createRideMessage was called with the correct parameters
      expect(mockRideService.createRideMessage).toHaveBeenCalledWith(createdRide, mockCtx);
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
      
      mockRideService.getParticipants.mockResolvedValue([]);
      
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
      await newRideCommandHandler.handleWithParams(topicCtx, params);
      
      // Verify
      expect(mockRideService.createRideFromParams).toHaveBeenCalledWith(
        params,
        789, // chat.id
        101112 // from.id
      );
      
      // These expectations are no longer needed since they're handled by createRideMessage
      
      // Verify that createRideMessage was called with the correct parameters
      expect(mockRideService.createRideMessage).toHaveBeenCalledWith(createdRide, topicCtx);
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
      expect(mockRideService.getParticipants).not.toHaveBeenCalled();
      expect(mockRideService.updateRide).not.toHaveBeenCalled();
    });
  });
});
