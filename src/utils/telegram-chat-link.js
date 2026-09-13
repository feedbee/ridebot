export const MAX_TELEGRAM_CHAT_LINK_LENGTH = 512;

const TELEGRAM_WEB_HOSTS = new Set(['t.me', 'telegram.me', 'telegram.dog']);
const NON_CHAT_PATHS = new Set([
  'addemoji', 'addlist', 'addstickers', 'boost', 'contact', 'giftcode', 'invoice',
  'iv', 'joinchat', 'login', 'proxy', 'setlanguage', 'share', 'socks'
]);
const CHAT_NAME_PATTERN = /^[A-Za-z0-9_]+$/;
const INVITE_HASH_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Validate and normalize a Telegram chat or invite link.
 *
 * @param {unknown} input
 * @returns {{link: string|null, error: 'invalid'|'tooLong'|null}}
 */
export function parseTelegramChatLink(input) {
  if (typeof input !== 'string') return { link: null, error: 'invalid' };

  const value = input.trim();
  if (value.length > MAX_TELEGRAM_CHAT_LINK_LENGTH) {
    return { link: null, error: 'tooLong' };
  }
  if (!value) return { link: null, error: 'invalid' };

  if (value.toLowerCase().startsWith('tg://')) {
    return parseDeepLink(value);
  }

  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return { link: null, error: 'invalid' };
  }

  const host = url.hostname.toLowerCase();
  if (!TELEGRAM_WEB_HOSTS.has(host) || url.username || url.password || url.port || url.search || url.hash) {
    return { link: null, error: 'invalid' };
  }

  const segments = url.pathname.split('/').filter(Boolean);
  const isPublicChat = segments.length === 1
    && CHAT_NAME_PATTERN.test(segments[0])
    && !NON_CHAT_PATHS.has(segments[0].toLowerCase());
  const isCurrentInvite = segments.length === 1
    && segments[0].startsWith('+')
    && INVITE_HASH_PATTERN.test(segments[0].slice(1));
  const isLegacyInvite = segments.length === 2
    && segments[0].toLowerCase() === 'joinchat'
    && INVITE_HASH_PATTERN.test(segments[1]);

  if (!isPublicChat && !isCurrentInvite && !isLegacyInvite) {
    return { link: null, error: 'invalid' };
  }

  return { link: `https://t.me/${segments.join('/')}`, error: null };
}

/**
 * Validate Telegram deep links that resolve a public chat or open an invite.
 *
 * @param {string} value
 * @returns {{link: string|null, error: 'invalid'|null}}
 */
function parseDeepLink(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return { link: null, error: 'invalid' };
  }

  const action = url.hostname.toLowerCase();
  const entries = [...url.searchParams.entries()];
  if (url.pathname || url.hash || entries.length !== 1) {
    return { link: null, error: 'invalid' };
  }

  if (action === 'resolve' && entries[0][0] === 'domain' && CHAT_NAME_PATTERN.test(entries[0][1])) {
    return { link: `tg://resolve?domain=${encodeURIComponent(entries[0][1])}`, error: null };
  }
  if (action === 'join' && entries[0][0] === 'invite' && INVITE_HASH_PATTERN.test(entries[0][1])) {
    return { link: `tg://join?invite=${encodeURIComponent(entries[0][1])}`, error: null };
  }

  return { link: null, error: 'invalid' };
}
