/**
 * Gemini provider using the provider factory
 */
import { createChatProvider } from "../utils/providers/providerFactory.js";
import { removeDuplicateModels, sortModels } from "../utils/modelProcessing/modelUtils.js";
import { processGeminiModels } from "../utils/modelProcessing/geminiModelFilter.js";
import { createCancellableSession } from "../apiUtils.js";
import { getSettings } from "../../lib/settings.js";

// API endpoints
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_MODELS_URL = `${GEMINI_BASE_URL}/models`;
const GEMINI_API_URL = `${GEMINI_BASE_URL}/models/`;

// Module state
const errorMessages = [];

/**
 * Records errors for later reporting
 * @param {string} message - Error message to record
 */
function recordError(message) {
  errorMessages.push(message);
  log(`ERROR: ${message}`);
}

/**
 * Logs messages for debugging
 * @param {string} message - Message to log
 */
function log(message) {
  // Using push to store logs without console.log for later retrieval
  errorMessages.push(`LOG: ${message}`);
  console.log(`[GEMINI] ${message}`);
}

/**
 * Gets the Gemini API key from settings
 * @param {Object} settings - Settings object
 * @returns {string} API key
 */
function getApiKey(settings) {
  const apiKey = settings.get_string("gemini-api-key");
  if (!apiKey) {
    recordError("Gemini API key not found in settings");
  }
  return apiKey;
}

// Create the provider using the factory - but we'll override fetchModelNames with our custom implementation
const provider = createChatProvider({
  modelsEndpoint: GEMINI_MODELS_URL,
  apiEndpoint: GEMINI_API_URL,
  getApiKey,
  processModels: processGeminiModels,
  recordError
});

// We need to override the fetchModelNames function because Gemini API requires the API key as a query parameter
export const fetchModelNames = async () => {
  log("Fetching Gemini models...");
  const settings = getSettings();
  const apiKey = getApiKey(settings);
  
  if (!apiKey) {
    recordError("API key not configured");
    return [];
  }
  
  try {
    // Add the API key as a query parameter
    const modelUrl = `${GEMINI_MODELS_URL}?key=${apiKey}`;
    log(`Request URL: ${modelUrl}`);
    
    const session = createCancellableSession();
    const data = await session.get(modelUrl);
    
    log(`Received response: ${JSON.stringify(data).substring(0, 200)}...`);
    
    // Use the processGeminiModels function to filter the models
    if (data && data.models) {
      return processGeminiModels(data.models);
    } else {
      recordError("Invalid or unexpected Gemini models data format");
      log(`Data received: ${JSON.stringify(data)}`);
      return [];
    }
  } catch (error) {
    recordError(`Error fetching models: ${error.message || "Unknown error"}`);
    log(`Stack: ${error.stack}`);
    return [];
  }
};

// We need a custom implementation for sendMessage as well due to Gemini's specific API format
export const sendMessageToAPI = async ({ messageText, modelName, context = [], onData }) => {
  log(`Sending message to Gemini model: ${modelName}`);
  
  const settings = getSettings();
  const apiKey = getApiKey(settings);
  const temperature = settings.get_double("temperature");
  
  if (!apiKey) {
    recordError("API key not configured");
    throw new Error("API key not configured");
  }
  
  // Remove the gemini: prefix if present
  const actualModel = modelName.replace(/^gemini:/, '');
  
  // Convert context to Gemini format
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
  
  log(`Prepared ${contents.length} messages for Gemini`);
  
  // Create the request URL
  const requestUrl = `${GEMINI_BASE_URL}/models/${actualModel}:generateContent?key=${apiKey}`;
  
  // Create a cancellable session
  const session = createCancellableSession();
  
  // Keep track of accumulated response
  let accumulatedResponse = "";
  
  try {
    const requestHandler = await session.sendRequest(
      "POST",
      requestUrl,
      { "Content-Type": "application/json" },
      JSON.stringify({ 
        contents,
        generationConfig: {
          temperature: temperature
        }
      }),
      // Create a chunk processor function
      (chunk) => {
        try {
          log(`Received chunk: ${chunk.substring(0, 30)}...`);
          
          // Simply append to accumulated response
          accumulatedResponse += chunk;
          
          // Call onData if provided
          if (onData && typeof onData === 'function') {
            // Parse the chunk to extract text content
            try {
              const parsed = JSON.parse(chunk);
              if (parsed.candidates && parsed.candidates[0] && 
                  parsed.candidates[0].content && parsed.candidates[0].content.parts && 
                  parsed.candidates[0].content.parts[0]) {
                onData(parsed.candidates[0].content.parts[0].text);
              }
            } catch (parseError) {
              // If parse fails, just send the raw chunk
              onData(chunk);
            }
          }
        } catch (error) {
          recordError(`Error processing chunk: ${error.message}`);
        }
        
        return true; // Continue processing
      }
    );
    
    return {
      result: requestHandler.result.then((result) => {
        try {
          // Parse the response if needed
          if (typeof result === 'string') {
            try {
              return JSON.parse(result);
            } catch (e) {
              return result;
            }
          }
          return result;
        } finally {
          // Always clean up
          log("Request completed");
        }
      }),
      cancel: () => {
        log("Cancelling request");
        session.cancel();
        return accumulatedResponse;
      }
    };
  } catch (error) {
    recordError(`Error in sendMessageToAPI: ${error.message}`);
    throw error;
  }
};

// Export Gemini provider functions
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