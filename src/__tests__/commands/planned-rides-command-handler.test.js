/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { PlannedRidesCommandHandler } from '../../commands/PlannedRidesCommandHandler.js';
import { DateParser } from '../../utils/date-parser.js';
import { t } from '../../i18n/index.js';

describe.each(['en', 'ru'])('PlannedRidesCommandHandler (%s)', (language) => {
  let handler;
  let rideService;
  let messageFormatter;
  let ctx;
  const boundary = new Date('2026-09-01T00:00:00.000Z');
  const tr = (key, params = {}) => t(language, key, params, { fallbackLanguage: 'en' });

  beforeEach(() => {
    jest.spyOn(DateParser, 'startOfDay').mockReturnValue(boundary);
    rideService = { getPlannedRides: jest.fn() };
    messageFormatter = {
      formatPlannedRidesList: jest.fn().mockReturnValue('Planned rides')
    };
    ctx = {
      from: { id: 123 },
      lang: language,
      match: ['planned:list:2', '2'],
      t: jest.fn((key, params = {}) => tr(key, params)),
      replyWithRichMessage: jest.fn().mockResolvedValue({}),
      editMessageText: jest.fn().mockResolvedValue({}),
      answerCallbackQuery: jest.fn().mockResolvedValue({}),
      deleteMessage: jest.fn().mockResolvedValue({})
    };
    handler = new PlannedRidesCommandHandler(rideService, messageFormatter);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows the first page with an explicit start-of-day boundary', async () => {
    rideService.getPlannedRides.mockResolvedValue({ rides: [{ id: 'a' }], total: 1 });

    await handler.handle(ctx);

    expect(rideService.getPlannedRides).toHaveBeenCalledWith(123, boundary, 0, 5);
    expect(messageFormatter.formatPlannedRidesList)
      .toHaveBeenCalledWith([{ id: 'a' }], 123, 1, 1, 1, language);
    expect(ctx.replyWithRichMessage).toHaveBeenCalled();
  });

  it('edits the requested page with planned-specific navigation callbacks', async () => {
    rideService.getPlannedRides.mockResolvedValue({ rides: [{ id: 'b' }], total: 12 });

    await handler.handleCallback(ctx);

    expect(rideService.getPlannedRides).toHaveBeenCalledWith(123, boundary, 5, 5);
    const keyboard = ctx.editMessageText.mock.calls[0][1].reply_markup.inline_keyboard;
    expect(keyboard.flat()).toEqual(expect.arrayContaining([
      expect.objectContaining({ callback_data: 'planned:list:1' }),
      expect.objectContaining({ callback_data: 'planned:list:3' }),
      expect.objectContaining({ callback_data: 'planned:list:close' })
    ]));
    expect(ctx.answerCallbackQuery).toHaveBeenCalled();
  });

  it('normalizes a stale page to the last available page', async () => {
    rideService.getPlannedRides
      .mockResolvedValueOnce({ rides: [], total: 6 })
      .mockResolvedValueOnce({ rides: [{ id: 'last' }], total: 6 });
    ctx.match = ['planned:list:3', '3'];

    await handler.handleCallback(ctx);

    expect(rideService.getPlannedRides).toHaveBeenNthCalledWith(2, 123, boundary, 5, 5);
    expect(messageFormatter.formatPlannedRidesList)
      .toHaveBeenCalledWith([{ id: 'last' }], 123, 2, 2, 6, language);
  });

  it('acknowledges and deletes the list message on close', async () => {
    await handler.handleClose(ctx);

    expect(ctx.answerCallbackQuery).toHaveBeenCalled();
    expect(ctx.deleteMessage).toHaveBeenCalled();
  });

  it('does not convert a storage failure into an empty list', async () => {
    rideService.getPlannedRides.mockRejectedValue(new Error('Database error'));

    await expect(handler.handle(ctx)).rejects.toThrow('Database error');

    expect(messageFormatter.formatPlannedRidesList).not.toHaveBeenCalled();
    expect(ctx.replyWithRichMessage).not.toHaveBeenCalled();
  });
});
