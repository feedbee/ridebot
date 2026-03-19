import { parseDateTimeInput } from '../utils/date-input-parser.js';
import { RouteParser } from '../utils/route-parser.js';
import { parseDuration } from '../utils/duration-parser.js';
import {
  CATEGORY_CODES,
  normalizeCategory,
  DEFAULT_CATEGORY,
  getCategoryLabel
} from '../utils/category-utils.js';
import { DateParser } from '../utils/date-parser.js';
import { config } from '../config.js';
import { t } from '../i18n/index.js';
import { parseSpeedInput, formatSpeed } from '../utils/speed-utils.js';

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
  SPEED: 'speed',
  BOOLEAN: 'boolean'
};

function translate(language, key, params = {}) {
  return t(language, key, params, {
    fallbackLanguage: config.i18n.fallbackLanguage,
    withMissingMarker: config.isDev
  });
}

export function getWizardFields(language = config.i18n.defaultLanguage) {
  return {
    title: {
      step: 'title',
      type: FieldType.TEXT,
      dataKey: 'title',
      prompt: translate(language, 'wizard.prompts.title'),
      required: true,
      clearable: false,
      skippable: false,
      nextStep: 'category',
      previousStep: null,
      validator: (text) => {
        if (!text || text.trim() === '') {
          return { valid: false, error: translate(language, 'wizard.validation.titleRequired') };
        }
        return { valid: true, value: text };
      }
    },

    category: {
      step: 'category',
      type: FieldType.CATEGORY,
      dataKey: 'category',
      prompt: translate(language, 'wizard.prompts.category'),
      required: false,
      clearable: false,
      skippable: true,
      nextStep: 'organizer',
      previousStep: 'title',
      validator: (text) => {
        const normalized = normalizeCategory(text);
        return { valid: true, value: normalized };
      },
      options: [
        { label: getCategoryLabel(CATEGORY_CODES.ROAD, language), value: CATEGORY_CODES.ROAD },
        { label: getCategoryLabel(CATEGORY_CODES.GRAVEL, language), value: CATEGORY_CODES.GRAVEL },
        {
          label: getCategoryLabel(CATEGORY_CODES.MTB, language),
          value: CATEGORY_CODES.MTB
        },
        { label: getCategoryLabel(CATEGORY_CODES.MTB_XC, language), value: CATEGORY_CODES.MTB_XC },
        { label: getCategoryLabel(CATEGORY_CODES.E_BIKE, language), value: CATEGORY_CODES.E_BIKE },
        { label: getCategoryLabel(CATEGORY_CODES.VIRTUAL, language), value: CATEGORY_CODES.VIRTUAL }
      ]
    },

    organizer: {
      step: 'organizer',
      type: FieldType.TEXT,
      dataKey: 'organizer',
      prompt: translate(language, 'wizard.prompts.organizer'),
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
      prompt: translate(language, 'wizard.prompts.date'),
      required: true,
      clearable: false,
      skippable: false,
      nextStep: 'route',
      previousStep: 'organizer',
      validator: (text) => {
        const result = parseDateTimeInput(text, { language });
        if (!result.date) {
          return { valid: false, error: result.error };
        }
        return { valid: true, value: result.date };
      },
      formatter: (date) => {
        if (!(date instanceof Date) || isNaN(date)) return '';
        const formattedDateTime = DateParser.formatDateTime(date, language);
        return `${formattedDateTime.date} ${translate(language, 'formatter.atWord')} ${formattedDateTime.time}`;
      }
    },

    route: {
      step: 'route',
      type: FieldType.ROUTE,
      dataKey: 'routeLink',
      prompt: translate(language, 'wizard.prompts.route'),
      required: false,
      clearable: true,
      skippable: true,
      nextStep: 'distance',
      previousStep: 'date',
      validator: (text) => {
        if (!RouteParser.isValidRouteUrl(text)) {
          return {
            valid: false,
            error: translate(language, 'wizard.validation.routeInvalid')
          };
        }
        return { valid: true, value: text };
      },
      async postProcess(text, state) {
        if (RouteParser.isKnownProvider(text)) {
          const routeInfo = await RouteParser.parseRoute(text);

          if (routeInfo) {
            if (routeInfo.distance) state.data.distance = routeInfo.distance;
            if (routeInfo.duration) state.data.duration = routeInfo.duration;
          }
        }
        return 'distance';
      }
    },

    distance: {
      step: 'distance',
      type: FieldType.NUMBER,
      dataKey: 'distance',
      prompt: translate(language, 'wizard.prompts.distance'),
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
            error: translate(language, 'wizard.validation.distanceInvalid')
          };
        }
        return { valid: true, value: distance };
      },
      formatter: (value) => `${value} ${translate(language, 'formatter.units.km')}`
    },

    duration: {
      step: 'duration',
      type: FieldType.DURATION,
      dataKey: 'duration',
      prompt: translate(language, 'wizard.prompts.duration'),
      required: false,
      clearable: true,
      skippable: true,
      nextStep: 'speed',
      previousStep: 'distance',
      validator: (text) => {
        const result = parseDuration(text, { language });
        if (result.error) {
          return { valid: false, error: result.error };
        }
        return { valid: true, value: result.duration };
      },
      formatter: (mins) => {
        if (!mins && mins !== 0) return '';
        const hours = Math.floor(mins / 60);
        const minutes = mins % 60;
        return `${hours}${translate(language, 'formatter.units.hour')} ${minutes}${translate(language, 'formatter.units.min')}`;
      }
    },

    speed: {
      step: 'speed',
      type: FieldType.SPEED,
      dataKey: ['speedMin', 'speedMax'],
      prompt: translate(language, 'wizard.prompts.speed'),
      required: false,
      clearable: true,
      skippable: true,
      nextStep: 'meet',
      previousStep: 'duration',
      validator: (text) => {
        const parsed = parseSpeedInput(text);
        return {
          valid: true,
          value: {
            speedMin: parsed?.speedMin ?? null,
            speedMax: parsed?.speedMax ?? null
          }
        };
      },
      formatter: (value, state) => {
        return formatSpeed(state.data.speedMin, state.data.speedMax, language);
      },
      hasValue: (state) => state.data.speedMin || state.data.speedMax
    },

    meet: {
      step: 'meet',
      type: FieldType.TEXT,
      dataKey: 'meetingPoint',
      prompt: translate(language, 'wizard.prompts.meet'),
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
      prompt: translate(language, 'wizard.prompts.info'),
      required: false,
      clearable: true,
      skippable: true,
      nextStep: 'notify',
      previousStep: 'meet',
      validator: (text) => ({ valid: true, value: text })
    },

    notify: {
      step: 'notify',
      type: FieldType.BOOLEAN,
      dataKey: 'notifyOnParticipation',
      prompt: translate(language, 'wizard.prompts.notify'),
      required: true,
      clearable: false,
      skippable: false,
      nextStep: 'confirm',
      previousStep: 'info',
      options: [
        { label: translate(language, 'common.yes'), value: true },
        { label: translate(language, 'common.no'), value: false }
      ]
    }
  };
}

