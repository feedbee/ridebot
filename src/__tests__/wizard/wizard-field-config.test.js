/**
 * @jest-environment node
 * 
 * Tests for wizardFieldConfig.js
 */

import { jest } from '@jest/globals';
import {
  FieldType,
  WIZARD_FIELDS,
  getFieldConfig,
  getFirstField,
  buildRideDataFromWizard,
} from '../../wizard/wizardFieldConfig.js';
import { DEFAULT_CATEGORY } from '../../utils/category-utils.js';
import { getCategoryLabel } from '../../utils/category-utils.js';
import { DateParser } from '../../utils/date-parser.js';
import { escapeHtml } from '../../utils/html-escape.js';
import { RouteParser } from '../../utils/route-parser.js';
import { t } from '../../i18n/index.js';

describe('wizardFieldConfig', () => {
  const tr = (key, params = {}) => t('en', key, params, { fallbackLanguage: 'en' });
  describe('FieldType', () => {
    it('should export all field types', () => {
      expect(FieldType.TEXT).toBe('text');
      expect(FieldType.CATEGORY).toBe('category');
      expect(FieldType.DATE).toBe('date');
      expect(FieldType.ROUTE).toBe('route');
      expect(FieldType.NUMBER).toBe('number');
      expect(FieldType.DURATION).toBe('duration');
      expect(FieldType.SPEED).toBe('speed');
      expect(FieldType.BOOLEAN).toBe('boolean');
    });
  });

  describe('WIZARD_FIELDS', () => {
    it('should have configuration for all fields', () => {
      expect(WIZARD_FIELDS.title).toBeDefined();
      expect(WIZARD_FIELDS.category).toBeDefined();
      expect(WIZARD_FIELDS.organizer).toBeDefined();
      expect(WIZARD_FIELDS.date).toBeDefined();
      expect(WIZARD_FIELDS.route).toBeDefined();
      expect(WIZARD_FIELDS.distance).toBeDefined();
      expect(WIZARD_FIELDS.duration).toBeDefined();
      expect(WIZARD_FIELDS.speed).toBeDefined();
      expect(WIZARD_FIELDS.meet).toBeDefined();
      expect(WIZARD_FIELDS.info).toBeDefined();
    });

    it('should have required properties for each field', () => {
      Object.values(WIZARD_FIELDS).forEach(field => {
        expect(field.step).toBeDefined();
        expect(field.type).toBeDefined();
        expect(field.dataKey).toBeDefined();
        expect(field.prompt).toBeDefined();
        expect(typeof field.required).toBe('boolean');
        expect(typeof field.clearable).toBe('boolean');
        expect(typeof field.skippable).toBe('boolean');
      });
    });
  });

  describe('getFieldConfig', () => {
    it('should return field configuration for valid step', () => {
      const config = getFieldConfig('title');
      expect(config).toBeDefined();
      expect(config.step).toBe('title');
      expect(config.type).toBe(FieldType.TEXT);
    });

    it('should return null for invalid step', () => {
      const config = getFieldConfig('invalid_step');
      expect(config).toBeNull();
    });

    it('should return null for confirm step', () => {
      const config = getFieldConfig('confirm');
      expect(config).toBeNull();
    });
  });

  describe('title field', () => {
    it('should validate non-empty title', () => {
      const result = WIZARD_FIELDS.title.validator('Evening Ride');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('Evening Ride');
    });

    it('should reject empty title', () => {
      const result = WIZARD_FIELDS.title.validator('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe(tr('wizard.validation.titleRequired'));
    });

    it('should reject whitespace-only title', () => {
      const result = WIZARD_FIELDS.title.validator('   ');
      expect(result.valid).toBe(false);
      expect(result.error).toBe(tr('wizard.validation.titleRequired'));
    });

    it('should be required and not clearable', () => {
      expect(WIZARD_FIELDS.title.required).toBe(true);
      expect(WIZARD_FIELDS.title.clearable).toBe(false);
      expect(WIZARD_FIELDS.title.skippable).toBe(false);
    });
  });

  describe('date field', () => {
    it('should validate valid date input', () => {
      const result = WIZARD_FIELDS.date.validator('tomorrow at 6pm');
      expect(result.valid).toBe(true);
      expect(result.value).toBeInstanceOf(Date);
    });

    it('should reject invalid date input', () => {
      const result = WIZARD_FIELDS.date.validator('invalid date');
      expect(result.valid).toBe(false);
      expect(result.error).toContain(tr('parsers.date.invalidFormat'));
    });

    it('should reject past dates', () => {
      const result = WIZARD_FIELDS.date.validator('yesterday');
      expect(result.valid).toBe(false);
      expect(result.error).toBe(tr('parsers.date.pastDate'));
    });

    it('should be required', () => {
      expect(WIZARD_FIELDS.date.required).toBe(true);
      expect(WIZARD_FIELDS.date.clearable).toBe(false);
    });
  });

  describe('distance field', () => {
    it('should validate positive numbers', () => {
      const result = WIZARD_FIELDS.distance.validator('50');
      expect(result.valid).toBe(true);
      expect(result.value).toBe(50);
    });

    it('should validate decimal numbers', () => {
      const result = WIZARD_FIELDS.distance.validator('35.5');
      expect(result.valid).toBe(true);
      expect(result.value).toBe(35.5);
    });

    it('should accept negative numbers as valid numbers', () => {
      // The actual validator only checks if it's a valid number, not if it's positive
      const result = WIZARD_FIELDS.distance.validator('-10');
      expect(result.valid).toBe(true);
      expect(result.value).toBe(-10);
    });

    it('should accept zero as a valid number', () => {
      // The actual validator only checks if it's a valid number
      const result = WIZARD_FIELDS.distance.validator('0');
      expect(result.valid).toBe(true);
      expect(result.value).toBe(0);
    });

    it('should reject non-numeric input', () => {
      const result = WIZARD_FIELDS.distance.validator('abc');
      expect(result.valid).toBe(false);
      expect(result.error).toBe(tr('wizard.validation.distanceInvalid'));
    });

    it('should be optional and clearable', () => {
      expect(WIZARD_FIELDS.distance.required).toBe(false);
      expect(WIZARD_FIELDS.distance.clearable).toBe(true);
      expect(WIZARD_FIELDS.distance.skippable).toBe(true);
    });
  });

  describe('duration field', () => {
    it('should validate minutes as number', () => {
      const result = WIZARD_FIELDS.duration.validator('120');
      expect(result.valid).toBe(true);
      expect(result.value).toBe(120);
    });

    it('should validate human-readable format', () => {
      const result = WIZARD_FIELDS.duration.validator('2h 30m');
      expect(result.valid).toBe(true);
      expect(result.value).toBe(150); // 2.5 hours * 60
    });

    it('should reject invalid duration format', () => {
      const result = WIZARD_FIELDS.duration.validator('invalid');
      expect(result.valid).toBe(false);
      expect(result.error).toContain(tr('parsers.duration.invalidFormat'));
    });

    it('should be optional and clearable', () => {
      expect(WIZARD_FIELDS.duration.required).toBe(false);
      expect(WIZARD_FIELDS.duration.clearable).toBe(true);
    });
  });

  describe('speed field', () => {
    it('should validate speed range', () => {
      const result = WIZARD_FIELDS.speed.validator('25-30');
      expect(result.valid).toBe(true);
      expect(result.value.speedMin).toBe(25);
      expect(result.value.speedMax).toBe(30);
    });

    it('should validate single speed value as average (min === max)', () => {
      const result = WIZARD_FIELDS.speed.validator('25');
      expect(result.valid).toBe(true);
      expect(result.value.speedMin).toBe(25);
      expect(result.value.speedMax).toBe(25);
    });

    it('should accept any input (validation is lenient)', () => {
      // The actual validator accepts most inputs
      const result = WIZARD_FIELDS.speed.validator('abc');
      expect(result.valid).toBe(true);
    });

    it('should accept negative speeds (validation is lenient)', () => {
      const result = WIZARD_FIELDS.speed.validator('-10');
      expect(result.valid).toBe(true);
    });

    it('should accept reversed range (validation is lenient)', () => {
      const result = WIZARD_FIELDS.speed.validator('30-25');
      expect(result.valid).toBe(true);
    });

    it('should be optional and clearable', () => {
      expect(WIZARD_FIELDS.speed.required).toBe(false);
      expect(WIZARD_FIELDS.speed.clearable).toBe(true);
    });
  });

  describe('route field', () => {
    it('should validate route URLs', () => {
      const result = WIZARD_FIELDS.route.validator('https://strava.com/route/123');
      expect(result.valid).toBe(true);
      expect(result.value).toEqual([{ url: 'https://strava.com/route/123' }]);
    });

    it('should validate URLs as valid routes', () => {
      const result = WIZARD_FIELDS.route.validator('Custom route description');
      // Route field requires a URL-like format
      expect(result).toBeDefined();
    });

    it('should be optional and clearable', () => {
      expect(WIZARD_FIELDS.route.required).toBe(false);
      expect(WIZARD_FIELDS.route.clearable).toBe(true);
    });

    it('should post-process known route with distance and duration and prefill distance step', async () => {
      jest.spyOn(RouteParser, 'isKnownProvider').mockReturnValueOnce(true);
      jest.spyOn(RouteParser, 'parseRoute').mockResolvedValueOnce({ distance: 60, duration: 150 });
      const state = { data: { routes: [{ url: 'https://strava.com/routes/1' }] } };

      const nextStep = await WIZARD_FIELDS.route.postProcess('https://strava.com/routes/1', state);

      expect(state.data.distance).toBe(60);
      expect(state.data.duration).toBe(150);
      expect(nextStep).toBe('distance');
    });

    it('should post-process known route with only distance and prefill distance step', async () => {
      jest.spyOn(RouteParser, 'isKnownProvider').mockReturnValueOnce(true);
      jest.spyOn(RouteParser, 'parseRoute').mockResolvedValueOnce({ distance: 42 });
      const state = { data: { routes: [{ url: 'https://strava.com/routes/2' }] } };

      const nextStep = await WIZARD_FIELDS.route.postProcess('https://strava.com/routes/2', state);

      expect(state.data.distance).toBe(42);
      expect(state.data.duration).toBeUndefined();
      expect(nextStep).toBe('distance');
    });

    it('should replace stale distance and duration when route changes and new metrics are available', async () => {
      jest.spyOn(RouteParser, 'isKnownProvider').mockReturnValueOnce(true);
      jest.spyOn(RouteParser, 'parseRoute').mockResolvedValueOnce({ distance: 88, duration: 240 });
      const state = {
        data: {
          routes: [{ url: 'https://strava.com/routes/new' }],
          distance: 45,
          duration: 90
        }
      };

      const nextStep = await WIZARD_FIELDS.route.postProcess('https://strava.com/routes/new', state);

      expect(state.data.distance).toBe(88);
      expect(state.data.duration).toBe(240);
      expect(nextStep).toBe('distance');
    });

    it('should keep existing distance and duration when new route provides no metrics', async () => {
      jest.spyOn(RouteParser, 'isKnownProvider').mockReturnValueOnce(true);
      jest.spyOn(RouteParser, 'parseRoute').mockResolvedValueOnce(null);
      const state = {
        data: {
          routes: [{ url: 'https://strava.com/routes/new' }],
          distance: 45,
          duration: 90
        }
      };

      await WIZARD_FIELDS.route.postProcess('https://strava.com/routes/new', state);

      expect(state.data.distance).toBe(45);
      expect(state.data.duration).toBe(90);
    });

    it('should format current route values as readable lines', () => {
      const formatted = WIZARD_FIELDS.route.formatter([
        { url: 'https://www.strava.com/routes/1' },
        { label: 'Short option', url: 'https://ridewithgps.com/routes/2' }
      ]);

      expect(formatted).toBe(
        'Strava | https://www.strava.com/routes/1\nShort option | https://ridewithgps.com/routes/2'
      );
    });
  });

  describe('organizer field', () => {
    it('should validate organizer name', () => {
      const result = WIZARD_FIELDS.organizer.validator('John Doe');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('John Doe');
    });

    it('should be optional and clearable', () => {
      expect(WIZARD_FIELDS.organizer.required).toBe(false);
      expect(WIZARD_FIELDS.organizer.clearable).toBe(true);
    });
  });

  describe('meet field', () => {
    it('should validate meeting point', () => {
      const result = WIZARD_FIELDS.meet.validator('City Center');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('City Center');
    });

    it('should be optional and clearable', () => {
      expect(WIZARD_FIELDS.meet.required).toBe(false);
      expect(WIZARD_FIELDS.meet.clearable).toBe(true);
    });
  });

  describe('info field', () => {
    it('should validate additional info', () => {
      const result = WIZARD_FIELDS.info.validator('Bring lights and water');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('Bring lights and water');
    });

    it('should be optional and clearable', () => {
      expect(WIZARD_FIELDS.info.required).toBe(false);
      expect(WIZARD_FIELDS.info.clearable).toBe(true);
    });
  });

  describe('helper builders', () => {
    it('should return title as first field', () => {
      expect(getFirstField()).toBe(WIZARD_FIELDS.title);
    });

    it('should build ride data for create and update modes', () => {
      const wizardData = {
        title: 'Ride',
        category: 'road',
        datetime: new Date('2025-10-10T18:00:00Z')
      };

      const createData = buildRideDataFromWizard(wizardData, { currentUser: 10, isUpdate: false });
      expect(createData.createdBy).toBe(10);
      expect(createData.messages).toEqual([]);
      expect(createData.updatedBy).toBeUndefined();

      const updateData = buildRideDataFromWizard(wizardData, { currentUser: 11, isUpdate: true });
      expect(updateData.updatedBy).toBe(11);
      expect(updateData.createdBy).toBeUndefined();
    });
  });

  describe('field navigation', () => {
    it('should define correct next steps', () => {
      expect(WIZARD_FIELDS.title.nextStep).toBe('category');
      expect(WIZARD_FIELDS.category.nextStep).toBe('organizer');
      expect(WIZARD_FIELDS.organizer.nextStep).toBe('date');
      expect(WIZARD_FIELDS.date.nextStep).toBe('route');
      expect(WIZARD_FIELDS.meet.nextStep).toBe('info');
      expect(WIZARD_FIELDS.info.nextStep).toBe('confirm');
    });

    it('should define correct previous steps', () => {
      expect(WIZARD_FIELDS.title.previousStep).toBeNull();
      expect(WIZARD_FIELDS.category.previousStep).toBe('title');
      expect(WIZARD_FIELDS.organizer.previousStep).toBe('category');
      expect(WIZARD_FIELDS.date.previousStep).toBe('organizer');
    });
  });

  describe('buildRideDataFromWizard', () => {
    it('does not include ride settings in wizard output', () => {
      const data = buildRideDataFromWizard({ title: 'Ride', datetime: new Date() }, {});
      expect(data).not.toHaveProperty('notifyOnParticipation');
      expect(data).not.toHaveProperty('settings');
    });
  });
});
