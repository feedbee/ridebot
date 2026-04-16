/**
 * @jest-environment node
 * 
 * Edge case tests for RideWizard to improve branch coverage
 */

import { RideWizard } from '../../wizard/RideWizard.js';
import { jest } from '@jest/globals';
import { t } from '../../i18n/index.js';

// Mock storage
class MockStorage {
  constructor() {
    this.rides = new Map();
    this.nextId = 1;
  }

  async createRide(ride) {
    const id = this.nextId++;
    const newRide = { ...ride, id: id.toString(), participants: [] };
    this.rides.set(id.toString(), newRide);
    return newRide;
  }

  async updateRide(rideId, updates) {
    const ride = this.rides.get(rideId);
    if (!ride) throw new Error('Ride not found');
    const updated = { ...ride, ...updates };
    this.rides.set(rideId, updated);
    return updated;
  }
}

// Mock context factory
const createMockContext = (userId = 123, chatId = 456, chatType = 'private', language = 'en') => {
  const messages = [];
  const deletedMessages = [];
  const editedMessages = [];

  const ctx = {
    from: { id: userId, first_name: 'Test', last_name: 'User', username: 'testuser' },
    chat: { id: chatId, type: chatType },
    lang: language,
    message: null,
    match: null,
    reply: jest.fn().mockImplementation((text, options) => {
      const msg = { message_id: messages.length + 1, text, ...options };
      messages.push(msg);
      return Promise.resolve(msg);
    }),
    deleteMessage: jest.fn().mockImplementation(() => {
      deletedMessages.push(messages[messages.length - 1]);
      return Promise.resolve();
    }),
    answerCallbackQuery: jest.fn().mockResolvedValue(),
    api: {
      deleteMessage: jest.fn().mockResolvedValue(),
      editMessageText: jest.fn().mockImplementation((chatId, messageId, text, options) => {
        const msg = { message_id: messageId, text, ...options };
        editedMessages.push(msg);
        return Promise.resolve(msg);
      })
    },
    _test: { messages, deletedMessages, editedMessages }
  };

  return ctx;
};

