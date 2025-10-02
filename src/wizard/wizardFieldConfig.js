import { parseDateTimeInput } from '../utils/date-input-parser.js';
import { RouteParser } from '../utils/route-parser.js';
import { parseDuration } from '../utils/duration-parser.js';
import { normalizeCategory, DEFAULT_CATEGORY } from '../utils/category-utils.js';
import { DateParser } from '../utils/date-parser.js';

/**
 * Wizard field configuration
 * Defines all wizard fields with their properties, validation, and behavior
 */

/**
 * Field type enum
 */
export const FieldType = {
  TEXT: 'text',
  CATEGORY: 'category',
  DATE: 'date',
  ROUTE: 'route',
  NUMBER: 'number',
  DURATION: 'duration',
  SPEED: 'speed'
};

/**
 * Wizard field configurations
 * Each field defines its behavior, validation, and UI properties
 */
export const WIZARD_FIELDS = {
  title: {
    step: 'title',
    type: FieldType.TEXT,
    dataKey: 'title',
    prompt: '📝 Please enter the ride title:',
    required: true,
    clearable: false,
    skippable: false,
    nextStep: 'category',
    previousStep: null, // First step, no previous
    validator: (text) => {
      if (!text || text.trim() === '') {
        return { valid: false, error: 'Title cannot be empty' };
      }
      return { valid: true, value: text };
    }
  },

  category: {
    step: 'category',
    type: FieldType.CATEGORY,
    dataKey: 'category',
    prompt: '🚲 Please select the ride category:',
    required: false,
    clearable: false,
    skippable: true,
    nextStep: 'organizer',
    previousStep: 'title',
    validator: (text) => {
      const normalized = normalizeCategory(text);
      return { valid: true, value: normalized };
    },
    // Category-specific options for inline keyboard
    options: [
      { label: 'Road Ride', value: 'Road Ride' },
      { label: 'Gravel Ride', value: 'Gravel Ride' },
      { label: 'Mountain/Enduro/Downhill Ride', value: 'Mountain/Enduro/Downhill Ride' },
      { label: 'MTB-XC Ride', value: 'MTB-XC Ride' },
      { label: 'E-Bike Ride', value: 'E-Bike Ride' },
      { label: 'Virtual/Indoor Ride', value: 'Virtual/Indoor Ride' }
    ]
  },

  organizer: {
    step: 'organizer',
    type: FieldType.TEXT,
    dataKey: 'organizer',
    prompt: '👤 Who is organizing this ride?\n<i>Enter a dash (-) to clear/skip this field</i>',
    required: false,
    clearable: true,
    skippable: true,
    nextStep: 'date',
    previousStep: 'category',
    validator: (text) => ({ valid: true, value: text })
  },

  date: {
    step: 'date',
    type: FieldType.DATE,
    dataKey: 'datetime',
    prompt: '📅 When is the ride?\nYou can use natural language like:\n• tomorrow at 6pm\n• in 2 hours\n• next saturday 10am\n• 21 Jul 14:30',
    required: true,
    clearable: false,
    skippable: false,
    nextStep: 'route',
    previousStep: 'organizer',
    validator: (text) => {
      const result = parseDateTimeInput(text);
      if (!result.date) {
        return { valid: false, error: result.error };
      }
      return { valid: true, value: result.date };
    },
    formatter: (date) => {
      if (!(date instanceof Date) || isNaN(date)) return '';
      const formattedDateTime = DateParser.formatDateTime(date);
      return `${formattedDateTime.date} at ${formattedDateTime.time}`;
    }
  },

  route: {
    step: 'route',
    type: FieldType.ROUTE,
    dataKey: 'routeLink',
    prompt: '🔗 Please enter the route link (or skip):\n<i>Enter a dash (-) to clear/skip this field</i>',
    required: false,
    clearable: true,
    skippable: true,
    nextStep: 'distance', // Default, can be overridden based on route parsing
    previousStep: 'date',
    validator: (text) => {
      if (!RouteParser.isValidRouteUrl(text)) {
        return { 
          valid: false, 
          error: 'Invalid route URL format. Please provide a valid URL, use a dash (-) to clear the field, or click Skip.' 
        };
      }
      return { valid: true, value: text };
    },
    // Special handler for route parsing
    async postProcess(text, state) {
      if (RouteParser.isKnownProvider(text)) {
        const routeInfo = await RouteParser.parseRoute(text);
        
        if (routeInfo) {
          if (routeInfo.distance) state.data.distance = routeInfo.distance;
          if (routeInfo.duration) state.data.duration = routeInfo.duration;
        }
        
        // Determine next step based on parsed data
        if (state.data.distance && state.data.duration) {
          return 'speed';
        } else if (state.data.distance) {
          return 'duration';
        }
      }
      return 'distance';
    }
  },

  distance: {
    step: 'distance',
    type: FieldType.NUMBER,
    dataKey: 'distance',
    prompt: '📏 Please enter the distance in kilometers (or skip):\n<i>Enter a dash (-) to clear/skip this field</i>',
    required: false,
    clearable: true,
    skippable: true,
    nextStep: 'duration',
    previousStep: 'route',
    validator: (text) => {
      const distance = parseFloat(text);
      if (isNaN(distance)) {
        return { 
          valid: false, 
          error: 'Please enter a valid number for distance, or use a dash (-) to clear the field.' 
        };
      }
      return { valid: true, value: distance };
    },
    formatter: (value) => `${value} km`
  },

  duration: {
    step: 'duration',
    type: FieldType.DURATION,
    dataKey: 'duration',
    prompt: '⏱ Please enter the duration (e.g., "2h 30m", "90m", "1.5h"):\n<i>Enter a dash (-) to clear/skip this field</i>',
    required: false,
    clearable: true,
    skippable: true,
    nextStep: 'speed',
    previousStep: 'distance',
    validator: (text) => {
      const result = parseDuration(text);
      if (result.error) {
        return { valid: false, error: result.error };
      }
      return { valid: true, value: result.duration };
    },
    formatter: (mins) => {
      if (!mins && mins !== 0) return '';
      const hours = Math.floor(mins / 60);
      const minutes = mins % 60;
      return `${hours}h ${minutes}m`;
    }
  },

  speed: {
    step: 'speed',
    type: FieldType.SPEED,
    dataKey: ['speedMin', 'speedMax'], // Multiple data keys
    prompt: '🚴 Please enter the speed range in km/h (e.g., 25-28) or skip:\n<i>Enter a dash (-) to clear/skip this field</i>',
    required: false,
    clearable: true,
    skippable: true,
    nextStep: 'meet',
    previousStep: 'duration',
    validator: (text) => {
      const [min, max] = text.split('-').map(s => parseFloat(s.trim()));
      return { 
        valid: true, 
        value: { 
          speedMin: !isNaN(min) ? min : null, 
          speedMax: !isNaN(max) ? max : null 
        } 
      };
    },
    formatter: (value, state) => {
      if (state.data.speedMin && state.data.speedMax) {
        return `${state.data.speedMin}-${state.data.speedMax} km/h`;
      } else if (state.data.speedMin) {
        return `min ${state.data.speedMin} km/h`;
      } else if (state.data.speedMax) {
        return `max ${state.data.speedMax} km/h`;
      }
      return '';
    },
    hasValue: (state) => state.data.speedMin || state.data.speedMax
  },

  meet: {
    step: 'meet',
    type: FieldType.TEXT,
    dataKey: 'meetingPoint',
    prompt: '📍 Please enter the meeting point (or skip):\n<i>Enter a dash (-) to clear/skip this field</i>',
    required: false,
    clearable: true,
    skippable: true,
    nextStep: 'info',
    previousStep: 'speed',
    validator: (text) => ({ valid: true, value: text })
  },

  info: {
    step: 'info',
    type: FieldType.TEXT,
    dataKey: 'additionalInfo',
    prompt: 'ℹ️ Please enter any additional information (or skip):\n<i>Enter a dash (-) to clear/skip this field</i>',
    required: false,
    clearable: true,
    skippable: true,
    nextStep: 'confirm',
    previousStep: 'meet',
    validator: (text) => ({ valid: true, value: text })
  }
};

