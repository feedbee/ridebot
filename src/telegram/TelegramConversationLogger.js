import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

const OPERATIONS = {
  sendMessage: 'send_message',
  editMessageText: 'edit_message_text',
  deleteMessage: 'delete_message',
  answerCallbackQuery: 'answer_callback_query',
};

/**
 * Emits opt-in structured records for Telegram conversation operations.
 */
export class TelegramConversationLogger {
  /**
   * @param {Object} options
   * @param {boolean} options.enabled
   * @param {(line: string) => void} [options.output]
   * @param {() => Date} [options.now]
   * @param {() => string} [options.createId]
   */
  constructor({
    enabled,
    output = console.log,
    now = () => new Date(),
    createId = randomUUID,
  }) {
    this.enabled = enabled;
    this.output = output;
    this.now = now;
    this.createId = createId;
    this.updateContext = new AsyncLocalStorage();
  }

  /**
   * Run Telegram update handling within a correlation context.
   * @param {import('grammy').Context} ctx
   * @param {Function} next
   * @returns {Promise<unknown>}
   */
  middleware = async (ctx, next) => {
    if (!this.enabled) {
      return next();
    }

    const incoming = this.#extractIncoming(ctx);
    if (!incoming) {
      return next();
    }

    const updateId = ctx.update?.update_id ?? null;
    const state = {
      correlationId: updateId === null ? `background:${this.createId()}` : `telegram-update:${updateId}`,
      updateId,
      senderUserId: incoming.senderUserId,
      username: incoming.username,
      sourceChat: incoming.chat,
      sourceMessageThreadId: incoming.messageThreadId,
      sourceMessageId: incoming.messageId,
      callbackQueryId: incoming.callbackQueryId,
      outgoingAttempted: false,
      callbackHandled: false,
    };

    return this.updateContext.run(state, async () => {
      try {
        return await next();
      } finally {
        const shouldLog = incoming.operation === 'callback_query'
          ? state.callbackHandled
          : incoming.chat.type === 'private' || state.outgoingAttempted;

        if (shouldLog) {
          this.#emit(this.#event({
            direction: 'incoming',
            operation: incoming.operation,
            status: 'success',
            context: state,
            chat: incoming.chat,
            messageThreadId: incoming.messageThreadId,
            messageId: incoming.messageId,
            callbackQueryId: incoming.callbackQueryId,
            text: incoming.text,
          }));
        }
      }
    });
  };

  /** Mark the current callback query as handled by a registered handler. */
  markCallbackHandled() {
    const context = this.updateContext.getStore();
    if (context) {
      context.callbackHandled = true;
    }
  }

  /**
   * Create a grammY API transformer that observes conversation operations.
   * @returns {Function}
   */
  createApiTransformer() {
    return async (previous, method, payload, signal) => {
      const operation = OPERATIONS[method];
      if (!this.enabled || !operation) {
        return previous(method, payload, signal);
      }

      const existingContext = this.updateContext.getStore();
      const context = existingContext || {
        correlationId: `background:${this.createId()}`,
        updateId: null,
        senderUserId: null,
        username: null,
        sourceChat: null,
        sourceMessageThreadId: null,
        sourceMessageId: null,
        callbackQueryId: null,
      };
      if (existingContext) {
        existingContext.outgoingAttempted = true;
      }

      try {
        const result = await previous(method, payload, signal);
        this.#emitOutgoing({ operation, status: 'success', payload, result, context });
        return result;
      } catch (error) {
        this.#emitOutgoing({ operation, status: 'error', payload, context, error });
        throw error;
      }
    };
  }

  #emitOutgoing({ operation, status, payload, result, context, error }) {
    const resultChat = result && typeof result === 'object' ? result.chat : null;
    const payloadChatId = payload?.chat_id ?? null;
    const sourceChat = context.sourceChat;
    const inferredChatType = typeof payloadChatId === 'number' && payloadChatId > 0 ? 'private' : null;
    const chat = resultChat || (sourceChat?.id === payloadChatId ? sourceChat : {
      id: payloadChatId,
      type: inferredChatType,
      title: null,
    });
    const isCallbackAnswer = operation === 'answer_callback_query';
    const effectiveChat = isCallbackAnswer ? sourceChat : chat;
    const returnedMessageId = result && typeof result === 'object' && result.message_id !== undefined
      ? result.message_id
      : payload?.message_id ?? null;
    const messageId = isCallbackAnswer ? context.sourceMessageId : returnedMessageId;
    const event = this.#event({
      direction: 'outgoing',
      operation,
      status,
      context,
      chat: effectiveChat,
      messageThreadId: payload?.message_thread_id ?? context.sourceMessageThreadId ?? null,
      messageId,
      callbackQueryId: payload?.callback_query_id ?? context.callbackQueryId ?? null,
      text: operation === 'delete_message' ? null : payload?.text ?? null,
    });

    if (error) {
      event.error_name = typeof error.name === 'string' ? error.name : null;
      event.error_message = typeof error.message === 'string'
        ? error.message
        : typeof error.description === 'string' ? error.description : null;
      event.error_code = error.error_code ?? null;
    }

    this.#emit(event);
  }

  #event({
    direction,
    operation,
    status,
    context,
    chat,
    messageThreadId,
    messageId,
    callbackQueryId,
    text,
  }) {
    const chatType = chat?.type ?? null;
    return {
      event: 'telegram_conversation',
      timestamp: this.now().toISOString(),
      direction,
      operation,
      status,
      correlation_id: context.correlationId,
      update_id: context.updateId,
      sender_user_id: context.senderUserId,
      recipient_user_id: direction === 'outgoing' && chatType === 'private' ? chat?.id ?? null : null,
      username: context.username,
      chat_id: chat?.id ?? null,
      chat_type: chatType,
      chat_title: chat?.title ?? null,
      message_thread_id: messageThreadId ?? null,
      message_id: messageId ?? null,
      callback_query_id: callbackQueryId ?? null,
      text: text ?? null,
    };
  }

  #extractIncoming(ctx) {
    if (typeof ctx.message?.text === 'string') {
      return {
        operation: 'message',
        senderUserId: ctx.message.from?.id ?? ctx.from?.id ?? null,
        username: ctx.message.from?.username ?? ctx.from?.username ?? null,
        chat: ctx.message.chat || ctx.chat,
        messageThreadId: ctx.message.message_thread_id ?? null,
        messageId: ctx.message.message_id ?? null,
        callbackQueryId: null,
        text: ctx.message.text,
      };
    }

    if (ctx.callbackQuery && typeof ctx.callbackQuery.data === 'string') {
      const message = ctx.callbackQuery.message;
      return {
        operation: 'callback_query',
        senderUserId: ctx.callbackQuery.from?.id ?? ctx.from?.id ?? null,
        username: ctx.callbackQuery.from?.username ?? ctx.from?.username ?? null,
        chat: message?.chat || ctx.chat || { id: null, type: null, title: null },
        messageThreadId: message?.message_thread_id ?? null,
        messageId: message?.message_id ?? null,
        callbackQueryId: ctx.callbackQuery.id ?? null,
        text: ctx.callbackQuery.data,
      };
    }

    return null;
  }

  #emit(event) {
    try {
      this.output(JSON.stringify(event));
    } catch {
      // Diagnostic logging must never alter Telegram behavior.
    }
  }
}
