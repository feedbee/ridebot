/**
 * @jest-environment node
 */

import { RideParamsHelper } from '../../utils/RideParamsHelper.js';

describe('RideParamsHelper', () => {
  describe('VALID_PARAMS', () => {
    it('should define all required ride parameters', () => {
      expect(RideParamsHelper.VALID_PARAMS).toBeDefined();
      expect(Object.keys(RideParamsHelper.VALID_PARAMS)).toContain('title');
      expect(Object.keys(RideParamsHelper.VALID_PARAMS)).toContain('when');
      expect(Object.keys(RideParamsHelper.VALID_PARAMS)).toContain('meet');
      expect(Object.keys(RideParamsHelper.VALID_PARAMS)).toContain('route');
      expect(Object.keys(RideParamsHelper.VALID_PARAMS)).toContain('dist');
      expect(Object.keys(RideParamsHelper.VALID_PARAMS)).toContain('duration');
      expect(Object.keys(RideParamsHelper.VALID_PARAMS)).toContain('speed');
      expect(Object.keys(RideParamsHelper.VALID_PARAMS)).toContain('info');
      expect(Object.keys(RideParamsHelper.VALID_PARAMS)).toContain('category');
      expect(Object.keys(RideParamsHelper.VALID_PARAMS)).toContain('id');
    });

    it('should provide descriptions for all parameters', () => {
      Object.values(RideParamsHelper.VALID_PARAMS).forEach(description => {
        expect(typeof description).toBe('string');
        expect(description.length).toBeGreaterThan(0);
      });
    });
  });

  describe('parseRideParams', () => {
    it('should parse ride parameters from text', () => {
      const text = `/newride
title: Sunday Morning Ride
when: Sunday 9am
meet: Coffee Shop
route: https://example.com/route
speed: 25-28
info: Bring water and snacks`;
      
      const { params, unknownParams } = RideParamsHelper.parseRideParams(text);
      
      expect(params).toEqual({
        title: 'Sunday Morning Ride',
        when: 'Sunday 9am',
        meet: 'Coffee Shop',
        route: 'https://example.com/route',
        speed: '25-28',
        info: 'Bring water and snacks'
      });
      expect(unknownParams).toHaveLength(0);
    });

    it('should handle malformed parameter lines', () => {
      const text = `/newride
title: Sunday Morning Ride
when: Sunday 9am
This line has no parameter
meet: Coffee Shop`;
      
      const { params, unknownParams } = RideParamsHelper.parseRideParams(text);
      
      expect(params).toEqual({
        title: 'Sunday Morning Ride',
        when: 'Sunday 9am',
        meet: 'Coffee Shop'
      });
      expect(unknownParams).toEqual(['This line has no parameter']);
    });

    it('should identify unknown parameters', () => {
      const text = `/newride
title: Sunday Morning Ride
when: Sunday 9am
location: Coffee Shop
pace: fast
weather: sunny`;
      
      const { params, unknownParams } = RideParamsHelper.parseRideParams(text);
      
      expect(params).toEqual({
        title: 'Sunday Morning Ride',
        when: 'Sunday 9am'
      });
      expect(unknownParams).toEqual(['location', 'pace', 'weather']);
    });

    it('should handle empty input', () => {
      const text = `/newride`;
      
      const { params, unknownParams } = RideParamsHelper.parseRideParams(text);
      
      expect(params).toEqual({});
      expect(unknownParams).toHaveLength(0);
    });

    it('should trim parameter values', () => {
      const text = `/newride
title:    Ride with spaces    
when:  10am   
meet:   Coffee Shop   `;
      
      const { params } = RideParamsHelper.parseRideParams(text);
      
      expect(params).toEqual({
        title: 'Ride with spaces',
        when: '10am',
        meet: 'Coffee Shop'
      });
    });

    it('should normalize parameter keys to lowercase', () => {
      const text = `/newride
TITLE: Test Ride
WHEN: 10am
Meet: Coffee Shop`;
      
      const { params } = RideParamsHelper.parseRideParams(text);
      
      expect(params).toEqual({
        title: 'Test Ride',
        when: '10am',
        meet: 'Coffee Shop'
      });
    });
  });
}); 
