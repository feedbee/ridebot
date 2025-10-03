/**
 * @jest-environment node
 * 
 * Edge case tests for RideWizard to improve branch coverage
 */

import { RideWizard } from '../../wizard/RideWizard.js';
import { jest } from '@jest/globals';

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
const createMockContext = (userId = 123, chatId = 456, chatType = 'private') => {
  const messages = [];
  const deletedMessages = [];
  const editedMessages = [];

  const ctx = {
    from: { id: userId, first_name: 'Test', last_name: 'User', username: 'testuser' },
    chat: { id: chatId, type: chatType },
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

describe('RideWizard Edge Cases', () => {
  let wizard;
  let storage;
  let mockRideService;
  let mockMessageFormatter;
  let mockRideMessagesService;

  beforeEach(() => {
    storage = new MockStorage();
    mockRideService = {
      createRide: jest.fn((data) => storage.createRide(data)),
      updateRide: jest.fn((id, data) => storage.updateRide(id, data))
    };
    mockMessageFormatter = {};
    mockRideMessagesService = {
      createRideMessage: jest.fn().mockResolvedValue({ sentMessage: {}, updatedRide: {} }),
      updateRideMessages: jest.fn().mockResolvedValue({ success: true, updatedCount: 1, removedCount: 0 })
    };

    wizard = new RideWizard(storage, mockRideService, mockMessageFormatter, mockRideMessagesService);
  });

  describe('wizard session expired', () => {
    it('should handle wizard action when session expired', async () => {
      const ctx = createMockContext();
      ctx.match = ['wizard:skip', 'skip'];

      await wizard.handleWizardAction(ctx);

      expect(ctx.answerCallbackQuery).toHaveBeenCalledWith('Wizard session expired');
    });

    it('should handle wizard input when session expired', async () => {
      const ctx = createMockContext();
      ctx.message = { text: 'some input', message_id: 1 };

      await wizard.handleWizardInput(ctx);

      // Should return early without error
      expect(ctx.reply).not.toHaveBeenCalled();
    });
  });

  describe('group chat restrictions', () => {
    it('should reject wizard start in group chat', async () => {
      const ctx = createMockContext(123, 456, 'group');

      await wizard.startWizard(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('only available in private chats')
      );
    });

    it('should reject wizard action in group chat', async () => {
      const ctx = createMockContext(123, 456, 'private');
      await wizard.startWizard(ctx);

      // Change to group chat
      const groupCtx = createMockContext(123, 456, 'group');
      groupCtx.match = ['wizard:skip', 'skip'];

      await wizard.handleWizardAction(groupCtx);

      expect(groupCtx.answerCallbackQuery).toHaveBeenCalledWith(
        expect.stringContaining('only available in private chats')
      );
    });

    it('should reject wizard input in group chat', async () => {
      const ctx = createMockContext(123, 456, 'private');
      await wizard.startWizard(ctx);

      // Change to group chat
      const groupCtx = createMockContext(123, 456, 'group');
      groupCtx.message = { text: 'test', message_id: 1 };

      await wizard.handleWizardInput(groupCtx);

      expect(groupCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('only available in private chats')
      );
    });
  });

  describe('clearable fields with dash', () => {
    it('should clear field when dash is entered', async () => {
      const ctx = createMockContext();
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
      const ctx = createMockContext();
      await wizard.startWizard(ctx);

      // Enter title
      ctx.message = { text: 'Test Ride', message_id: 2 };
      await wizard.handleWizardInput(ctx);

      // Try invalid category
      ctx.match = ['wizard:category', 'category', 'InvalidCategory'];
      await wizard.handleWizardAction(ctx);

      expect(ctx.answerCallbackQuery).toHaveBeenCalledWith('Invalid category selected');
    });
  });

  describe('back navigation edge cases', () => {
    it('should navigate back through wizard steps', async () => {
      const ctx = createMockContext();
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
      const ctx = createMockContext();
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
      const ctx = createMockContext();
      await wizard.startWizard(ctx);

      // Enter title
      ctx.message = { text: 'Test Ride', message_id: 2 };
      await wizard.handleWizardInput(ctx);

      // Enter category (which triggers keep button path)
      ctx.match = ['wizard:category', 'category', 'Road Ride'];
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
      const ctx = createMockContext();
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
      expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(
        expect.stringContaining('Error:')
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle message deletion errors during cancel', async () => {
      const ctx = createMockContext();
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
      expect(ctx.reply).toHaveBeenCalledWith('Ride creation cancelled');

      consoleErrorSpy.mockRestore();
    });
  });

  describe('duplicate ride creation', () => {
    it('should show duplicate success message', async () => {
      const ctx = createMockContext();
      
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

      expect(ctx.answerCallbackQuery).toHaveBeenCalledWith('Ride duplicated successfully!');
    });
  });

  describe('update ride with message removal', () => {
    it('should log removed message count', async () => {
      const ctx = createMockContext();
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
      const ctx = createMockContext();
      await wizard.startWizard(ctx);

      // Try to start another
      await wizard.startWizard(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('complete or cancel the current')
      );
    });
  });
});

