import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_INPUT_CHARS = 2000;
const MAX_TOKENS = 1024;

/**
 * Service for parsing free-form ride descriptions using Claude AI.
 */
export class AiRideService {
  /**
   * @param {Anthropic} [client] - Optional Anthropic client (injected for testing)
   */
  constructor(client) {
    this.client = client ?? new Anthropic({ apiKey: config.anthropic.apiKey });
  }

  /**
   * Parse a free-form ride description into structured params.
   *
   * @param {string} userText - Free-form input from the user (ignored when dialogMessages provided)
   * @param {Object} [options]
   * @param {boolean} [options.isUpdate] - True when updating an existing ride
   * @param {string} [options.originalText] - Original text for follow-up re-parse
   * @param {string} [options.followUpText] - Clarification provided by user
   * @param {string[]} [options.dialogMessages] - Full dialog history; when provided, used instead of userText
   * @returns {Promise<{params: Object|null, error: string|null}>}
   *   params keys match RideParamsHelper.VALID_PARAMS (title, when, category, etc.)
   */
  async parseRideText(userText, options = {}) {
    try {
      const userMessage = this._buildUserMessage(userText, options);
      const response = await this.client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: this._buildSystemPrompt(options),
        messages: [{ role: 'user', content: userMessage }]
      });

      const rawText = response.content?.[0]?.text ?? '';
      return this._parseResponse(rawText);
    } catch {
      return { params: null, error: 'service_unavailable' };
    }
  }

  _buildSystemPrompt(options = {}) {
    const now = new Date();
    const timezone = config.dateFormat?.defaultTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const currentDate = now.toLocaleString('en-GB', { timeZone: timezone, dateStyle: 'full', timeStyle: 'short' });

    const base = `You are a structured data extractor for a cycling ride scheduling bot.
Extract ride details from the user's message and return ONLY a valid JSON object.
Use these exact field names (all optional except title and when):
  title: ride name or short description
  when: date/time in natural language (e.g. "tomorrow at 6pm", "Saturday 10am")
  category: one of "mixed","road","gravel","mtb","mtb-xc","e-bike","virtual"
  organizer: name of the organizer
  meet: meeting point location
  routes: array of strings, each string either a route URL or "Label | URL"
  dist: distance in km as a string number, e.g. "70"
  duration: e.g. "2h 30m", "90m", "1.5h"
  speed: e.g. "25-28", "25+", "-28", "~25"
  info: additional notes
  settings: optional object
  settings.notifyParticipation: boolean

Today: ${currentDate} (${timezone})
Return ONLY valid JSON, no markdown, no explanation. Omit fields that are not mentioned.`;

    if (options.dialogMessages) {
      return `${base}

This is a multi-turn conversation. The user sends multiple messages, each adding to or overriding earlier details. Extract the CURRENT state of all known fields. Later messages take priority over earlier ones for the same field.`;
    }

    return base;
  }

  _buildUserMessage(userText, options) {
    const { isUpdate, originalText, followUpText, dialogMessages } = options;

    // Dialog mode: combine numbered messages into one block
    if (dialogMessages && dialogMessages.length > 0) {
      const combined = dialogMessages
        .map((msg, i) => `[${i + 1}] ${msg.slice(0, MAX_INPUT_CHARS)}`)
        .join('\n');
      return combined;
    }

    // Follow-up re-parse: combine original + clarification
    if (originalText && followUpText) {
      return `Original description: ${originalText.slice(0, MAX_INPUT_CHARS)}\nUser's clarification: ${followUpText.slice(0, MAX_INPUT_CHARS)}`;
    }

    const text = userText.slice(0, MAX_INPUT_CHARS);

    if (isUpdate) {
      return `${text}\n[UPDATE MODE: Only extract fields the user explicitly wants to change. Use "-" to indicate a field should be cleared.]`;
    }

    return text;
  }

  _parseResponse(rawText) {
    // Strip markdown code fences if present
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return { params: null, error: 'invalid_response' };
    }

    if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
      return { params: null, error: 'invalid_response' };
    }

    if (typeof parsed.routes === 'string') {
      parsed.routes = [parsed.routes.trim()];
    }

    if (Array.isArray(parsed.routes)) {
      parsed.routes = parsed.routes
        .map(v => typeof v === 'string' ? v.trim() : v)
        .filter(v => typeof v === 'string' && v !== '');
    }

    // Remove null/empty-string fields so FieldProcessor isn't confused
    const params = Object.fromEntries(
      Object.entries(parsed).filter(([, v]) => v !== null && v !== '' && (!Array.isArray(v) || v.length > 0))
    );

    return { params, error: null };
  }
}
