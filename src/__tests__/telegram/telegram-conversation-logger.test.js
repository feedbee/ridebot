/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { TelegramConversationLogger } from '../../telegram/TelegramConversationLogger.js';

function parseEvents(output) {
  return output.mock.calls.map(([line]) => JSON.parse(line));
}

function messageContext(overrides = {}) {
  const chat = overrides.chat || { id: -100200, type: 'supergroup', title: 'Cyclists' };
  const from = overrides.from || { id: 111, username: 'alice' };
  return {
    update: { update_id: overrides.updateId ?? 123 },
    message: {
      message_id: 987,
      message_thread_id: 42,
      text: overrides.text ?? 'hello\nworld',
      chat,
      from,
    },
    chat,
    from,
  };
}

describe('TelegramConversationLogger', () => {
  let output;
  let logger;

  beforeEach(() => {
    output = jest.fn();
    logger = new TelegramConversationLogger({
      enabled: true,
      output,
      now: () => new Date('2026-08-27T12:34:56.789Z'),
      createId: () => 'fixed-id',
    });
  });

  it('emits stable one-line JSON with nullable fields and exact text', async () => {
    const ctx = messageContext({
      chat: { id: 111, type: 'private', first_name: 'Alice' },
      text: ' secret\n<raw> ',
    });

    await logger.middleware(ctx, async () => {});

    expect(output).toHaveBeenCalledTimes(1);
    expect(output.mock.calls[0][0]).not.toContain('\n');
    expect(parseEvents(output)[0]).toEqual({
      event: 'telegram_conversation',
      timestamp: '2026-08-27T12:34:56.789Z',
      direction: 'incoming',
      operation: 'message',
      status: 'success',
      correlation_id: 'telegram-update:123',
      update_id: 123,
      ride_id: null,
      source_chat_id: 111,
      source_message_id: 987,
      source_message_thread_id: 42,
      sender_user_id: 111,
      recipient_user_id: null,
      username: 'alice',
      chat_id: 111,
      chat_type: 'private',
      chat_title: null,
      message_thread_id: 42,
      message_id: 987,
      callback_query_id: null,
      text: ' secret\n<raw> ',
    });
  });

  it('does not log ignored group text', async () => {
    await logger.middleware(messageContext(), async () => {});

    expect(output).not.toHaveBeenCalled();
  });

  it('does not log media or an unhandled callback', async () => {
    await logger.middleware({
      update: { update_id: 10 },
      message: { message_id: 1, photo: [{ file_id: 'secret-file' }] },
    }, async () => {});
    await logger.middleware({
      update: { update_id: 11 },
      callbackQuery: { id: 'ignored', data: 'unknown', from: { id: 1 } },
    }, async () => {});

    expect(output).not.toHaveBeenCalled();
  });

  it('logs reacting group text and correlates it with a direct API send', async () => {
    const transformer = logger.createApiTransformer();
    const ctx = messageContext();
    const sent = { message_id: 555, chat: ctx.chat };

    await logger.middleware(ctx, async () => {
      await transformer(
        jest.fn().mockResolvedValue(sent),
        'sendMessage',
        { chat_id: ctx.chat.id, text: 'response', message_thread_id: 42 }
      );
    });

    const events = parseEvents(output);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      direction: 'outgoing',
      operation: 'send_message',
      status: 'success',
      correlation_id: 'telegram-update:123',
      chat_id: -100200,
      chat_type: 'supergroup',
      chat_title: 'Cyclists',
      message_thread_id: 42,
      message_id: 555,
      text: 'response',
    });
    expect(events[1]).toMatchObject({
      direction: 'incoming',
      operation: 'message',
      correlation_id: 'telegram-update:123',
    });
  });

  it('logs handled callback data and pressing user even when handling throws', async () => {
    const ctx = {
      update: { update_id: 777 },
      from: { id: 333, username: 'bob' },
      chat: { id: -444, type: 'group', title: 'Roadies' },
      callbackQuery: {
        id: 'callback-id',
        data: 'join:ride42',
        from: { id: 333, username: 'bob' },
        message: {
          message_id: 88,
          message_thread_id: 9,
          chat: { id: -444, type: 'group', title: 'Roadies' },
        },
      },
    };

    await expect(logger.middleware(ctx, async () => {
      logger.markCallbackHandled();
      throw new Error('handler failed');
    })).rejects.toThrow('handler failed');

    expect(parseEvents(output)[0]).toMatchObject({
      direction: 'incoming',
      operation: 'callback_query',
      status: 'success',
      sender_user_id: 333,
      callback_query_id: 'callback-id',
      chat_id: -444,
      message_thread_id: 9,
      message_id: 88,
      text: 'join:ride42',
    });
  });

  it('correlates a topic callback answer with its source message', async () => {
    const ctx = {
      update: { update_id: 778 },
      from: { id: 333, username: 'bob' },
      chat: { id: -444, type: 'supergroup', title: 'Roadies' },
      callbackQuery: {
        id: 'callback-topic',
        data: 'skip:ride42',
        from: { id: 333, username: 'bob' },
        message: {
          message_id: 89,
          message_thread_id: 10,
          chat: { id: -444, type: 'supergroup', title: 'Roadies' },
        },
      },
    };

    await logger.middleware(ctx, async () => {
      logger.markCallbackHandled();
      await logger.createApiTransformer()(
        jest.fn().mockResolvedValue(true),
        'answerCallbackQuery',
        { callback_query_id: 'callback-topic', text: 'done' }
      );
    });

    const [outgoing, incoming] = parseEvents(output);
    expect(outgoing).toMatchObject({
      direction: 'outgoing',
      operation: 'answer_callback_query',
      correlation_id: 'telegram-update:778',
      chat_id: -444,
      chat_type: 'supergroup',
      message_thread_id: 10,
      message_id: 89,
      callback_query_id: 'callback-topic',
    });
    expect(incoming.correlation_id).toBe(outgoing.correlation_id);
  });

  it.each([
    ['sendMessage', { chat_id: 111, text: 'sent' }, 'send_message'],
    ['editMessageText', { chat_id: 111, message_id: 12, text: 'edited' }, 'edit_message_text'],
    ['deleteMessage', { chat_id: 111, message_id: 12 }, 'delete_message'],
    ['answerCallbackQuery', { callback_query_id: 'cb', text: 'answered' }, 'answer_callback_query'],
  ])('logs one final success event for %s and preserves its result', async (method, payload, operation) => {
    const result = { ok: true, message_id: 91, chat: { id: 111, type: 'private' } };
    const previous = jest.fn().mockResolvedValue(result);

    await expect(logger.createApiTransformer()(previous, method, payload)).resolves.toBe(result);

    expect(previous).toHaveBeenCalledWith(method, payload, undefined);
    expect(parseEvents(output)).toHaveLength(1);
    expect(parseEvents(output)[0]).toMatchObject({
      direction: 'outgoing',
      operation,
      status: 'success',
      correlation_id: 'background:fixed-id',
      update_id: null,
    });
  });

  it('logs a safe error event once and rethrows the same failure', async () => {
    const error = Object.assign(new Error('Telegram rejected it'), {
      name: 'GrammyError',
      error_code: 400,
      payload: { token: 'must-not-leak' },
    });
    const previous = jest.fn().mockRejectedValue(error);

    await expect(logger.createApiTransformer()(
      previous,
      'editMessageText',
      { chat_id: -1, message_id: 2, text: 'attempted' }
    )).rejects.toBe(error);

    const [event] = parseEvents(output);
    expect(event).toMatchObject({
      operation: 'edit_message_text',
      status: 'error',
      error_name: 'GrammyError',
      error_message: 'Telegram rejected it',
      error_code: 400,
      text: 'attempted',
    });
    expect(JSON.stringify(event)).not.toContain('must-not-leak');
  });

  it.each([
    ['sendMessage', { chat_id: 111, text: 'sent' }, 'send_message'],
    ['editMessageText', { chat_id: 111, message_id: 12, text: 'edited' }, 'edit_message_text'],
    ['deleteMessage', { chat_id: 111, message_id: 12 }, 'delete_message'],
    ['answerCallbackQuery', { callback_query_id: 'cb', text: 'answered' }, 'answer_callback_query'],
  ])('logs one final error event for %s and preserves the thrown value', async (method, payload, operation) => {
    const failure = Object.assign(new Error(`${method} failed`), { error_code: 403 });
    const previous = jest.fn().mockRejectedValue(failure);

    await expect(logger.createApiTransformer()(previous, method, payload)).rejects.toBe(failure);

    expect(parseEvents(output)).toHaveLength(1);
    expect(parseEvents(output)[0]).toMatchObject({
      operation,
      status: 'error',
      error_code: 403,
    });
  });

  it('does nothing when disabled', async () => {
    const disabled = new TelegramConversationLogger({ enabled: false, output });
    const previous = jest.fn().mockResolvedValue('unchanged');

    await disabled.middleware(messageContext(), async () => {});
    await expect(disabled.createApiTransformer()(previous, 'sendMessage', {
      chat_id: 1,
      text: 'hidden',
    })).resolves.toBe('unchanged');

    expect(output).not.toHaveBeenCalled();
  });

  it('propagates a command ride ID to replies and records the source separately', async () => {
    const ctx = messageContext({ text: '/updateride@ridebot #ride42' });
    await logger.middleware(ctx, async () => {
      await logger.createApiTransformer()(async () => ({ ok: true, result: {
        message_id: 1234, chat: { id: 111, type: 'private' }
      } }), 'sendMessage', { chat_id: 111, text: 'Done' });
    });
    const [outgoing, incoming] = parseEvents(output);
    expect(outgoing).toMatchObject({ ride_id: 'ride42', source_chat_id: -100200, source_message_id: 987,
      chat_id: 111, message_id: 1234, api_method: 'sendMessage', duration_ms: expect.any(Number) });
    expect(outgoing.message_thread_id).toBeNull();
    expect(incoming.ride_id).toBe('ride42');
  });

  it.each(['join:ride42', 'pacegroup:ride42:A', 'startpoint:ride42:S2', 'application:accept:ride42:111',
    'settings:ride:bool:approval:on:ride42', 'rideowner:update:ride42', 'u:c:ride42:a'])('resolves ride IDs in %s', async data => {
    const ctx = { update: { update_id: 1 }, callbackQuery: { id: 'cb', data, from: { id: 111 } } };
    await logger.middleware(ctx, async () => { logger.markCallbackHandled(); });
    expect(parseEvents(output)[0].ride_id).toBe('ride42');
  });

  it('uses each announcement ride rather than assigning one ride to a multi-ride list', async () => {
    const ctx = messageContext({ text: '/listrides' });
    await logger.middleware(ctx, async () => {
      const transform = logger.createApiTransformer();
      for (const id of ['ride1', 'ride2']) {
        await transform(async () => ({}), 'sendRichMessage', { rich_message: { html: `<p>🎫 #Ride #${id}</p>` } });
      }
    });
    expect(parseEvents(output).slice(0, 2).map(event => event.ride_id)).toEqual(['ride1', 'ride2']);
  });

  it('recognizes Telegram ok:false responses and records retry hints without changing the result', async () => {
    const failure = { ok: false, error_code: 429, description: 'Too Many Requests', parameters: { retry_after: 5 } };
    await expect(logger.createApiTransformer()(async () => failure, 'editMessageText', {
      chat_id: -1, message_id: 2, text: '🎫 #Ride #ride42'
    })).resolves.toBe(failure);
    expect(parseEvents(output)[0]).toMatchObject({ status: 'error', ride_id: 'ride42', error_code: 429,
      error_message: 'Too Many Requests', retry_after: 5, api_method: 'editMessageText', duration_ms: expect.any(Number) });
  });

  it('resolves a ride from the replied announcement keyboard', async () => {
    const ctx = messageContext({ text: '/settings', chat: { id: 111, type: 'private' } });
    ctx.message.reply_to_message = { reply_markup: { inline_keyboard: [[{ callback_data: 'join:ride42' }]] } };
    await logger.middleware(ctx, async () => {});
    expect(parseEvents(output)[0].ride_id).toBe('ride42');
  });

  it('does not invent ride IDs for unrelated callbacks or a list of several rides', async () => {
    const transform = logger.createApiTransformer();
    await transform(async () => ({}), 'sendMessage', { text: '🎫 #Ride #ride1\n🎫 #Ride #ride2' });
    await logger.middleware({ callbackQuery: { id: 'cb', data: 'wizard:category:road', from: { id: 111 } } }, async () => {
      logger.markCallbackHandled();
    });
    expect(parseEvents(output).map(event => event.ride_id)).toEqual([null, null]);
  });

  it('keeps ride IDs isolated across simultaneous updates', async () => {
    const transform = logger.createApiTransformer();
    await Promise.all(['ride1', 'ride2'].map(id => logger.middleware(messageContext({ text: `/updateride ${id}` }), async () => {
      await Promise.resolve();
      await transform(async () => ({}), 'sendMessage', { text: 'Done' });
    })));
    expect(parseEvents(output).filter(event => event.direction === 'outgoing').map(event => event.ride_id).sort()).toEqual(['ride1', 'ride2']);
  });

  it.each([
    ['/updateride\nid: ride42', 'ride42'],
    ['/updateride\nride42', null],
    ['/settings\nID: #ride42', 'ride42'],
    ['/airide #ride42 Change start time', 'ride42'],
    ['/airide Morning ride', null]
  ])('matches command ride parsing for %s', async (text, rideId) => {
    await logger.middleware(messageContext({ text, chat: { id: 111, type: 'private' } }), async () => {});
    expect(parseEvents(output)[0].ride_id).toBe(rideId);
  });

  it('does not infer the destination topic for another message in the same chat', async () => {
    const ctx = messageContext();
    await logger.middleware(ctx, async () => {
      await logger.createApiTransformer()(async () => true, 'deleteMessage', { chat_id: ctx.chat.id, message_id: 999 });
    });
    expect(parseEvents(output)[0]).toMatchObject({ message_id: 999, message_thread_id: null, source_message_thread_id: 42 });
  });

  it('never lets malformed rich diagnostics interfere with transport success or failure', async () => {
    const transform = logger.createApiTransformer();
    const payload = { rich_message: { blocks: [{ type: 'list', items: [{}] }] } };
    const result = { ok: true, result: { message_id: 3 } };
    const previous = jest.fn().mockResolvedValue(result);
    await expect(transform(previous, 'sendRichMessage', payload)).resolves.toBe(result);
    expect(previous).toHaveBeenCalledTimes(1);
    const error = new Error('Original transport error');
    await expect(transform(async () => { throw error; }, 'editMessageText', payload)).rejects.toBe(error);
    expect(parseEvents(output).map(event => event.status)).toEqual(['success', 'error']);
  });

  it.each(['sendRichMessage', 'editMessageText'])('logs readable Rich HTML for %s', async method => {
    await logger.createApiTransformer()(async () => ({}), method, {
      chat_id: 111,
      rich_message: { html: '<h3>Ride &amp; friends</h3><p>Meet<br>At park</p><ul><li>Bring lights</li><li>Water</li></ul><table><tr><td>Speed</td><td>25</td></tr></table><p><a href="https://example.com/route">Route</a></p>' }
    });
    const [event] = parseEvents(output);
    expect(event.text).toBe('Ride & friends\nMeet\nAt park\n- Bring lights\n- Water\nSpeed | 25\nRoute (https://example.com/route)');
    expect(event.operation).toBe(method === 'sendRichMessage' ? 'send_message' : 'edit_message_text');
  });

  it('logs nested Rich blocks without exposing media IDs or callback payloads', async () => {
    const ctx = messageContext({ chat: { id: 111, type: 'private' } });
    delete ctx.message.text;
    ctx.message.rich_message = { blocks: [
      { type: 'section_heading', text: { type: 'bold', text: 'Morning Ride' } },
      { type: 'list', items: [{ label: '1.', blocks: [{ type: 'paragraph', text: ['Meet ', { type: 'italic', text: 'at park' }] }] }] },
      { type: 'table', cells: [[{ text: 'Speed' }, { text: '25' }]] },
      { type: 'details', summary: 'Details', blocks: [{ type: 'paragraph', text: 'Bring lights' }] },
      { type: 'photo', photo: [{ file_id: 'hidden-file' }], caption: { text: 'The start', credit: 'Alice' } },
      { type: 'paragraph', text: { type: 'custom_emoji', alternative_text: '🚲', custom_emoji_id: 'hidden-id' } }
    ] };
    await logger.middleware(ctx, async () => {});
    expect(parseEvents(output)[0].text).toBe('Morning Ride\n1. Meet at park\nSpeed | 25\nDetails\nBring lights\nThe start\nAlice\n🚲');
    expect(output.mock.calls[0][0]).not.toContain('hidden-');
  });

  it('keeps existing plain text when rich content is also present', async () => {
    await logger.createApiTransformer()(async () => ({}), 'editMessageText', {
      chat_id: 111, text: 'Exact <text>\n', rich_message: { html: '<b>Other</b>' }
    });
    expect(parseEvents(output)[0].text).toBe('Exact <text>\n');
  });

  it('logs readable Markdown and media-only rich messages', async () => {
    const transform = logger.createApiTransformer();
    await transform(async () => ({}), 'sendRichMessage', { rich_message: { markdown: '# Ride\n**Bring lights**\n[Route](https://example.com)' } });
    await transform(async () => ({}), 'sendRichMessage', { rich_message: { html: '<img src="tg://photo?id=secret"/>' } });
    expect(parseEvents(output).map(event => event.text)).toEqual(['Ride\nBring lights\nRoute (https://example.com)', '[image]']);
    expect(output.mock.calls[1][0]).not.toContain('secret');
  });
});
