/**
 * Ollama provider using the updated provider factory
 */
import { createCompletionProvider } from "../utils/providers/providerFactory.js";
import { removeDuplicateModels, sortModels } from "../utils/models/modelUtils.js";

// Module state
const errorMessages = [];

/**
 * Records errors without console.log for later reporting
 * @param {string} message - Error message to record
 */
function recordError(message) {
  errorMessages.push(message);
}

/**
 * Process Ollama model data
 * @param {Object} data - API response data
 * @returns {Array} Processed model names
 */
function processOllamaModels(data) {
  // Extract model names, remove duplicates, and sort
  const modelNames = data.models.map((model) => model.name);
  return sortModels(removeDuplicateModels(modelNames));
}

// Create the provider using the factory
const provider = createCompletionProvider({
  processModels: processOllamaModels,
  recordError
});

// Export the provider interface
export const fetchModelNames = provider.fetchModelNames;
export const sendMessageToAPI = provider.sendMessageToAPI;
export const stopMessage = provider.stopMessage;
export const resetContext = provider.resetContext;

// For debugging purposes
export function getErrorMessages() {
  return [...errorMessages];
}
