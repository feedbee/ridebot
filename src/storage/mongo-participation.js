/** Normalize the persistence fields shared by participation transitions.
 * @param {Object} profile
 * @returns {Object}
 */
export function createParticipantData(profile) {
  return {
    userId: profile.userId,
    username: profile.username,
    firstName: profile.firstName || '',
    lastName: profile.lastName || '',
    createdAt: new Date()
  };
}

/** Build the atomic guard for admitting a participant into joined.
 * @param {string} state
 * @returns {Object}
 */
export function buildCapacityFilter(state) {
  if (state !== 'joined') return {};
  const limit = { $ifNull: ['$settings.participantLimit', 0] };
  return {
    $expr: {
      $or: [
        { $lte: [limit, 0] },
        { $lt: [{ $size: { $ifNull: ['$participation.joined', []] } }, limit] }
      ]
    }
  };
}

/** Remove a participant from all states and insert literal data into the target.
 * @param {string} targetState
 * @param {Object} participant
 * @returns {Object}
 */
export function buildParticipationUpdate(targetState, participant) {
  return Object.fromEntries(['joined', 'thinking', 'skipped'].map(state => {
    const withoutUser = {
      $filter: {
        input: { $ifNull: [`$participation.${state}`, []] },
        as: 'participant',
        cond: { $ne: ['$$participant.userId', participant.userId] }
      }
    };
    return [`participation.${state}`, state === targetState
      ? { $concatArrays: [withoutUser, { $literal: [participant] }] }
      : withoutUser];
  }));
}
