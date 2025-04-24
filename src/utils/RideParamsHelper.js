export class RideParamsHelper {
  /**
   * Valid ride parameters and their descriptions
   * @type {Object.<string, string>}
   */
  static VALID_PARAMS = {
    'title': 'Title of the ride',
    'category': 'Ride category',
    'organizer': 'Ride organizer name',
    'when': 'Date and time of the ride',
    'meet': 'Meeting point',
    'route': 'Route URL',
    'dist': 'Distance in kilometers',
    'duration': 'Duration in minutes',
    'speed': 'Speed range (e.g. 25-28)',
    'info': 'Additional information',
    'id': 'Ride ID (for commands that need it)'
  };

  /**
   * Parse ride parameters from text
   * @param {string} text - Text to parse
   * @returns {{params: Object, unknownParams: Array<string>}} - Parsed parameters and any unknown parameters
   */
  static parseRideParams(text) {
    const lines = text.split('\n').slice(1); // Skip command line
    const params = {};
    const unknownParams = [];

    for (const line of lines) {
      const match = line.match(/^\s*(\w+)\s*:\s*(.+)$/);
      if (match) {
        const [_, key, value] = match;
        const normalizedKey = key.trim().toLowerCase();
        
        if (RideParamsHelper.VALID_PARAMS.hasOwnProperty(normalizedKey)) {
          params[normalizedKey] = value.trim();
        } else {
          unknownParams.push(key.trim());
        }
      } else {
        unknownParams.push(line.trim());
      }
    }

    return { params, unknownParams };
  }
} 
