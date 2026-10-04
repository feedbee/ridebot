import * as cheerio from 'cheerio';
import { normalizeRichLists, richListMessage } from '../../utils/rich-lists.js';
import { MessageFormatter } from '../../formatters/MessageFormatter.js';

describe('ride section spacing around native lists', () => {
  it('preserves a blank line after a list without adding one between its heading and items', () => {
    expect(normalizeRichLists('<p>Speed:<br><ul><li>A: 25</li></ul><br><br>Info</p>'))
      .toBe('<p>Speed:</p><ul><li>A: 25</li></ul><p>&#8288;<br>Info</p>');
    expect(normalizeRichLists('<p>Joined:<br><ul><li>A: Rider</li></ul><br>Thinking:<br><ul><li>B: Rider</li></ul><br><br>Share</p>'))
      .toContain('</ul><p>&#8288;<br>Share</p>');
    expect(normalizeRichLists('<p>Speed:<br><ul><li>A: 25</li></ul><br>Next field</p>'))
      .toContain('</ul><p>Next field</p>');
  });

  it.each(['en', 'ru'])('retains gaps before info and sharing in grouped and ordinary announcements (%s)', language => {
    const formatter = new MessageFormatter();
    const ride = { id: 'ride123', title: 'Ride', date: new Date('2099-01-01'),
      additionalInfo: 'SECTION_INFO', speedMin: 25, speedMax: 25 };
    const person = { userId: 1, firstName: 'Rider', paceGroup: 'A' };
    const ordinary = formatter.formatRideMessage(ride, { joined: [person] }, { lang: language, isForCreator: true });
    const share = formatter.translate('formatter.shareLine', { id: ride.id }, language);
    expect(ordinary).toContain('<br><br>ℹ️');
    expect(ordinary).toContain(`<br><br>${share}`);
    const grouped = formatter.formatRideMessage({ ...ride, speedGroups: [{ min: 25, max: 25 }, { min: 20, max: 20 }] },
      { joined: [person] }, { lang: language, isForCreator: true });
    expect(grouped).toContain('</ul><p>&#8288;<br>ℹ️');
    expect(grouped).toContain(`</ul><p>&#8288;<br>${share}`);
    expect(grouped).not.toContain('<br><ul>');
    // Leading newline trimming must leave the explicit empty first line intact.
    const $ = cheerio.load(grouped);
    const info = $('p').filter((_, element) => $(element).text().includes('SECTION_INFO')).first();
    expect(info.html().replace(/<br>/g, '\n').trimStart()).toMatch(/^\u2060\n/);
  });

  it('keeps explicit section gaps in line-oriented rich previews', () => {
    expect(richListMessage('Speed:<ul><li>A: 25</li></ul>\n\nInfo').html)
      .toBe('Speed:<ul><li>A: 25</li></ul>&#8288;<br>Info');
  });
});
