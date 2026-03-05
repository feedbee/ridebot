/**
 * @jest-environment node
 */

import { FieldProcessor } from '../../utils/FieldProcessor.js';

describe('FieldProcessor', () => {
  describe('processSpeedField', () => {
    it('keeps both bounds for a full range during updates', () => {
      expect(FieldProcessor.processSpeedField('22-25', true)).toEqual({
        speedMin: 22,
        speedMax: 25
      });
    });

    it('clears max bound when updating a range with a single value', () => {
      expect(FieldProcessor.processSpeedField('29', true)).toEqual({
        speedMin: 29,
        speedMax: null
      });
    });

    it('clears min bound when updating with a max-only value', () => {
      expect(FieldProcessor.processSpeedField('-25', true)).toEqual({
        speedMin: null,
        speedMax: 25
      });
    });

    it('does not force-clear values when input contains no numeric bounds', () => {
      expect(FieldProcessor.processSpeedField('abc', true)).toEqual({});
    });

    it('does not add null bounds on create for a single value', () => {
      expect(FieldProcessor.processSpeedField('29', false)).toEqual({
        speedMin: 29
      });
    });
  });
});
