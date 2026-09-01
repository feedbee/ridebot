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
      const normalizedText = text.trim();
      if (!normalizedText) return null;

      // Relative expressions must use the current calendar date in the configured timezone.
      const parserReferenceDate = this.createParserReferenceDate(
        new Date(),
        config.dateFormat.defaultTimezone
      );

      let bestResult = null;
      for (const parser of this.getChronoParsers(options.language)) {
        const results = parser.parse(normalizedText, parserReferenceDate, { forwardDate: true });
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
        const fallbackResults = chrono.parse(normalizedText, parserReferenceDate, { forwardDate: true });
        if (fallbackResults.length === 0) {
          return null;
        }
        parsedResult = fallbackResults[0];
      }

      if (parsedResult.index !== 0 || parsedResult.text.length !== normalizedText.length) {
        return null;
      }

      if (!parsedResult.start.isCertain('hour')) {
        return null;
      }

      const date = this.componentsToDate(parsedResult.start, config.dateFormat.defaultTimezone);
      if (!date) return null;
      
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
    const displayLocale = this.getDisplayLocale(language);
    const timezoneOptions = config.dateFormat.defaultTimezone
      ? { timeZone: config.dateFormat.defaultTimezone }
      : {};
    const dateStr = date.toLocaleDateString(displayLocale, {
      ...config.dateFormat.date,
      ...timezoneOptions
    });
    const timeStr = date.toLocaleTimeString(displayLocale, {
      ...config.dateFormat.time,
      ...timezoneOptions
    });

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
    const normalized = this.normalizeLanguageCode(language) || 'en';
    const timezoneOptions = config.dateFormat.defaultTimezone
      ? { timeZone: config.dateFormat.defaultTimezone }
      : {};

    if (normalized === 'en') {
      const month = date.toLocaleDateString('en-US', { month: 'long', ...timezoneOptions });
      const day = Number(date.toLocaleDateString('en-US', { day: 'numeric', ...timezoneOptions }));
      const pr = new Intl.PluralRules('en-US', { type: 'ordinal' });
      const suffixes = { one: 'st', two: 'nd', few: 'rd', other: 'th' };
      return `${month} ${day}${suffixes[pr.select(day)]}`;
    }

    const locale = this.DISPLAY_LOCALE_BY_LANGUAGE[normalized] || config.dateFormat.locale;
    return date.toLocaleDateString(locale, {
      day: 'numeric',
      month: 'long',
      ...timezoneOptions
    });
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
   * Build a local Date whose calendar fields match an instant in the target timezone.
   * Chrono reads these fields when resolving relative expressions.
   * @param {Date} date
   * @param {string|null} timezone
   * @returns {Date}
   */
  static createParserReferenceDate(date, timezone) {
    if (!timezone) return date;
    const parts = this.getTimezoneParts(date, timezone);
    return new Date(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      date.getMilliseconds()
    );
  }

  /**
   * Convert Chrono calendar components in a configured timezone to a UTC instant.
   * @param {import('chrono-node').ParsedComponents} components
   * @param {string|null} timezone
   * @returns {Date|null}
   */
  static componentsToDate(components, timezone) {
    if (!timezone) return components.date();
    return this.zonedDateTimeToDate({
      year: components.get('year'),
      month: components.get('month'),
      day: components.get('day'),
      hour: components.get('hour'),
      minute: components.get('minute'),
      second: components.get('second'),
      millisecond: components.get('millisecond')
    }, timezone);
  }

  /**
   * Convert wall-clock fields in an IANA timezone to the corresponding UTC Date.
   * @param {{year:number, month:number, day:number, hour:number, minute:number, second:number, millisecond:number}} parts
   * @param {string} timezone
   * @returns {Date|null}
   */
  static zonedDateTimeToDate(parts, timezone) {
    const targetTimestamp = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      parts.millisecond
    );
    let candidateTimestamp = targetTimestamp;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const candidateParts = this.getTimezoneParts(new Date(candidateTimestamp), timezone);
      const candidateWallTimestamp = Date.UTC(
        candidateParts.year,
        candidateParts.month - 1,
        candidateParts.day,
        candidateParts.hour,
        candidateParts.minute,
        candidateParts.second,
        parts.millisecond
      );
      const correction = targetTimestamp - candidateWallTimestamp;
      candidateTimestamp += correction;
      if (correction === 0) break;
    }

    const candidateDate = new Date(candidateTimestamp);
    const resolvedParts = this.getTimezoneParts(candidateDate, timezone);
    const resolvesToRequestedTime = [
      'year',
      'month',
      'day',
      'hour',
      'minute',
      'second'
    ].every(key => resolvedParts[key] === parts[key]);

    return resolvesToRequestedTime ? candidateDate : null;
  }

  /**
   * Extract numeric calendar fields for an instant in an IANA timezone.
   * @param {Date} date
   * @param {string} timezone
   * @returns {{year:number, month:number, day:number, hour:number, minute:number, second:number}}
   */
  static getTimezoneParts(date, timezone) {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    });
    const values = Object.fromEntries(
      formatter.formatToParts(date)
        .filter(part => part.type !== 'literal')
        .map(part => [part.type, Number(part.value)])
    );
    return {
      year: values.year,
      month: values.month,
      day: values.day,
      hour: values.hour,
      minute: values.minute,
      second: values.second
    };
  }

  /**
   * Get the start of the calendar day in the configured timezone.
   * @param {Date} [date] - Instant whose calendar day should be used.
   * @returns {Date}
   */
  static startOfDay(date = new Date()) {
    const timezone = config.dateFormat.defaultTimezone;
    if (!timezone) {
      return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    }

    const { year, month, day } = this.getTimezoneParts(date, timezone);
    return this.zonedDateTimeToDate({
      year,
      month,
      day,
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0
    }, timezone);
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
