/**
 * Gemini provider using the provider factory
 */
import { createChatProvider } from "../utils/providers/providerFactory.js";
import { processGeminiModels } from "../utils/modelProcessing/geminiModelFilter.js";
import { createCancellableSession } from "../apiUtils.js";
import { getSettings } from "../../lib/settings.js";
import { createSSEProcessor } from "../utils/api/responseProcessors.js";
import { SessionManager } from "../utils/api/sessionUtils.js";

// API endpoints
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_MODELS_URL = `${GEMINI_BASE_URL}/models`;
const GEMINI_API_URL = `${GEMINI_BASE_URL}/models/`;

// Module state
const errorMessages = [];
const sessionManager = new SessionManager();

/**
 * Records errors for later reporting
 * @param {string} message - Error message to record
 */
function recordError(message) {
  errorMessages.push(message);
}

/**
 * Gets the Gemini API key from settings
 * @param {Object} settings - Settings object
 * @returns {string} API key
 */
function getApiKey(settings) {
  return settings.get_string("gemini-api-key");
}

/**
 * Extracts content from Gemini API response chunks
 * @param {Object} json - Gemini response JSON
 * @returns {string|null} Content text or null
 */
function extractGeminiContent(json) {
  // Process Gemini SSE format
  if (json.candidates && 
      json.candidates[0] && 
      json.candidates[0].content && 
      json.candidates[0].content.parts && 
      json.candidates[0].content.parts[0] && 
      json.candidates[0].content.parts[0].text) {
    
    // Trim trailing newlines to prevent accumulation
    return json.candidates[0].content.parts[0].text.replace(/\n+$/, "");
  }
  
  // Check for errors
  if (json.error) {
    recordError(`Gemini API error: ${json.error.message || "Unknown error"}`);
    return json.error.message || "Error from Gemini API";
  }
  
  return null;
}

/**
 * Prepares a conversation context in Gemini API format
 * @param {string} messageText - Current message text
 * @param {Array} context - Previous conversation context
 * @returns {Array} Formatted messages for Gemini API
 */
function prepareGeminiMessages(messageText, context = []) {
  let contents = [];
  
  // Add context if available
  if (context && Array.isArray(context)) {
    for (const msg of context) {
      const role = msg.type === 'assistant' ? 'model' : 'user';
      contents.push({
        role: role,
        parts: [{ text: msg.text }]
      });
    }
  }
  
  // Add the current message
  contents.push({
    role: 'user',
    parts: [{ text: messageText }]
  });
  
  return contents;
}

/**
 * Fetches Gemini model names using API key as query parameter
 * @returns {Array} List of available model names
 */
async function fetchGeminiModels() {
  const settings = getSettings();
  const apiKey = getApiKey(settings);
  
  if (!apiKey) {
    recordError("API key not configured");
    return [];
  }
  
  try {
    const modelUrl = `${GEMINI_MODELS_URL}?key=${apiKey}`;
    const session = createCancellableSession();
    const data = await session.get(modelUrl);
    
    if (data && data.models) {
      return processGeminiModels(data.models);
    }
    recordError("Invalid data format");
    return [];
  } catch (error) {
    recordError(`Error fetching models: ${error.message || "Unknown error"}`);
    return [];
  }
}

/**
 * Sends a message to the Gemini API
 * @param {Object} options - Message options
 * @returns {Object} Request handler with result and cancel functions
 */
async function sendGeminiMessage({ messageText, modelName, context = [], onData }) {
  const settings = getSettings();
  const apiKey = getApiKey(settings);
  const temperature = settings.get_double("temperature");
  
  if (!apiKey) {
    recordError("API key not configured");
    throw new Error("API key not configured");
  }
  
  // Clean up any existing session
  sessionManager.terminateSession();
  
  // Remove the gemini: prefix if present
  const actualModel = modelName.replace(/^gemini:/, '');
  
  // Convert context to Gemini format
  const contents = prepareGeminiMessages(messageText, context);
  
  // Create the request URL with streamGenerateContent endpoint and SSE parameter
  const requestUrl = `${GEMINI_BASE_URL}/models/${actualModel}:streamGenerateContent?alt=sse&key=${apiKey}`;
  
  // Create a session and configure SSE processing
  const session = createCancellableSession();
  sessionManager.setSession(session);
  
  const processChunk = createSSEProcessor({
    onData,
    extractContent: extractGeminiContent
  });
  
  try {
    const requestHandler = await session.sendRequest(
      "POST",
      requestUrl,
      { "Content-Type": "application/json" },
      JSON.stringify({ 
        contents,
        generationConfig: { temperature }
      }),
      processChunk
    );
    
    return {
      result: requestHandler.result.then(result => {
        sessionManager.terminateSession();
        return result;
      }),
      cancel: () => sessionManager.terminateSession()
    };
  } catch (error) {
    const accumulatedResponse = sessionManager.getAccumulatedResponse();
    sessionManager.terminateSession();
    
    if (accumulatedResponse) {
      return {
        result: Promise.resolve(accumulatedResponse),
        cancel: () => {}
      };
    }
    
    recordError(`Error: ${error.message}`);
    throw error;
  }
}

/**
 * Stops the current message generation
 * @returns {string|null} Any accumulated response before stopping
 */
function stopGeminiMessage() {
  return sessionManager.terminateSession();
}

// Create the base provider
const provider = createChatProvider({
  modelsEndpoint: GEMINI_MODELS_URL,
  apiEndpoint: GEMINI_API_URL,
  getApiKey,
  processModels: processGeminiModels,
  recordError
});

// Export the provider interface
export const fetchModelNames = fetchGeminiModels;
export const sendMessageToAPI = sendGeminiMessage;
export const stopMessage = stopGeminiMessage;
export const isModelSupported = provider.isModelSupported;

// Export a function to check if a model is from Gemini
export function isGeminiModel(modelName) {
  return modelName && modelName.startsWith('gemini:');
}

// For debugging purposes
export function getErrorMessages() {
  return [...errorMessages];
} 