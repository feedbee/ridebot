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

export function extractRideIdFromText(text) {
  const match = text.match(/🎫\s*#Ride\s*#(\w+)/i);
  return match ? match[1] : null;
}
