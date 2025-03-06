import { DateParser } from './date-parser.js';

/**
 * Parse and validate date/time input
 * @param {string} text - Date/time text to parse
 * @param {Object} ctx - Context object for sending error messages
 * @returns {Date|null} Parsed date or null if invalid
 */
export async function parseDateTimeInput(text, ctx) {
  const parsedDate = DateParser.parseDateTime(text);
  if (!parsedDate) {
    await ctx.reply('❌ I couldn\'t understand that date/time format. Please try something like:\n• tomorrow at 6pm\n• in 2 hours\n• next saturday 10am\n• 21 Jul 14:30');
    return null;
  }
  
  if (DateParser.isPast(parsedDate.date)) {
    await ctx.reply('❌ The ride can\'t be scheduled in the past! Please provide a future date and time.');
    return null;
  }

  return parsedDate.date;
} 
