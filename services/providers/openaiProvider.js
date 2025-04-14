/**
 * OpenAI provider using the updated provider factory
 */
import { createChatProvider } from "../utils/providers/providerFactory.js";
import { processOpenAIModels } from "../utils/modelProcessing/openaiModelFilter.js";
import { getSettings } from "../../lib/settings.js";
import { createCancellableSession } from "../apiUtils.js";

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

/**
 * Extracts content from OpenAI API response chunks
 * @param {Object} json - OpenAI response JSON
 * @returns {string|null} Content text or null
 */
function extractOpenAIContent(json) {
  // Process an SSE message from OpenAI
  if (json.choices && json.choices.length > 0) {
    const delta = json.choices[0].delta;
    if (delta && delta.content) {
      return delta.content;
    }
  }
  
  // Check for errors in the response
  if (json.error) {
    recordError(`OpenAI API error: ${json.error.message || "Unknown error"}`);
    return json.error.message || "Error from OpenAI API";
  }
  
  return null;
}

/**
 * Fetches OpenAI model names with authentication
 * @returns {Array} List of available model names
 */
async function fetchOpenAIModels() {
  const settings = getSettings();
  const apiKey = getApiKey(settings);
  
  if (!apiKey) {
    recordError("API key not configured");
    return [];
  }
  
  try {
    const tempSession = createCancellableSession();
    const data = await tempSession.get(OPENAI_MODELS_URL, {
      Authorization: `Bearer ${apiKey}`
    });
    
    if (data && data.data) {
      return processOpenAIModels(data.data);
    }
    recordError("Invalid data format");
    return [];
  } catch (error) {
    recordError(`Error fetching models: ${error.message || "Unknown error"}`);
    return [];
  }
}

/**
 * Creates headers for OpenAI API requests
 * @param {Object} settings - Settings object
 * @returns {Object} Headers with Authorization
 */
function createOpenAIHeaders(settings) {
  const apiKey = getApiKey(settings);
  
  if (!apiKey) {
    recordError("API key not configured");
    throw new Error("API key not configured");
  }
  
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`
  };
}

// Create the provider using the factory
const provider = createChatProvider({
  modelsEndpoint: OPENAI_MODELS_URL,
  apiEndpoint: OPENAI_API_URL,
  processModels: processOpenAIModels,
  recordError,
  extractContent: extractOpenAIContent,
  createHeaders: createOpenAIHeaders,
  fetchModels: fetchOpenAIModels
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
