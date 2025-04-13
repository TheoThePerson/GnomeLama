/**
 * OpenAI provider using the updated provider factory
 */
import { createChatProvider } from "../utils/providers/providerFactory.js";
import { processOpenAIModels } from "../utils/models/openaiModelFilter.js";

// API endpoints
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODELS_URL = "https://api.openai.com/v1/models";

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
 * Gets the OpenAI API key from settings
 * @param {Object} settings - Settings object
 * @returns {string} API key
 */
function getApiKey(settings) {
  return settings.get_string("openai-api-key");
}

// Create the provider using the factory
const provider = createChatProvider({
  modelsEndpoint: OPENAI_MODELS_URL,
  apiEndpoint: OPENAI_API_URL,
  getApiKey,
  processModels: processOpenAIModels,
  recordError
});

// Export the provider interface
export const fetchModelNames = provider.fetchModelNames;
export const sendMessageToAPI = provider.sendMessageToAPI;
export const stopMessage = provider.stopMessage;
export const isOpenAIModel = provider.isModelSupported;

// For debugging purposes
export function getErrorMessages() {
  return [...errorMessages];
}