/**
 * Get field configuration by step name
 * @param {string} step - Step name
 * @returns {Object|null} Field configuration or null if not found
 */
export function getFieldConfig(step) {
  return Object.values(WIZARD_FIELDS).find(field => field.step === step) || null;
}

/**
 * Get the first field configuration
 * @returns {Object} First field configuration
 */
export function getFirstField() {
  return WIZARD_FIELDS.title;
}

/**
 * Build ride data object from wizard state
 * @param {Object} wizardData - Wizard state data
 * @param {Object} metadata - Additional metadata (currentUser, originalRideId, etc.)
 * @returns {Object} Ride data object ready for storage
 */
export function buildRideDataFromWizard(wizardData, metadata = {}) {
  const { currentUser, originalRideId, isUpdate } = metadata;
  
  const rideData = {
    title: wizardData.title,
    category: wizardData.category,
    date: wizardData.datetime,
    organizer: wizardData.organizer,
    meetingPoint: wizardData.meetingPoint,
    routeLink: wizardData.routeLink,
    distance: wizardData.distance,
    duration: wizardData.duration,
    speedMin: wizardData.speedMin,
    speedMax: wizardData.speedMax,
    additionalInfo: wizardData.additionalInfo
  };
  
  if (isUpdate) {
    // For updates, add updatedBy
    rideData.updatedBy = currentUser;
  } else {
    // For new rides, add createdBy and initialize messages array
    rideData.createdBy = currentUser;
    rideData.messages = [];
  }
  
  return rideData;
}

