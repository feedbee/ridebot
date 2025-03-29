/**
 * Escapes Markdown special characters in text
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
export function escapeMarkdown(text) {
  if (!text) return text;
  
  // Replace special Markdown characters with their escaped versions
  return text.replace(/([_*\[\]()~`>#+\-=|{}!])/g, '\\$1');
}

/**
 * Escapes Markdown special characters in a ride object's text fields
 * @param {Object} ride - Ride object
 * @returns {Object} New ride object with escaped text fields
 */
export function escapeRideMarkdown(ride) {
  if (!ride) return ride;

  return {
    ...ride,
    title: escapeMarkdown(ride.title),
    meetingPoint: ride.meetingPoint ? escapeMarkdown(ride.meetingPoint) : ride.meetingPoint,
    routeLink: ride.routeLink ? escapeMarkdown(ride.routeLink) : ride.routeLink
  };
} 
