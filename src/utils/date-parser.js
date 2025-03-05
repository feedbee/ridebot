import * as chrono from 'chrono-node';
import { config } from '../config.js';

export class DateParser {
  /**
   * Parse natural language date/time into a Date object
   * @param {string} text - Natural language date/time (e.g., "tomorrow at 6pm", "in 2 hours")
   * @returns {{date: Date, text: string}|null} Parsed date and the text that was recognized
   */
  static parseDateTime(text) {
    try {
      const results = chrono.parse(text, new Date(), { forwardDate: true });
      
      if (results.length === 0) {
        return null;
      }

      const parsedResult = results[0];
      const date = parsedResult.start.date();
      
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
   * @returns {{date: string, time: string}} Formatted date and time strings
   */
  static formatDateTime(date) {
    const dateStr = date.toLocaleDateString(config.dateFormat.locale, config.dateFormat.date);
    const timeStr = date.toLocaleTimeString(config.dateFormat.locale, config.dateFormat.time);

    return {
      date: dateStr,
      time: timeStr
    };
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
