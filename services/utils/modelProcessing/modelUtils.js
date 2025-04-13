/**
 * Common utilities for managing different provider models
 */

/**
 * Filters models based on common criteria
 * @param {Array} models - Array of model objects or strings
 * @param {Function} filterFn - Function to filter models
 * @returns {Array} Filtered model array
 */
export function filterModels(models, filterFn) {
  if (!Array.isArray(models)) return [];
  return models.filter(filterFn);
}

/**
 * Groups models by a key extraction function
 * @param {Array} models - Array of models to group
 * @param {Function} keyFn - Function to extract group key
 * @returns {Map} Map of grouped models
 */
export function groupModels(models, keyFn) {
  const modelGroups = new Map();
  
  models.forEach((model) => {
    const key = keyFn(model);
    if (!modelGroups.has(key)) {
      modelGroups.set(key, []);
    }
    modelGroups.get(key).push(model);
  });
  
  return modelGroups;
}

/**
 * Removes duplicates from an array of models
 * @param {Array} models - Array of models
 * @param {Function} [keyFn] - Optional function to extract key for comparison
 * @returns {Array} Array with duplicates removed
 */
export function removeDuplicateModels(models, keyFn = null) {
  if (!Array.isArray(models)) return [];
  
  if (keyFn) {
    const seen = new Set();
    return models.filter(model => {
      const key = keyFn(model);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  
  return [...new Set(models)];
}

/**
 * Sorts models array alphabetically
 * @param {Array} models - Array of model names or objects
 * @param {Function} [keyFn] - Optional function to extract key for sorting
 * @returns {Array} Sorted array
 */
export function sortModels(models, keyFn = null) {
  if (!Array.isArray(models)) return [];
  
  if (keyFn) {
    return [...models].sort((a, b) => {
      const keyA = keyFn(a);
      const keyB = keyFn(b);
      return String(keyA).localeCompare(String(keyB));
    });
  }
  
  return [...models].sort((a, b) => String(a).localeCompare(String(b)));
} 