/**
 * @jest-environment node
 */

import { parseTelegramChatLink } from '../../utils/telegram-chat-link.js';

describe('parseTelegramChatLink', () => {
  it.each([
    ['https://t.me/example_chat', 'https://t.me/example_chat'],
    [' http://telegram.me/example_chat/ ', 'https://t.me/example_chat'],
    ['telegram.dog/+invite_Hash-1', 'https://t.me/+invite_Hash-1'],
    ['t.me/joinchat/invite_Hash-1', 'https://t.me/joinchat/invite_Hash-1'],
    ['tg://resolve?domain=example_chat', 'tg://resolve?domain=example_chat'],
    ['tg://join?invite=invite_Hash-1', 'tg://join?invite=invite_Hash-1']
  ])('normalizes supported chat link %s', (input, expected) => {
    expect(parseTelegramChatLink(input)).toEqual({ link: expected, error: null });
  });

  it.each([
    '@example_chat',
    'https://example.com/chat',
    'https://t.me/example_chat/123',
    'https://t.me/c/123456/7',
    'https://t.me/share',
    'https://t.me/example_bot?start=payload',
    'tg://resolve?domain=example_chat&start=payload',
    'tg://user?id=123'
  ])('rejects non-chat value %s', (input) => {
    expect(parseTelegramChatLink(input)).toEqual({ link: null, error: 'invalid' });
  });

  it('rejects values longer than 512 characters after trimming', () => {
    expect(parseTelegramChatLink(`https://t.me/${'a'.repeat(501)}`)).toEqual({
      link: null,
      error: 'tooLong'
    });
  });
});