describe.each(['en', 'ru'])('RideWizard Edge Cases (%s)', (language) => {
  let wizard;
  let storage;
  let mockRideService;
  let mockMessageFormatter;
  let mockRideMessagesService;
  const tr = (key, params = {}) => t(language, key, params, { fallbackLanguage: 'en' });

  beforeEach(() => {
    storage = new MockStorage();
    mockRideService = {
      createRide: jest.fn((data) => storage.createRide(data)),
      updateRide: jest.fn((id, data) => storage.updateRide(id, data))
    };
    mockMessageFormatter = {
      formatRidePreview: jest.fn().mockReturnValue('<preview>')
    };
    mockRideMessagesService = {
      createRideMessage: jest.fn().mockResolvedValue({ sentMessage: {}, updatedRide: {} }),
      updateRideMessages: jest.fn().mockResolvedValue({ success: true, updatedCount: 1, removedCount: 0 })
    };

    wizard = new RideWizard(storage, mockRideService, mockMessageFormatter, mockRideMessagesService);
  });

  describe('wizard session expired', () => {
    it('should handle wizard action when session expired', async () => {
      const ctx = createMockContext(123, 456, 'private', language);
      ctx.match = ['wizard:skip', 'skip'];

      await wizard.handleWizardAction(ctx);

      expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(tr('wizard.messages.sessionExpired'));
    });

    it('should handle wizard input when session expired', async () => {
      const ctx = createMockContext(123, 456, 'private', language);
      ctx.message = { text: 'some input', message_id: 1 };

      await wizard.handleWizardInput(ctx);

      // Should return early without error
      expect(ctx.reply).not.toHaveBeenCalled();
    });
  });

  describe('group chat restrictions', () => {
    it('should reject wizard start in group chat', async () => {
      const ctx = createMockContext(123, 456, 'group', language);

      await wizard.startWizard(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining(tr('wizard.messages.privateChatOnlyReply'))
      );
    });

    it('should reject wizard action in group chat', async () => {
      const ctx = createMockContext(123, 456, 'private', language);
      await wizard.startWizard(ctx);

      // Change to group chat
      const groupCtx = createMockContext(123, 456, 'group', language);
      groupCtx.match = ['wizard:skip', 'skip'];

      await wizard.handleWizardAction(groupCtx);

      expect(groupCtx.answerCallbackQuery).toHaveBeenCalledWith(
        expect.stringContaining(tr('wizard.messages.privateChatOnlyCallback'))
      );
    });

    it('should reject wizard input in group chat', async () => {
      const ctx = createMockContext(123, 456, 'private', language);
      await wizard.startWizard(ctx);

      // Change to group chat
      const groupCtx = createMockContext(123, 456, 'group', language);
      groupCtx.message = { text: 'test', message_id: 1 };

      await wizard.handleWizardInput(groupCtx);

      expect(groupCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining(tr('wizard.messages.privateChatOnlyReply'))
      );
    });
  });

  describe('clearable fields with dash', () => {
    it('should clear field when dash is entered', async () => {
      const ctx = createMockContext(123, 456, 'private', language);
      await wizard.startWizard(ctx);

      // Navigate to a clearable field (distance)
      ctx.message = { text: 'Test Ride', message_id: 2 };
      await wizard.handleWizardInput(ctx); // title

      ctx.match = ['wizard:skip', 'skip'];
      await wizard.handleWizardAction(ctx); // skip category
      await wizard.handleWizardAction(ctx); // skip organizer

      ctx.message = { text: 'tomorrow at 6pm', message_id: 3 };
      await wizard.handleWizardInput(ctx); // date

      ctx.match = ['wizard:skip', 'skip'];
      await wizard.handleWizardAction(ctx); // skip route

      // Enter distance then clear it
      ctx.message = { text: '50', message_id: 4 };
      await wizard.handleWizardInput(ctx); // distance

      // Now we're at duration, go back to distance
      ctx.match = ['wizard:back', 'back'];
      await wizard.handleWizardAction(ctx);

      // Clear with dash
      ctx.message = { text: '-', message_id: 5 };
      await wizard.handleWizardInput(ctx);

      const stateKey = wizard.getWizardStateKey(ctx.from.id, ctx.chat.id);
      const state = wizard.wizardStates.get(stateKey);
      expect(state.data.distance).toBeUndefined();
    });
  });

  describe('invalid category selection', () => {
    it('should reject invalid category', async () => {
      const ctx = createMockContext(123, 456, 'private', language);
      await wizard.startWizard(ctx);

      // Enter title
      ctx.message = { text: 'Test Ride', message_id: 2 };
      await wizard.handleWizardInput(ctx);

      // Try invalid category
      ctx.match = ['wizard:category', 'category', 'InvalidCategory'];
      await wizard.handleWizardAction(ctx);

      expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(tr('wizard.messages.invalidCategory'));
    });
  });

  describe('back navigation edge cases', () => {
    it('should navigate back through wizard steps', async () => {
      const ctx = createMockContext(123, 456, 'private', language);
      await wizard.startWizard(ctx);

      // Enter title
      ctx.message = { text: 'Test Ride', message_id: 2 };
      await wizard.handleWizardInput(ctx);

      // Skip category
      ctx.match = ['wizard:skip', 'skip'];
      await wizard.handleWizardAction(ctx);

      // Now at organizer, go back to category
      ctx.match = ['wizard:back', 'back'];
      await wizard.handleWizardAction(ctx);

      const stateKey = wizard.getWizardStateKey(ctx.from.id, ctx.chat.id);
      const state = wizard.wizardStates.get(stateKey);
      expect(state.step).toBe('category');
    });
  });

  describe('command input during wizard', () => {
    it('should ignore command input during wizard', async () => {
      const ctx = createMockContext(123, 456, 'private', language);
      await wizard.startWizard(ctx);

      // Try to enter a command
      ctx.message = { text: '/help', message_id: 2 };
      await wizard.handleWizardInput(ctx);

      // Should be ignored and still at title step
      const stateKey = wizard.getWizardStateKey(ctx.from.id, ctx.chat.id);
      const state = wizard.wizardStates.get(stateKey);
      expect(state.step).toBe('title');
    });
  });

  describe('keep button functionality', () => {
    it('should keep existing value when keep is clicked', async () => {
      const ctx = createMockContext(123, 456, 'private', language);
      await wizard.startWizard(ctx);

      // Enter title
      ctx.message = { text: 'Test Ride', message_id: 2 };
      await wizard.handleWizardInput(ctx);

      // Enter category (which triggers keep button path)
      ctx.match = ['wizard:category', 'category', 'road'];
      await wizard.handleWizardAction(ctx);

      // Now we're at organizer - enter a value
      ctx.message = { text: 'John Doe', message_id: 3 };
      await wizard.handleWizardInput(ctx);

      // Go back to organizer
      ctx.match = ['wizard:back', 'back'];
      await wizard.handleWizardAction(ctx);

      // Use keep button to keep "John Doe"
      ctx.match = ['wizard:keep', 'keep'];
      await wizard.handleWizardAction(ctx);

      const stateKey = wizard.getWizardStateKey(ctx.from.id, ctx.chat.id);
      const state = wizard.wizardStates.get(stateKey);
      expect(state.data.organizer).toBe('John Doe');
      expect(state.step).toBe('date'); // Should have moved to next step
    });
  });

  describe('error handling during wizard', () => {
    it('should handle error in handleWizardAction', async () => {
      const ctx = createMockContext(123, 456, 'private', language);
      ctx.deleteMessage = jest.fn().mockResolvedValue();
      await wizard.startWizard(ctx);

      // Mock storage to throw error
      storage.createRide = jest.fn().mockRejectedValue(new Error('Database error'));

      // Complete minimal wizard
      ctx.message = { text: 'Test Ride', message_id: 2 };
      await wizard.handleWizardInput(ctx);

      for (let i = 0; i < 8; i++) {
        ctx.match = ['wizard:skip', 'skip'];
        await wizard.handleWizardAction(ctx);
      }

      // Confirm (should trigger error)
      ctx.match = ['wizard:confirm', 'confirm'];
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await wizard.handleWizardAction(ctx);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error in handleWizardAction:',
        expect.any(Error)
      );
      const expectedErrorPrefix = tr('wizard.messages.errorWithMessage', { message: '' });
      expect(
        ctx.reply.mock.calls.some(
          ([value]) => typeof value === 'string' && value.startsWith(expectedErrorPrefix)
        )
      ).toBe(true);

      consoleErrorSpy.mockRestore();
    });

    it('should handle message deletion errors during cancel', async () => {
      const ctx = createMockContext(123, 456, 'private', language);
      ctx.api.deleteMessage.mockRejectedValue(new Error('Cannot delete message'));
      
      await wizard.startWizard(ctx);

      // Add some validation errors
      ctx.message = { text: '', message_id: 2 };
      await wizard.handleWizardInput(ctx); // This will create an error message

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      // Cancel
      ctx.match = ['wizard:cancel', 'cancel'];
      await wizard.handleWizardAction(ctx);

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith(tr('wizard.messages.creationCancelled'));

      consoleErrorSpy.mockRestore();
    });

    it('should show cancellation as popup for callback-origin wizard', async () => {
      const ctx = createMockContext(123, 456, 'private', language);

      await wizard.startWizard(ctx, null, 'callback');

      ctx.match = ['wizard:cancel', 'cancel'];
      await wizard.handleWizardAction(ctx);

      expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(tr('wizard.messages.creationCancelled'));
      expect(ctx.reply).not.toHaveBeenCalledWith(tr('wizard.messages.creationCancelled'));
    });
  });

  describe('duplicate ride creation', () => {
    it('should show duplicate success message in chat for message-origin wizard', async () => {
      const ctx = createMockContext(123, 456, 'private', language);
      
      // Start wizard with originalRideId (duplicate mode)
      await wizard.startWizard(ctx, {
        title: 'Original Ride',
        originalRideId: 'ride123',
        datetime: new Date()
      });

      // Complete minimal fields
      ctx.message = { text: 'Duplicated Ride', message_id: 2 };
      await wizard.handleWizardInput(ctx);

      // Skip to confirm
      for (let i = 0; i < 8; i++) {
        ctx.match = ['wizard:skip', 'skip'];
        await wizard.handleWizardAction(ctx);
      }

      // Confirm
      ctx.match = ['wizard:confirm', 'confirm'];
      await wizard.handleWizardAction(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(tr('wizard.messages.duplicatedSuccessfully'));
    });

    it('should show duplicate success popup for callback-origin wizard', async () => {
      const ctx = createMockContext(123, 456, 'private', language);
      
      await wizard.startWizard(ctx, {
        title: 'Original Ride',
        originalRideId: 'ride123',
        datetime: new Date()
      }, 'callback');

      ctx.message = { text: 'Duplicated Ride', message_id: 2 };
      await wizard.handleWizardInput(ctx);

      for (let i = 0; i < 8; i++) {
        ctx.match = ['wizard:skip', 'skip'];
        await wizard.handleWizardAction(ctx);
      }

      ctx.match = ['wizard:confirm', 'confirm'];
      await wizard.handleWizardAction(ctx);

      expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(tr('wizard.messages.duplicatedSuccessfully'));
    });
  });

  describe('update ride with message removal', () => {
    it('should log removed message count', async () => {
      const ctx = createMockContext(123, 456, 'private', language);
      const existingRide = await storage.createRide({
        title: 'Test Ride',
        date: new Date(),
        createdBy: ctx.from.id,
        messages: []
      });

      mockRideMessagesService.updateRideMessages.mockResolvedValue({
        success: true,
        updatedCount: 2,
        removedCount: 1
      });

      // Start update wizard
      await wizard.startWizard(ctx, {
        isUpdate: true,
        originalRideId: existingRide.id,
        title: 'Test Ride',
        datetime: new Date()
      });

      // Skip to confirm
      for (let i = 0; i < 9; i++) {
        ctx.match = ['wizard:skip', 'skip'];
        await wizard.handleWizardAction(ctx);
      }

      const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});

      // Confirm update
      ctx.match = ['wizard:confirm', 'confirm'];
      await wizard.handleWizardAction(ctx);

      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('Removed 1 unavailable messages')
      );

      consoleInfoSpy.mockRestore();
    });
  });

  describe('already active wizard', () => {
    it('should reject starting new wizard when one is active', async () => {
      const ctx = createMockContext(123, 456, 'private', language);
      await wizard.startWizard(ctx);

      // Try to start another
      await wizard.startWizard(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining(tr('wizard.messages.completeOrCancelCurrent'))
      );
    });
  });

  describe('additional branch coverage', () => {
    it('should navigate back from confirm to notify step', async () => {
      const ctx = createMockContext(123, 456, 'private', language);
      await wizard.startWizard(ctx);
      const stateKey = wizard.getWizardStateKey(ctx.from.id, ctx.chat.id);
      const state = wizard.wizardStates.get(stateKey);
      state.step = 'confirm';

      ctx.match = ['wizard:back', 'back'];
      await wizard.handleWizardAction(ctx);

      expect(state.step).toBe('notify');
      expect(ctx.api.editMessageText).toHaveBeenCalled();
    });

    it('should auto-fill organizer from username in confirm step when names are missing', async () => {
      const ctx = createMockContext(123, 456, 'private', language);
      ctx.from = { id: 123, first_name: '', last_name: '', username: 'solo_user' };
      const state = {
        step: 'confirm',
        isUpdate: false,
        data: {
          title: 'Ride',
          category: 'road',
          datetime: new Date('2026-01-01T10:00:00Z')
        },
        primaryMessageId: null
      };

      await wizard.sendConfirmStep(ctx, state, false);

      expect(state.data.organizer).toBe('@solo_user');
    });

    it('should auto-fill organizer from full name and username in confirm step', async () => {
      const ctx = createMockContext(123, 456, 'private', language);
      ctx.from = { id: 123, first_name: 'John', last_name: 'Doe', username: 'johnny' };
      const state = {
        step: 'confirm',
        isUpdate: false,
        data: {
          title: 'Ride',
          category: 'road',
          datetime: new Date('2026-01-01T10:00:00Z')
        },
        primaryMessageId: null
      };

      await wizard.sendConfirmStep(ctx, state, false);

      expect(state.data.organizer).toBe('John Doe (@johnny)');
    });
  });
});
