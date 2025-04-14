/**
 * Gemini provider using the provider factory
 */
import { createChatProvider } from "../utils/providers/providerFactory.js";
import { processGeminiModels } from "../utils/modelProcessing/geminiModelFilter.js";
import { getSettings } from "../../lib/settings.js";
import { createCancellableSession } from "../apiUtils.js";

// API endpoints
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_MODELS_URL = `${GEMINI_BASE_URL}/models`;
const GEMINI_CHAT_ENDPOINT = (model, apiKey) => 
  `${GEMINI_BASE_URL}/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

// Module state
const errorMessages = [];

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
 * Create a custom payload for Gemini's API format
 * @param {Object} params - Parameters including messages and temperature
 * @returns {string} JSON payload as string
 */
function createGeminiPayload(params) {
  const { messages, temperature } = params;
  
  // Convert messages to Gemini format
  let contents = [];
  for (const msg of messages) {
    const role = msg.role === 'assistant' ? 'model' : 'user';
    contents.push({
      role: role,
      parts: [{ text: msg.content }]
    });
  }
  
  return JSON.stringify({
    contents,
    generationConfig: { temperature }
  });
}

/**
 * Custom headers builder for Gemini API that doesn't need Authorization header
 * @returns {Object} Headers for Gemini API
 */
function createGeminiHeaders() {
  return { "Content-Type": "application/json" };
}

/**
 * Custom endpoint builder for Gemini API
 * @param {Object} params - Parameters including model and settings
 * @returns {string} Endpoint URL for Gemini API
 */
function getGeminiEndpoint(params) {
  const { modelName, settings } = params;
  const apiKey = getApiKey(settings);
  
  if (!apiKey) {
    recordError("API key not configured");
    throw new Error("API key not configured");
  }
  
  // Remove the gemini: prefix if present
  const actualModel = modelName.replace(/^gemini:/, '');
  return GEMINI_CHAT_ENDPOINT(actualModel, apiKey);
}

// Create the provider using the factory
const provider = createChatProvider({
  modelsEndpoint: GEMINI_MODELS_URL,
  processModels: processGeminiModels,
  recordError,
  extractContent: extractGeminiContent,
  createPayload: createGeminiPayload,
  createHeaders: createGeminiHeaders,
  getEndpoint: getGeminiEndpoint,
  fetchModels: fetchGeminiModels
});

// Export the provider interface
export const fetchModelNames = provider.fetchModelNames;
export const sendMessageToAPI = provider.sendMessageToAPI;
export const stopMessage = provider.stopMessage;
export const isModelSupported = provider.isModelSupported;

// Export a function to check if a model is from Gemini
export function isGeminiModel(modelName) {
  return modelName && modelName.startsWith('gemini:');
}

// For debugging purposes
export function getErrorMessages() {
  return [...errorMessages];
} 