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

/**
 * Prepares message context for API call
 * @param {string} messageText - User's message text
 * @param {Array} context - Previous conversation context
 * @param {Object} options - Optional parameters
 * @returns {Array} Formatted messages
 */
export function prepareBasicMessages(messageText, context = [], options = {}) {
  const { 
    defaultSystemMessage = "You are a helpful assistant.",
    roleMapping = (type) => type === "user" ? "user" : type === "system" ? "system" : "assistant"
  } = options;
  
  const messages = [];
  
  // Add system message at the beginning if not already present
  const hasSystemMessage = context.some((msg) => msg.type === "system");
  if (!hasSystemMessage) {
    messages.push({
      role: "system",
      content: defaultSystemMessage,
    });
  }

  // Add context messages
  context.forEach((msg) => {
    if (!msg.text || typeof msg.text !== "string") return;
    
    messages.push({
      role: roleMapping(msg.type),
      content: msg.text,
    });
  });

  // Add current user message
  messages.push({ 
    role: "user", 
    content: messageText 
  });
  
  return messages;
} 