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

// Constants for debugging
const DEBUG = true;

/**
 * Debug logger for provider issues
 * @param {string} message - Debug message
 * @param {Object} [data] - Optional data to log
 */
function debugLog(message, data) {
  if (!DEBUG) return;
  
  if (data) {
    console.log(`[DEBUG] ${message}`, data);
  } else {
    console.log(`[DEBUG] ${message}`);
  }
}

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
  } else if (geminiProvider.isGeminiModel(modelName)) {
    return geminiProvider;
  } else {
    return ollamaProvider;
  }
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
    
    // Check for errors from providers
    checkProviderErrors();

    const models = [
      ...(ollamaModels.status === "fulfilled" ? ollamaModels.value : []),
      ...(openaiModels.status === "fulfilled" ? openaiModels.value : []),
      ...(geminiModels.status === "fulfilled" ? geminiModels.value : []),
    ];

    return {
      models,
      error: models.length === 0 ? "No models found. Please check if services are running with models installed, or that you have API keys in settings." : null
    };
  } catch (error) {
    console.error("Error fetching models:", error);
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
  const cleanText = text.replace(/^Prompt:\s*/i, '');
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
    return response.replace(/^Prompt:\s*/i, '');
  }

  // Handle object responses
  if (response && typeof response === "object") {
    // Handle OpenAI-style response
    if (response.choices && response.choices[0]?.message?.content) {
      return response.choices[0].message.content.replace(/^Prompt:\s*/i, '');
    }
    
    // Handle Ollama-style response
    if (response.response) {
      return response.response.replace(/^Prompt:\s*/i, '');
    }

    // Handle direct response property
    if (response.content) {
      return response.content.replace(/^Prompt:\s*/i, '');
    }
    
    // Handle text property from parsed responses
    if (response.text) {
      return response.text.replace(/^Prompt:\s*/i, '');
    }
  }

  // If we get here, log the response for debugging
  console.warn("Unexpected response format:", response);
  return "No valid response received";
}

/**
 * Handles errors during API communication
 * @param {Error} error - The error that occurred
 * @param {Function|null} asyncOnData - Optional callback for streaming data
 * @returns {string} Error message
 */
function handleApiError(error, asyncOnData) {
  const provider = getProviderForModel(currentModel);
  let errorMessage;
  
  if (provider === openaiProvider) {
    errorMessage = "Error communicating with OpenAI. Please check your API key in settings.";
  } else if (provider === geminiProvider) {
    errorMessage = "Error communicating with Gemini. Please check your API key in settings.";
  } else {
    errorMessage = "Error communicating with Ollama. Please check if Ollama is installed and running.";
  }

  lastError = errorMessage;
  if (asyncOnData) asyncOnData(errorMessage);
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
  if (cancelCurrentRequest) {
    cancelCurrentRequest();
  }

  // For OpenAI and Gemini, use the conversation history directly
  // For Ollama, use contextToUse parameter or let the provider handle context
  const context = (provider === openaiProvider || provider === geminiProvider) ? 
    conversationHistory : 
    contextToUse;

  const { result, cancel } = await provider.sendMessageToAPI({
    messageText,
    modelName,
    context,
    onData: asyncOnData,
  });

  cancelCurrentRequest = cancel;
  return result;
}

/**
 * Send a message to the AI and process the response
 * @param {Object} options - Message options
 * @param {string} options.message - The message to send
 * @param {string} [options.context] - Optional conversation context
 * @param {Function} [options.onData] - Callback function for streaming response
 * @param {string} [options.displayMessage] - Optional simplified message for history
 * @returns {Promise<string>} The complete response
 */
export async function sendMessage({
  message,
  context,
  onData,
  displayMessage = null,
}) {
  if (isMessageInProgress) return;
  if (!currentModel) {
    // Use the default model from settings
    const settings = getSettings();
    currentModel = settings.get_string("default-model");
    if (!currentModel) return;
  }

  isMessageInProgress = true;
  lastError = null;

  // Clean the message before adding to history
  const cleanMessage = message.replace(/^Prompt:\s*/i, '');
  addMessageToHistory(cleanMessage, "user");

  // Only call displayMessage if it's provided and is a function
  if (displayMessage && typeof displayMessage === 'function') {
    try {
      displayMessage(cleanMessage, "user");
    } catch (error) {
      console.error("Error calling displayMessage:", error);
    }
  }

  let responseText = "";
  debugLog(`Starting message to model: ${currentModel}`);

  try {
    const asyncOnData = (data) => {
      responseText += data;
      debugLog(`Received chunk: ${data.substring(0, 20)}...`);
      
      if (onData) {
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
          onData(data);
          return GLib.SOURCE_REMOVE;
        });
      }
    };

    // Create proper context based on provider
    const provider = getProviderForModel(currentModel);
    let providerName = 'Ollama';
    if (provider === openaiProvider) providerName = 'OpenAI';
    if (provider === geminiProvider) providerName = 'Gemini';
    
    debugLog(`Using provider: ${providerName}`);
    
    const contextToUse = context || ((provider === openaiProvider || provider === geminiProvider) ? conversationHistory : null);
    debugLog(`Context length: ${contextToUse ? contextToUse.length : 0}`);
    
    const result = await sendApiRequest({
      provider,
      messageText: cleanMessage,
      modelName: currentModel,
      contextToUse,
      asyncOnData,
    });

    // Check for errors from providers after API request
    checkProviderErrors();
    
    // Wait for the result to resolve
    debugLog(`Waiting for full response`);
    const response = await result;
    responseText = processProviderResponse(response);
    debugLog(`Got full response: ${responseText.substring(0, 50)}...`);
    
    if (responseText && responseText !== "No valid response received") {
      addMessageToHistory(responseText, "assistant");
      // Only call displayMessage if it's provided and is a function
      if (displayMessage && typeof displayMessage === 'function') {
        try {
          displayMessage(responseText, "assistant");
        } catch (error) {
          console.error("Error calling displayMessage for response:", error);
        }
      }
    }
  } catch (error) {
    console.error("Error sending message:", error);
    debugLog(`Error in sendMessage: ${error.message}`);
    const errorMessage = handleApiError(error, asyncOnData);
    addMessageToHistory(errorMessage, "assistant");
    
    // Only call displayMessage if it's provided and is a function
    if (displayMessage && typeof displayMessage === 'function') {
      try {
        displayMessage(errorMessage, "assistant");
      } catch (error) {
        console.error("Error calling displayMessage for error:", error);
      }
    }
  } finally {
    isMessageInProgress = false;
    cancelCurrentRequest = null;
    debugLog(`Message completed`);
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
}

export function getLastError() {
  return lastError;
}

// Add this helper function to check providers for errors
function checkProviderErrors() {
  if (typeof openaiProvider.getErrorMessages === 'function') {
    const errors = openaiProvider.getErrorMessages();
    if (errors.length > 0) {
      console.log("OpenAI provider errors:", errors);
    }
  }
  
  if (typeof geminiProvider.getErrorMessages === 'function') {
    const errors = geminiProvider.getErrorMessages();
    if (errors.length > 0) {
      console.log("Gemini provider errors:", errors);
    }
  }
}
