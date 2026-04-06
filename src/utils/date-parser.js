import * as chrono from 'chrono-node';
import { config } from '../config.js';

export class DateParser {
  static DISPLAY_LOCALE_BY_LANGUAGE = Object.freeze({
    en: 'en-GB',
    ru: 'ru-RU',
    de: 'de-DE',
    es: 'es-ES',
    fr: 'fr-FR',
    it: 'it-IT',
    ja: 'ja-JP',
    nl: 'nl-NL',
    pt: 'pt-PT',
    sv: 'sv-SE',
    uk: 'uk-UA',
    zh: 'zh-CN'
  });

  static CHRONO_LOCALE_PARSERS = Object.freeze({
    en: chrono.en,
    ru: chrono.ru,
    de: chrono.de,
    es: chrono.es,
    fr: chrono.fr,
    it: chrono.it,
    ja: chrono.ja,
    nl: chrono.nl,
    pt: chrono.pt,
    sv: chrono.sv,
    uk: chrono.uk,
    zh: chrono.zh
  });

  static CHRONO_LOCALE_ORDER = Object.freeze([
    'en',
    'ru',
    'de',
    'es',
    'fr',
    'it',
    'ja',
    'nl',
    'pt',
    'sv',
    'uk',
    'zh'
  ]);

  static normalizeLanguageCode(language) {
    if (!language) return null;
    return String(language).trim().toLowerCase().split(/[-_]/)[0];
  }

  static getChronoParsers(language) {
    const requested = this.normalizeLanguageCode(language);
    const fallback = this.normalizeLanguageCode(config.i18n.fallbackLanguage);
    const orderedKeys = [];

    if (requested && this.CHRONO_LOCALE_PARSERS[requested]) orderedKeys.push(requested);
    if (fallback && this.CHRONO_LOCALE_PARSERS[fallback] && fallback !== requested) orderedKeys.push(fallback);

    this.CHRONO_LOCALE_ORDER.forEach((key) => {
      if (!orderedKeys.includes(key)) orderedKeys.push(key);
    });

    return orderedKeys
      .map(key => this.CHRONO_LOCALE_PARSERS[key])
      .filter(Boolean);
  }

  /**
   * Parse natural language date/time into a Date object
   * @param {string} text - Natural language date/time (e.g., "tomorrow at 6pm", "in 2 hours")
   * @param {{language?: string}} [options]
   * @returns {{date: Date, text: string}|null} Parsed date and the text that was recognized
   */
  static parseDateTime(text, options = {}) {
    try {
      // For relative dates (like "tomorrow"), the reference date needs to be in the target timezone
      const convertedRefDate = this.convertToTimezone(new Date(), config.dateFormat.defaultTimezone);

      let bestResult = null;
      for (const parser of this.getChronoParsers(options.language)) {
        const results = parser.parse(text, convertedRefDate, { forwardDate: true });
        if (results.length > 0) {
          const candidate = results[0];
          if (
            !bestResult ||
            candidate.index < bestResult.index ||
            (candidate.index === bestResult.index && candidate.text.length > bestResult.text.length)
          ) {
            bestResult = candidate;
          }
        }
      }

      let parsedResult = bestResult;
      if (!parsedResult) {
        const fallbackResults = chrono.parse(text, convertedRefDate, { forwardDate: true });
        if (fallbackResults.length === 0) {
          return null;
        }
        parsedResult = fallbackResults[0];
      }

      // We expect input in local timezone
      const date = this.convertFromTimezone(parsedResult.start.date(), config.dateFormat.defaultTimezone);
      
      // Return both the parsed date and the text that was recognized
      return {
        date,
        text: parsedResult.text
      };
    } catch (error) {
      console.error('Error parsing date:', error);
      return null;
    }
  }

