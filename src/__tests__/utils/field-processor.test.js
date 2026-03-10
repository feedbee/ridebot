/**
 * @jest-environment node
 */

import { FieldProcessor } from '../../utils/FieldProcessor.js';

describe('FieldProcessor', () => {
  describe('processRideFields — notify param', () => {
    it('maps notify:yes to notifyOnParticipation:true', () => {
      const { data } = FieldProcessor.processRideFields({ notify: 'yes' });
      expect(data.notifyOnParticipation).toBe(true);
    });

    it('maps notify:no to notifyOnParticipation:false', () => {
      const { data } = FieldProcessor.processRideFields({ notify: 'no' });
      expect(data.notifyOnParticipation).toBe(false);
    });

    it('maps notify:true to notifyOnParticipation:true', () => {
      const { data } = FieldProcessor.processRideFields({ notify: 'true' });
      expect(data.notifyOnParticipation).toBe(true);
    });

    it('maps notify:1 to notifyOnParticipation:true', () => {
      const { data } = FieldProcessor.processRideFields({ notify: '1' });
      expect(data.notifyOnParticipation).toBe(true);
    });

    it('maps notify:false to notifyOnParticipation:false', () => {
      const { data } = FieldProcessor.processRideFields({ notify: 'false' });
      expect(data.notifyOnParticipation).toBe(false);
    });

    it('does not include notifyOnParticipation when notify param absent', () => {
      const { data } = FieldProcessor.processRideFields({ title: 'Test' });
      expect(data).not.toHaveProperty('notifyOnParticipation');
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
