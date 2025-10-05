/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { ListParticipantsCommandHandler } from '../../commands/ListParticipantsCommandHandler.js';

describe('ListParticipantsCommandHandler', () => {
  let listParticipantsHandler;
  let mockRideService;
  let mockMessageFormatter;
  let mockRideMessagesService;
  let mockCtx;

  beforeEach(() => {
    // Create mock services
    mockRideService = {
      getRide: jest.fn()
    };

    mockMessageFormatter = {
      formatRideDetails: jest.fn(),
      formatParticipant: jest.fn()
    };

    mockRideMessagesService = {
      extractRideId: jest.fn()
    };

    // Create mock Grammy context
    mockCtx = {
      reply: jest.fn().mockResolvedValue({}),
      from: { id: 123 },
      message: {
        text: '/listparticipants abc123'
      }
    };

    // Create handler instance
    listParticipantsHandler = new ListParticipantsCommandHandler(
      mockRideService,
      mockMessageFormatter,
      mockRideMessagesService
    );
  });

  describe('handle', () => {
    it('should list all participants for a valid ride with categories', async () => {
      // Setup
      const rideId = 'abc123';
      const ride = {
        id: rideId,
        title: 'Test Ride',
        participation: {
          joined: [
            { userId: 1, firstName: 'John', lastName: 'Doe', username: 'johndoe' },
            { userId: 2, firstName: 'Jane', lastName: 'Smith', username: 'janesmith' }
          ],
          thinking: [
            { userId: 3, firstName: 'Bob', lastName: 'Wilson' }
          ],
          skipped: []
        }
      };

      mockRideMessagesService.extractRideId.mockReturnValue({ rideId, error: null });
      mockRideService.getRide.mockResolvedValue(ride);
      mockMessageFormatter.formatParticipant
        .mockReturnValueOnce('<a href="tg://user?id=1">John Doe (@johndoe)</a>')
        .mockReturnValueOnce('<a href="tg://user?id=2">Jane Smith (@janesmith)</a>')
        .mockReturnValueOnce('<a href="tg://user?id=3">Bob Wilson</a>');

      // Execute
      await listParticipantsHandler.handle(mockCtx);

      // Verify
      expect(mockRideMessagesService.extractRideId).toHaveBeenCalledWith(mockCtx.message);
      expect(mockRideService.getRide).toHaveBeenCalledWith(rideId);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('All Participants for "Test Ride" (3)'),
        { parse_mode: 'HTML' }
      );
      
      const replyMessage = mockCtx.reply.mock.calls[0][0];
      expect(replyMessage).toContain('🚴 <b>Joined (2):</b>');
      expect(replyMessage).toContain('🤔 <b>Thinking (1):</b>');
      expect(replyMessage).toContain('<a href="tg://user?id=1">John Doe (@johndoe)</a>');
      expect(replyMessage).toContain('<a href="tg://user?id=2">Jane Smith (@janesmith)</a>');
      expect(replyMessage).toContain('<a href="tg://user?id=3">Bob Wilson</a>');
    });

    it('should handle ride with no participants', async () => {
      // Setup
      const rideId = 'abc123';
      const ride = {
        id: rideId,
        title: 'Test Ride',
        participation: { joined: [], thinking: [], skipped: [] }
      };

      mockRideMessagesService.extractRideId.mockReturnValue({ rideId, error: null });
      mockRideService.getRide.mockResolvedValue(ride);

      // Execute
      await listParticipantsHandler.handle(mockCtx);

      // Verify
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('All Participants for "Test Ride" (0)'),
        { parse_mode: 'HTML' }
      );
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('🚴 <b>Joined (0):</b>'),
        { parse_mode: 'HTML' }
      );
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('No one joined yet.'),
        { parse_mode: 'HTML' }
      );
    });

    it('should handle ride with all three categories of participants', async () => {
      // Setup
      const rideId = 'abc123';
      const ride = {
        id: rideId,
        title: 'Test Ride',
        participation: {
          joined: [
            { userId: 1, firstName: 'John', lastName: 'Doe', username: 'johndoe' }
          ],
          thinking: [
            { userId: 2, firstName: 'Jane', lastName: 'Smith', username: 'janesmith' }
          ],
          skipped: [
            { userId: 3, firstName: 'Bob', lastName: 'Wilson', username: 'bobwilson' }
          ]
        }
      };

      mockRideMessagesService.extractRideId.mockReturnValue({ rideId, error: null });
      mockRideService.getRide.mockResolvedValue(ride);
      mockMessageFormatter.formatParticipant
        .mockReturnValueOnce('<a href="tg://user?id=1">John Doe (@johndoe)</a>')
        .mockReturnValueOnce('<a href="tg://user?id=2">Jane Smith (@janesmith)</a>')
        .mockReturnValueOnce('<a href="tg://user?id=3">Bob Wilson (@bobwilson)</a>');

      // Execute
      await listParticipantsHandler.handle(mockCtx);

      // Verify
      const replyMessage = mockCtx.reply.mock.calls[0][0];
      expect(replyMessage).toContain('All Participants for "Test Ride" (3)');
      expect(replyMessage).toContain('🚴 <b>Joined (1):</b>');
      expect(replyMessage).toContain('🤔 <b>Thinking (1):</b>');
      expect(replyMessage).toContain('🙅 <b>Not interested (1):</b>');
      expect(replyMessage).toContain('<a href="tg://user?id=1">John Doe (@johndoe)</a>');
      expect(replyMessage).toContain('<a href="tg://user?id=2">Jane Smith (@janesmith)</a>');
      expect(replyMessage).toContain('<a href="tg://user?id=3">Bob Wilson (@bobwilson)</a>');
    });

    it('should handle missing ride ID', async () => {
      // Setup
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: null, error: 'Invalid ride ID' });

      // Execute
      await listParticipantsHandler.handle(mockCtx);

      // Verify
      expect(mockCtx.reply).toHaveBeenCalledWith('Please provide a valid ride ID. Usage: /listparticipants rideID');
      expect(mockRideService.getRide).not.toHaveBeenCalled();
    });

    it('should handle ride not found', async () => {
      // Setup
      const rideId = 'abc123';
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId, error: null });
      mockRideService.getRide.mockResolvedValue(null);

      // Execute
      await listParticipantsHandler.handle(mockCtx);

      // Verify
      expect(mockCtx.reply).toHaveBeenCalledWith('Ride #abc123 not found.');
    });

    it('should handle service errors gracefully', async () => {
      // Setup
      const rideId = 'abc123';
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId, error: null });
      mockRideService.getRide.mockRejectedValue(new Error('Database error'));

      // Execute
      await listParticipantsHandler.handle(mockCtx);

      // Verify
      expect(mockCtx.reply).toHaveBeenCalledWith('An error occurred while retrieving participants.');
    });
  });

  describe('formatParticipantsByCategory', () => {
    it('should format participants with numbering', () => {
      // Setup
      const participants = [
        { userId: 1, firstName: 'John', lastName: 'Doe', username: 'johndoe' },
        { userId: 2, firstName: 'Jane', lastName: 'Smith', username: 'janesmith' }
      ];

      mockMessageFormatter.formatParticipant
        .mockReturnValueOnce('<a href="tg://user?id=1">John Doe (@johndoe)</a>')
        .mockReturnValueOnce('<a href="tg://user?id=2">Jane Smith (@janesmith)</a>');

      // Execute
      const result = listParticipantsHandler.formatParticipantsByCategory(participants);

      // Verify
      expect(result).toContain('1. <a href="tg://user?id=1">John Doe (@johndoe)</a>');
      expect(result).toContain('2. <a href="tg://user?id=2">Jane Smith (@janesmith)</a>');
    });

    it('should handle empty participants list', () => {
      // Execute
      const result = listParticipantsHandler.formatParticipantsByCategory([]);

      // Verify
      expect(result).toBe('');
    });
  });

});
