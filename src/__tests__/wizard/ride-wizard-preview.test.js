/**
 * @jest-environment node
 *
 * Tests for the live ride preview feature in RideWizard.
 * Verifies that a preview message is sent above the wizard question,
 * updated on each step, and cleaned up on cancel/confirm.
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
    deleteMessage: jest.fn().mockResolvedValue(),
    answerCallbackQuery: jest.fn().mockResolvedValue(),
    api: {
      deleteMessage: jest.fn().mockResolvedValue(),
      editMessageText: jest.fn().mockImplementation((chatId, messageId, text, options) => {
        const msg = { message_id: messageId, chatId, text, ...options };
        editedMessages.push(msg);
        return Promise.resolve(msg);
      })
    },
    _test: { messages, deletedMessages, editedMessages }
  };

  return ctx;
};

describe.each(['en', 'ru'])('RideWizard — Live Preview (%s)', (language) => {
  let wizard;
  let storage;
  let mockMessageFormatter;
  let mockRideMessagesService;
  const tr = (key, params = {}) => t(language, key, params, { fallbackLanguage: 'en' });

  beforeEach(() => {
    storage = new MockStorage();
    mockMessageFormatter = {
      formatRidePreview: jest.fn().mockReturnValue('<preview text>'),
      formatRideMessage: jest.fn()
    };
    mockRideMessagesService = {
      createRideMessage: jest.fn().mockResolvedValue(true),
      updateRideMessages: jest.fn().mockResolvedValue(true)
    };
    wizard = new RideWizard(storage, {}, mockMessageFormatter, mockRideMessagesService);
  });

  describe('buildPreviewRideObject', () => {
    it('maps wizard state data keys to ride-like object keys', () => {
      const date = new Date('2026-07-21T10:00:00Z');
      const state = {
        data: {
          title: 'Evening Ride',
          category: 'road',
          datetime: date,        // wizard key
          organizer: 'Jane',
          meetingPoint: 'Park',
          routes: [{ url: 'https://strava.com/routes/1' }],
          distance: 45,
          duration: 90,
          speedMin: 25,
          speedMax: 28,
          additionalInfo: 'Bring lights',
          // extra wizard-only keys that should NOT appear in result
          chatId: 456,
          currentUser: 123,
          notifyOnParticipation: true
        }
      };

      const result = wizard.buildPreviewRideObject(state);

      expect(result).toEqual({
        title: 'Evening Ride',
        category: 'road',
        date: date,              // mapped from 'datetime'
        organizer: 'Jane',
        meetingPoint: 'Park',
        routes: [{ url: 'https://strava.com/routes/1' }],
        distance: 45,
        duration: 90,
        speedMin: 25,
        speedMax: 28,
        additionalInfo: 'Bring lights'
      });
    });

    it('maps undefined wizard fields to null', () => {
      const result = wizard.buildPreviewRideObject({ data: { title: 'Test' } });
      expect(result.date).toBeNull();
      expect(result.category).toBeNull();
      expect(result.organizer).toBeNull();
    });
  });

  describe('startWizard', () => {
    it('sends preview message first (index 0), wizard question second (index 1)', async () => {
      const ctx = createMockContext(123, 456, 'private', language);
      await wizard.startWizard(ctx);

      expect(ctx._test.messages).toHaveLength(2);
      // Preview message is first (sent with the placeholder text)
      expect(ctx._test.messages[0].text).toBe(tr('wizard.preview.placeholder'));
      // Wizard question is second
      expect(ctx._test.messages[1].text).toContain(tr('wizard.prompts.title'));
    });

    it('stores previewMessageId in wizard state', async () => {
      const ctx = createMockContext(123, 456, 'private', language);
      await wizard.startWizard(ctx);

      const stateKey = wizard.getWizardStateKey(ctx.from.id, ctx.chat.id);
      const state = wizard.wizardStates.get(stateKey);
      expect(state.previewMessageId).toBe(ctx._test.messages[0].message_id);
    });

    it('sends real preview (not placeholder) when prefill data has title', async () => {
      const ctx = createMockContext(123, 456, 'private', language);
      await wizard.startWizard(ctx, {
        title: 'Prefilled Ride',
        datetime: new Date('2026-07-21T10:00:00Z')
      });

      // formatRidePreview should have been called (not placeholder)
      expect(mockMessageFormatter.formatRidePreview).toHaveBeenCalled();
      // First message uses the formatRidePreview output
      expect(ctx._test.messages[0].text).toBe('<preview text>');
    });

    it('preview message has no inline keyboard', async () => {
      const ctx = createMockContext(123, 456, 'private', language);
      await wizard.startWizard(ctx);

      const previewMsg = ctx._test.messages[0];
      expect(previewMsg.reply_markup).toBeUndefined();
    });
  });

  describe('preview updates on step advance', () => {
    it('updates preview after entering title', async () => {
      const ctx = createMockContext(123, 456, 'private', language);
      await wizard.startWizard(ctx);

      ctx.message = { text: 'Evening Ride', message_id: 10 };
      await wizard.handleWizardInput(ctx);

      // formatRidePreview should have been called with title data
      expect(mockMessageFormatter.formatRidePreview).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Evening Ride' }),
        language
      );

      // editMessageText called for the preview (previewMessageId = 1)
      const previewEdits = ctx._test.editedMessages.filter(m => m.message_id === 1);
      expect(previewEdits.length).toBeGreaterThan(0);
      expect(previewEdits[previewEdits.length - 1].text).toBe('<preview text>');
    });

    it('updates preview after category button click', async () => {
      const ctx = createMockContext(123, 456, 'private', language);
      await wizard.startWizard(ctx);

      ctx.message = { text: 'Test Ride', message_id: 10 };
      await wizard.handleWizardInput(ctx);

      mockMessageFormatter.formatRidePreview.mockClear();
      ctx.match = ['wizard:category:road', 'category', 'road'];
      await wizard.handleWizardAction(ctx);

      expect(mockMessageFormatter.formatRidePreview).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'road' }),
        language
      );
    });

    it('updates preview after skipping a field', async () => {
      const ctx = createMockContext(123, 456, 'private', language);
      await wizard.startWizard(ctx);

      ctx.message = { text: 'Test Ride', message_id: 10 };
      await wizard.handleWizardInput(ctx);

      mockMessageFormatter.formatRidePreview.mockClear();
      ctx.match = ['wizard:skip', 'skip']; // skip category
      await wizard.handleWizardAction(ctx);

      expect(mockMessageFormatter.formatRidePreview).toHaveBeenCalled();
    });
  });

  describe('confirm step', () => {
    async function advanceToConfirm(ctx) {
      await wizard.startWizard(ctx);
      ctx.message = { text: 'Test Ride', message_id: 10 };
      await wizard.handleWizardInput(ctx); // title
      ctx.match = ['wizard:skip', 'skip'];
      await wizard.handleWizardAction(ctx); // skip category
      await wizard.handleWizardAction(ctx); // skip organizer
      ctx.message = { text: 'tomorrow at 6pm', message_id: 11 };
      await wizard.handleWizardInput(ctx); // date
      for (let i = 0; i < 6; i++) {
        ctx.match = ['wizard:skip', 'skip'];
        await wizard.handleWizardAction(ctx);
      }
      ctx.match = ['wizard:notifyYes', 'notifyYes'];
      await wizard.handleWizardAction(ctx); // advance to confirm
    }

    it('shows simplified confirmPrompt at confirm step', async () => {
      const ctx = createMockContext(123, 456, 'private', language);
      await advanceToConfirm(ctx);

      const lastEdit = ctx._test.editedMessages[ctx._test.editedMessages.length - 1];
      expect(lastEdit.text).toBe(tr('wizard.confirm.confirmPrompt'));
    });

    it('updates preview at confirm step (with auto-filled organizer)', async () => {
      const ctx = createMockContext(123, 456, 'private', language);
      await advanceToConfirm(ctx);

      // formatRidePreview should have been called with organizer set
      const lastCall = mockMessageFormatter.formatRidePreview.mock.calls[
        mockMessageFormatter.formatRidePreview.mock.calls.length - 1
      ];
      expect(lastCall[0].organizer).toBeTruthy();
    });
  });

  describe('cancel cleanup', () => {
    it('deletes preview message when wizard is cancelled', async () => {
      const ctx = createMockContext(123, 456, 'private', language);
      await wizard.startWizard(ctx);

      const stateKey = wizard.getWizardStateKey(ctx.from.id, ctx.chat.id);
      const state = wizard.wizardStates.get(stateKey);
      const previewMessageId = state.previewMessageId;

      ctx.match = ['wizard:cancel', 'cancel'];
      await wizard.handleWizardAction(ctx);

      expect(ctx.api.deleteMessage).toHaveBeenCalledWith(
        ctx.chat.id,
        previewMessageId
      );
    });

    it('swallows preview deletion failure on cancel', async () => {
      const ctx = createMockContext(123, 456, 'private', language);
      ctx.api.deleteMessage.mockRejectedValue(new Error('Cannot delete'));
      await wizard.startWizard(ctx);

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      ctx.match = ['wizard:cancel', 'cancel'];
      // Should not throw
      await expect(wizard.handleWizardAction(ctx)).resolves.not.toThrow();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('confirm cleanup (new ride)', () => {
    it('deletes preview message when new ride is confirmed', async () => {
      const ctx = createMockContext(123, 456, 'private', language);
      await wizard.startWizard(ctx);

      const stateKey = wizard.getWizardStateKey(ctx.from.id, ctx.chat.id);
      const state = wizard.wizardStates.get(stateKey);
      const previewMessageId = state.previewMessageId;

      // Complete wizard minimally
      ctx.message = { text: 'Test Ride', message_id: 10 };
      await wizard.handleWizardInput(ctx);
      for (let i = 0; i < 8; i++) {
        ctx.match = ['wizard:skip', 'skip'];
        await wizard.handleWizardAction(ctx);
      }

      ctx.match = ['wizard:confirm', 'confirm'];
      await wizard.handleWizardAction(ctx);

      expect(ctx.api.deleteMessage).toHaveBeenCalledWith(ctx.chat.id, previewMessageId);
    });

    it('swallows preview deletion failure on confirm', async () => {
      const ctx = createMockContext(123, 456, 'private', language);
      ctx.api.deleteMessage.mockRejectedValue(new Error('Cannot delete'));
      await wizard.startWizard(ctx);

      ctx.message = { text: 'Test Ride', message_id: 10 };
      await wizard.handleWizardInput(ctx);
      for (let i = 0; i < 8; i++) {
        ctx.match = ['wizard:skip', 'skip'];
        await wizard.handleWizardAction(ctx);
      }

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      ctx.match = ['wizard:confirm', 'confirm'];
      await expect(wizard.handleWizardAction(ctx)).resolves.not.toThrow();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('confirm cleanup (update ride)', () => {
    it('deletes preview message when ride update is confirmed', async () => {
      const ctx = createMockContext(123, 456, 'private', language);
      const existingRide = await storage.createRide({ title: 'Old Ride', date: new Date(), createdBy: ctx.from.id });

      await wizard.startWizard(ctx, {
        isUpdate: true,
        originalRideId: existingRide.id,
        title: existingRide.title,
        datetime: existingRide.date
      });

      const stateKey = wizard.getWizardStateKey(ctx.from.id, ctx.chat.id);
      const state = wizard.wizardStates.get(stateKey);
      const previewMessageId = state.previewMessageId;

      for (let i = 0; i < 9; i++) {
        ctx.match = ['wizard:skip', 'skip'];
        await wizard.handleWizardAction(ctx);
      }

      ctx.match = ['wizard:confirm', 'confirm'];
      await wizard.handleWizardAction(ctx);

      expect(ctx.api.deleteMessage).toHaveBeenCalledWith(ctx.chat.id, previewMessageId);
    });
  });

  describe('preview edit failure fallback', () => {
    it('sends new preview message when edit fails', async () => {
      const ctx = createMockContext(123, 456, 'private', language);
      await wizard.startWizard(ctx);

      const stateKey = wizard.getWizardStateKey(ctx.from.id, ctx.chat.id);
      const state = wizard.wizardStates.get(stateKey);

      // Make edit fail (not "message is not modified")
      ctx.api.editMessageText.mockRejectedValueOnce(new Error('Message edit failed'));

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      ctx.message = { text: 'Test Ride', message_id: 10 };
      await wizard.handleWizardInput(ctx);

      // A new preview message should have been sent
      expect(ctx.reply).toHaveBeenCalledTimes(3); // preview + wizard question + re-sent preview
      // previewMessageId should be updated
      expect(state.previewMessageId).not.toBe(1);

      consoleErrorSpy.mockRestore();
    });

    it('silently ignores "message is not modified" edit failure', async () => {
      const ctx = createMockContext(123, 456, 'private', language);
      await wizard.startWizard(ctx);

      const notModifiedError = new Error('Bad Request: message is not modified');
      ctx.api.editMessageText.mockRejectedValueOnce(notModifiedError);

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      ctx.message = { text: 'Test Ride', message_id: 10 };
      await wizard.handleWizardInput(ctx);

      // No fallback send - error was silently ignored
      expect(ctx.reply).toHaveBeenCalledTimes(2); // only preview + wizard question from startWizard
      expect(consoleErrorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Error editing preview'),
        expect.anything()
      );

      consoleErrorSpy.mockRestore();
    });
  });
});
