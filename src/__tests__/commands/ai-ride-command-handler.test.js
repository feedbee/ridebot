/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { AiRideCommandHandler } from '../../commands/AiRideCommandHandler.js';
import { RouteParser } from '../../utils/route-parser.js';
import { t } from '../../i18n/index.js';

describe.each(['en', 'ru'])('AiRideCommandHandler (%s)', (language) => {
  const tr = (key, params = {}) => t(language, key, params, { fallbackLanguage: 'en' });

  let handler;
  let mockRideService;
  let mockMessageFormatter;
  let mockRideMessagesService;
  let mockAiRideService;
  let mockCtx;

  const makeCtx = (text = '/airide Road ride tomorrow 9am', messageOverrides = {}) => ({
    message: { text, message_id: 1, ...messageOverrides },
    lang: language,
    chat: { id: 100, type: 'private' },
    from: { id: 42, username: 'alice', first_name: 'Alice', last_name: 'Smith' },
    reply: jest.fn().mockResolvedValue({ message_id: 99 }),
    answerCallbackQuery: jest.fn().mockResolvedValue({}),
    deleteMessage: jest.fn().mockResolvedValue({}),
    api: {
      deleteMessage: jest.fn().mockResolvedValue({}),
      editMessageText: jest.fn().mockResolvedValue({}),
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
      extractRideId: jest.fn((message) => {
        const match = message.reply_to_message?.text?.match(/🎫\s*#Ride\s*#(\w+)/i);
        return match
          ? { rideId: match[1], error: null }
          : { rideId: null, error: tr('services.rideMessages.couldNotFindRideIdInMessage') };
      }),
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
    it('shows "session already active" when a session exists for this user+chat', async () => {
      handler.states.set('42:100', { mode: 'create' });
      mockCtx.message.text = '/airide something';
      await handler.handle(mockCtx);
      expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.airide.sessionAlreadyActive'));
      expect(mockAiRideService.parseRideText).not.toHaveBeenCalled();
    });

    describe('create mode — no initial text', () => {
      it('sends dialog prompt and stores empty state', async () => {
        mockCtx.message.text = '/airide';

        await handler.handle(mockCtx);

        expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.airide.dialogPrompt'));
        expect(mockAiRideService.parseRideText).not.toHaveBeenCalled();
        const state = handler.states.get('42:100');
        expect(state.mode).toBe('create');
        expect(state.userMessages).toEqual([]);
        expect(state.messageCount).toBe(0);
        expect(state.botMessageIds).toContain(99); // reply message ID
      });
    });

    describe('create mode — with initial text', () => {
      it('immediately processes text and shows preview', async () => {
        mockAiRideService.parseRideText.mockResolvedValue({
          params: { title: 'Evening Ride', when: 'tomorrow 6pm' },
          error: null
        });
        mockCtx.message.text = '/airide Evening Ride tomorrow 6pm';

        await handler.handle(mockCtx);

        expect(mockAiRideService.parseRideText).toHaveBeenCalledWith('', {
          dialogMessages: ['Evening Ride tomorrow 6pm']
        });
        expect(mockMessageFormatter.formatRidePreview).toHaveBeenCalled();
        const state = handler.states.get('42:100');
        expect(state.messageCount).toBe(1);
        expect(state.lastParams).toMatchObject({ title: 'Evening Ride' });
      });

      it('shows parseError and clears state when AI returns error', async () => {
        mockAiRideService.parseRideText.mockResolvedValue({ params: null, error: 'service_unavailable' });
        mockCtx.message.text = '/airide some text';

        await handler.handle(mockCtx);

        expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.airide.parseError'));
        expect(handler.states.has('42:100')).toBe(false);
      });
    });

    describe('update mode', () => {
      it('sends update dialog prompt when only #id provided', async () => {
        const ride = { id: 'abc123', createdBy: 42, title: 'Old Ride', date: new Date() };
        mockRideService.getRide.mockResolvedValue(ride);
        mockCtx.message.text = '/airide #abc123';

        await handler.handle(mockCtx);

        expect(mockRideService.getRide).toHaveBeenCalledWith('abc123');
        expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.airide.dialogUpdatePrompt'));
        const state = handler.states.get('42:100');
        expect(state.mode).toBe('update');
        expect(state.rideId).toBe('abc123');
        expect(state.ride).toBe(ride);
        expect(state.messageCount).toBe(0);
      });

      it('immediately processes text when #id + text provided', async () => {
        const ride = { id: 'abc123', createdBy: 42, title: 'Old Ride', date: new Date() };
        mockRideService.getRide.mockResolvedValue(ride);
        mockAiRideService.parseRideText.mockResolvedValue({
          params: { speed: '25-28' }, error: null
        });
        mockCtx.message.text = '/airide #abc123 change speed to 25-28';

        await handler.handle(mockCtx);

        expect(mockAiRideService.parseRideText).toHaveBeenCalledWith('', {
          dialogMessages: ['change speed to 25-28']
        });
        expect(mockMessageFormatter.formatRidePreview).toHaveBeenCalled();
      });

      it('detects update mode with in-memory base62 ID', async () => {
        const ride = { id: '7F6CMTkvLyX', createdBy: 42, title: 'Old Ride', date: new Date() };
        mockRideService.getRide.mockResolvedValue(ride);
        mockCtx.message.text = '/airide #7F6CMTkvLyX';

        await handler.handle(mockCtx);

        expect(mockRideService.getRide).toHaveBeenCalledWith('7F6CMTkvLyX');
        expect(handler.states.get('42:100').mode).toBe('update');
      });

      it('detects update mode with MongoDB ObjectId', async () => {
        const ride = { id: '507f1f77bcf86cd799439011', createdBy: 42, title: 'Old Ride', date: new Date() };
        mockRideService.getRide.mockResolvedValue(ride);
        mockCtx.message.text = '/airide #507f1f77bcf86cd799439011';

        await handler.handle(mockCtx);

        expect(mockRideService.getRide).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
        expect(handler.states.get('42:100').mode).toBe('update');
      });

      it('replies with ride not found when rideId is invalid', async () => {
        mockRideService.getRide.mockResolvedValue(null);
        mockCtx.message.text = '/airide #notexist';

        await handler.handle(mockCtx);

        expect(mockCtx.reply).toHaveBeenCalledWith(
          expect.stringContaining('notexist')
        );
        expect(mockAiRideService.parseRideText).not.toHaveBeenCalled();
      });

      it('replies with creator error when user is not the ride creator', async () => {
        const ride = { id: 'abc123', createdBy: 999, title: 'Other Ride' };
        mockRideService.getRide.mockResolvedValue(ride);
        mockCtx.message.text = '/airide #abc123';

        await handler.handle(mockCtx);

        expect(mockCtx.reply).toHaveBeenCalledWith(
          expect.stringContaining(tr('commands.update.onlyCreator'))
        );
        expect(mockAiRideService.parseRideText).not.toHaveBeenCalled();
      });

      it('detects update mode when replying to a ride message', async () => {
        const ride = { id: 'abc123', createdBy: 42, title: 'Old Ride', date: new Date() };
        mockRideService.getRide.mockResolvedValue(ride);
        mockCtx = makeCtx('/airide', {
          reply_to_message: { text: 'Title\n🎫 #Ride #abc123' }
        });

        await handler.handle(mockCtx);

        expect(mockRideService.getRide).toHaveBeenCalledWith('abc123');
        expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.airide.dialogUpdatePrompt'));
        expect(handler.states.get('42:100')).toMatchObject({
          mode: 'update',
          rideId: 'abc123'
        });
      });

      it('uses reply ride id and processes free text when replying to a ride message', async () => {
        const ride = { id: 'abc123', createdBy: 42, title: 'Old Ride', date: new Date() };
        mockRideService.getRide.mockResolvedValue(ride);
        mockAiRideService.parseRideText.mockResolvedValue({
          params: { speed: '25-28' }, error: null
        });
        mockCtx = makeCtx('/airide change speed to 25-28', {
          reply_to_message: { text: 'Title\n🎫 #Ride #abc123' }
        });

        await handler.handle(mockCtx);

        expect(mockRideService.getRide).toHaveBeenCalledWith('abc123');
        expect(mockAiRideService.parseRideText).toHaveBeenCalledWith('', {
          dialogMessages: ['change speed to 25-28']
        });
      });

      it('replies with extraction error when reply does not contain a ride id', async () => {
        mockCtx = makeCtx('/airide', {
          reply_to_message: { text: 'Just some other message' }
        });

        await handler.handle(mockCtx);

        expect(mockCtx.reply).toHaveBeenCalledWith(
          tr('services.rideMessages.couldNotFindRideIdInMessage')
        );
        expect(mockRideService.getRide).not.toHaveBeenCalled();
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

    it('ignores command messages (starting with /)', async () => {
      handler.states.set('42:100', { mode: 'create', messageCount: 0, userMessages: [] });
      mockCtx.message = { text: '/newride', message_id: 5 };
      await handler.handleTextInput(mockCtx);
      expect(mockAiRideService.parseRideText).not.toHaveBeenCalled();
    });

    it('ignores messages when message limit is reached', async () => {
      handler.states.set('42:100', {
        mode: 'create', messageCount: 10, userMessages: [],
        lastParams: {}, previewMessageId: null, botMessageIds: []
      });
      mockCtx.message = { text: 'another message', message_id: 5 };
      await handler.handleTextInput(mockCtx);
      expect(mockAiRideService.parseRideText).not.toHaveBeenCalled();
    });

    it('processes message, calls AI with full dialog history, updates preview', async () => {
      handler.states.set('42:100', {
        mode: 'create', rideId: null, ride: null,
        userMessages: ['road ride tomorrow 9am'],
        messageCount: 1, lastParams: { title: 'Road Ride', when: 'tomorrow 9am' },
        previewMessageId: 50, botMessageIds: [50]
      });
      mockAiRideService.parseRideText.mockResolvedValue({
        params: { title: 'Road Ride', when: 'tomorrow 9am', speed: '25-28' },
        error: null
      });
      mockCtx.message = { text: 'speed 25-28', message_id: 6 };

      await handler.handleTextInput(mockCtx);

      expect(mockAiRideService.parseRideText).toHaveBeenCalledWith('', {
        dialogMessages: ['road ride tomorrow 9am', 'speed 25-28']
      });
      expect(mockCtx.api.editMessageText).toHaveBeenCalled();
      const state = handler.states.get('42:100');
      expect(state.messageCount).toBe(2);
      expect(state.lastParams).toMatchObject({ speed: '25-28' });
    });

    it('sends new preview message when no previewMessageId yet', async () => {
      handler.states.set('42:100', {
        mode: 'create', rideId: null, ride: null,
        userMessages: [], messageCount: 0, lastParams: null,
        previewMessageId: null, botMessageIds: []
      });
      mockAiRideService.parseRideText.mockResolvedValue({
        params: { title: 'Test', when: 'tomorrow' }, error: null
      });
      mockCtx.message = { text: 'Test ride tomorrow', message_id: 5 };

      await handler.handleTextInput(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalled();
      expect(mockCtx.api.editMessageText).not.toHaveBeenCalled();
      const state = handler.states.get('42:100');
      expect(state.previewMessageId).toBe(99);
      expect(state.botMessageIds).toContain(99);
    });

    it('appends limit-reached notice on 10th message', async () => {
      handler.states.set('42:100', {
        mode: 'create', rideId: null, ride: null,
        userMessages: Array(9).fill('msg'),
        messageCount: 9, lastParams: null,
        previewMessageId: null, botMessageIds: []
      });
      mockAiRideService.parseRideText.mockResolvedValue({
        params: { title: 'Ride', when: 'tomorrow' }, error: null
      });
      mockCtx.message = { text: 'final message', message_id: 10 };

      await handler.handleTextInput(mockCtx);

      const replyArg = mockCtx.reply.mock.calls[0][0];
      expect(replyArg).toContain(tr('commands.airide.dialogLimitReached'));
      expect(handler.states.get('42:100').messageCount).toBe(10);
    });

    it('clears state and replies parseError when AI returns error', async () => {
      handler.states.set('42:100', {
        mode: 'create', rideId: null, ride: null,
        userMessages: [], messageCount: 0, lastParams: null,
        previewMessageId: null, botMessageIds: []
      });
      mockAiRideService.parseRideText.mockResolvedValue({ params: null, error: 'service_unavailable' });
      mockCtx.message = { text: 'some text', message_id: 5 };

      await handler.handleTextInput(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.airide.parseError'));
      expect(handler.states.has('42:100')).toBe(false);
    });

    it('falls back to sending new message when editMessageText fails', async () => {
      handler.states.set('42:100', {
        mode: 'create', rideId: null, ride: null,
        userMessages: [], messageCount: 0, lastParams: null,
        previewMessageId: 50, botMessageIds: [50]
      });
      mockAiRideService.parseRideText.mockResolvedValue({
        params: { title: 'Ride', when: 'tomorrow' }, error: null
      });
      mockCtx.api.editMessageText.mockRejectedValue(new Error('Bad Gateway'));
      mockCtx.message = { text: 'test', message_id: 5 };

      await handler.handleTextInput(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalled();
      const state = handler.states.get('42:100');
      expect(state.previewMessageId).toBe(99); // updated to new message
    });

    describe('update mode — uses existing ride data for required-field check', () => {
      it('preview merges existing ride date when AI did not extract when', async () => {
        const existingDate = new Date('2026-04-12T09:00:00Z');
        const ride = {
          id: 'abc123', createdBy: 42, title: 'Morning Ride',
          date: existingDate, distance: 50, category: 'road'
        };
        handler.states.set('42:100', {
          mode: 'update', rideId: 'abc123', ride,
          userMessages: [], messageCount: 0, lastParams: null,
          previewMessageId: null, botMessageIds: []
        });
        mockAiRideService.parseRideText.mockResolvedValue({
          params: { speed: '25-28' }, error: null
        });
        mockCtx.message = { text: 'speed 25-28', message_id: 5 };

        await handler.handleTextInput(mockCtx);

        const previewArg = mockMessageFormatter.formatRidePreview.mock.calls[0][0];
        expect(previewArg.date).toBe(existingDate);
        expect(previewArg.title).toBe('Morning Ride');
        expect(previewArg.speedMin).toBe(25);
        expect(previewArg.speedMax).toBe(28);
      });

      it('preview uses AI when over existing ride date when AI extracted it', async () => {
        const existingDate = new Date('2026-04-12T09:00:00Z');
        const ride = { id: 'abc123', createdBy: 42, title: 'Morning Ride', date: existingDate };
        handler.states.set('42:100', {
          mode: 'update', rideId: 'abc123', ride,
          userMessages: [], messageCount: 0, lastParams: null,
          previewMessageId: null, botMessageIds: []
        });
        mockAiRideService.parseRideText.mockResolvedValue({
          params: { when: 'next Sunday 10am' }, error: null
        });
        mockCtx.message = { text: 'move to next Sunday 10am', message_id: 5 };

        await handler.handleTextInput(mockCtx);

        const previewArg = mockMessageFormatter.formatRidePreview.mock.calls[0][0];
        expect(previewArg.date).not.toBe(existingDate);
      });
    });
  });

  // ─── handleCallback() ────────────────────────────────────────────────────────

  describe('handleCallback()', () => {
    it('answers session expired when no state found', async () => {
      mockCtx.match = ['airide:confirm:42:100', 'confirm', '42:100'];
      await handler.handleCallback(mockCtx);
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith(tr('commands.airide.sessionExpired'));
    });

    it('cancel: deletes bot messages, clears state, replies cancelled', async () => {
      handler.states.set('42:100', {
        mode: 'create', rideId: null, ride: null,
        userMessages: [], messageCount: 1, lastParams: {},
        previewMessageId: 55, botMessageIds: [10, 55]
      });
      mockCtx.match = ['airide:cancel:42:100', 'cancel', '42:100'];

      await handler.handleCallback(mockCtx);

      expect(mockCtx.api.deleteMessage).toHaveBeenCalledWith(100, 55);
      expect(mockCtx.api.deleteMessage).toHaveBeenCalledWith(100, 10);
      expect(handler.states.has('42:100')).toBe(false);
      expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.airide.cancelled'));
    });

    it('confirm: shows toast error when title is missing', async () => {
      handler.states.set('42:100', {
        mode: 'create', rideId: null, ride: null,
        userMessages: ['some text'], messageCount: 1,
        lastParams: { when: 'tomorrow 9am' }, // no title
        previewMessageId: 55, botMessageIds: [55]
      });
      mockCtx.match = ['airide:confirm:42:100', 'confirm', '42:100'];

      await handler.handleCallback(mockCtx);

      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith(
        expect.stringContaining(tr('commands.airide.missingFieldsError', {
          fields: language === 'ru' ? 'название' : 'title'
        }))
      );
      // Dialog stays open
      expect(handler.states.has('42:100')).toBe(true);
    });

    it('confirm: shows toast error when date is missing', async () => {
      handler.states.set('42:100', {
        mode: 'create', rideId: null, ride: null,
        userMessages: ['road ride'], messageCount: 1,
        lastParams: { title: 'Road Ride' }, // no when
        previewMessageId: 55, botMessageIds: [55]
      });
      mockCtx.match = ['airide:confirm:42:100', 'confirm', '42:100'];

      await handler.handleCallback(mockCtx);

      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith(
        expect.stringContaining(language === 'ru' ? 'дата' : 'date')
      );
      expect(handler.states.has('42:100')).toBe(true);
    });

    it('confirm create: saves ride, cleans up dialog, calls createRideMessage', async () => {
      const mockRide = { id: 'new1', title: 'Road Ride' };
      mockRideService.createRideFromParams.mockResolvedValue({ ride: mockRide, error: null });
      handler.states.set('42:100', {
        mode: 'create', rideId: null, ride: null,
        userMessages: ['road ride tomorrow 9am'], messageCount: 1,
        lastParams: { title: 'Road Ride', when: 'tomorrow 9am' },
        previewMessageId: 55, botMessageIds: [99, 55]
      });
      mockCtx.match = ['airide:confirm:42:100', 'confirm', '42:100'];

      await handler.handleCallback(mockCtx);

      expect(mockRideService.createRideFromParams).toHaveBeenCalledWith(
        { title: 'Road Ride', when: 'tomorrow 9am' },
        100, mockCtx.from, { language }
      );
      expect(mockCtx.api.deleteMessage).toHaveBeenCalledWith(100, 55);
      expect(mockCtx.api.deleteMessage).toHaveBeenCalledWith(100, 99);
      expect(mockRideMessagesService.createRideMessage).toHaveBeenCalledWith(mockRide, mockCtx);
      expect(handler.states.has('42:100')).toBe(false);
    });

    it('confirm update: saves ride, cleans up dialog, updates messages', async () => {
      const existingRide = { id: 'abc123', createdBy: 42, title: 'Old Ride', date: new Date() };
      const mockUpdatedRide = { id: 'abc123', title: 'Old Ride' };
      mockRideService.updateRideFromParams.mockResolvedValue({ ride: mockUpdatedRide, error: null });
      // updateRideMessages is called internally via updateRideMessage on BaseCommandHandler
      handler.states.set('42:100', {
        mode: 'update', rideId: 'abc123', ride: existingRide,
        userMessages: ['speed 25'], messageCount: 1,
        lastParams: { speed: '25' },
        previewMessageId: 55, botMessageIds: [55]
      });
      mockCtx.match = ['airide:confirm:42:100', 'confirm', '42:100'];

      await handler.handleCallback(mockCtx);

      expect(mockRideService.updateRideFromParams).toHaveBeenCalledWith(
        'abc123', { speed: '25' }, 42, { language }
      );
      expect(mockCtx.api.deleteMessage).toHaveBeenCalledWith(100, 55);
      expect(handler.states.has('42:100')).toBe(false);
    });

    it('confirm: shows toast and replies error when createRideFromParams returns error', async () => {
      mockRideService.createRideFromParams.mockResolvedValue({ ride: null, error: 'Date is in the past' });
      handler.states.set('42:100', {
        mode: 'create', rideId: null, ride: null,
        userMessages: ['test'], messageCount: 1,
        lastParams: { title: 'Test', when: 'yesterday' },
        previewMessageId: 55, botMessageIds: [55]
      });
      mockCtx.match = ['airide:confirm:42:100', 'confirm', '42:100'];

      await handler.handleCallback(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith('Date is in the past');
      expect(handler.states.has('42:100')).toBe(false);
    });

    it('update mode: confirm uses existing ride date when params has no when', async () => {
      const existingDate = new Date('2026-04-12T09:00:00Z');
      const existingRide = { id: 'abc123', createdBy: 42, title: 'Old Ride', date: existingDate };
      mockRideService.updateRideFromParams.mockResolvedValue({ ride: { id: 'abc123' }, error: null });
      handler.states.set('42:100', {
        mode: 'update', rideId: 'abc123', ride: existingRide,
        userMessages: ['speed 25'], messageCount: 1,
        lastParams: { speed: '25' }, // no title, no when — but existing ride has both
        previewMessageId: 55, botMessageIds: [55]
      });
      mockCtx.match = ['airide:confirm:42:100', 'confirm', '42:100'];

      await handler.handleCallback(mockCtx);

      // Should NOT show missing-field toast — existing ride covers both
      expect(mockCtx.answerCallbackQuery).not.toHaveBeenCalledWith(
        expect.stringContaining(language === 'ru' ? 'дата' : 'date')
      );
      expect(mockRideService.updateRideFromParams).toHaveBeenCalled();
    });
  });

  // ─── route info enrichment in preview ───────────────────────────────────────

  describe('route info enrichment in preview', () => {
    let routeParserSpy;

    beforeEach(() => {
      routeParserSpy = jest.spyOn(RouteParser, 'processRouteInfo');
    });

    afterEach(() => {
      routeParserSpy.mockRestore();
    });

    const setupState = () => {
      handler.states.set('42:100', {
        mode: 'create', rideId: null, ride: null,
        userMessages: [], messageCount: 0, lastParams: null,
        previewMessageId: null, botMessageIds: [],
        routeInfoCache: {}
      });
    };

    it('populates distance and duration in preview from route URL when AI did not extract them', async () => {
      routeParserSpy.mockResolvedValue({ routeLink: 'https://strava.com/routes/1', distance: 75, duration: 150 });
      mockAiRideService.parseRideText.mockResolvedValue({
        params: { title: 'Ride', when: 'tomorrow', routes: ['https://strava.com/routes/1'] }, error: null
      });
      setupState();
      mockCtx.message = { text: 'Ride tomorrow https://strava.com/routes/1', message_id: 5 };

      await handler.handleTextInput(mockCtx);

      const preview = mockMessageFormatter.formatRidePreview.mock.calls[0][0];
      expect(preview.distance).toBe(75);
      expect(preview.duration).toBe(150); // 150m parsed to 150 minutes
    });

    it('does not overwrite dist/duration that AI already extracted', async () => {
      routeParserSpy.mockResolvedValue({ routeLink: 'https://strava.com/routes/1', distance: 75, duration: 150 });
      mockAiRideService.parseRideText.mockResolvedValue({
        params: { title: 'Ride', when: 'tomorrow', routes: ['https://strava.com/routes/1'], dist: '60', duration: '2h' },
        error: null
      });
      setupState();
      mockCtx.message = { text: 'Ride tomorrow 60km 2h', message_id: 5 };

      await handler.handleTextInput(mockCtx);

      const preview = mockMessageFormatter.formatRidePreview.mock.calls[0][0];
      expect(preview.distance).toBe(60);   // user-specified, not overwritten
      expect(preview.duration).toBe(120);  // 2h = 120 min, not overwritten
    });

    it('calls processRouteInfo only once even when the same route appears in multiple messages', async () => {
      routeParserSpy.mockResolvedValue({ routeLink: 'https://strava.com/routes/1', distance: 75, duration: 150 });
      mockAiRideService.parseRideText.mockResolvedValue({
        params: { title: 'Ride', when: 'tomorrow', routes: ['https://strava.com/routes/1'] }, error: null
      });
      handler.states.set('42:100', {
        mode: 'create', rideId: null, ride: null,
        userMessages: ['first msg'],
        messageCount: 1, lastParams: null,
        previewMessageId: 50, botMessageIds: [50],
        routeInfoCache: { 'https://strava.com/routes/1': { routeLink: 'https://strava.com/routes/1', distance: 75, duration: 150 } }
      });
      mockCtx.message = { text: 'second msg', message_id: 6 };

      await handler.handleTextInput(mockCtx);

      expect(routeParserSpy).not.toHaveBeenCalled(); // served from cache
    });

    it('still renders preview without crashing when processRouteInfo throws', async () => {
      routeParserSpy.mockRejectedValue(new Error('network error'));
      mockAiRideService.parseRideText.mockResolvedValue({
        params: { title: 'Ride', when: 'tomorrow', route: 'https://strava.com/routes/1' }, error: null
      });
      setupState();
      mockCtx.message = { text: 'Ride tomorrow', message_id: 5 };

      await expect(handler.handleTextInput(mockCtx)).resolves.not.toThrow();
      expect(mockMessageFormatter.formatRidePreview).toHaveBeenCalled();
    });

    it('still renders preview without crashing when processRouteInfo returns error', async () => {
      routeParserSpy.mockResolvedValue({ error: 'Invalid URL', routeLink: 'bad-url' });
      mockAiRideService.parseRideText.mockResolvedValue({
        params: { title: 'Ride', when: 'tomorrow', route: 'bad-url' }, error: null
      });
      setupState();
      mockCtx.message = { text: 'Ride tomorrow', message_id: 5 };

      await handler.handleTextInput(mockCtx);

      const preview = mockMessageFormatter.formatRidePreview.mock.calls[0][0];
      expect(preview.distance).toBeNull();
    });
  });

  // ─── preview building ─────────────────────────────────────────────────────────

  describe('preview speed parsing', () => {
    const setupAndProcess = async (params) => {
      mockAiRideService.parseRideText.mockResolvedValue({ params, error: null });
      mockCtx.message = { text: 'some text', message_id: 5 };
      handler.states.set('42:100', {
        mode: 'create', rideId: null, ride: null,
        userMessages: [], messageCount: 0, lastParams: null,
        previewMessageId: null, botMessageIds: []
      });
      await handler.handleTextInput(mockCtx);
      return mockMessageFormatter.formatRidePreview.mock.calls[0]?.[0];
    };

    it('parses speed range into speedMin/speedMax', async () => {
      const preview = await setupAndProcess({ title: 'Ride', when: 'tomorrow', speed: '25-28' });
      expect(preview.speedMin).toBe(25);
      expect(preview.speedMax).toBe(28);
      expect(preview.additionalInfo).toBeNull();
    });

    it('parses average speed (single number) into speedMin===speedMax', async () => {
      const preview = await setupAndProcess({ title: 'Ride', when: 'tomorrow', speed: '26' });
      expect(preview.speedMin).toBe(26);
      expect(preview.speedMax).toBe(26);
    });

    it('parses duration string into minutes', async () => {
      const preview = await setupAndProcess({ title: 'Ride', when: 'tomorrow', duration: '5h' });
      expect(preview.duration).toBe(300);
    });

    it('parses duration with hours and minutes', async () => {
      const preview = await setupAndProcess({ title: 'Ride', when: 'tomorrow', duration: '2h 30m' });
      expect(preview.duration).toBe(150);
    });

    it('puts info text in additionalInfo', async () => {
      const preview = await setupAndProcess({ title: 'Ride', when: 'tomorrow', info: 'Bring lights' });
      expect(preview.additionalInfo).toBe('Bring lights');
      expect(preview.speedMin).toBeNull();
    });

    it('uses existing ride duration when AI did not extract duration (update mode)', async () => {
      const existingDate = new Date('2026-04-12T09:00:00Z');
      const ride = { id: 'abc123', createdBy: 42, title: 'Ride', date: existingDate, duration: 180 };
      mockAiRideService.parseRideText.mockResolvedValue({ params: { dist: '60' }, error: null });
      mockCtx.message = { text: 'distance 60km', message_id: 5 };
      handler.states.set('42:100', {
        mode: 'update', rideId: 'abc123', ride,
        userMessages: [], messageCount: 0, lastParams: null,
        previewMessageId: null, botMessageIds: []
      });

      await handler.handleTextInput(mockCtx);

      const previewArg = mockMessageFormatter.formatRidePreview.mock.calls[0][0];
      expect(previewArg.duration).toBe(180);
    });
  });
});
