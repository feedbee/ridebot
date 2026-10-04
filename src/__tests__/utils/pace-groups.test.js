import { parseSpeedField, getPaceGroups, speedFieldToInput, normalizeSpeedFields } from '../../utils/pace-groups.js';
import { RideParamsHelper } from '../../utils/RideParamsHelper.js';
import { StravaEventParser } from '../../utils/strava-event-parser.js';

describe('pace group speed input', () => {
  it('collects repeated speed parameters in source order without changing other parameters', () => {
    const { params } = RideParamsHelper.parseRideParams('/newride\nspeed: 25\ntitle: Ride\nspeed: 20-22\ncruisingSpeed: 30+');
    expect(params.speed).toEqual(['25', '20-22']);
    expect(params.cruisingSpeed).toBe('30+');
  });

  it('normalizes singletons and shares scalar grammar with multiline input', () => {
    expect(parseSpeedField(['25']).data).toEqual({ speedMin: 25, speedMax: 25, speedGroups: [] });
    expect(parseSpeedField('25+\n\n-28\n20-22').data.speedGroups).toEqual([
      { min: 25, max: null }, { min: null, max: 28 }, { min: 20, max: 22 }
    ]);
  });

  it('rejects malformed elements and excessive lists without partial output', () => {
    expect(parseSpeedField(['25', 'fast'])).toMatchObject({ data: null, error: 'invalid', index: 2 });
    for (const input of [[], [''], ['25', null], ['25', '-'], [25], ['25','25','25','25','25','25']]) {
      expect(parseSpeedField(input).data).toBeNull();
    }
    expect(parseSpeedField('-', 'speed', true).data).toEqual({ speedMin: null, speedMax: null, speedGroups: [] });
  });

  it('derives groups by maximum list length, keeps input order, and round trips', () => {
    const ride = { ...parseSpeedField(['30', '20']).data, ...parseSpeedField(['35', '25', '15'], 'cruisingSpeed').data };
    expect(getPaceGroups(ride)).toEqual(['A', 'B', 'C']);
    expect(speedFieldToInput(ride, 'speed')).toEqual(['30', '20']);
    expect(getPaceGroups({ speedMin: 25, speedMax: 30 })).toEqual([]);
  });

  it('normalizes direct persisted patches and rejects malformed speed-group bounds', () => {
    expect(normalizeSpeedFields({ speedMin: 25 })).toEqual({ speedMin: 25, speedGroups: [] });
    expect(normalizeSpeedFields({ speedGroups: [{ min: null, max: 28 }] })).toEqual({ speedGroups: [], speedMin: null, speedMax: 28 });
    for (const groups of [[{ min: 30, max: 20 }], [{ min: null, max: null }], [{ min: '25', max: 30 }], Array(6).fill({ min: 25, max: 25 })]) {
      expect(() => normalizeSpeedFields({ speedGroups: groups })).toThrow();
    }
  });

  it('imports only the first five Strava source entries and skips malformed entries safely', () => {
    const groups = [null, { pace: '30' }, { pace: 25.4, range: 1.1 }, { pace: 20, range: -1 }, { target_pace_metric: 15, pace_range_metric: 0 }, { pace: 10 }];
    expect(StravaEventParser.extractSpeedFields(groups, 'speed').cruisingSpeedGroups).toEqual([{ min: 24, max: 27 }, { min: 15, max: 15 }]);
    expect(StravaEventParser.extractSpeedFields(groups, 'pace')).toEqual({});
    expect(StravaEventParser.extractSpeedFields({}, 'speed')).toEqual({});
    expect(StravaEventParser.extractSpeedFields([{ pace: 25 }], 'speed')).toEqual({ cruisingSpeedMin: 25, cruisingSpeedMax: 25, cruisingSpeedGroups: [] });
  });

  it('keeps numeric Strava bounds numeric instead of reparsing exponent notation', () => {
    expect(StravaEventParser.extractSpeedFields([{ pace: 1e22 }, { pace: 25 }], 'speed').cruisingSpeedGroups)
      .toEqual([{ min: 1e22, max: 1e22 }, { min: 25, max: 25 }]);
  });
});
