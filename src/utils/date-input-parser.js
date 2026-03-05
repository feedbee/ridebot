import { DateParser } from './date-parser.js';
import { config } from '../config.js';
import { t } from '../i18n/index.js';

/**
 * Parse and validate date/time input
 * @param {string} text - Date/time text to parse
 * @returns {{date: Date|null, error?: string}} Result object containing either the parsed date or error message
 */
export function parseDateTimeInput(text, options = {}) {
  const language = options.language || config.i18n.defaultLanguage;
  const translate = (key, params = {}) => t(language, key, params, {
    fallbackLanguage: config.i18n.fallbackLanguage,
    withMissingMarker: config.isDev
  });

  const parsedDate = DateParser.parseDateTime(text, { language });
  if (!parsedDate) {
    let errorMessage = translate('parsers.date.invalidFormat');
    
    // Add timezone information to the error message if a default timezone is configured
    if (config.dateFormat.defaultTimezone) {
      errorMessage += `\n\n${translate('parsers.date.timezoneNote', { timezone: config.dateFormat.defaultTimezone })}`;
    }
    
    return {
      date: null,
      error: errorMessage
    };
  }
  
  if (DateParser.isPast(parsedDate.date)) {
    return {
      date: null,
      error: translate('parsers.date.pastDate')
    };
  }

  return { date: parsedDate.date };
} 
