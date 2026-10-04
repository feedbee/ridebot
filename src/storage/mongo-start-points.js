import { buildSelectionCleanup, buildSelectionUpdate } from './mongo-participant-selection.js';
import { START_POINT_NAMES } from '../utils/start-points.js';

/** Mongo expression for the current point count; single values do not create groups.
 * @returns {Object}
 */
export function startPointCountExpression() {
  return { $let: {
    vars: { count: { $size: { $ifNull: ['$meetingPoints', []] } } },
    in: { $cond: [{ $gte: ['$$count', 2] }, '$$count', 0] }
  } };
}

/** Mongo expression for labels available in the current document.
 * @returns {Object}
 */
export function startPointNamesExpression() {
  return { $slice: [{ $literal: START_POINT_NAMES }, startPointCountExpression()] };
}

/** Clean deleted selections against the meeting fields written by the preceding stage.
 * @returns {Object}
 */
export function buildStartPointCleanup() {
  return buildSelectionCleanup('startPoint', startPointNamesExpression());
}

/** Update only the selected user's group in both eligible participation sections.
 * @param {number} userId
 * @param {string} group
 * @returns {Object}
 */
export function buildStartPointSelection(userId, group) {
  return buildSelectionUpdate(userId, 'startPoint', group);
}
