import { jest } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import { installStructuredLogging } from '../../utils/structured-logging.js';

describe('structured application logging', () => {
  let output;
  let target;

  beforeEach(() => {
    output = { stdout: jest.fn(), stderr: jest.fn() };
    target = Object.fromEntries(['log', 'info', 'warn', 'error', 'debug', 'trace', 'dir'].map(method => [method, jest.fn()]));
    installStructuredLogging({ target, ...output });
  });

  it.each([['log', 'info'], ['info', 'info'], ['warn', 'warn'], ['error', 'error'], ['debug', 'debug'], ['trace', 'trace']])('maps %s to %s in a single JSON line', (method, level) => {
    target[method]('First line\nSecond line');
    const stream = ['warn', 'error'].includes(level) ? output.stderr : output.stdout;
    const line = stream.mock.calls[0][0];
    expect(line.split('\n')).toHaveLength(2);
    expect(JSON.parse(line)).toEqual({ level, time: expect.any(String), service: 'ridebot', msg: 'First line\nSecond line' });
    expect(Number.isNaN(Date.parse(JSON.parse(line).time))).toBe(false);
  });

  it('preserves exception stacks, causes and Telegram error details', () => {
    const cause = new Error('Connection closed');
    const error = Object.assign(new Error('Telegram failed', { cause }), {
      error_code: 400, description: 'Bad Request', method: 'editMessageText', payload: { chat_id: -1, message_id: 42 }
    });
    target.error('Failed to update announcement', error);
    expect(JSON.parse(output.stderr.mock.calls[0][0]).err).toEqual(expect.objectContaining({
      name: 'Error', message: 'Telegram failed', stack: error.stack,
      cause: expect.objectContaining({ message: 'Connection closed', stack: cause.stack }),
      error_code: 400, payload: { chat_id: -1, message_id: 42 }
    }));
  });

  it('serializes circular context and bigint without throwing', () => {
    const context = { id: 123n };
    context.self = context;
    expect(() => target.warn('Context', context)).not.toThrow();
    expect(JSON.parse(output.stderr.mock.calls[0][0]).data).toEqual([{ id: '123', self: '[Circular]' }]);
  });

  it('keeps diagnostic serialization failures from interrupting application code', () => {
    const context = { date: new Date(NaN), toJSON() { throw new Error('Do not invoke'); } };
    Object.defineProperty(context, 'broken', { enumerable: true, get() { throw new Error('Getter failed'); } });
    expect(() => target.error('Failure', context)).not.toThrow();
    const event = JSON.parse(output.stderr.mock.calls[0][0]);
    expect(event.msg).toBe('Failure');
    expect(event.data[0]).toMatchObject({ date: null, broken: '[Unserializable]' });
  });

  it('does not let a failed output stream replace an application error', () => {
    output.stderr.mockImplementation(() => { throw new Error('Stream closed'); });
    expect(() => target.error('Original failure', new Error('Original'))).not.toThrow();
  });

  it('leaves conversation JSON unchanged', () => {
    const line = JSON.stringify({ event: 'telegram_conversation', status: 'success', text: 'Hello\nWorld' });
    target.log(line);
    expect(output.stdout).toHaveBeenCalledWith(`${line}\n`);
  });

  it('initializes logging before the real conversation logger captures console output', () => {
    const bootstrap = new URL('../../logging.js', import.meta.url).href;
    const conversation = new URL('../../telegram/TelegramConversationLogger.js', import.meta.url).href;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import ${JSON.stringify(bootstrap)};
      import { TelegramConversationLogger } from ${JSON.stringify(conversation)};
      console.info('Application started');
      console.error('Edit failed', new Error('First line\\nSecond line'));
      const logger = new TelegramConversationLogger({ enabled: true });
      await logger.createApiTransformer()(async () => ({}), 'sendMessage', { chat_id: 1, text: 'Hello' });
    `], { encoding: 'utf8' });

    expect(child.status).toBe(0);
    const records = child.stdout.trim().split('\n').map(line => JSON.parse(line));
    expect(records[0]).toMatchObject({ level: 'info', msg: 'Application started' });
    expect(records[1]).toMatchObject({ event: 'telegram_conversation', status: 'success' });
    expect(records[1]).not.toHaveProperty('level');
    const errors = child.stderr.trim().split('\n').map(line => JSON.parse(line));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ level: 'error', err: { message: 'First line\nSecond line' } });
  });
});
