import { parseDateTimeInput } from './date-input-parser.js';
import { parseDuration } from './duration-parser.js';
import { normalizeCategory, DEFAULT_CATEGORY } from './category-utils.js';

/**
 * Utility class for processing ride field parameters
 * Centralizes field processing logic to eliminate duplication between create and update operations
 */
export class FieldProcessor {
  /**
   * Process ride fields from parameters
   * @param {Object} params - Input parameters
   * @param {boolean} isUpdate - Whether this is an update operation (affects how '-' is handled)
   * @param {{language?: string}} options - Localization options
   * @returns {Object} - { data, error }
   */
  static processRideFields(params, isUpdate = false, options = {}) {
    const language = options.language;
    const result = { data: {}, error: null };
    
    // Process date
    if (params.when) {
      const dateResult = parseDateTimeInput(params.when, { language });
      if (!dateResult.date) {
        return { data: null, error: dateResult.error };
      }
      result.data.date = dateResult.date;
    }
    
    // Process distance
    if (params.dist !== undefined) {
      result.data.distance = this.processNumericField(params.dist, isUpdate);
    }
    
    // Process duration
    if (params.duration !== undefined) {
      const durationResult = this.processDurationField(params.duration, isUpdate, { language });
      if (durationResult.error) {
        return { data: null, error: durationResult.error };
      }
      result.data.duration = durationResult.value;
    }
    
    // Process speed
    if (params.speed !== undefined) {
      const speedResult = this.processSpeedField(params.speed, isUpdate);
      Object.assign(result.data, speedResult);
    }
    
    // Process route
    if (params.route !== undefined) {
      if (isUpdate && params.route === '-') {
        // Clear route for updates
        result.data.routeLink = '';
      } else {
        // Handle async route parsing separately
        result.data._routeParam = params.route;
        result.data._requiresRouteProcessing = true;
      }
    }
    
    // Process simple text fields
    this.processTextFields(params, result.data, isUpdate);
    
    return result;
  }
  
  /**
   * Process numeric field (distance)
   * @param {string} value - Field value
   * @param {boolean} isUpdate - Whether this is an update operation
   * @returns {number|null} - Parsed value or null if cleared
   */
  static processNumericField(value, isUpdate) {
    if (isUpdate && value === '-') return null;
    return parseFloat(value);
  }
  
  /**
   * Process duration field
   * @param {string} value - Field value
   * @param {boolean} isUpdate - Whether this is an update operation
   * @param {{language?: string}} options - Localization options
   * @returns {Object} - { value, error }
   */
  static processDurationField(value, isUpdate, options = {}) {
    if (isUpdate && value === '-') {
      return { value: null, error: null };
    }
    const result = parseDuration(value, { language: options.language });
    return { value: result.duration, error: result.error };
  }
  
  /**
   * Process speed field supporting 4 input forms:
   *   "25-28"       → range    (speedMin=25, speedMax=28)
   *   "25+" or "25-"→ minimum  (speedMin=25, speedMax=null)
   *   "-28"         → maximum  (speedMin=null, speedMax=28)
   *   "25" or "~25" → average  (speedMin=25, speedMax=25)
   *
   * @param {string} value - Field value
   * @param {boolean} isUpdate - Whether this is an update operation
   * @returns {Object} - Object with speedMin and/or speedMax properties
   */
  static processSpeedField(value, isUpdate) {
    if (isUpdate && value === '-') {
      return { speedMin: null, speedMax: null };
    }

    const trimmed = value.trim().replace(/^~/, '');

    // Maximum: starts with "-" followed by a digit, e.g. "-28"
    if (/^-\d/.test(trimmed)) {
      const max = parseFloat(trimmed.slice(1));
      if (isNaN(max)) return {};
      const result = { speedMax: max };
      if (isUpdate) result.speedMin = null;
      return result;
    }

    // Minimum: ends with "+" or "-", e.g. "25+" or "25-"
    if (/\d[+-]$/.test(trimmed)) {
      const min = parseFloat(trimmed);
      if (isNaN(min)) return {};
      const result = { speedMin: min };
      if (isUpdate) result.speedMax = null;
      return result;
    }

    // Range: two numbers separated by "-", e.g. "25-28"
    if (/^\d/.test(trimmed) && trimmed.includes('-')) {
      const [minStr, maxStr] = trimmed.split('-');
      const min = parseFloat(minStr);
      const max = parseFloat(maxStr);
      if (isNaN(min) || isNaN(max)) return {};
      return { speedMin: min, speedMax: max };
    }

    // Average: single number, e.g. "25" — stored as min === max
    const avg = parseFloat(trimmed);
    if (!isNaN(avg)) {
      return { speedMin: avg, speedMax: avg };
    }

    return {};
  }
  
  /**
   * Process simple text fields
   * @param {Object} params - Input parameters
   * @param {Object} data - Data object to populate
   * @param {boolean} isUpdate - Whether this is an update operation
   */
  static processTextFields(params, data, isUpdate) {
    const textFields = ['title', 'meet', 'info', 'organizer', 'category'];
    textFields.forEach(field => {
      if (params[field] !== undefined) {
        if (isUpdate && params[field] === '-') {
          // Clear field value for updates
          if (field === 'category') {
            data[field] = DEFAULT_CATEGORY;
          } else if (field === 'meet') {
            data.meetingPoint = '';
          } else if (field === 'info') {
            data.additionalInfo = '';
          } else {
            data[field] = '';
          }
        } else {
          // Set field value
          if (field === 'category') {
            data[field] = normalizeCategory(params[field]);
          } else if (field === 'meet') {
            data.meetingPoint = params[field];
          } else if (field === 'info') {
            data.additionalInfo = params[field];
          } else {
            data[field] = params[field];
          }
        }
      }
    });
  }
}
