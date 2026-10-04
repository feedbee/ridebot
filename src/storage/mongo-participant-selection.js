/** Retain a valid participant selection, removing only an obsolete selection field.
 * @param {string} participant - Aggregation variable reference
 * @param {string} field - Trusted participant field name
 * @param {Object} names - Expression for currently available labels
 * @returns {Object}
 */
function cleanSelectionExpression(participant, field, names) {
  return { $cond: [
    { $in: [{ $ifNull: [`${participant}.${field}`, null] }, names] },
    participant,
    { $arrayToObject: { $filter: {
      input: { $objectToArray: participant }, as: 'field',
      cond: { $ne: ['$$field.k', field] }
    } } }
  ] };
}

/** Clean choices in the current joined/thinking arrays after a content update.
 * @param {string} field - Trusted participant field name
 * @param {Object} names - Expression for currently available labels
 * @returns {Object}
 */
export function buildSelectionCleanup(field, names) {
  return { $set: Object.fromEntries(['joined', 'thinking'].map(state => [
    `participation.${state}`, { $map: {
      input: { $ifNull: [`$participation.${state}`, []] }, as: 'person',
      in: cleanSelectionExpression('$$person', field, names)
    } }
  ])) };
}

/** Update one selection without replacing status or another selection.
 * @param {number} userId
 * @param {string} field - Trusted participant field name
 * @param {string} selection
 * @returns {Object}
 */
export function buildSelectionUpdate(userId, field, selection) {
  return { $set: Object.fromEntries(['joined', 'thinking'].map(state => [
    `participation.${state}`, { $map: {
      input: { $ifNull: [`$participation.${state}`, []] }, as: 'person',
      in: { $cond: [{ $eq: ['$$person.userId', userId] },
        { $mergeObjects: ['$$person', { [field]: { $literal: selection } }] }, '$$person'] }
    } }
  ])) };
}
