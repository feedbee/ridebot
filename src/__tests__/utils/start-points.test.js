import { parseMeetingPoints, normalizeMeetingFields, formatMeetingPoints, getMeetingPoints, getStartPoints } from '../../utils/start-points.js';
import { RideParamsHelper } from '../../utils/RideParamsHelper.js';

describe('meeting points input', () => {
  it.each([
    'https://maps.app.goo.gl/BvBKw3nji6VmDuLa7',
    'https://www.google.com/maps/place/50%C2%B053\'25.9%22N+15%C2%B019\'52.1%22E/@50.890537,15.331147,17z/data=!3m1!4b1!4m4!3m3!8m2!3d50.890537!4d15.331147?entry=ttu&g_ep=EgoyMDI2MDkzMC4wIKXMDSoASAFQAw%3D%3D',
    'https://www.google.com/maps/place/Punkt+widokowy+%E2%80%9EPanorama+%C5%9Awieradowa%E2%80%9D/@50.890537,15.331147,17z/data=!4m12!1m5!3m4!2zNTDCsDUzJzI1LjkiTiAxNcKwMTknNTIuMSJF!8m2!3d50.890537!4d15.331147!3m5!1s0x470ed31646ae64bf:0xdeaff2eb43a66c8c!8m2!3d50.8905526!4d15.3345544!16s%2Fg%2F11fvmhq644?entry=ttu&g_ep=EgoyMDI2MDkzMC4wIKXMDSoASAFQAw%3D%3D',
    'https://www.google.com/maps/@50.890537,15.331147,17z?entry=ttu&g_ep=EgoyMDI2MDkzMC4wIKXMDSoASAFQAw%3D%3D'
  ])('renders Google Maps with a short label and the original URL: %s', url => {
    const escapedUrl = url.replace(/&/g, '&amp;').replace(/'/g, '&#039;');
    const link = `<a href="${escapedUrl}">[Google Maps]</a>`;
    expect(formatMeetingPoints({ meetingPoint: `Gate <north>\n${url} by the fountain` }))
      .toBe(`Gate &lt;north&gt;<br>${link} by the fountain`);
    expect(formatMeetingPoints({ meetingPoints: [url, `Park ${url}`] }))
      .toBe(`<ul><li>S1: ${link}</li><li>S2: Park ${link}</li></ul>`);
  });

  it('leaves other URLs and HTML input as escaped text', () => {
    const text = 'https://www.google.com/search https://maps.app.goo.gl.evil.test/x <a href="https://evil.test">Map</a>';
    expect(formatMeetingPoints({ meetingPoint: text })).toBe(
      'https://www.google.com/search https://maps.app.goo.gl.evil.test/x &lt;a href=&quot;https://evil.test&quot;&gt;Map&lt;/a&gt;');
  });

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
