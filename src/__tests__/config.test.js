/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';

describe('config.maxRideMessagesPerChatThread', () => {
  const originalValue = process.env.MAX_RIDE_MESSAGES_PER_CHAT_THREAD;

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env.MAX_RIDE_MESSAGES_PER_CHAT_THREAD;
    } else {
      process.env.MAX_RIDE_MESSAGES_PER_CHAT_THREAD = originalValue;
    }
    jest.resetModules();
  });

  it('uses an explicit positive integer', async () => {
    process.env.MAX_RIDE_MESSAGES_PER_CHAT_THREAD = '4';
    jest.resetModules();

    const { config } = await import('../config.js');

    expect(config.maxRideMessagesPerChatThread).toBe(4);
  });

  it('defaults to 5 when the value is missing', async () => {
    delete process.env.MAX_RIDE_MESSAGES_PER_CHAT_THREAD;
    jest.resetModules();

    const { config } = await import('../config.js');

    expect(config.maxRideMessagesPerChatThread).toBe(5);
  });

  it.each(['abc', '1.5', '0', '-2'])('defaults to 5 for invalid value %s', async (value) => {
    process.env.MAX_RIDE_MESSAGES_PER_CHAT_THREAD = value;
    jest.resetModules();

    const { config } = await import('../config.js');

    expect(config.maxRideMessagesPerChatThread).toBe(5);
  });
});
