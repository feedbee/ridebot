import { buildSelectionCleanup, buildSelectionUpdate } from './mongo-participant-selection.js';
import { startPointNamesExpression } from './mongo-start-points.js';
import { PACE_GROUP_NAMES } from '../utils/pace-groups.js';

/** Mongo expression for the current group count; single values do not create groups.
 * @returns {Object}
 */
export function paceGroupCountExpression() {
  return { $let: {
    vars: { count: { $max: [
      { $size: { $ifNull: ['$speedGroups', []] } },
      { $size: { $ifNull: ['$cruisingSpeedGroups', []] } }
    ] } },
    in: { $cond: [{ $gte: ['$$count', 2] }, '$$count', 0] }
  } };
}

/** Mongo expression for letters available in the current document.
 * @returns {Object}
 */
export function paceGroupNamesExpression() {
  return { $slice: [{ $literal: PACE_GROUP_NAMES }, paceGroupCountExpression()] };
}

/** Clean deleted selections against the speed fields written by the preceding stage.
 * @returns {Object}
 */
export function buildPaceGroupCleanup() {
  return buildSelectionCleanup('paceGroup', paceGroupNamesExpression());
}

/** Build a participant from the latest stored selection, never a stale caller snapshot.
 * @param {string} targetState
 * @param {Object} participant
 * @returns {Object}
 */
export function participantWithPaceGroupExpression(targetState, participant) {
  if (targetState === 'skipped') return { $literal: participant };
  return { $let: {
    vars: { current: { $arrayElemAt: [{ $filter: {
      input: { $concatArrays: [
        { $ifNull: ['$participation.joined', []] },
        { $ifNull: ['$participation.thinking', []] }
      ] },
      as: 'person', cond: { $eq: ['$$person.userId', participant.userId] }
    } }, 0] } },
    in: { $mergeObjects: [{ $literal: participant }, { $cond: [
      { $in: [{ $ifNull: ['$$current.paceGroup', null] }, paceGroupNamesExpression()] },
      { paceGroup: '$$current.paceGroup' }, {}
    ] }, { $cond: [
      { $in: [{ $ifNull: ['$$current.startPoint', null] }, startPointNamesExpression()] },
      { startPoint: '$$current.startPoint' }, {}
    ] }] }
  } };
}

/** Update only the selected user's group in both eligible participation sections.
 * @param {number} userId
 * @param {string} group
 * @returns {Object}
 */
export function buildPaceGroupSelection(userId, group) {
  return buildSelectionUpdate(userId, 'paceGroup', group);
}
