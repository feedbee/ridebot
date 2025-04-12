/**
 * Parse human-readable duration into minutes
 * @param {string} text - Duration text (e.g., "2h 30m", "90m", "1.5h", "2 hours 30 minutes")
 * @returns {{duration: number|null, error?: string}} Result object containing either the parsed duration in minutes or error message
 */
export function parseDuration(text) {
  // Remove any whitespace and convert to lowercase
  text = text.toLowerCase().trim();

  // If it's just a number, treat it as minutes
  if (/^\d+$/.test(text)) {
    return { duration: parseInt(text) };
  }

  let totalMinutes = 0;
  let matched = false;

  // Match patterns like "2h", "2 h", "2 hours", "2.5h", "2.5 hours"
  const hourMatches = text.match(/(\d*\.?\d+)\s*h(?:ours?)?/);
  if (hourMatches) {
    totalMinutes += Math.round(parseFloat(hourMatches[1]) * 60);
    matched = true;
  }

  // Match patterns like "30m", "30 m", "30 min", "30 minutes"
  const minuteMatches = text.match(/(\d+)\s*m(?:in(?:utes?)?)?/);
  if (minuteMatches) {
    totalMinutes += parseInt(minuteMatches[1]);
    matched = true;
  }

  if (!matched) {
    return {
      duration: null,
      error: '❌ I couldn\'t understand that duration format. Please try something like:\n• 90 (for 90 minutes)\n• 2h (for 2 hours)\n• 2h 30m (for 2 hours and 30 minutes)\n• 1.5h (for 1 hour and 30 minutes)'
    };
  }

  return { duration: totalMinutes };
} 
