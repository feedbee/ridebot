/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { ParticipationHandlers } from '../../commands/ParticipationHandlers.js';
import { t } from '../../i18n/index.js';

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

describe.each(['en', 'ru'])('ParticipationHandlers (%s)', (language) => {
  let participationHandlers;
  let mockRideService;
  let mockRideParticipationService;
  let mockMessageFormatter;
  let mockRideMessagesService;
  let mockCtx;
  const tr = (key, params = {}) => t(language, key, params, { fallbackLanguage: 'en' });

  beforeEach(() => {
    // Create mock RideService
    mockRideService = {};
    mockRideParticipationService = {
      changeParticipation: jest.fn()
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
      lang: language,
      t: jest.fn((key, params = {}) => tr(key, params)),
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
    participationHandlers = new ParticipationHandlers(
      mockRideService, mockMessageFormatter, mockRideMessagesService, mockRideParticipationService
    );
  });
  
  describe('handleJoinRide', () => {
    it('should handle ride not found', async () => {
      // Setup
      mockRideParticipationService.changeParticipation.mockResolvedValue({ status: 'ride_not_found', targetState: 'joined' });
      
      // Execute
      await participationHandlers.handleJoinRide(mockCtx);
      
      // Verify
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith(tr('commands.participation.rideNotFound'));
    });
    
    it('should handle cancelled ride', async () => {
      // Setup
      mockRideParticipationService.changeParticipation.mockResolvedValue({
        status: 'ride_cancelled',
        ride: { id: '123', cancelled: true },
        targetState: 'joined'
      });
      
      // Execute
      await participationHandlers.handleJoinRide(mockCtx);
      
      // Verify
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith(tr('commands.participation.rideCancelled'));
    });
    
    it('should add participant successfully', async () => {
      // Setup
      const mockRide = {
        id: '123',
        cancelled: false,
        messageId: 789,
        chatId: 101112
      };
      mockRideParticipationService.changeParticipation.mockResolvedValue({
        status: 'changed',
        ride: mockRide,
        previousState: null,
        targetState: 'joined'
      });
      
      // Mock the dependency, not the method under test
      mockRideMessagesService.updateRideMessages.mockResolvedValue({
        success: true,
        updatedCount: 1,
        removedCount: 0
      });
      
      // Execute
      await participationHandlers.handleJoinRide(mockCtx);
      
      // Verify
      expect(mockRideParticipationService.changeParticipation).toHaveBeenCalledWith({
        rideId: '123',
        participantProfile: expect.objectContaining({
          userId: 456,
          username: 'testuser',
          firstName: 'Test',
          lastName: 'User'
        }),
        targetState: 'joined',
        language,
        api: mockCtx.api
      });
      expect(mockRideMessagesService.updateRideMessages).toHaveBeenCalledWith(mockRide, mockCtx);
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith(tr('commands.participation.joinedSuccess'));
    });
    
    it('should pass normalized UserProfile to participation service on successful join', async () => {
      const mockRide = {
        id: '123',
        cancelled: false,
        createdBy: 999,
        settings: {
          notifyParticipation: true
        }
      };
      mockRideParticipationService.changeParticipation.mockResolvedValue({
        status: 'changed',
        ride: mockRide,
        previousState: null,
        targetState: 'joined'
      });
      mockRideMessagesService.updateRideMessages.mockResolvedValue({ success: true, updatedCount: 1, removedCount: 0 });

      await participationHandlers.handleJoinRide(mockCtx);

      expect(mockRideParticipationService.changeParticipation).toHaveBeenCalledWith(
        expect.objectContaining({
          participantProfile: expect.objectContaining({
            userId: 456,
            username: 'testuser',
            firstName: 'Test',
            lastName: 'User'
          })
        })
      );
    });

    it('should not update ride messages when participation unchanged', async () => {
      mockRideParticipationService.changeParticipation.mockResolvedValue({ status: 'already_in_state', targetState: 'joined' });

      await participationHandlers.handleJoinRide(mockCtx);

      expect(mockRideMessagesService.updateRideMessages).not.toHaveBeenCalled();
    });

    // Multi-chat propagation: just expect the simple reply
    it('should report join with simple reply even after multi-chat propagation', async () => {
      // Setup
      const mockRide = {
        id: '123',
        cancelled: false
      };
      mockRideParticipationService.changeParticipation.mockResolvedValue({
        status: 'changed',
        ride: mockRide,
        previousState: null,
        targetState: 'joined'
      });
      // Mock the dependency, not the method under test
      mockRideMessagesService.updateRideMessages.mockResolvedValue({
        success: true,
        updatedCount: 2,
        removedCount: 1
      });
      // Execute
      await participationHandlers.handleJoinRide(mockCtx);
      // Verify
      expect(mockRideMessagesService.updateRideMessages).toHaveBeenCalledWith(mockRide, mockCtx);
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith(tr('commands.participation.joinedSuccess'));
    });

    it('should handle already joined ride', async () => {
      // Setup
      mockRideParticipationService.changeParticipation.mockResolvedValue({ status: 'already_in_state', targetState: 'joined' });
      
      // Execute
      await participationHandlers.handleJoinRide(mockCtx);
      
      // Verify
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith(
        tr('commands.participation.alreadyInState', {
          state: tr('commands.participation.states.joined')
        })
      );
    });
    
    it('should handle error during join', async () => {
      // Setup
      const dbError = new Error('Database error');
      mockRideParticipationService.changeParticipation.mockRejectedValue(dbError);
      
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
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith(tr('commands.participation.genericError'));
      
      // Verify no partial state - setParticipation should not have been called
      expect(mockRideMessagesService.updateRideMessages).not.toHaveBeenCalled();
      
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
      mockRideParticipationService.changeParticipation.mockResolvedValue({
        status: 'changed',
        ride: mockRide,
        previousState: null,
        targetState: 'thinking'
      });
      mockRideMessagesService.updateRideMessages.mockResolvedValue({ success: true });

      // Execute
      await participationHandlers.handleThinkingRide(mockCtx);

      // Verify
      expect(mockRideParticipationService.changeParticipation).toHaveBeenCalledWith(
        expect.objectContaining({ rideId: '123', targetState: 'thinking' })
      );
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith(tr('commands.participation.thinkingSuccess'));
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
      mockRideParticipationService.changeParticipation.mockResolvedValue({
        status: 'changed',
        ride: mockRide,
        previousState: null,
        targetState: 'skipped'
      });
      mockRideMessagesService.updateRideMessages.mockResolvedValue({ success: true });

      // Execute
      await participationHandlers.handleSkipRide(mockCtx);

      // Verify
      expect(mockRideParticipationService.changeParticipation).toHaveBeenCalledWith(
        expect.objectContaining({ rideId: '123', targetState: 'skipped' })
      );
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith(tr('commands.participation.skippedSuccess'));
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
