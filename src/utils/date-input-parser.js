import { DateParser } from './date-parser.js';

/**
 * Parse and validate date/time input
 * @param {string} text - Date/time text to parse
 * @returns {{date: Date|null, error?: string}} Result object containing either the parsed date or error message
 */
export function parseDateTimeInput(text) {
  const parsedDate = DateParser.parseDateTime(text);
  if (!parsedDate) {
    return {
      date: null,
      error: '❌ I couldn\'t understand that date/time format. Please try something like:\n• tomorrow at 6pm\n• in 2 hours\n• next saturday 10am\n• 21 Jul 14:30'
    };
  }
  
  if (DateParser.isPast(parsedDate.date)) {
    return {
      date: null,
      error: '❌ The ride can\'t be scheduled in the past! Please provide a future date and time.'
    };
  }

  return { date: parsedDate.date };
} 
