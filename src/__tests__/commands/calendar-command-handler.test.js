/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { t } from '../../i18n/index.js';

class MockInlineKeyboard {
  constructor() {
    this.inline_keyboard = [[]];
  }

  url(text, url) {
    this.inline_keyboard.at(-1).push({ text, url });
    return this;
  }

  text(text, callbackData) {
    this.inline_keyboard.at(-1).push({ text, callback_data: callbackData });
    return this;
  }

  row() {
    this.inline_keyboard.push([]);
    return this;
  }
}

class MockInputFile {
  constructor(data, filename) {
    this.data = data;
    this.filename = filename;
  }
}

jest.unstable_mockModule('grammy', () => ({
  InlineKeyboard: MockInlineKeyboard,
  InputFile: MockInputFile
}));

const { CalendarCommandHandler } = await import('../../commands/CalendarCommandHandler.js');

describe.each(['en', 'ru'])('CalendarCommandHandler (%s)', (language) => {
  const tr = (key, params = {}) => t(language, key, params, { fallbackLanguage: 'en' });
  const ride = {
    id: 'abc123',
    title: 'Morning Ride',
    date: new Date('2099-08-30T08:00:00.000Z'),
    duration: 120
  };

  let handler;
  let rideService;
  let calendarEventService;
  let ctx;

  beforeEach(() => {
    rideService = { getRide: jest.fn().mockResolvedValue(ride) };
    calendarEventService = {
      createExport: jest.fn().mockReturnValue({
        status: 'ok',
        googleUrl: 'https://calendar.google.com/test',
        outlookUrl: 'https://outlook.live.com/test',
        ics: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n',
        filename: 'ride-abc123.ics',
        mimeType: 'text/calendar; charset=utf-8'
      })
    };
    ctx = {
      lang: language,
      t: jest.fn((key, params = {}) => tr(key, params)),
      from: { id: 42 },
      chat: { id: -100, type: 'supergroup' },
      match: [null, 'abc123'],
      api: {
        sendMessage: jest.fn().mockResolvedValue({}),
        sendDocument: jest.fn().mockResolvedValue({}),
        getMe: jest.fn().mockResolvedValue({ username: 'ridebot' })
      },
      reply: jest.fn().mockResolvedValue({}),
      answerCallbackQuery: jest.fn().mockResolvedValue({})
    };
    handler = new CalendarCommandHandler(rideService, calendarEventService);
  });

  it('sends the provider menu only to the callback sender', async () => {
    await handler.handleMenuCallback(ctx);

    expect(ctx.api.sendMessage).toHaveBeenCalledWith(
      42,
      tr('commands.calendar.menuPrompt', { title: ride.title }),
      expect.objectContaining({ reply_markup: expect.any(MockInlineKeyboard) })
    );
    const keyboard = ctx.api.sendMessage.mock.calls[0][2].reply_markup.inline_keyboard.flat();
    expect(keyboard).toEqual(expect.arrayContaining([
      expect.objectContaining({ url: 'https://calendar.google.com/test' }),
      expect.objectContaining({ url: 'https://outlook.live.com/test' }),
      expect.objectContaining({ callback_data: 'calendar:ics:abc123' })
    ]));
    const rows = ctx.api.sendMessage.mock.calls[0][2].reply_markup.inline_keyboard;
    expect(rows[0]).toHaveLength(3);
    expect(rows[1]).toEqual([
      expect.objectContaining({ callback_data: 'calendar:close' })
    ]);
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(tr('commands.calendar.sentPrivately'));
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it('redirects through a private deep link when Telegram rejects the DM with 403', async () => {
    ctx.api.sendMessage.mockRejectedValue(Object.assign(new Error('Forbidden'), { error_code: 403 }));

    await handler.handleMenuCallback(ctx);

    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith({
      text: tr('commands.calendar.openPrivateChat'),
      url: 'https://t.me/ridebot?start=calendar_abc123'
    });
  });

  it('rethrows non-403 private delivery errors for the generic callback wrapper', async () => {
    const failure = Object.assign(new Error('Bad gateway'), { error_code: 502 });
    ctx.api.sendMessage.mockRejectedValue(failure);

    await expect(handler.handleMenuCallback(ctx)).rejects.toBe(failure);
  });

  it('sends the iCalendar document to the callback sender, never the source group', async () => {
    await handler.handleIcsCallback(ctx);

    expect(ctx.api.sendDocument).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ filename: 'ride-abc123.ics' }),
      expect.objectContaining({
        caption: tr('commands.calendar.fileCaption', { title: ride.title })
      })
    );
    const inputFile = ctx.api.sendDocument.mock.calls[0][1];
    expect(inputFile.data.toString()).toBe('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n');
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(tr('commands.calendar.fileSent'));
  });

  it('closes only a private calendar menu', async () => {
    ctx.chat = { id: 42, type: 'private' };
    ctx.deleteMessage = jest.fn().mockResolvedValue({});

    await handler.handleCloseCallback(ctx);

    expect(ctx.deleteMessage).toHaveBeenCalledTimes(1);
    expect(ctx.answerCallbackQuery).toHaveBeenCalled();
  });

  it('does not delete a message for a forged group close callback', async () => {
    ctx.deleteMessage = jest.fn().mockResolvedValue({});

    await handler.handleCloseCallback(ctx);

    expect(ctx.deleteMessage).not.toHaveBeenCalled();
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith({
      text: tr('commands.calendar.privateOnly'),
      show_alert: true
    });
  });

  it.each([
    ['invalid_ride', 'commands.calendar.invalidRide'],
    ['cancelled', 'commands.calendar.cancelled'],
    ['missing_duration', 'commands.calendar.missingDuration'],
    ['past', 'commands.calendar.past']
  ])('answers safely when export status is %s', async (status, messageKey) => {
    calendarEventService.createExport.mockReturnValue({ status });

    await handler.handleMenuCallback(ctx);

    expect(ctx.api.sendMessage).not.toHaveBeenCalled();
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith({
      text: tr(messageKey),
      show_alert: true
    });
  });

  it('answers safely when the ride no longer exists', async () => {
    rideService.getRide.mockResolvedValue(null);

    await handler.handleMenuCallback(ctx);

    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith({
      text: tr('commands.calendar.rideNotFound'),
      show_alert: true
    });
  });

  it('sends the provider menu from a validated private start payload', async () => {
    ctx.chat = { id: 42, type: 'private' };

    const handled = await handler.handleStartPayload(ctx, 'calendar_abc123');

    expect(handled).toBe(true);
    expect(ctx.reply).toHaveBeenCalledWith(
      tr('commands.calendar.menuPrompt', { title: ride.title }),
      expect.objectContaining({ reply_markup: expect.any(MockInlineKeyboard) })
    );
  });

  it('ignores unrelated and malformed start payloads', async () => {
    expect(await handler.handleStartPayload(ctx, 'other')).toBe(false);
    expect(await handler.handleStartPayload(ctx, 'calendar_../bad')).toBe(false);
    expect(rideService.getRide).not.toHaveBeenCalled();
  });
});
