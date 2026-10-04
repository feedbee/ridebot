import { parseMeetingPoints, normalizeMeetingFields, formatMeetingPoints, getMeetingPoints, getStartPoints } from '../../utils/start-points.js';
import { RideParamsHelper } from '../../utils/RideParamsHelper.js';

describe('meeting points input', () => {
  it('preserves plain multiline text unless it begins with a marker', () => {
    expect(parseMeetingPoints('Intro\nS1: Park').points).toEqual(['Intro\nS1: Park']);
  });
  it('sorts numeric markers stably, normalizes gaps, and preserves multiline contents', () => {
    expect(parseMeetingPoints('  s6: Park\nGate\nS1: Square\nS1: Station').points)
      .toEqual(['Square', 'Station', 'Park\nGate']);
  });
  it('accepts arbitrary numbers and rejects only excessive or empty points', () => {
    expect(parseMeetingPoints('S999: Park').points).toEqual(['Park']);
    expect(parseMeetingPoints(Array(6).fill('S1: Park').join('\n')).error).toBe('limit');
    expect(parseMeetingPoints('S1:\nS2: Park').error).toBe('empty');
  });
  it('uses repeated parameters as separate points without markers', () => {
    const { params } = RideParamsHelper.parseRideParams('/newride\nmeet: Park\nmeet: Square');
    expect(params.meet).toEqual(['Park', 'Square']);
    expect(parseMeetingPoints(params.meet).points).toEqual(['Park', 'Square']);
  });
  it('only recognizes markers at the beginning of a line, including CRLF and whitespace', () => {
    expect(parseMeetingPoints('S2: Park S1: a gate\r\n\tS1: Square').points)
      .toEqual(['Square', 'Park S1: a gate']);
    expect(parseMeetingPoints('S10: Ten\nS2: Two').points).toEqual(['Two', 'Ten']);
  });
  it('does not reinterpret scalar point contents when normalized again and escapes list text', () => {
    const fields = normalizeMeetingFields({ meetingPoint: 'S1: S99: Gate' });
    expect(fields.meetingPoints).toEqual(['S99: Gate']);
    expect(normalizeMeetingFields(fields)).toEqual(fields);
    expect(formatMeetingPoints(fields)).toBe('S99: Gate');
    expect(formatMeetingPoints({ meetingPoints: ['<Gate>', 'Park\n& Square'] }))
      .toBe('<ul><li>S1: &lt;Gate&gt;</li><li>S2: Park<br>&amp; Square</li></ul>');
  });

  it('reads legacy scalar meeting text literally without inventing selectable points', () => {
    for (const meetingPoint of ['S6: Park\nS1: Square', 'S1:', Array(6).fill('S1: Park').join('\n')]) {
      const ride = { meetingPoint };
      expect(getMeetingPoints(ride)).toEqual([meetingPoint]);
      expect(getStartPoints(ride)).toEqual([]);
      expect(formatMeetingPoints(ride)).toContain('S');
    }
  });

});
