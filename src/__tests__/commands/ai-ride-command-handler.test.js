/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { AiRideCommandHandler } from '../../commands/AiRideCommandHandler.js';
import { t } from '../../i18n/index.js';

describe.each(['en', 'ru'])('AiRideCommandHandler (%s)', (language) => {
  const tr = (key, params = {}) => t(language, key, params, { fallbackLanguage: 'en' });

  let handler;
  let mockRideService;
  let mockMessageFormatter;
  let mockRideMessagesService;
  let mockAiRideService;
  let mockCtx;

  const makeCtx = (text = '/airide Road ride tomorrow 9am') => ({
    message: { text, message_id: 1 },
    lang: language,
    chat: { id: 100, type: 'private' },
    from: { id: 42, username: 'alice', first_name: 'Alice', last_name: 'Smith' },
    reply: jest.fn().mockResolvedValue({ message_id: 99 }),
    answerCallbackQuery: jest.fn().mockResolvedValue({}),
    api: {
      deleteMessage: jest.fn().mockResolvedValue({}),
      sendMessage: jest.fn().mockResolvedValue({ message_id: 88 })
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockRideService = {
      getRide: jest.fn(),
      createRideFromParams: jest.fn(),
      updateRideFromParams: jest.fn()
    };

    mockMessageFormatter = {
      formatRidePreview: jest.fn().mockReturnValue('🚲 Preview text')
    };

    mockRideMessagesService = {
      createRideMessage: jest.fn().mockResolvedValue({}),
      updateRideMessages: jest.fn().mockResolvedValue({ success: true, updatedCount: 1, removedCount: 0 })
    };

    mockAiRideService = {
      parseRideText: jest.fn()
    };

    handler = new AiRideCommandHandler(
      mockRideService,
      mockMessageFormatter,
      mockRideMessagesService,
      mockAiRideService
    );

    mockCtx = makeCtx();
  });

  // ─── handle() ────────────────────────────────────────────────────────────────

  describe('handle()', () => {
    it('replies with usage hint when no text follows the command', async () => {
      mockCtx.message.text = '/airide';
      await handler.handle(mockCtx);
      expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.airide.usageHint'));
      expect(mockAiRideService.parseRideText).not.toHaveBeenCalled();
    });

    it('replies with usage hint when only whitespace follows command', async () => {
      mockCtx.message.text = '/airide   ';
      await handler.handle(mockCtx);
      expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.airide.usageHint'));
    });

    it('shows "session already active" when a session exists for this user+chat', async () => {
      // Seed an existing state
      handler.states.set('42:100', { step: 'awaiting_confirmation' });

      await handler.handle(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.airide.sessionAlreadyActive'));
      expect(mockAiRideService.parseRideText).not.toHaveBeenCalled();
    });

    it('sends parsing message then deletes it during AI call', async () => {
      mockAiRideService.parseRideText.mockResolvedValue({
        params: { title: 'Ride', when: 'tomorrow' },
        error: null
      });
      mockMessageFormatter.formatRidePreview.mockReturnValue('preview');

      await handler.handle(mockCtx);

      // Parsing message was sent
      expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.airide.parsing'));
      // Parsing message was deleted
      expect(mockCtx.api.deleteMessage).toHaveBeenCalledWith(100, 99);
    });

    it('shows parseError and clears state when AI returns error', async () => {
      mockAiRideService.parseRideText.mockResolvedValue({ params: null, error: 'service_unavailable' });

      await handler.handle(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(expect.stringContaining(tr('commands.airide.parseError')));
      expect(handler.states.has('42:100')).toBe(false);
    });

    it('asks for missing title when AI returns params without title', async () => {
      mockAiRideService.parseRideText.mockResolvedValue({
        params: { when: 'tomorrow 9am' },
        error: null
      });

      await handler.handle(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.airide.missingField.title'));
      const state = handler.states.get('42:100');
      expect(state.step).toBe('awaiting_followup');
      expect(state.missingField).toBe('title');
    });

    it('asks for missing date when AI returns params without when', async () => {
      mockAiRideService.parseRideText.mockResolvedValue({
        params: { title: 'Evening Ride' },
        error: null
      });

      await handler.handle(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.airide.missingField.when'));
      const state = handler.states.get('42:100');
      expect(state.step).toBe('awaiting_followup');
      expect(state.missingField).toBe('when');
    });

    it('sends preview and stores state when all required fields present', async () => {
      mockAiRideService.parseRideText.mockResolvedValue({
        params: { title: 'Evening Ride', when: 'tomorrow 6pm', dist: '50' },
        error: null
      });
      mockMessageFormatter.formatRidePreview.mockReturnValue('🚲 Evening Ride\n📅 tomorrow 6pm');

      await handler.handle(mockCtx);

      expect(mockMessageFormatter.formatRidePreview).toHaveBeenCalled();
      const state = handler.states.get('42:100');
      expect(state.step).toBe('awaiting_confirmation');
      expect(state.mode).toBe('create');
      expect(state.parsedParams).toMatchObject({ title: 'Evening Ride', when: 'tomorrow 6pm' });
    });

    it('detects update mode with in-memory base62 ID (mixed case)', async () => {
      const ride = { id: '7F6CMTkvLyX', createdBy: 42, title: 'Old Ride' };
      mockRideService.getRide.mockResolvedValue(ride);
      mockAiRideService.parseRideText.mockResolvedValue({
        params: { when: 'next Sunday' },
        error: null
      });
      mockCtx.message.text = '/airide #7F6CMTkvLyX change date to next Sunday';

      await handler.handle(mockCtx);

      expect(mockRideService.getRide).toHaveBeenCalledWith('7F6CMTkvLyX');
      const state = handler.states.get('42:100');
      expect(state.mode).toBe('update');
      expect(state.rideId).toBe('7F6CMTkvLyX');
    });

    it('detects update mode with MongoDB ObjectId (hex)', async () => {
      const ride = { id: '507f1f77bcf86cd799439011', createdBy: 42, title: 'Old Ride' };
      mockRideService.getRide.mockResolvedValue(ride);
      mockAiRideService.parseRideText.mockResolvedValue({
        params: { when: 'next Sunday' },
        error: null
      });
      mockCtx.message.text = '/airide #507f1f77bcf86cd799439011 change date to next Sunday';

      await handler.handle(mockCtx);

      expect(mockRideService.getRide).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
      const state = handler.states.get('42:100');
      expect(state.mode).toBe('update');
    });

    it('replies with ride not found when update mode rideId is invalid', async () => {
      mockRideService.getRide.mockResolvedValue(null);
      mockCtx.message.text = '/airide #notexist change date to next Sunday';

      await handler.handle(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('notexist')
      );
      expect(mockAiRideService.parseRideText).not.toHaveBeenCalled();
    });

    it('replies with creator error when user is not the ride creator', async () => {
      const ride = { id: 'abc123', createdBy: 999, title: 'Other Ride' };
      mockRideService.getRide.mockResolvedValue(ride);
      mockCtx.message.text = '/airide #abc123 change something';

      await handler.handle(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining(tr('commands.update.onlyCreator'))
      );
      expect(mockAiRideService.parseRideText).not.toHaveBeenCalled();
    });

    describe('update mode — uses existing ride data for required-field check', () => {
      it('does NOT ask for date when existing ride has a date and AI did not extract when', async () => {
        const existingDate = new Date('2026-04-12T09:00:00Z');
        const ride = { id: 'abc123', createdBy: 42, title: 'Morning Ride', date: existingDate };
        mockRideService.getRide.mockResolvedValue(ride);
        mockAiRideService.parseRideText.mockResolvedValue({
          params: { speed: '25-28' }, // no 'when' field
          error: null
        });
        mockMessageFormatter.formatRidePreview.mockReturnValue('preview');
        mockCtx.message.text = '/airide #abc123 speed 25-28';

        await handler.handle(mockCtx);

        // Should NOT ask for date
        expect(mockCtx.reply).not.toHaveBeenCalledWith(tr('commands.airide.missingField.when'));
        // Should show preview instead
        expect(mockMessageFormatter.formatRidePreview).toHaveBeenCalled();
        const state = handler.states.get('42:100');
        expect(state.step).toBe('awaiting_confirmation');
      });

      it('does NOT ask for title when existing ride has a title and AI did not extract title', async () => {
        const existingDate = new Date('2026-04-12T09:00:00Z');
        const ride = { id: 'abc123', createdBy: 42, title: 'Morning Ride', date: existingDate };
        mockRideService.getRide.mockResolvedValue(ride);
        mockAiRideService.parseRideText.mockResolvedValue({
          params: { dist: '60' }, // no 'title' or 'when'
          error: null
        });
        mockMessageFormatter.formatRidePreview.mockReturnValue('preview');
        mockCtx.message.text = '/airide #abc123 change distance to 60km';

        await handler.handle(mockCtx);

        expect(mockCtx.reply).not.toHaveBeenCalledWith(tr('commands.airide.missingField.title'));
        expect(mockCtx.reply).not.toHaveBeenCalledWith(tr('commands.airide.missingField.when'));
        expect(mockMessageFormatter.formatRidePreview).toHaveBeenCalled();
      });

      it('still asks for date when existing ride has no date and AI did not extract when', async () => {
        const ride = { id: 'abc123', createdBy: 42, title: 'Morning Ride', date: null };
        mockRideService.getRide.mockResolvedValue(ride);
        mockAiRideService.parseRideText.mockResolvedValue({
          params: { speed: '25-28' },
          error: null
        });
        mockCtx.message.text = '/airide #abc123 speed 25-28';

        await handler.handle(mockCtx);

        expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.airide.missingField.when'));
      });

      it('preview merges existing ride date when AI did not extract when', async () => {
        const existingDate = new Date('2026-04-12T09:00:00Z');
        const ride = {
          id: 'abc123', createdBy: 42, title: 'Morning Ride',
          date: existingDate, distance: 50, category: 'road'
        };
        mockRideService.getRide.mockResolvedValue(ride);
        mockAiRideService.parseRideText.mockResolvedValue({
          params: { speed: '25-28' },
          error: null
        });
        mockMessageFormatter.formatRidePreview.mockReturnValue('preview');
        mockCtx.message.text = '/airide #abc123 speed 25-28';

        await handler.handle(mockCtx);

        // formatRidePreview should receive the existing date merged in
        const previewArg = mockMessageFormatter.formatRidePreview.mock.calls[0][0];
        expect(previewArg.date).toBe(existingDate);
        expect(previewArg.title).toBe('Morning Ride');
        expect(previewArg.distance).toBe(50);
        // speed "25-28" should be parsed into speedMin/speedMax, not additionalInfo
        expect(previewArg.speedMin).toBe(25);
        expect(previewArg.speedMax).toBe(28);
        expect(previewArg.additionalInfo).toBeNull();
      });

      it('preview uses AI when over existing ride date when AI extracted it', async () => {
        const existingDate = new Date('2026-04-12T09:00:00Z');
        const ride = { id: 'abc123', createdBy: 42, title: 'Morning Ride', date: existingDate };
        mockRideService.getRide.mockResolvedValue(ride);
        mockAiRideService.parseRideText.mockResolvedValue({
          params: { when: 'next Sunday 10am' },
          error: null
        });
        mockMessageFormatter.formatRidePreview.mockReturnValue('preview');
        mockCtx.message.text = '/airide #abc123 move to next Sunday 10am';

        await handler.handle(mockCtx);

        const previewArg = mockMessageFormatter.formatRidePreview.mock.calls[0][0];
        // date should be parsed from 'next Sunday 10am', NOT the existing date
        expect(previewArg.date).not.toBe(existingDate);
      });
    });

    describe('preview speed parsing', () => {
      it('parses speed range into speedMin/speedMax in create mode preview', async () => {
        mockAiRideService.parseRideText.mockResolvedValue({
          params: { title: 'Fast Ride', when: 'tomorrow 9am', speed: '25-28' },
          error: null
        });
        mockMessageFormatter.formatRidePreview.mockReturnValue('preview');

        await handler.handle(mockCtx);

        const previewArg = mockMessageFormatter.formatRidePreview.mock.calls[0][0];
        expect(previewArg.speedMin).toBe(25);
        expect(previewArg.speedMax).toBe(28);
        expect(previewArg.additionalInfo).toBeNull();
      });

      it('parses average speed (single number) into speedMin===speedMax', async () => {
        mockAiRideService.parseRideText.mockResolvedValue({
          params: { title: 'Fast Ride', when: 'tomorrow 9am', speed: '26' },
          error: null
        });
        mockMessageFormatter.formatRidePreview.mockReturnValue('preview');

        await handler.handle(mockCtx);

        const previewArg = mockMessageFormatter.formatRidePreview.mock.calls[0][0];
        expect(previewArg.speedMin).toBe(26);
        expect(previewArg.speedMax).toBe(26);
        expect(previewArg.additionalInfo).toBeNull();
      });

      it('puts info text in additionalInfo, not speed', async () => {
        mockAiRideService.parseRideText.mockResolvedValue({
          params: { title: 'Ride', when: 'tomorrow', info: 'Bring lights' },
          error: null
        });
        mockMessageFormatter.formatRidePreview.mockReturnValue('preview');

        await handler.handle(mockCtx);

        const previewArg = mockMessageFormatter.formatRidePreview.mock.calls[0][0];
        expect(previewArg.additionalInfo).toBe('Bring lights');
        expect(previewArg.speedMin).toBeNull();
      });

      it('parses duration string into minutes for preview', async () => {
        mockAiRideService.parseRideText.mockResolvedValue({
          params: { title: 'Long Ride', when: 'tomorrow 9am', duration: '5h' },
          error: null
        });
        mockMessageFormatter.formatRidePreview.mockReturnValue('preview');

        await handler.handle(mockCtx);

        const previewArg = mockMessageFormatter.formatRidePreview.mock.calls[0][0];
        expect(previewArg.duration).toBe(300); // 5h = 300 minutes
      });

      it('parses duration with hours and minutes for preview', async () => {
        mockAiRideService.parseRideText.mockResolvedValue({
          params: { title: 'Ride', when: 'tomorrow', duration: '2h 30m' },
          error: null
        });
        mockMessageFormatter.formatRidePreview.mockReturnValue('preview');

        await handler.handle(mockCtx);

        const previewArg = mockMessageFormatter.formatRidePreview.mock.calls[0][0];
        expect(previewArg.duration).toBe(150); // 2h30m = 150 minutes
      });

      it('uses existing ride duration in minutes when AI did not extract duration', async () => {
        const existingDate = new Date('2026-04-12T09:00:00Z');
        const ride = { id: 'abc123', createdBy: 42, title: 'Ride', date: existingDate, duration: 180 };
        mockRideService.getRide.mockResolvedValue(ride);
        mockAiRideService.parseRideText.mockResolvedValue({
          params: { dist: '60' },
          error: null
        });
        mockMessageFormatter.formatRidePreview.mockReturnValue('preview');
        mockCtx.message.text = '/airide #abc123 distance 60km';

        await handler.handle(mockCtx);

        const previewArg = mockMessageFormatter.formatRidePreview.mock.calls[0][0];
        expect(previewArg.duration).toBe(180);
      });
    });
  });

  // ─── handleTextInput() ───────────────────────────────────────────────────────

  describe('handleTextInput()', () => {
    it('ignores messages when no active state for user+chat', async () => {
      mockCtx.message = { text: 'some answer', message_id: 5 };
      await handler.handleTextInput(mockCtx);
      expect(mockAiRideService.parseRideText).not.toHaveBeenCalled();
    });

    it('ignores messages when state is awaiting_confirmation not followup', async () => {
      handler.states.set('42:100', {
        step: 'awaiting_confirmation',
        originalText: 'some ride',
        parsedParams: { title: 'X', when: 'tomorrow' }
      });
      mockCtx.message = { text: 'something', message_id: 5 };

      await handler.handleTextInput(mockCtx);

      expect(mockAiRideService.parseRideText).not.toHaveBeenCalled();
    });

    it('re-parses with followup text and shows preview on success', async () => {
      handler.states.set('42:100', {
        mode: 'create',
        rideId: null,
        originalText: 'Road ride 50km',
        parsedParams: { when: 'tomorrow' },
        step: 'awaiting_followup',
        missingField: 'title',
        retryCount: 0,
        confirmMessageId: null
      });
      mockAiRideService.parseRideText.mockResolvedValue({
        params: { title: 'Road Ride', when: 'tomorrow', dist: '50' },
        error: null
      });
      mockMessageFormatter.formatRidePreview.mockReturnValue('preview');
      mockCtx.message = { text: 'Road Ride', message_id: 5 };

      await handler.handleTextInput(mockCtx);

      expect(mockAiRideService.parseRideText).toHaveBeenCalledWith(
        'Road ride 50km',
        expect.objectContaining({ followUpText: 'Road Ride' })
      );
      const state = handler.states.get('42:100');
      expect(state.step).toBe('awaiting_confirmation');
    });

    it('asks again when re-parse still missing required field', async () => {
      handler.states.set('42:100', {
        mode: 'create',
        rideId: null,
        originalText: 'some ride',
        parsedParams: {},
        step: 'awaiting_followup',
        missingField: 'title',
        retryCount: 0,
        confirmMessageId: null
      });
      mockAiRideService.parseRideText.mockResolvedValue({
        params: { when: 'tomorrow' }, // still no title
        error: null
      });
      mockCtx.message = { text: 'I dunno', message_id: 5 };

      await handler.handleTextInput(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.airide.missingField.title'));
      expect(handler.states.get('42:100').retryCount).toBe(1);
    });

    it('clears state and replies error after too many retries', async () => {
      handler.states.set('42:100', {
        mode: 'create',
        rideId: null,
        originalText: 'some ride',
        parsedParams: {},
        step: 'awaiting_followup',
        missingField: 'title',
        retryCount: 2, // already at max
        confirmMessageId: null
      });
      mockCtx.message = { text: 'still unclear', message_id: 5 };

      await handler.handleTextInput(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.airide.tooManyRetries'));
      expect(handler.states.has('42:100')).toBe(false);
    });
  });

  // ─── handleCallback() ────────────────────────────────────────────────────────

  describe('handleCallback()', () => {
    const stateKey = '42:100';

    beforeEach(() => {
      mockCtx.match = [null, 'confirm', stateKey];
    });

    it('answers session expired when no state found', async () => {
      await handler.handleCallback(mockCtx);

      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith(
        tr('commands.airide.sessionExpired')
      );
    });

    it('cancel: deletes preview message, clears state, replies cancelled', async () => {
      handler.states.set(stateKey, {
        mode: 'create',
        step: 'awaiting_confirmation',
        confirmMessageId: 55,
        parsedParams: { title: 'Ride', when: 'tomorrow' }
      });
      mockCtx.match = [null, 'cancel', stateKey];

      await handler.handleCallback(mockCtx);

      expect(mockCtx.api.deleteMessage).toHaveBeenCalledWith(100, 55);
      expect(handler.states.has(stateKey)).toBe(false);
      expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.airide.cancelled'));
    });

    it('confirm create: calls createRideFromParams and createRideMessage', async () => {
      const mockRide = { id: 'new1', title: 'New Ride' };
      mockRideService.createRideFromParams.mockResolvedValue({ ride: mockRide, error: null });
      handler.states.set(stateKey, {
        mode: 'create',
        rideId: null,
        step: 'awaiting_confirmation',
        confirmMessageId: 55,
        parsedParams: { title: 'New Ride', when: 'tomorrow 9am' }
      });

      await handler.handleCallback(mockCtx);

      expect(mockRideService.createRideFromParams).toHaveBeenCalledWith(
        { title: 'New Ride', when: 'tomorrow 9am' },
        100,
        mockCtx.from,
        expect.objectContaining({ language: language })
      );
      expect(mockRideMessagesService.createRideMessage).toHaveBeenCalledWith(mockRide, mockCtx);
      expect(handler.states.has(stateKey)).toBe(false);
    });

    it('confirm update: calls updateRideFromParams and updateRideMessages', async () => {
      const mockRide = { id: 'upd1', title: 'Updated Ride' };
      mockRideService.updateRideFromParams.mockResolvedValue({ ride: mockRide, error: null });
      handler.states.set(stateKey, {
        mode: 'update',
        rideId: 'upd1',
        step: 'awaiting_confirmation',
        confirmMessageId: 55,
        parsedParams: { when: 'next Sunday' }
      });

      await handler.handleCallback(mockCtx);

      expect(mockRideService.updateRideFromParams).toHaveBeenCalledWith(
        'upd1',
        { when: 'next Sunday' },
        42,
        expect.objectContaining({ language: language })
      );
      expect(mockRideMessagesService.updateRideMessages).toHaveBeenCalledWith(mockRide, mockCtx);
      expect(handler.states.has(stateKey)).toBe(false);
    });

    it('confirm: replies with error when createRideFromParams fails', async () => {
      mockRideService.createRideFromParams.mockResolvedValue({ ride: null, error: 'Date in the past' });
      handler.states.set(stateKey, {
        mode: 'create',
        rideId: null,
        step: 'awaiting_confirmation',
        confirmMessageId: null,
        parsedParams: { title: 'Ride', when: 'yesterday' }
      });

      await handler.handleCallback(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith('Date in the past');
      expect(handler.states.has(stateKey)).toBe(false);
    });
  });
});
