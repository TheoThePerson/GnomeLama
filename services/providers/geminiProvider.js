/**
 * Gemini provider using the provider factory
 */
import { createChatProvider } from "../utils/providers/providerFactory.js";
import { removeDuplicateModels, sortModels } from "../utils/modelProcessing/modelUtils.js";
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

/**
 * Custom implementation for fetching model names since Gemini uses a different format
 * than what providerFactory assumes
 */
async function fetchModelNamesImpl() {
  log("Fetching Gemini models directly...");
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
    
    // Process the models
    if (data && data.models) {
      // Add a prefix to distinguish Gemini models
      const modelNames = data.models.map(model => {
        // The name comes in form 'models/gemini-1.0-pro' - we need to extract the model name
        const modelName = model.name.replace(/^models\//, '');
        return `gemini:${modelName}`;
      });
      
      log(`Found ${modelNames.length} Gemini models`);
      return sortModels(removeDuplicateModels(modelNames));
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
}

/**
 * Custom implementation for sending messages to Gemini API
 * @param {Object} options - Options for sending messages
 * @returns {Object} Object with result promise and cancel function
 */
async function sendMessageToAPIImpl({ messageText, modelName, context = [], onData }) {
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
}

/**
 * Process Gemini model data
 * @param {Object} data - API response data
 * @returns {Array} Processed model names
 */
function processGeminiModels(data) {
  log(`Processing Gemini models response`);
  
  try {
    // Extract model names if data has the expected structure
    if (data && Array.isArray(data.models)) {
      // Add a prefix to distinguish Gemini models
      const modelNames = data.models.map(model => {
        // The name comes in form 'models/gemini-1.0-pro' - we need to extract the model name
        const modelName = model.name.replace(/^models\//, '');
        return `gemini:${modelName}`;
      });
      
      log(`Found ${modelNames.length} Gemini models`);
      return sortModels(removeDuplicateModels(modelNames));
    } else {
      recordError("Invalid or unexpected Gemini models data format");
      console.log("Gemini models data:", JSON.stringify(data));
      return [];
    }
  } catch (error) {
    recordError(`Error processing Gemini models: ${error.message}`);
    return [];
  }
}

/**
 * Custom request formatter for Gemini API
 * @param {Object} options - Request options
 * @returns {Object} Formatted request
 */
function formatRequest(options) {
  log(`Formatting request for model: ${options.model}`);
  
  const { messages, model, settings } = options;
  
  // Remove the gemini: prefix if present
  const actualModel = model.replace(/^gemini:/, '');
  
  // Convert messages array to Gemini format
  const contents = messages.map(msg => ({
    parts: [{ text: msg.content || msg.text }],
    role: msg.role === 'assistant' ? 'model' : 'user'
  }));
  
  log(`Prepared ${contents.length} messages for Gemini`);
  
  // Build the request URL with API key
  const apiKey = getApiKey(settings);
  const requestUrl = `${GEMINI_BASE_URL}/models/${actualModel}:generateContent?key=${apiKey}`;
  
  return {
    url: requestUrl,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents })
  };
}

/**
 * Parse Gemini response to standard format
 * @param {Object} response - API response
 * @returns {Object} Standardized response
 */
function parseResponse(response) {
  log(`Parsing Gemini response`);
  
  try {
    if (!response || !response.candidates || !response.candidates[0]) {
      recordError("Invalid Gemini response structure");
      return { text: "Error processing response from Gemini", finish_reason: "error" };
    }
    
    const candidate = response.candidates[0];
    const content = candidate.content;
    
    if (!content || !content.parts || !content.parts[0]) {
      recordError("Missing content in Gemini response");
      return { text: "Empty response from Gemini", finish_reason: "error" };
    }
    
    return {
      text: content.parts[0].text,
      finish_reason: candidate.finishReason || "stop"
    };
  } catch (error) {
    recordError(`Error parsing Gemini response: ${error.message}`);
    return { text: "Error processing response", finish_reason: "error" };
  }
}

// Create the provider using the factory for other functions
// but not for sendMessageToAPI
const provider = createChatProvider({
  modelsEndpoint: GEMINI_MODELS_URL,
  apiEndpoint: GEMINI_API_URL,
  formatRequest,
  parseResponse,
  getApiKey,
  processModels: processGeminiModels,
  recordError,
  log
});

// Export the custom implementation for sendMessageToAPI
export const sendMessageToAPI = sendMessageToAPIImpl;

// Export other functions from the provider
export const stopMessage = provider.stopMessage;
export const resetContext = provider.resetContext;

// Use our custom implementation for fetchModelNames
export const fetchModelNames = fetchModelNamesImpl;

// Export a function to check if a model is from Gemini
export function isGeminiModel(modelName) {
  return modelName && modelName.startsWith('gemini:');
}

// For debugging purposes
export function getErrorMessages() {
  return [...errorMessages];
} 