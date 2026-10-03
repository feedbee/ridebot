/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { UnshareRideCommandHandler } from '../../commands/UnshareRideCommandHandler.js';
import { t } from '../../i18n/index.js';

describe.each(['en', 'ru'])('UnshareRideCommandHandler (%s)', language => {
  const tr = (key, params = {}) => t(language, key, params, { fallbackLanguage: 'en' });
  let handler;
  let rideService;
  let rideMessagesService;
  let ctx;

  beforeEach(() => {
    rideService = {
      getRide: jest.fn().mockResolvedValue({
        id: 'ride1',
        createdBy: 1,
        settings: { allowReposts: true },
        messages: [
          { chatId: 1, messageId: 10, isForCreator: true },
          { chatId: -100, messageId: 20, messageThreadId: 7, publishedBy: 2 },
          { chatId: -100, messageId: 21, messageThreadId: 7, publishedBy: 3 },
          { chatId: -100, messageId: 22, messageThreadId: 8, publishedBy: 2 },
          { chatId: -200, messageId: 30, publishedBy: 2 }
        ]
      })
    };
    rideMessagesService = {
      extractRideId: jest.fn().mockReturnValue({ rideId: 'ride1', error: null }),
      unshareRideMessages: jest.fn().mockResolvedValue({ deletedCount: 1, unavailableCount: 0, failedCount: 0 })
    };
    handler = new UnshareRideCommandHandler(rideService, {}, rideMessagesService);
    ctx = {
      chat: { id: -100, type: 'supergroup' },
      from: { id: 2 },
      message: { text: '/unshareride ride1', message_thread_id: 7 },
      api: { sendMessage: jest.fn().mockResolvedValue({}) },
      reply: jest.fn().mockResolvedValue({}),
      t: jest.fn((key, params = {}) => tr(key, params)),
      lang: language
    };
  });

  it('formats the missing-ID command example as code', async () => {
    const error = tr('services.rideMessages.provideRideIdAfterCommand', { commandName: 'unshareride' });
    rideMessagesService.extractRideId.mockReturnValue({ rideId: null, error });
    ctx.message.text = '/unshareride';
    await handler.handle(ctx);
    expect(ctx.reply).toHaveBeenCalledWith(error, { parse_mode: 'HTML' });
    expect(error).toContain('<code>/unshareride rideID</code>');
  });

  it('asks privately to remove only the publisher messages in the current topic', async () => {
    await handler.handle(ctx);

    expect(ctx.api.sendMessage).toHaveBeenCalledWith(
      2,
      expect.stringContaining('1'),
      expect.objectContaining({ reply_markup: expect.any(Object) })
    );
    const callback = ctx.api.sendMessage.mock.calls[0][2].reply_markup.inline_keyboard[0][0].callback_data;
    expect(callback).toBe('u:c:ride1:s:-100:7');
  });

  it('keeps confirmation callback data within the Telegram 64-byte limit', async () => {
    const rideId = '507f1f77bcf86cd799439011';
    rideMessagesService.extractRideId.mockReturnValue({ rideId, error: null });
    rideService.getRide.mockResolvedValue({
      id: rideId,
      createdBy: 2,
      messages: [{
        chatId: -1001234567890,
        messageId: 2147483647,
        messageThreadId: 2147483647,
        publishedBy: 2
      }]
    });
    ctx.chat.id = -1001234567890;
    ctx.message.message_thread_id = 2147483647;

    await handler.handle(ctx);

    const callback = ctx.api.sendMessage.mock.calls[0][2].reply_markup.inline_keyboard[0][0].callback_data;
    expect(Buffer.byteLength(callback)).toBeLessThanOrEqual(64);
  });

  it('asks the creator to remove every announcement in the current topic', async () => {
    ctx.from.id = 1;

    await handler.handle(ctx);

    expect(ctx.api.sendMessage.mock.calls[0][1]).toContain('2');
  });

  it('selects only the caller publications across chats for an ID used in private', async () => {
    ctx.chat = { id: 2, type: 'private' };
    ctx.message = { text: '/unshareride ride1' };

    await handler.handle(ctx);

    expect(ctx.reply.mock.calls[0][0]).toContain('3');
    const callback = ctx.reply.mock.calls[0][1].reply_markup.inline_keyboard[0][0].callback_data;
    expect(callback).toBe('u:c:ride1:a');
  });

  it('does not let a republisher remove announcements when reposts are disabled', async () => {
    rideService.getRide.mockResolvedValue({
      id: 'ride1',
      createdBy: 1,
      settings: { allowReposts: false },
      messages: [{ chatId: -100, messageId: 20, messageThreadId: 7, publishedBy: 2 }]
    });

    await handler.handle(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(tr('commands.unshare.nothingToDelete'));
    expect(ctx.api.sendMessage).not.toHaveBeenCalled();
  });

  it('keeps a legacy private creator message out of global removal', async () => {
    const ride = {
      id: 'ride1',
      createdBy: 1,
      settings: { allowReposts: true },
      messages: [
        { chatId: 1, messageId: 10 },
        { chatId: -100, messageId: 20, publishedBy: 2 }
      ]
    };

    expect(handler.selectTargets(ride, 1, { mode: 'a' })).toEqual([ride.messages[1]]);
  });

  it('keeps every private-chat message out of removal', () => {
    const ride = {
      id: 'ride1',
      createdBy: 1,
      settings: { allowReposts: true },
      messages: [
        { chatId: 2, messageId: 10, isForCreator: false, publishedBy: 2 },
        { chatId: -100, messageId: 20, publishedBy: 2 }
      ]
    };

    expect(handler.selectTargets(ride, 1, { mode: 'a' })).toEqual([ride.messages[1]]);
  });

  it('uses the forwarded source to target one announcement', async () => {
    ctx.chat = { id: 2, type: 'private' };
    ctx.message = {
      text: '/unshareride',
      reply_to_message: {
        message_id: 99,
        text: '🎫 #Ride #ride1',
        forward_origin: { type: 'channel', chat: { id: -100 }, message_id: 20 }
      }
    };

    await handler.handle(ctx);

    const callback = ctx.reply.mock.calls[0][1].reply_markup.inline_keyboard[0][0].callback_data;
    expect(callback).toBe('u:c:ride1:m:-100:20');
  });

  it('rejects a forwarded announcement whose source chat is hidden', async () => {
    ctx.chat = { id: 2, type: 'private' };
    ctx.message = {
      text: '/unshareride',
      reply_to_message: {
        message_id: 99,
        text: '🎫 #Ride #ride1',
        forward_origin: { type: 'hidden_user' }
      }
    };

    await handler.handle(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(tr('commands.unshare.unrecognizedAnnouncement'));
  });

  it('rechecks scope on confirm, deletes matches, cleans confirmation, and reports partial success', async () => {
    ctx.match = ['u:c:ride1:s:-100:7', 'c', 'ride1', 's', '-100', '7'];
    ctx.callbackQuery = { message: { chat: { id: 2 }, message_id: 50 } };
    ctx.chat = { id: 2, type: 'private' };
    ctx.deleteMessage = jest.fn().mockResolvedValue({});
    ctx.answerCallbackQuery = jest.fn().mockResolvedValue({});
    rideMessagesService.unshareRideMessages.mockResolvedValue({
      deletedCount: 0,
      unavailableCount: 1,
      failedCount: 1
    });

    await handler.handleConfirmation(ctx);

    expect(rideMessagesService.unshareRideMessages).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ride1' }),
      ctx.api,
      [expect.objectContaining({ chatId: -100, messageId: 20 })]
    );
    expect(ctx.deleteMessage).toHaveBeenCalled();
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(
      tr('commands.unshare.partial', { removed: 1, failed: 1 })
    );
  });
});
