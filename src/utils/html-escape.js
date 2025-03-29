/**
 * Escape HTML special characters in a string
 * @param {string} text - Text to escape
 * @returns {string} - Escaped text
 */
export function escapeHtml(text) {
  if (!text) return text;
  
  // Replace HTML special characters with their entity equivalents
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Escape HTML in ride fields
 * @param {Object} ride - Ride object
 * @returns {Object} - Ride with escaped fields
 */
export function escapeRideHtml(ride) {
  if (!ride) return ride;
  
  const result = { ...ride };
  
  // Only escape string fields that might contain HTML
  if (result.title) result.title = escapeHtml(result.title);
  if (result.meetingPoint) result.meetingPoint = escapeHtml(result.meetingPoint);
  
  return result;
}
