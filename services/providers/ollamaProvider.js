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
 * Records detailed errors for later reporting
 * @param {string} message - Error message to record
 * @param {Object} [details] - Additional error details
 * @param {string} [source] - Source of the error
 */
function recordError(message, details = null, source = 'Ollama Provider') {
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
 * Process Ollama model data
 * @param {Object} data - API response data
 * @returns {Array} Processed model names
 */
function processOllamaModels(data) {
  try {
    // Extract model names, remove duplicates, and sort
    if (!data || !data.models || !Array.isArray(data.models)) {
      recordError(
        "Invalid model data structure",
        { data },
        "Model Processing"
      );
      return [];
    }
    
    const modelNames = data.models.map((model) => model.name);
    return sortModels(removeDuplicateModels(modelNames));
  } catch (error) {
    recordError(
      `Error processing Ollama models: ${error.message}`,
      error,
      "Model Processing"
    );
    return [];
  }
}

/**
 * Extracts content from Ollama API response chunks
 * @param {Object} json - Ollama response JSON
 * @param {Function} [contextCallback] - Callback for context updates
 * @returns {string|null} Content text or null
 */
function extractOllamaContent(json, contextCallback = null) {
  try {
    if (json.context && contextCallback) {
      contextCallback(json.context);
    }
    
    if (json.response) {
      return json.response;
    }
    
    if (json.error) {
      recordError(
        `Ollama API error: ${json.error}`,
        { response: json },
        "Response Processing"
      );
      return `Error: ${json.error}`;
    }
    
    return null;
  } catch (error) {
    recordError(
      `Error extracting content from Ollama response: ${error.message}`,
      { json, error },
      "Response Processing"
    );
    return null;
  }
}

/**
 * Fetches Ollama model names
 * @returns {Array} List of available model names
 */
async function fetchOllamaModels() {
  try {
    const settings = getSettings();
    const endpoint = settings.get_string("models-api-endpoint");
    
    if (!endpoint) {
      recordError(
        "Ollama models API endpoint not configured",
        null,
        "Configuration"
      );
      return [];
    }
    
    const tempSession = createCancellableSession();
    const data = await tempSession.get(endpoint);
    
    if (data && data.models) {
      return processOllamaModels(data);
    }
    
    recordError(
      "Invalid data format when fetching Ollama models",
      { received: data },
      "Model Fetch"
    );
    return [];
  } catch (error) {
    recordError(
      `Error fetching Ollama models: ${error.message || "Unknown error"}`,
      error,
      "Model Fetch"
    );
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
export const { fetchModelNames, sendMessageToAPI, stopMessage, resetContext } = provider;