export const WIZARD_FIELDS = getWizardFields();

/**
 * Get field configuration by step name
 * @param {string} step - Step name
 * @param {string} language - Language code
 * @returns {Object|null} Field configuration or null if not found
 */
export function getFieldConfig(step, language = config.i18n.defaultLanguage) {
  const fields = language === config.i18n.defaultLanguage
    ? WIZARD_FIELDS
    : getWizardFields(language);
  return Object.values(fields).find(field => field.step === step) || null;
}

/**
 * Get the first field configuration
 * @param {string} language - Language code
 * @returns {Object} First field configuration
 */
export function getFirstField(language = config.i18n.defaultLanguage) {
  if (language === config.i18n.defaultLanguage) {
    return WIZARD_FIELDS.title;
  }
  return getWizardFields(language).title;
}

/**
 * Build ride data object from wizard state
 * @param {Object} wizardData - Wizard state data
 * @param {Object} metadata - Additional metadata (currentUser, originalRideId, etc.)
 * @returns {Object} Ride data object ready for storage
 */
export function buildRideDataFromWizard(wizardData, metadata = {}) {
  const { currentUser, isUpdate } = metadata;

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
    additionalInfo: wizardData.additionalInfo,
    notifyOnParticipation: wizardData.notifyOnParticipation ?? true
  };

  if (isUpdate) {
    rideData.updatedBy = currentUser;
  } else {
    rideData.createdBy = currentUser;
    rideData.messages = [];
  }

  return rideData;
}

