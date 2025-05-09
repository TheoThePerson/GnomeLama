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
 * Records detailed errors for later reporting
 * @param {string} message - Error message to record
 * @param {Object} [details] - Additional error details
 * @param {string} [source] - Source of the error
 */
function recordError(message, details = null, source = 'OpenAI Provider') {
  const timestamp = new Date().toISOString();
  const formattedMessage = `[${timestamp}] [${source}] ${message}`;
  
  if (details) {
    if (details instanceof Error) {
      errorMessages.push(`${formattedMessage}: ${details.message}\n${details.stack || ''}`);
    } else {
      errorMessages.push(`${formattedMessage}: ${JSON.stringify(details)}`);
    }
  } else {
    errorMessages.push(formattedMessage);
  }
}

/**
 * Gets the OpenAI API key from settings
 * @param {Object} settings - Settings object
 * @returns {string} API key
 */
function getApiKey(settings) {
  const apiKey = settings.get_string("openai-api-key");
  if (!apiKey) {
    recordError("OpenAI API key not configured", null, "Configuration");
  }
  return apiKey;
}

/**
 * Extracts content from OpenAI API response chunks
 * @param {Object} json - OpenAI response JSON
 * @returns {string|null} Content text or null
 */
function extractOpenAIContent(json) {
  // Process an SSE message from OpenAI
  if (json.choices && json.choices.length > 0) {
    const { delta } = json.choices[0];
    if (delta && delta.content) {
      return delta.content;
    }
  }
  
  // Check for errors in the response
  if (json.error) {
    const errorType = json.error.type || "Unknown";
    const errorCode = json.error.code || "N/A";
    recordError(
      `OpenAI API error: ${json.error.message || "Unknown error"}`,
      { type: errorType, code: errorCode, details: json.error },
      "API Response"
    );
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
    recordError("Cannot fetch models - API key not configured", null, "Model Fetch");
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
    
    recordError(
      "Invalid data format when fetching models",
      { received: data },
      "Model Fetch"
    );
    return [];
  } catch (error) {
    recordError(
      `Error fetching OpenAI models: ${error.message || "Unknown error"}`,
      error,
      "Model Fetch"
    );
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
    recordError("Cannot create headers - API key not configured", null, "Request Setup");
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
const { fetchModelNames, sendMessageToAPI, stopMessage, isModelSupported } = provider;
export { fetchModelNames, sendMessageToAPI, stopMessage };
export const isOpenAIModel = isModelSupported;
