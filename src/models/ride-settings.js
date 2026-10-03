/** Application defaults; boolean setting names derive from this contract. */
export const RIDE_SETTING_DEFAULTS = Object.freeze({
  notifyParticipation: true,
  allowReposts: false,
  requireParticipationApproval: false,
  participantLimit: 0
});

export const BOOLEAN_RIDE_SETTING_NAMES = Object.freeze(
  Object.keys(RIDE_SETTING_DEFAULTS).filter(name => typeof RIDE_SETTING_DEFAULTS[name] === 'boolean')
);