  /**
   * Format date for display in messages
   * @param {Date} date 
   * @param {string} [language]
   * @returns {{date: string, time: string}} Formatted date and time strings
   */
  static formatDateTime(date, language) {
    // Convert the date from the configured timezone for display
    const displayDate = this.convertToTimezone(date, config.dateFormat.defaultTimezone);
    const displayLocale = this.getDisplayLocale(language);
    
    const dateStr = displayDate.toLocaleDateString(displayLocale, config.dateFormat.date);
    const timeStr = displayDate.toLocaleTimeString(displayLocale, config.dateFormat.time);

    return {
      date: dateStr,
      time: timeStr
    };
  }

  /**
   * Format date for use in Telegram chat titles: "April 5th" (en) or "5 апреля" (ru)
   * @param {Date} date
   * @param {string} [language]
   * @returns {string}
   */
  static formatDateForChatTitle(date, language) {
    const displayDate = this.convertToTimezone(date, config.dateFormat.defaultTimezone);
    const normalized = this.normalizeLanguageCode(language) || 'en';

    if (normalized === 'en') {
      const month = displayDate.toLocaleDateString('en-US', { month: 'long' });
      const day = displayDate.getDate();
      const pr = new Intl.PluralRules('en-US', { type: 'ordinal' });
      const suffixes = { one: 'st', two: 'nd', few: 'rd', other: 'th' };
      return `${month} ${day}${suffixes[pr.select(day)]}`;
    }

    const locale = this.DISPLAY_LOCALE_BY_LANGUAGE[normalized] || config.dateFormat.locale;
    return displayDate.toLocaleDateString(locale, { day: 'numeric', month: 'long' });
  }

  /**
   * Resolve locale used for user-facing date/time formatting
   * @param {string} [language]
   * @returns {string}
   */
  static getDisplayLocale(language) {
    const normalized = this.normalizeLanguageCode(language);
    if (normalized && this.DISPLAY_LOCALE_BY_LANGUAGE[normalized]) {
      return this.DISPLAY_LOCALE_BY_LANGUAGE[normalized];
    }
    return config.dateFormat.locale;
  }

  /**
   * Convert a date from local timezone to the specified timezone
   * @param {Date} date - The date to convert
   * @param {string} timezone - The target timezone (e.g., 'Europe/London')
   * @returns {Date} The converted date
   */
  static convertToTimezone(date, timezone) {
    // If no timezone is configured, return the original date
    if (!timezone) return date;
    
    try {
      // Get the date in the target timezone
      const options = { timeZone: timezone };
      const targetDate = new Date(date.toLocaleString('en-US', options));
      
      // Calculate the time difference between local and target timezone
      const localOffset = date.getTimezoneOffset();
      const targetOffset = (date.getTime() - targetDate.getTime()) / 60000;
      
      // Apply the offset to get the correct time in the target timezone
      return new Date(date.getTime() + (localOffset - targetOffset) * 60000);
    } catch (error) {
      console.error(`Error converting date to timezone ${timezone}:`, error);
      return date; // Return original date if conversion fails
    }
  }

  /**
   * Convert a date from the specified timezone to local timezone
   * @param {Date} date - The date to convert
   * @param {string} timezone - The source timezone (e.g., 'Europe/London')
   * @returns {Date} The converted date
   */
  static convertFromTimezone(date, timezone) {
    // If no timezone is configured, return the original date
    if (!timezone) return date;
    
    try {
      // Get the date in the source timezone
      const options = { timeZone: timezone };
      const sourceDate = new Date(date.toLocaleString('en-US', options));
      
      // Calculate the time difference between local and source timezone
      const localOffset = date.getTimezoneOffset();
      const sourceOffset = (date.getTime() - sourceDate.getTime()) / 60000;
      
      // Apply the offset to get the correct time in the local timezone
      return new Date(date.getTime() - (localOffset - sourceOffset) * 60000);
    } catch (error) {
      console.error(`Error converting date from timezone ${timezone}:`, error);
      return date; // Return original date if conversion fails
    }
  }

  /**
   * Check if a date is in the past
   * @param {Date} date 
   * @returns {boolean}
   */
  static isPast(date) {
    return date < new Date();
  }
} 
