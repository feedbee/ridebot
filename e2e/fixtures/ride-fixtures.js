export function buildLifecycleRideFixture() {
  const timestamp = Date.now();
  const baseTitle = `E2E Ride ${timestamp}`;

  return {
    title: baseTitle,
    updatedTitle: `${baseTitle} Updated`,
    meetingPoint: 'Old Town Gate',
    updatedMeetingPoint: 'North Gate'
  };
}

export function buildWizardCreateFixture() {
  const timestamp = Date.now();
  const baseTitle = `E2E Wizard Create ${timestamp}`;

  return {
    title: baseTitle,
    organizer: 'E2E Wizard Organizer',
    distance: '47.5',
    duration: '2h 15m',
    speed: '26-28',
    meetingPoint: 'Old Town Gate',
    info: 'Bring lights and a spare tube',
    probeText: `wizard-create-cleanup-${timestamp}`
  };
}

export function buildWizardUpdateFixture() {
  const timestamp = Date.now();
  const baseTitle = `E2E Wizard Update ${timestamp}`;

  return {
    seedTitle: `${baseTitle} Seed`,
    updatedTitle: `${baseTitle} Updated`,
    seedMeetingPoint: 'South Gate',
    seedInfo: 'Seed info',
    updatedDistance: '55',
    updatedSpeed: '28-30',
    updatedInfo: 'Updated by wizard flow',
    probeText: `wizard-update-cleanup-${timestamp}`
  };
}

export function extractRideIdFromText(text) {
  const match = text.match(/🎫\s*#Ride\s*#(\w+)/i);
  return match ? match[1] : null;
}
