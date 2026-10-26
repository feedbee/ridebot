import { conversationText } from './conversation-text.js';
import { RideParamsHelper } from '../utils/RideParamsHelper.js';

const CALLBACK_PATTERNS = [
  /^(?:join|apply|thinking|skip|pacegroup|startpoint|ridepublish):(\w+)(?::|$)/,
  /^(?:rideowner|application|calendar|delete):\w+:(\w+)(?::|$)/,
  /^u:[cx]:(\w+):/,
  /^settings:ride:bool:\w+:(?:on|off):(\w+)$/,
  /^settings:ride:participant-limit:(\w+)$/,
  /^decline:\w+:(\w+)(?::|$)/
];

/** Extract only known ride-bearing callback formats, never generic token positions.
 * @param {string} data
 * @returns {string|null}
 */
export function callbackRideId(data) {
  if (typeof data !== 'string') return null;
  for (const pattern of CALLBACK_PATTERNS) {
    const match = data.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/** Resolve an unambiguous ride reference from visible content or its keyboard.
 * Multi-ride lists deliberately have no single ride ID.
 * @param {Object} message
 * @returns {string|null}
 */
export function messageRideId(message) {
  try {
    return extractMessageRideId(message);
  } catch {
    return null;
  }
}

/** Read a ride reference inside the diagnostic safety boundary.
 * @param {Object} message
 * @returns {string|null}
 */
function extractMessageRideId(message) {
  if (!message) return null;
  const text = conversationText(message) || '';
  const ids = new Set([...text.matchAll(/🎫\s*#Ride\s*#(\w+)/gi)].map(match => match[1]));
  for (const row of message.reply_markup?.inline_keyboard || []) {
    for (const button of row) {
      const id = callbackRideId(button.callback_data);
      if (id) ids.add(id);
    }
  }
  return ids.size === 1 ? [...ids][0] : null;
}

/** Resolve the ride targeted by a command, callback or replied announcement.
 * @param {Object} ctx
 * @returns {string|null}
 */
export function incomingRideId(ctx) {
  const callbackId = callbackRideId(ctx.callbackQuery?.data);
  if (callbackId) return callbackId;
  const text = ctx.message?.text || '';
  const firstLine = text.split('\n')[0];
  const isRideCommand = /^\/(?:updateride|cancelride|deleteride|listparticipants|dupride|resumeride|shareride|unshareride|settings|declineparticipant|joinchat|detach|attach)(?:@\w+)?(?:\s|$)/i.test(firstLine);
  // Match the command service's positional-ID and multiline parameter rules.
  const command = isRideCommand ? firstLine.match(/^\/(\w+)(@\w+)?(\s+#?(\w+))?/i) : null;
  const parameterId = isRideCommand ? RideParamsHelper.parseRideParams(text).params.id?.replace(/^#/, '') : null;
  const calendar = text.match(/^\/start(?:@\w+)?\s+calendar_(\w+)\s*$/i);
  const aiUpdate = text.match(/^\/airide\s+#([a-zA-Z0-9]+)(?:\s|$)/i);
  return command?.[4] || parameterId || calendar?.[1] || aiUpdate?.[1] || messageRideId(ctx.message?.reply_to_message)
    || messageRideId(ctx.callbackQuery?.message) || messageRideId(ctx.message);
}
