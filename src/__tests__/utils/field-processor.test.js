/**
 * @jest-environment node
 */

import { FieldProcessor } from '../../utils/FieldProcessor.js';

describe('FieldProcessor', () => {
  describe('processRideFields — settings.notifyParticipation', () => {
    it('maps settings.notifyParticipation:yes to nested settings', () => {
      const { data } = FieldProcessor.processRideFields({
        'settings.notifyParticipation': 'yes'
      });
      expect(data.settings).toEqual({ notifyParticipation: true });
    });

    it('maps settings.notifyParticipation:no to nested settings', () => {
      const { data } = FieldProcessor.processRideFields({
        'settings.notifyParticipation': 'no'
      });
      expect(data.settings).toEqual({ notifyParticipation: false });
    });

    it('accepts structured settings objects from AI parsing', () => {
      const { data } = FieldProcessor.processRideFields({
        settings: {
          notifyParticipation: false,
          allowReposts: true
        }
      });
      expect(data.settings).toEqual({ notifyParticipation: false, allowReposts: true });
    });

    it('maps settings.allowReposts to nested settings', () => {
      const { data } = FieldProcessor.processRideFields({
        'settings.allowReposts': 'yes'
      });
      expect(data.settings).toEqual({ allowReposts: true });
    });

    it('maps boolean-like values to true', () => {
      expect(FieldProcessor.parseBooleanSetting('true')).toBe(true);
      expect(FieldProcessor.parseBooleanSetting('1')).toBe(true);
      expect(FieldProcessor.parseBooleanSetting(true)).toBe(true);
    });

    it('maps other values to false', () => {
      expect(FieldProcessor.parseBooleanSetting('false')).toBe(false);
      expect(FieldProcessor.parseBooleanSetting('no')).toBe(false);
    });

    it('does not include settings when the param is absent', () => {
      const { data } = FieldProcessor.processRideFields({ title: 'Test' });
      expect(data).not.toHaveProperty('settings');
    });
  });

  describe('processSpeedField', () => {
    // Range
    it('parses a full range', () => {
      expect(FieldProcessor.processSpeedField('22-25', false)).toEqual({
        speedMin: 22,
        speedMax: 25
      });
    });

    it('keeps both bounds for a full range during updates', () => {
      expect(FieldProcessor.processSpeedField('22-25', true)).toEqual({
        speedMin: 22,
        speedMax: 25
      });
    });

    // Average (single number → min === max)
    it('treats a single number as average on create', () => {
      expect(FieldProcessor.processSpeedField('29', false)).toEqual({
        speedMin: 29,
        speedMax: 29
      });
    });

    it('treats a single number as average on update', () => {
      expect(FieldProcessor.processSpeedField('29', true)).toEqual({
        speedMin: 29,
        speedMax: 29
      });
    });

    it('treats ~-prefixed number as average', () => {
      expect(FieldProcessor.processSpeedField('~29', false)).toEqual({
        speedMin: 29,
        speedMax: 29
      });
    });

    // Minimum (explicit + or - suffix)
    it('parses min-only with + suffix', () => {
      expect(FieldProcessor.processSpeedField('25+', false)).toEqual({
        speedMin: 25
      });
    });

    it('parses min-only with - suffix', () => {
      expect(FieldProcessor.processSpeedField('25-', false)).toEqual({
        speedMin: 25
      });
    });

    it('clears max bound when updating with min+ form', () => {
      expect(FieldProcessor.processSpeedField('25+', true)).toEqual({
        speedMin: 25,
        speedMax: null
      });
    });

    // Maximum (- prefix)
    it('parses max-only with - prefix', () => {
      expect(FieldProcessor.processSpeedField('-25', false)).toEqual({
        speedMax: 25
      });
    });

    it('clears min bound when updating with max-only value', () => {
      expect(FieldProcessor.processSpeedField('-25', true)).toEqual({
        speedMin: null,
        speedMax: 25
      });
    });

    // Clear (update only)
    it('clears both bounds with dash on update', () => {
      expect(FieldProcessor.processSpeedField('-', true)).toEqual({
        speedMin: null,
        speedMax: null
      });
    });

    // Invalid
    it('returns empty object for non-numeric input', () => {
      expect(FieldProcessor.processSpeedField('abc', true)).toEqual({});
    });
  });
});
