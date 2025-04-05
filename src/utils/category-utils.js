/**
 * Utility functions for ride category validation and normalization
 */

/**
 * List of valid ride categories
 */
export const VALID_CATEGORIES = [
  'Regular/Mixed Ride',
  'Road Ride',
  'Gravel Ride',
  'Mountain/Enduro/Downhill Ride',
  'MTB-XC Ride',
  'E-Bike Ride',
  'Virtual/Indoor Ride'
];

/**
 * Default category to use when none is provided
 */
export const DEFAULT_CATEGORY = 'Regular/Mixed Ride';

/**
 * Normalize a category input to a valid category
 * @param {string} input - User input for ride category
 * @returns {string} - Normalized ride category
 */
export function normalizeCategory(input) {
  // Default category
  if (!input || input.trim() === '') {
    return DEFAULT_CATEGORY;
  }
  
  // Normalize input: lowercase, remove extra spaces
  const normalizedInput = input.trim().toLowerCase();
  
  // Check for exact match (case insensitive)
  for (const category of VALID_CATEGORIES) {
    if (category.toLowerCase() === normalizedInput) {
      return category;
    }
  }
  
  // Check if input is a partial match (without 'ride' word)
  for (const category of VALID_CATEGORIES) {
    const parts = category.toLowerCase().split(' ');
    // Remove 'ride' from the parts if present
    const categoryWithoutRide = parts.filter(part => part !== 'ride').join(' ');
    
    if (categoryWithoutRide === normalizedInput || category.toLowerCase().includes(normalizedInput)) {
      return category;
    }
  }
  
  // For inputs that might match any part of the category
  for (const category of VALID_CATEGORIES) {
    const parts = category.toLowerCase().split('/');
    for (const part of parts) {
      if (part.trim() === normalizedInput) {
        return category;
      }
    }
  }
  
  // If no match found, return the default category
  return DEFAULT_CATEGORY;
}

/**
 * Validate if a category is valid
 * @param {string} category - Category to validate
 * @returns {boolean} - True if valid, false otherwise
 */
export function isValidCategory(category) {
  if (!category) return false;
  
  const normalizedCategory = normalizeCategory(category);
  return VALID_CATEGORIES.includes(normalizedCategory);
}
