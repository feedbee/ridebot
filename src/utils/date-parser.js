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
      // For relative dates (like "tomorrow"), the reference date needs to be in the target timezone
      const convertedRefDate = this.convertToTimezone(new Date(), config.dateFormat.defaultTimezone);
      
      const results = chrono.parse(text, convertedRefDate, { forwardDate: true });
      
      if (results.length === 0) {
        return null;
      }

      const parsedResult = results[0];
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
   * @returns {{date: string, time: string}} Formatted date and time strings
   */
  static formatDateTime(date) {
    // Convert the date from the configured timezone for display
    const displayDate = this.convertToTimezone(date, config.dateFormat.defaultTimezone);
    
    const dateStr = displayDate.toLocaleDateString(config.dateFormat.locale, config.dateFormat.date);
    const timeStr = displayDate.toLocaleTimeString(config.dateFormat.locale, config.dateFormat.time);

    return {
      date: dateStr,
      time: timeStr
    };
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
