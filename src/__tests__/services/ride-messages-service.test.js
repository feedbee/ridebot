/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { RideMessagesService } from '../../services/RideMessagesService.js';
import { t } from '../../i18n/index.js';

describe('RideMessagesService', () => {
  let rideMessagesService;
  let mockRideService;
  let mockMessageFormatter;
  const tr = (language, key, params = {}) => t(language, key, params, { fallbackLanguage: 'en' });

  beforeEach(() => {
    // Create mock ride service for extended tests
    mockRideService = {
      updateRide: jest.fn()
    };

    // Create service instance
    rideMessagesService = new RideMessagesService(mockRideService);

    // Setup mock formatter for extended tests
    mockMessageFormatter = {
      formatRideWithKeyboard: jest.fn()
    };
    rideMessagesService.messageFormatter = mockMessageFormatter;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('extractRideId', () => {
    // Test for extracting ride ID from command line with optional # symbol
    it('should extract ride ID from command line with optional # symbol', () => {
      // Test without #
      const message1 = {
        text: '/updateride abc123'
      };
      
      const result1 = rideMessagesService.extractRideId(message1);
      expect(result1.rideId).toBe('abc123');
      expect(result1.error).toBeNull();
      
      // Test with #
      const message2 = {
        text: '/updateride #abc123'
      };
      
      const result2 = rideMessagesService.extractRideId(message2);
      expect(result2.rideId).toBe('abc123');
      expect(result2.error).toBeNull();
    });
    
    it('should extract ride ID from command line with bot username', () => {
      // Test with bot username and without #
      const message1 = {
        text: '/updateride@MyRideBot abc123'
      };
      
      const result1 = rideMessagesService.extractRideId(message1);
      expect(result1.rideId).toBe('abc123');
      expect(result1.error).toBeNull();
      
      // Test with bot username and with #
      const message2 = {
        text: '/updateride@MyRideBot #abc123'
      };
      
      const result2 = rideMessagesService.extractRideId(message2);
      expect(result2.rideId).toBe('abc123');
      expect(result2.error).toBeNull();
    });
    
    it('should handle command with plain ID', () => {
      const message = {
        text: '/updateride abc123'
      };
      
      const result = rideMessagesService.extractRideId(message);
      
      expect(result.rideId).toBe('abc123');
      expect(result.error).toBeNull();
    });
    
    it('should handle various command formats with different commands', () => {
      // Test with plain ID
      const message1 = {
        text: '/updateride abc123'
      };
      const result1 = rideMessagesService.extractRideId(message1);
      expect(result1.rideId).toBe('abc123');
      expect(result1.error).toBeNull();
      
      // Test with # prefix
      const message2 = {
        text: '/updateride #abc123'
      };
      const result2 = rideMessagesService.extractRideId(message2);
      expect(result2.rideId).toBe('abc123');
      expect(result2.error).toBeNull();
      
      // Test with different commands
      const commands = ['cancelride', 'deleteride', 'dupride', 'shareride'];
      
      for (const cmd of commands) {
        // Without #
        const msgWithoutHash = {
          text: `/${cmd} xyz789`
        };
        const resultWithoutHash = rideMessagesService.extractRideId(msgWithoutHash);
        expect(resultWithoutHash.rideId).toBe('xyz789');
        expect(resultWithoutHash.error).toBeNull();
        
        // With #
        const msgWithHash = {
          text: `/${cmd} #xyz789`
        };
        const resultWithHash = rideMessagesService.extractRideId(msgWithHash);
        expect(resultWithHash.rideId).toBe('xyz789');
        expect(resultWithHash.error).toBeNull();
      }
    });
    
    // Test for extracting ride ID from parameters
    it('should extract ride ID from parameters', () => {
      const message = {
        text: '/updateride\nid: abc123'
      };
      
      const result = rideMessagesService.extractRideId(message);
      
      expect(result.rideId).toBe('abc123');
      expect(result.error).toBeNull();
    });
    
    // Test for extracting ride ID from parameters with leading # symbol
    it('should extract ride ID from parameters with leading # symbol', () => {
      const message = {
        text: '/updateride\nid: #abc123'
      };
      
      const result = rideMessagesService.extractRideId(message);
      
      expect(result.rideId).toBe('abc123');
      expect(result.error).toBeNull();
    });
    
    it('should accept both #id and id formats in parameters', () => {
      // Test with different commands and both formats
      const commands = ['updateride', 'cancelride', 'deleteride', 'dupride', 'shareride'];
      
      for (const cmd of commands) {
        // Without #
        const msgWithoutHash = {
          text: `/${cmd}\nid: xyz789`
        };
        const resultWithoutHash = rideMessagesService.extractRideId(msgWithoutHash);
        expect(resultWithoutHash.rideId).toBe('xyz789');
        expect(resultWithoutHash.error).toBeNull();
        
        // With #
        const msgWithHash = {
          text: `/${cmd}\nid: #xyz789`
        };
        const resultWithHash = rideMessagesService.extractRideId(msgWithHash);
        expect(resultWithHash.rideId).toBe('xyz789');
        expect(resultWithHash.error).toBeNull();
      }
    });
    
    // Test for extracting ride ID from replied message
    it('should extract ride ID from replied message', () => {
      const message = {
        text: '/updateride',
        reply_to_message: {
          text: '🎫 #Ride #abc123\nSome other content'
        }
      };
      
      const result = rideMessagesService.extractRideId(message);
      
      expect(result.rideId).toBe('abc123');
      expect(result.error).toBeNull();
    });
    
    // Test for returning error when no ID is found
    it.each(['en', 'ru'])('should return error when no ID is found (%s)', (language) => {
      const message = {
        text: '/updateride'
        // No reply and no ID parameter
      };
      
      const result = rideMessagesService.extractRideId(message, { language });
      
      expect(result.rideId).toBeNull();
      expect(result.error).toBe(
        tr(language, 'services.rideMessages.provideRideIdAfterCommand', { commandName: 'updateride' })
      );
    });
    
    // Test for returning error when replied message has no ride ID
    it.each(['en', 'ru'])('should return error when replied message has no ride ID (%s)', (language) => {
      const message = {
        text: '/updateride',
        reply_to_message: {
          text: 'This is not a ride message'
        }
      };
      
      const result = rideMessagesService.extractRideId(message, { language });
      
      expect(result.rideId).toBeNull();
      expect(result.error).toContain(tr(language, 'services.rideMessages.couldNotFindRideIdInMessage'));
    });
  });

  describe('createRideMessage', () => {
    it('should create and send a ride message successfully', async () => {
      // Setup
      const mockRide = {
        id: 'ride123',
        title: 'Morning Ride',
        participants: [],
        messages: []
      };

      const mockCtx = {
        chat: { id: 12345 },
        message: { message_thread_id: null },
        reply: jest.fn().mockResolvedValue({ message_id: 67890 })
      };

      mockMessageFormatter.formatRideWithKeyboard.mockReturnValue({
        message: 'Formatted ride message',
        keyboard: { inline_keyboard: [] },
        parseMode: 'HTML'
      });

      mockRideService.updateRide.mockResolvedValue({
        ...mockRide,
        messages: [{ chatId: 12345, messageId: 67890, language: 'en', isForCreator: false }]
      });

      // Execute
      const result = await rideMessagesService.createRideMessage(mockRide, mockCtx);

      // Verify
      expect(mockMessageFormatter.formatRideWithKeyboard).toHaveBeenCalledWith(
        mockRide,
        { joined: [], thinking: [], skipped: [] },
        { isForCreator: false, lang: 'en' }
      );
      expect(mockCtx.reply).toHaveBeenCalledWith('Formatted ride message', {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [] }
      });
      expect(mockRideService.updateRide).toHaveBeenCalledWith('ride123', {
        messages: [{ chatId: 12345, messageId: 67890, language: 'en', isForCreator: false }]
      });
      expect(result.sentMessage).toEqual({ message_id: 67890 });
      expect(result.updatedRide.messages).toHaveLength(1);
    });

    it('should create message with thread ID when provided', async () => {
      // Setup
      const mockRide = {
        id: 'ride123',
        title: 'Morning Ride',
        participants: [],
        messages: []
      };

      const mockCtx = {
        chat: { id: 12345 },
        message: { message_thread_id: 999 },
        reply: jest.fn().mockResolvedValue({ message_id: 67890 })
      };

      mockMessageFormatter.formatRideWithKeyboard.mockReturnValue({
        message: 'Formatted ride message',
        keyboard: { inline_keyboard: [] },
        parseMode: 'HTML'
      });

      mockRideService.updateRide.mockResolvedValue({
        ...mockRide,
        messages: [{ chatId: 12345, messageId: 67890, messageThreadId: 999, language: 'en', isForCreator: false }]
      });

      // Execute
      const result = await rideMessagesService.createRideMessage(mockRide, mockCtx);

      // Verify
      expect(mockCtx.reply).toHaveBeenCalledWith('Formatted ride message', {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [] },
        message_thread_id: 999
      });
      expect(mockRideService.updateRide).toHaveBeenCalledWith('ride123', {
        messages: [{ chatId: 12345, messageId: 67890, messageThreadId: 999, language: 'en', isForCreator: false }]
      });
      expect(result.updatedRide.messages[0].messageThreadId).toBe(999);
    });

    it('should use explicit messageThreadId parameter over context', async () => {
      // Setup
      const mockRide = {
        id: 'ride123',
        participants: [],
        messages: []
      };

      const mockCtx = {
        chat: { id: 12345 },
        message: { message_thread_id: 888 },
        reply: jest.fn().mockResolvedValue({ message_id: 67890 })
      };

      mockMessageFormatter.formatRideWithKeyboard.mockReturnValue({
        message: 'Formatted ride message',
        keyboard: { inline_keyboard: [] },
        parseMode: 'HTML'
      });

      mockRideService.updateRide.mockResolvedValue({
        ...mockRide,
        messages: [{ chatId: 12345, messageId: 67890, messageThreadId: 777, language: 'en', isForCreator: false }]
      });

      // Execute with explicit thread ID
      await rideMessagesService.createRideMessage(mockRide, mockCtx, 777);

      // Verify explicit thread ID is used
      expect(mockCtx.reply).toHaveBeenCalledWith('Formatted ride message', {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [] },
        message_thread_id: 777
      });
    });

    it('should append message to existing messages array', async () => {
      // Setup
      const mockRide = {
        id: 'ride123',
        participants: [],
        messages: [
          { chatId: 11111, messageId: 22222 }
        ]
      };

      const mockCtx = {
        chat: { id: 12345 },
        message: { message_thread_id: null },
        reply: jest.fn().mockResolvedValue({ message_id: 67890 })
      };

      mockMessageFormatter.formatRideWithKeyboard.mockReturnValue({
        message: 'Formatted ride message',
        keyboard: { inline_keyboard: [] },
        parseMode: 'HTML'
      });

      mockRideService.updateRide.mockResolvedValue({
        ...mockRide,
        messages: [
          { chatId: 11111, messageId: 22222 },
          { chatId: 12345, messageId: 67890, language: 'en', isForCreator: false }
        ]
      });

      // Execute
      const result = await rideMessagesService.createRideMessage(mockRide, mockCtx);

      // Verify
      expect(mockRideService.updateRide).toHaveBeenCalledWith('ride123', {
        messages: [
          { chatId: 11111, messageId: 22222 },
          { chatId: 12345, messageId: 67890, language: 'en', isForCreator: false }
        ]
      });
      expect(result.updatedRide.messages).toHaveLength(2);
    });

    it('should throw error when reply fails', async () => {
      // Setup
      const mockRide = {
        id: 'ride123',
        participants: [],
        messages: []
      };

      const mockCtx = {
        chat: { id: 12345 },
        message: { message_thread_id: null },
        reply: jest.fn().mockRejectedValue(new Error('Network error'))
      };

      mockMessageFormatter.formatRideWithKeyboard.mockReturnValue({
        message: 'Formatted ride message',
        keyboard: { inline_keyboard: [] },
        parseMode: 'HTML'
      });

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      // Execute & Verify
      await expect(rideMessagesService.createRideMessage(mockRide, mockCtx))
        .rejects.toThrow('Network error');

      // Verify error was logged with proper context
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error creating ride message:',
        expect.objectContaining({ message: 'Network error' })
      );
      
      // Verify no partial state - updateRide should not have been called
      expect(mockRideService.updateRide).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should throw error when updateRide fails', async () => {
      // Setup
      const mockRide = {
        id: 'ride123',
        participants: [],
        messages: []
      };

      const mockCtx = {
        chat: { id: 12345 },
        message: { message_thread_id: null },
        reply: jest.fn().mockResolvedValue({ message_id: 67890 })
      };

      mockMessageFormatter.formatRideWithKeyboard.mockReturnValue({
        message: 'Formatted ride message',
        keyboard: { inline_keyboard: [] },
        parseMode: 'HTML'
      });

      const dbError = new Error('Database error');
      mockRideService.updateRide.mockRejectedValue(dbError);

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      // Execute & Verify
      await expect(rideMessagesService.createRideMessage(mockRide, mockCtx))
        .rejects.toThrow('Database error');

      // Verify error was logged with proper context
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error creating ride message:',
        dbError
      );
      
      // Verify message was sent (operation got far enough)
      expect(mockCtx.reply).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should handle ride with participants', async () => {
      // Setup
      const mockRide = {
        id: 'ride123',
        participants: [
          { userId: 1, username: 'user1' },
          { userId: 2, username: 'user2' }
        ],
        messages: []
      };

      const mockCtx = {
        chat: { id: 12345 },
        message: { message_thread_id: null },
        reply: jest.fn().mockResolvedValue({ message_id: 67890 })
      };

      mockMessageFormatter.formatRideWithKeyboard.mockReturnValue({
        message: 'Formatted ride message with participants',
        keyboard: { inline_keyboard: [] },
        parseMode: 'HTML'
      });

      mockRideService.updateRide.mockResolvedValue(mockRide);

      // Execute
      await rideMessagesService.createRideMessage(mockRide, mockCtx);

      // Verify participants were passed to formatter
      expect(mockMessageFormatter.formatRideWithKeyboard).toHaveBeenCalledWith(
        mockRide,
        { joined: [], thinking: [], skipped: [] },
        { isForCreator: false, lang: 'en' }
      );
    });

    it('should include share line for ride creator in private chat', async () => {
      // Setup
      const mockRide = {
        id: 'ride123',
        title: 'Morning Ride',
        createdBy: 123, // Creator ID
        messages: []
      };

      const mockCtx = {
        lang: 'ru',
        chat: { id: 456, type: 'private' },
        from: { id: 123 }, // Same as createdBy
        reply: jest.fn().mockResolvedValue({ message_id: 789 })
      };

      mockMessageFormatter.formatRideWithKeyboard.mockReturnValue({
        message: 'Formatted ride message with share line',
        keyboard: { inline_keyboard: [] },
        parseMode: 'HTML'
      });

      mockRideService.updateRide.mockResolvedValue(mockRide);

      // Execute
      await rideMessagesService.createRideMessage(mockRide, mockCtx);

      // Verify - should pass isForCreator: true
      expect(mockMessageFormatter.formatRideWithKeyboard).toHaveBeenCalledWith(
        mockRide,
        { joined: [], thinking: [], skipped: [] },
        { isForCreator: true, lang: 'ru' }
      );
      expect(mockRideService.updateRide).toHaveBeenCalledWith('ride123', {
        messages: [{ chatId: 456, messageId: 789, language: 'ru', isForCreator: true }]
      });
    });

    it('should not include share line for non-creator', async () => {
      // Setup
      const mockRide = {
        id: 'ride123',
        title: 'Morning Ride',
        createdBy: 123, // Creator ID
        messages: []
      };

      const mockCtx = {
        lang: 'ru',
        chat: { id: 456, type: 'private' },
        from: { id: 789 }, // Different from createdBy
        reply: jest.fn().mockResolvedValue({ message_id: 789 })
      };

      mockMessageFormatter.formatRideWithKeyboard.mockReturnValue({
        message: 'Formatted ride message without share line',
        keyboard: { inline_keyboard: [] },
        parseMode: 'HTML'
      });

      mockRideService.updateRide.mockResolvedValue(mockRide);

      // Execute
      await rideMessagesService.createRideMessage(mockRide, mockCtx);

      // Verify - should pass isForCreator: false
      expect(mockMessageFormatter.formatRideWithKeyboard).toHaveBeenCalledWith(
        mockRide,
        { joined: [], thinking: [], skipped: [] },
        { isForCreator: false, lang: 'ru' }
      );
    });

    it('should not include share line in group chats', async () => {
      // Setup
      const mockRide = {
        id: 'ride123',
        title: 'Morning Ride',
        createdBy: 123, // Creator ID
        messages: []
      };

      const mockCtx = {
        lang: 'ru',
        chat: { id: 456, type: 'group' },
        from: { id: 123 }, // Same as createdBy but in group chat
        reply: jest.fn().mockResolvedValue({ message_id: 789 })
      };

      mockMessageFormatter.formatRideWithKeyboard.mockReturnValue({
        message: 'Formatted ride message without share line',
        keyboard: { inline_keyboard: [] },
        parseMode: 'HTML'
      });

      mockRideService.updateRide.mockResolvedValue(mockRide);

      // Execute
      await rideMessagesService.createRideMessage(mockRide, mockCtx);

      // Verify - should pass isForCreator: false (not private chat)
      expect(mockMessageFormatter.formatRideWithKeyboard).toHaveBeenCalledWith(
        mockRide,
        { joined: [], thinking: [], skipped: [] },
        { isForCreator: false, lang: 'ru' }
      );
    });
  });

  describe('updateRideMessages', () => {
    it('should return early when ride has no messages', async () => {
      // Setup
      const mockRide = {
        id: 'ride123',
        messages: []
      };

      const mockCtx = {
        api: {
          editMessageText: jest.fn()
        }
      };

      // Execute
      const result = await rideMessagesService.updateRideMessages(mockRide, mockCtx);

      // Verify
      expect(result).toEqual({ success: true, updatedCount: 0, removedCount: 0 });
      expect(mockCtx.api.editMessageText).not.toHaveBeenCalled();
    });

    it('should update single message successfully', async () => {
      // Setup
      const mockRide = {
        id: 'ride123',
        participants: [],
        messages: [
          { chatId: 12345, messageId: 67890, language: 'en', isForCreator: false }
        ]
      };

      const mockCtx = {
        api: {
          editMessageText: jest.fn().mockResolvedValue({})
        }
      };

      mockMessageFormatter.formatRideWithKeyboard.mockReturnValue({
        message: 'Updated ride message',
        keyboard: { inline_keyboard: [] },
        parseMode: 'HTML'
      });

      // Execute
      const result = await rideMessagesService.updateRideMessages(mockRide, mockCtx);

      // Verify
      expect(mockCtx.api.editMessageText).toHaveBeenCalledWith(
        12345,
        67890,
        'Updated ride message',
        {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [] }
        }
      );
      expect(result).toEqual({ success: true, updatedCount: 1, removedCount: 0 });
      expect(mockMessageFormatter.formatRideWithKeyboard).toHaveBeenCalledWith(
        mockRide,
        { joined: [], thinking: [], skipped: [] },
        { isForCreator: false, lang: 'en' }
      );
    });

    it('should update multiple messages across different chats', async () => {
      // Setup
      const mockRide = {
        id: 'ride123',
        participants: [],
        messages: [
          { chatId: 11111, messageId: 22222, language: 'en', isForCreator: false },
          { chatId: 33333, messageId: 44444, language: 'ru', isForCreator: false },
          { chatId: 55555, messageId: 66666, language: 'en', isForCreator: false }
        ]
      };

      const mockCtx = {
        api: {
          editMessageText: jest.fn().mockResolvedValue({})
        }
      };

      mockMessageFormatter.formatRideWithKeyboard.mockReturnValue({
        message: 'Updated ride message',
        keyboard: { inline_keyboard: [] },
        parseMode: 'HTML'
      });

      // Execute
      const result = await rideMessagesService.updateRideMessages(mockRide, mockCtx);

      // Verify
      expect(mockCtx.api.editMessageText).toHaveBeenCalledTimes(3);
      expect(result).toEqual({ success: true, updatedCount: 3, removedCount: 0 });
    });

    it('should render each stored message with its own audience and language', async () => {
      const mockRide = {
        id: 'ride123',
        createdBy: 123,
        participants: [],
        messages: [
          { chatId: 123, messageId: 1, language: 'ru', isForCreator: true },
          { chatId: -1001, messageId: 2, language: 'en', isForCreator: false }
        ]
      };

      const mockCtx = {
        chat: { type: 'supergroup' },
        from: { id: 999 },
        lang: 'en',
        api: {
          editMessageText: jest.fn().mockResolvedValue({})
        }
      };

      mockMessageFormatter.formatRideWithKeyboard
        .mockReturnValueOnce({
          message: 'Creator private message',
          keyboard: { inline_keyboard: [] },
          parseMode: 'HTML'
        })
        .mockReturnValueOnce({
          message: 'Group message',
          keyboard: { inline_keyboard: [] },
          parseMode: 'HTML'
        });

      const result = await rideMessagesService.updateRideMessages(mockRide, mockCtx);

      expect(mockMessageFormatter.formatRideWithKeyboard).toHaveBeenNthCalledWith(
        1,
        mockRide,
        { joined: [], thinking: [], skipped: [] },
        { isForCreator: true, lang: 'ru' }
      );
      expect(mockMessageFormatter.formatRideWithKeyboard).toHaveBeenNthCalledWith(
        2,
        mockRide,
        { joined: [], thinking: [], skipped: [] },
        { isForCreator: false, lang: 'en' }
      );
      expect(mockCtx.api.editMessageText).toHaveBeenNthCalledWith(
        1,
        123,
        1,
        'Creator private message',
        { parse_mode: 'HTML', reply_markup: { inline_keyboard: [] } }
      );
      expect(mockCtx.api.editMessageText).toHaveBeenNthCalledWith(
        2,
        -1001,
        2,
        'Group message',
        { parse_mode: 'HTML', reply_markup: { inline_keyboard: [] } }
      );
      expect(result).toEqual({ success: true, updatedCount: 2, removedCount: 0 });
    });

    it('should include thread ID in edit options when present', async () => {
      // Setup
      const mockRide = {
        id: 'ride123',
        participants: [],
        messages: [
          { chatId: 12345, messageId: 67890, messageThreadId: 999, language: 'en', isForCreator: false }
        ]
      };

      const mockCtx = {
        api: {
          editMessageText: jest.fn().mockResolvedValue({})
        }
      };

      mockMessageFormatter.formatRideWithKeyboard.mockReturnValue({
        message: 'Updated ride message',
        keyboard: { inline_keyboard: [] },
        parseMode: 'HTML'
      });

      // Execute
      await rideMessagesService.updateRideMessages(mockRide, mockCtx);

      // Verify
      expect(mockCtx.api.editMessageText).toHaveBeenCalledWith(
        12345,
        67890,
        'Updated ride message',
        {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [] },
          message_thread_id: 999
        }
      );
    });

    it('should remove messages that cannot be found', async () => {
      // Setup
      const mockRide = {
        id: 'ride123',
        participants: [],
        messages: [
          { chatId: 11111, messageId: 22222, language: 'en', isForCreator: false },
          { chatId: 33333, messageId: 44444, language: 'en', isForCreator: false }
        ]
      };

      const mockCtx = {
        api: {
          editMessageText: jest.fn()
            .mockResolvedValueOnce({})
            .mockRejectedValueOnce({
              description: 'Bad Request: message to edit not found'
            })
        }
      };

      mockMessageFormatter.formatRideWithKeyboard.mockReturnValue({
        message: 'Updated ride message',
        keyboard: { inline_keyboard: [] },
        parseMode: 'HTML'
      });

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      // Execute
      const result = await rideMessagesService.updateRideMessages(mockRide, mockCtx);

      // Verify
      expect(result).toEqual({ success: true, updatedCount: 1, removedCount: 1 });
      expect(mockRideService.updateRide).toHaveBeenCalledWith('ride123', {
        messages: [{ chatId: 11111, messageId: 22222, language: 'en', isForCreator: false }]
      });

      consoleWarnSpy.mockRestore();
    });

    it('should remove messages when bot is blocked', async () => {
      // Setup
      const mockRide = {
        id: 'ride123',
        participants: [],
        messages: [
          { chatId: 12345, messageId: 67890, language: 'en', isForCreator: false }
        ]
      };

      const mockCtx = {
        api: {
          editMessageText: jest.fn().mockRejectedValue({
            description: 'Forbidden: bot was blocked by the user'
          })
        }
      };

      mockMessageFormatter.formatRideWithKeyboard.mockReturnValue({
        message: 'Updated ride message',
        keyboard: { inline_keyboard: [] },
        parseMode: 'HTML'
      });

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      // Execute
      const result = await rideMessagesService.updateRideMessages(mockRide, mockCtx);

      // Verify
      expect(result).toEqual({ success: true, updatedCount: 0, removedCount: 1 });
      expect(mockRideService.updateRide).toHaveBeenCalledWith('ride123', {
        messages: []
      });

      consoleWarnSpy.mockRestore();
    });

    it('should remove messages when chat not found', async () => {
      // Setup
      const mockRide = {
        id: 'ride123',
        participants: [],
        messages: [
          { chatId: 12345, messageId: 67890, language: 'en', isForCreator: false }
        ]
      };

      const mockCtx = {
        api: {
          editMessageText: jest.fn().mockRejectedValue({
            description: 'Bad Request: chat not found'
          })
        }
      };

      mockMessageFormatter.formatRideWithKeyboard.mockReturnValue({
        message: 'Updated ride message',
        keyboard: { inline_keyboard: [] },
        parseMode: 'HTML'
      });

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      // Execute
      const result = await rideMessagesService.updateRideMessages(mockRide, mockCtx);

      // Verify
      expect(result).toEqual({ success: true, updatedCount: 0, removedCount: 1 });
      expect(mockRideService.updateRide).toHaveBeenCalledWith('ride123', {
        messages: []
      });

      consoleWarnSpy.mockRestore();
    });

    it('should handle partial failures correctly', async () => {
      // Setup
      const mockRide = {
        id: 'ride123',
        participants: [],
        messages: [
          { chatId: 11111, messageId: 22222, language: 'en', isForCreator: false },
          { chatId: 33333, messageId: 44444, language: 'en', isForCreator: false },
          { chatId: 55555, messageId: 66666, language: 'en', isForCreator: false }
        ]
      };

      const mockCtx = {
        api: {
          editMessageText: jest.fn()
            .mockResolvedValueOnce({})
            .mockRejectedValueOnce({
              description: 'Bad Request: message to edit not found'
            })
            .mockResolvedValueOnce({})
        }
      };

      mockMessageFormatter.formatRideWithKeyboard.mockReturnValue({
        message: 'Updated ride message',
        keyboard: { inline_keyboard: [] },
        parseMode: 'HTML'
      });

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      // Execute
      const result = await rideMessagesService.updateRideMessages(mockRide, mockCtx);

      // Verify
      expect(result).toEqual({ success: true, updatedCount: 2, removedCount: 1 });
      expect(mockRideService.updateRide).toHaveBeenCalledWith('ride123', {
        messages: [
          { chatId: 11111, messageId: 22222, language: 'en', isForCreator: false },
          { chatId: 55555, messageId: 66666, language: 'en', isForCreator: false }
        ]
      });

      consoleWarnSpy.mockRestore();
    });

    it('should not remove messages on non-recoverable errors', async () => {
      // Setup
      const mockRide = {
        id: 'ride123',
        participants: [],
        messages: [
          { chatId: 12345, messageId: 67890, language: 'en', isForCreator: false }
        ]
      };

      const mockCtx = {
        api: {
          editMessageText: jest.fn().mockRejectedValue({
            description: 'Network timeout'
          })
        }
      };

      mockMessageFormatter.formatRideWithKeyboard.mockReturnValue({
        message: 'Updated ride message',
        keyboard: { inline_keyboard: [] },
        parseMode: 'HTML'
      });

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      // Execute
      const result = await rideMessagesService.updateRideMessages(mockRide, mockCtx);

      // Verify - message should not be removed for network errors
      expect(result).toEqual({ success: true, updatedCount: 0, removedCount: 0 });
      expect(mockRideService.updateRide).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it('should return error when formatting fails', async () => {
      // Setup
      const mockRide = {
        id: 'ride123',
        participants: [],
        messages: [
          { chatId: 12345, messageId: 67890, language: 'en', isForCreator: false }
        ]
      };

      const mockCtx = {
        api: {
          editMessageText: jest.fn()
        }
      };

      mockMessageFormatter.formatRideWithKeyboard.mockImplementation(() => {
        throw new Error('Formatting error');
      });

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      // Execute
      const result = await rideMessagesService.updateRideMessages(mockRide, mockCtx);

      // Verify
      expect(result).toEqual({
        success: false,
        updatedCount: 0,
        removedCount: 0,
        error: 'Formatting error'
      });
      expect(mockCtx.api.editMessageText).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should handle messages with thread IDs correctly when removing', async () => {
      // Setup
      const mockRide = {
        id: 'ride123',
        participants: [],
        messages: [
          { chatId: 11111, messageId: 22222, messageThreadId: 888, language: 'en', isForCreator: false },
          { chatId: 33333, messageId: 44444, messageThreadId: 999, language: 'en', isForCreator: false }
        ]
      };

      const mockCtx = {
        api: {
          editMessageText: jest.fn()
            .mockResolvedValueOnce({})
            .mockRejectedValueOnce({
              description: 'Bad Request: message to edit not found'
            })
        }
      };

      mockMessageFormatter.formatRideWithKeyboard.mockReturnValue({
        message: 'Updated ride message',
        keyboard: { inline_keyboard: [] },
        parseMode: 'HTML'
      });

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      // Execute
      const result = await rideMessagesService.updateRideMessages(mockRide, mockCtx);

      // Verify - only the failed message with thread ID is removed
      expect(result).toEqual({ success: true, updatedCount: 1, removedCount: 1 });
      expect(mockRideService.updateRide).toHaveBeenCalledWith('ride123', {
        messages: [
          { chatId: 11111, messageId: 22222, messageThreadId: 888, language: 'en', isForCreator: false }
        ]
      });

      consoleWarnSpy.mockRestore();
    });

    it('should handle ride with no messages property', async () => {
      // Setup
      const mockRide = {
        id: 'ride123',
        participants: []
        // No messages property
      };

      const mockCtx = {
        api: {
          editMessageText: jest.fn()
        }
      };

      // Execute
      const result = await rideMessagesService.updateRideMessages(mockRide, mockCtx);

      // Verify
      expect(result).toEqual({ success: true, updatedCount: 0, removedCount: 0 });
      expect(mockCtx.api.editMessageText).not.toHaveBeenCalled();
    });

    it('should include share line for ride creator in private chat when updating', async () => {
      // Setup
      const mockRide = {
        id: 'ride123',
        createdBy: 123, // Creator ID
        participants: [],
        messages: [
          { chatId: 12345, messageId: 67890, language: 'ru', isForCreator: true }
        ]
      };

      const mockCtx = {
        chat: { type: 'private' },
        from: { id: 123 }, // Same as createdBy
        lang: 'en',
        api: {
          editMessageText: jest.fn().mockResolvedValue({})
        }
      };

      mockMessageFormatter.formatRideWithKeyboard.mockReturnValue({
        message: 'Updated ride message with share line',
        keyboard: { inline_keyboard: [] },
        parseMode: 'HTML'
      });

      // Execute
      await rideMessagesService.updateRideMessages(mockRide, mockCtx);

      expect(mockMessageFormatter.formatRideWithKeyboard).toHaveBeenCalledWith(
        mockRide,
        { joined: [], thinking: [], skipped: [] },
        { isForCreator: true, lang: 'ru' }
      );
    });

    it('should not include share line for non-creator when updating', async () => {
      // Setup
      const mockRide = {
        id: 'ride123',
        createdBy: 123, // Creator ID
        participants: [],
        messages: [
          { chatId: 12345, messageId: 67890, language: 'en', isForCreator: false }
        ]
      };

      const mockCtx = {
        chat: { type: 'private' },
        from: { id: 789 }, // Different from createdBy
        lang: 'ru',
        api: {
          editMessageText: jest.fn().mockResolvedValue({})
        }
      };

      mockMessageFormatter.formatRideWithKeyboard.mockReturnValue({
        message: 'Updated ride message without share line',
        keyboard: { inline_keyboard: [] },
        parseMode: 'HTML'
      });

      // Execute
      await rideMessagesService.updateRideMessages(mockRide, mockCtx);

      // Verify - should pass isForCreator: false
      expect(mockMessageFormatter.formatRideWithKeyboard).toHaveBeenCalledWith(
        mockRide,
        { joined: [], thinking: [], skipped: [] },
        { isForCreator: false, lang: 'en' }
      );
    });
  });
});
