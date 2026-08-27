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
});
