import { parseDateTimeInput } from './date-input-parser.js';
import { parseDuration } from './duration-parser.js';
import { normalizeCategory, DEFAULT_CATEGORY } from './category-utils.js';
import { parseSpeedInput } from './speed-utils.js';
import { parseRouteEntries } from './route-links.js';
import { config } from '../config.js';
import { t } from '../i18n/index.js';

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
    const routeInput = params.routes !== undefined ? params.routes : params.route;
    if (routeInput !== undefined) {
      const routeValues = Array.isArray(routeInput) ? routeInput : [routeInput];
      if (isUpdate && routeValues.length === 1 && routeValues[0] === '-') {
        // Clear route for updates
        result.data.routes = [];
        result.data.routeLink = '';
      } else {
        const parsedRoutes = parseRouteEntries(routeValues, { validateUrl: false });
        if (parsedRoutes.error) {
          return { data: null, error: this.translateRouteError(language) };
        }
        result.data.routes = parsedRoutes.routes;
        if (parsedRoutes.routes.length === 0) {
          result.data.routeLink = '';
        }
        result.data._requiresRouteProcessing = parsedRoutes.routes.length > 0;
      }
    }
    
    // Process simple text fields
    this.processTextFields(params, result.data, isUpdate);

    const notifyParticipation = params.settings?.notifyParticipation
      ?? params['settings.notifyParticipation'];
    if (notifyParticipation !== undefined) {
      result.data.settings = {
        ...(result.data.settings || {}),
        notifyParticipation: this.parseBooleanSetting(notifyParticipation)
      };
    }

    return result;
  }

  /**
   * Parse boolean-like setting inputs from text or structured values.
   *
   * @param {string|boolean|number} value
   * @returns {boolean}
   */
  static parseBooleanSetting(value) {
    if (typeof value === 'boolean') {
      return value;
    }

    const normalized = String(value).toLowerCase().trim();
    return normalized === 'yes' || normalized === 'true' || normalized === '1';
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

    const parsed = parseSpeedInput(value);
    if (!parsed) return {};

    const result = { ...parsed };

    // On update, explicitly null out whichever bound was not specified,
    // so switching forms (e.g. range → average) clears the old value.
    if (isUpdate) {
      if (!('speedMin' in result)) result.speedMin = null;
      if (!('speedMax' in result)) result.speedMax = null;
    }

    return result;
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

  static translateRouteError(language) {
    return t(language || config.i18n.defaultLanguage, 'utils.routeParser.invalidUrl', {}, {
      fallbackLanguage: config.i18n.fallbackLanguage,
      withMissingMarker: config.isDev
    });
  }
}
