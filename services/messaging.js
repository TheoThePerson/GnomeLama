/**
 * Services for communicating with the AI backend
 */
import GLib from "gi://GLib";
import { getSettings } from "../lib/settings.js";
import * as ollamaProvider from "./providers/ollamaProvider.js";
import * as openaiProvider from "./providers/openaiProvider.js";
import * as geminiProvider from "./providers/geminiProvider.js";

let conversationHistory = [];
let currentModel = null;
let isMessageInProgress = false;
let cancelCurrentRequest = null;
let lastError = null;

/**
 * Sets the current AI model
 * @param {string} modelName - Name of the model to use
 */
export function setModel(modelName) {
  currentModel = modelName;
  GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
    const settings = getSettings();
    settings.set_string("default-model", modelName);
    return GLib.SOURCE_REMOVE;
  });
}

/**
 * @param {string} modelName - Model name to get provider for
 * @returns {Object} Provider object with standardized interface
 */
function getProviderForModel(modelName) {
  if (openaiProvider.isOpenAIModel(modelName)) {
    return openaiProvider;
  } 
  if (geminiProvider.checkIsGeminiModel(modelName)) {
    return geminiProvider;
  }
  return ollamaProvider;
}

/**
 * Fetches model names from the API
 * @returns {Promise<{models: string[], error: string|null}>} Object containing array of available model names and optional error
 */
export async function fetchModelNames() {
  try {
    const [ollamaModels, openaiModels, geminiModels] = await Promise.allSettled([
      ollamaProvider.fetchModelNames(),
      openaiProvider.fetchModelNames(),
      geminiProvider.fetchModelNames(),
    ]);

    const models = [
      ...(ollamaModels.status === "fulfilled" ? ollamaModels.value : []),
      ...(openaiModels.status === "fulfilled" ? openaiModels.value : []),
      ...(geminiModels.status === "fulfilled" ? geminiModels.value : []),
    ];

    return {
      models,
      error: models.length === 0 ? "No models found. Please check if services are running with models installed, or that you have API keys in settings." : null
    };
  } catch {
    // Error fetching models, silent in production
    return {
      models: [],
      error: "Error fetching models. Please check network connection and service availability."
    };
  }
}

/**
 * @returns {Array} The conversation history
 */
export function getConversationHistory() {
  return conversationHistory;
}

/**
 * Clears the conversation history
 */
export function clearConversationHistory() {
  GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
    conversationHistory = [];
    ollamaProvider.resetContext();
    return GLib.SOURCE_REMOVE;
  });
}

/**
 * Clean up all module state when the extension is disabled
 * Resets all variables to their initial state
 */
export function cleanupOnDisable() {
  if (cancelCurrentRequest) {
    cancelCurrentRequest();
  }

  conversationHistory = [];
  currentModel = null;
  isMessageInProgress = false;
  cancelCurrentRequest = null;
  lastError = null;
  ollamaProvider.resetContext();
}

/**
 * @param {string} text - Message text
 * @param {string} type - Message type (user or assistant)
 */
function addMessageToHistory(text, type) {
  if (!text) return;
  
  // Remove any "Prompt:" prefix from the text
  const cleanText = text.replace(/^Prompt:\s*/iu, '');
  conversationHistory.push({ text: cleanText, type });
}

/**
 * @returns {boolean} True if a message is being processed
 */
export function isProcessingMessage() {
  return isMessageInProgress;
}

/**
 * Process the response from the AI provider
 * @param {Object|string} response - Response from the provider
 * @returns {string} Processed response text
 */
function processProviderResponse(response) {
  // Handle string responses directly
  if (typeof response === "string") {
    return response.replace(/^Prompt:\s*/iu, '');
  }

  // Handle object responses
  if (response && typeof response === "object") {
    // Handle OpenAI-style response
    if (response.choices && response.choices[0]?.message?.content) {
      return response.choices[0].message.content.replace(/^Prompt:\s*/iu, '');
    }
    
    // Handle Ollama-style response
    if (response.response) {
      return response.response.replace(/^Prompt:\s*/iu, '');
    }

    // Handle direct response property
    if (response.content) {
      return response.content.replace(/^Prompt:\s*/iu, '');
    }
    
    // Handle text property from parsed responses
    if (response.text) {
      return response.text.replace(/^Prompt:\s*/iu, '');
    }
  }

  return "No valid response received";
}

/**
 * Handles errors during API communication
 * @param {Error} error - The error that occurred
 * @returns {string} Error message
 */
function handleApiError(error) {
  const provider = getProviderForModel(currentModel);
  let errorMessage;
  
  // Include model information and more context in error messages
  if (provider === openaiProvider) {
    errorMessage = `Error communicating with OpenAI (model: ${currentModel || "unknown"}). ${error.message || "Please check your API key in settings."}`;
    if (error.message && error.message.includes("429 is not a valid value for enumeration Status")) {
      errorMessage += "\n\nThis might be due to rate limiting. Try again later.";
    }
  } else if (provider === geminiProvider) {
    errorMessage = `Error communicating with Gemini (model: ${currentModel || "unknown"}). ${error.message || "Please check your API key in settings."}`;
  } else {
    errorMessage = `Error communicating with Ollama (model: ${currentModel || "unknown"}). ${error.message || "Please check if Ollama is installed and running."}`;
  }
  
  // Set lastError for temporary message display
  lastError = errorMessage;
  
  return errorMessage;
}

