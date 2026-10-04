import { escapeHtml } from './html-escape.js';
import { getPaceGroups } from './pace-groups.js';

export const START_POINT_NAMES = ['S1', 'S2', 'S3', 'S4', 'S5'];

/** Parse explicit point arrays or marked text, preserving ordinary multiline input.
 * @param {string|string[]} input
 * @returns {{points?: string[], error?: string}}
 */
export function parseMeetingPoints(input) {
  let points;
  if (Array.isArray(input)) {
    points = input.map(value => typeof value === 'string' ? value.trim() : '');
  } else if (typeof input === 'string') {
    const text = input.trim();
    if (!/^s\d+:/i.test(text)) return { points: text ? [text] : [] };
    const markers = [...text.matchAll(/^[^\S\r\n]*s(\d+):/gim)];
    points = markers.map((marker, index) => ({
      number: BigInt(marker[1]),
      text: text.slice(marker.index + marker[0].length, markers[index + 1]?.index ?? text.length).trim()
    })).sort((a, b) => a.number < b.number ? -1 : a.number > b.number ? 1 : 0).map(point => point.text);
  } else return { error: 'empty' };
  if (points.length > 5) return { error: 'limit' };
  if (points.some(point => !point)) return { error: 'empty' };
  return { points };
}

/** Encode canonical text for legacy consumers and wizard editing.
 * @param {string[]} points
 * @returns {string}
 */
export function meetingPointsToInput(points) {
  return points.length > 1 ? points.map((point, index) => `S${index + 1}: ${point}`).join('\n') : points[0] || '';
}

/** Normalize meeting patches at the persistence boundary.
 * @param {Object} fields
 * @returns {Object}
 */
export function normalizeMeetingFields(fields) {
  if (fields.meetingPoint === undefined && fields.meetingPoints === undefined) return fields;
  const parsed = parseMeetingPoints(fields.meetingPoints ?? fields.meetingPoint ?? '');
  if (parsed.error) throw new Error(`Invalid meeting points: ${parsed.error}`);
  return { ...fields, meetingPoint: meetingPointsToInput(parsed.points),
    meetingPoints: parsed.points };
}

/** Read normalized points, preserving legacy scalar text literally.
 * @param {Object} ride
 * @returns {string[]}
 */
export function getMeetingPoints(ride) {
  if (Array.isArray(ride?.meetingPoints)) return ride.meetingPoints;
  return ride?.meetingPoint ? [ride.meetingPoint] : [];
}

/** Derive selectable names only when several points exist.
 * @param {Object} ride
 * @returns {string[]}
 */
export function getStartPoints(ride) {
  const points = getMeetingPoints(ride);
  return points.length > 1 ? START_POINT_NAMES.slice(0, points.length) : [];
}

/** Render scalar text or a native list without surrounding spacing.
 * @param {Object} ride
 * @returns {string}
 */
export function formatMeetingPoints(ride) {
  const points = getMeetingPoints(ride);
  return points.length > 1 ? `<ul>${points.map((point, index) => `<li>S${index + 1}: ${escapeHtml(point).replace(/\r\n?|\n/g, '<br>')}</li>`).join('')}</ul>` : escapeHtml(points[0] || '').replace(/\r\n?|\n/g, '<br>');
}

/** Choose a single localized prompt for missing optional selections.
 * @param {Object} ride
 * @param {Object} person
 * @returns {string|null}
 */
export function selectionPromptKey(ride, person) {
  const pace = getPaceGroups(ride).length && !person?.paceGroup;
  const start = getStartPoints(ride).length && !person?.startPoint;
  return pace && start ? 'startPoints.chooseBoth' : start ? 'startPoints.choose' : pace ? 'paceGroups.choose' : null;
}