/**
 * Confirmation display configuration
 * Defines how each field should be displayed in the confirmation step
 */
export const CONFIRMATION_FIELDS = [
  {
    label: '📝 Title',
    dataKey: 'title',
    required: true,
    format: (value, escapeHtml) => escapeHtml(value)
  },
  {
    label: '🚲 Category',
    dataKey: 'category',
    required: true,
    format: (value) => value || DEFAULT_CATEGORY
  },
  {
    label: '👤 Organizer',
    dataKey: 'organizer',
    required: true,
    format: (value, escapeHtml) => escapeHtml(value)
  },
  {
    label: '📅 When',
    dataKey: 'datetime',
    required: true,
    format: (value, escapeHtml, DateParser) => {
      const formattedDateTime = DateParser.formatDateTime(value);
      return `${formattedDateTime.date} at ${formattedDateTime.time}`;
    }
  },
  {
    label: '🔗 Route',
    dataKey: 'routeLink',
    required: false,
    format: (value, escapeHtml) => escapeHtml(value)
  },
  {
    label: '📏 Distance',
    dataKey: 'distance',
    required: false,
    format: (value) => `${value} km`
  },
  {
    label: '⏱ Duration',
    dataKey: 'duration',
    required: false,
    format: (value) => {
      const hours = Math.floor(value / 60);
      const minutes = value % 60;
      return `${hours}h ${minutes}m`;
    }
  },
  {
    label: '🚴 Speed',
    dataKey: ['speedMin', 'speedMax'],
    required: false,
    format: (value, escapeHtml, DateParser, data) => {
      const { speedMin, speedMax } = data;
      if (speedMin && speedMax) return `${speedMin}-${speedMax} km/h`;
      if (speedMin) return `min ${speedMin} km/h`;
      if (speedMax) return `max ${speedMax} km/h`;
      return null;
    }
  },
  {
    label: '📍 Meeting Point',
    dataKey: 'meetingPoint',
    required: false,
    format: (value, escapeHtml) => escapeHtml(value)
  },
  {
    label: 'ℹ️ Additional Info',
    dataKey: 'additionalInfo',
    required: false,
    format: (value, escapeHtml) => escapeHtml(value)
  }
];

/**
 * Build confirmation message from wizard data
 * @param {Object} wizardData - Wizard state data
 * @param {boolean} isUpdate - Whether this is an update or new ride
 * @param {Function} escapeHtml - HTML escape function
 * @param {Object} DateParser - Date parser utility
 * @returns {string} Formatted confirmation message
 */
export function buildConfirmationMessage(wizardData, isUpdate, escapeHtml, DateParser) {
  let message = `<b>Please confirm the ${isUpdate ? 'update' : 'ride'} details:</b>\n\n`;
  
  CONFIRMATION_FIELDS.forEach(field => {
    let value;
    
    // Get value(s)
    if (Array.isArray(field.dataKey)) {
      // Multiple keys (e.g., speedMin, speedMax)
      value = field.dataKey.some(key => wizardData[key] !== undefined && wizardData[key] !== null);
    } else {
      value = wizardData[field.dataKey];
    }
    
    // Skip optional fields that have no value
    if (!field.required && (!value || (Array.isArray(field.dataKey) && !value))) {
      return;
    }
    
    // Format the value
    const formattedValue = field.format(
      Array.isArray(field.dataKey) ? null : value,
      escapeHtml,
      DateParser,
      wizardData
    );
    
    if (formattedValue !== null && formattedValue !== undefined) {
      message += `${field.label}: ${formattedValue}\n`;
    }
  });
  
  return message;
}