/**
 * Send the API request and handle the cancel function
 * @param {Object} options - API call options
 * @returns {Promise<{result: Promise, responseText: Promise<string>}>} Result and response text promises
 */
async function sendApiRequest({
  provider,
  messageText,
  modelName,
  contextToUse,
  asyncOnData,
}) {
  // Store in a local variable and clear global to avoid race condition
  const prevCancel = cancelCurrentRequest;
  cancelCurrentRequest = null;
  
  if (prevCancel) {
    prevCancel();
  }

  // For OpenAI and Gemini, use the conversation history directly
  // For Ollama, use contextToUse parameter or let the provider handle context
  const context = (provider === openaiProvider || provider === geminiProvider) ? 
    conversationHistory : 
    contextToUse;

  const apiResult = await provider.sendMessageToAPI({
    messageText,
    modelName,
    context,
    onData: asyncOnData,
  });
  
  // Store cancel function - only assign if we're still in this call context
  // Use a local function to ensure atomic update
  const newCancel = apiResult.cancel;
  GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
    if (cancelCurrentRequest === null) {
      cancelCurrentRequest = newCancel;
    }
    return GLib.SOURCE_REMOVE;
  });
  
  return apiResult.result;
}

/**
 * Send a message to the AI and process the response
 * @param {Object} options - Message options
 * @param {string} options.message - The message to send
 * @param {string} [options.context] - Optional conversation context
 * @param {Function} [options.onData] - Callback function for streaming response
 * @param {Function} [options.displayMessage] - Optional simplified message for history
 * @returns {Promise<string>} The complete response
 */
export async function sendMessage({
  message,
  context,
  onData,
  displayMessage = null,
}) {
  // Early return checks - don't start if already processing
  if (isMessageInProgress) return "";
  if (!currentModel) {
    // Use the default model from settings
    const settings = getSettings();
    currentModel = settings.get_string("default-model");
    if (!currentModel) return "";
  }

  // Set processing state
  GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
    isMessageInProgress = true;
    return GLib.SOURCE_REMOVE;
  });
  
  lastError = null;
  
  // Check if this is the first message in the conversation and show the model prompt
  if (conversationHistory.length === 0) {
    // Get the model prompt and add it as a system message in the history only
    const settings = getSettings();
    const modelPrompt = settings.get_string("model-prompt") || "";
    
    if (modelPrompt && modelPrompt.trim() !== "") {
      // Add the model prompt as a system message in the history
      addMessageToHistory(modelPrompt, "system");
    }
  }

  // For history, use a clean message (but we'll send the original message to the model)
  const cleanMessage = message.replace(/^Prompt:\s*/iu, '');
  addMessageToHistory(cleanMessage, "user");

  // Only call displayMessage if it's provided and is a function
  if (displayMessage && typeof displayMessage === 'function') {
    try {
      displayMessage(cleanMessage, "user");
    } catch {
      // Error handling
    }
  }

  let responseText = "";

  try {
    const asyncOnData = (data) => {
      // Ensure data is valid and not an error message that should be a temporary message
      if (!data || typeof data !== 'string' || data.includes("Error communicating with")) {
        return;
      }
      
      responseText += data;
      
      if (onData) {
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
          onData(data);
          return GLib.SOURCE_REMOVE;
        });
      }
    };

    // Create proper context based on provider
    const provider = getProviderForModel(currentModel);
    
    const contextToUse = context || ((provider === openaiProvider || provider === geminiProvider) ? conversationHistory : null);
    
    // Use the original message (not the cleaned message) for the API request
    const result = await sendApiRequest({
      provider,
      messageText: message,
      modelName: currentModel,
      contextToUse,
      asyncOnData,
    });

    // Wait for the result to resolve
    const response = await result;
    responseText = processProviderResponse(response);
    
    if (responseText && responseText !== "No valid response received") {
      addMessageToHistory(responseText, "assistant");
      // Only call displayMessage if it's provided and is a function
      if (displayMessage && typeof displayMessage === 'function') {
        try {
          displayMessage(responseText, "assistant");
        } catch {
          // Error handling
        }
      }
    }
  } catch (error) {
    // Handle the error without sending to asyncOnData callback
    const errorMessage = handleApiError(error);
    
    // Only add the error to history if lastError is set to null
    if (lastError === null) {
      addMessageToHistory(errorMessage, "assistant");
    }
  } finally {
    // Reset processing state using GLib.idle_add to ensure it's done on the main thread
    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
      isMessageInProgress = false;
      return GLib.SOURCE_REMOVE;
    });
  }
  
  return responseText;
}

/**
 * Stops the current AI message generation
 * @returns {string|null} Partial response or null if no message was in progress
 */
export function stopAiMessage() {
  if (cancelCurrentRequest) {
    cancelCurrentRequest();
    cancelCurrentRequest = null;
  }
  isMessageInProgress = false;
  return null;
}

/**
 * Gets the last error that occurred
 * @returns {string|null} The last error message or null if no error occurred
 */
export function getLastError() {
  return lastError;
}
