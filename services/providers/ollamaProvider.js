/**
 * Ollama provider using the updated provider factory
 */
import { createCompletionProvider } from "../utils/providers/providerFactory.js";
import { removeDuplicateModels, sortModels } from "../utils/modelProcessing/modelUtils.js";
import { getSettings } from "../../lib/settings.js";
import { createCancellableSession } from "../apiUtils.js";

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

/**
 * Extracts content from Ollama API response chunks
 * @param {Object} json - Ollama response JSON
 * @param {Function} [contextCallback] - Callback for context updates
 * @returns {string|null} Content text or null
 */
function extractOllamaContent(json, contextCallback = null) {
  if (json.context && contextCallback) {
    contextCallback(json.context);
  }
  
  if (json.response) {
    return json.response;
  }
  
  return null;
}

/**
 * Fetches Ollama model names
 * @returns {Array} List of available model names
 */
async function fetchOllamaModels() {
  try {
    const settings = getSettings();
    const endpoint = settings.get_string("models-api-endpoint");
    
    const tempSession = createCancellableSession();
    const data = await tempSession.get(endpoint);
    
    if (data && data.models) {
      return processOllamaModels(data);
    }
    
    recordError("Invalid data format");
    return [];
  } catch (error) {
    recordError(`Error fetching models: ${error.message || "Unknown error"}`);
    return [];
  }
}

// Create the provider using the factory
const provider = createCompletionProvider({
  processModels: processOllamaModels,
  recordError,
  extractContent: extractOllamaContent,
  fetchModels: fetchOllamaModels
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
