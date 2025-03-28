/**
 * Services for communicating with the AI backend
 */
import GLib from "gi://GLib";
import { getSettings } from "../lib/settings.js";
import * as ollamaProvider from "./providers/ollamaProvider.js";
import * as openaiProvider from "./providers/openaiProvider.js";

let conversationHistory = [];
let currentModel = null;
let lastError = null;
let isMessageInProgress = false;
let cancelCurrentRequest = null;

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
  return openaiProvider.isOpenAIModel(modelName)
    ? openaiProvider
    : ollamaProvider;
}

/**
 * Fetches model names from the API
 * @returns {Promise<{models: string[], error: string|null}>} Object containing array of available model names and optional error
 */
export async function fetchModelNames() {
  try {
    const [ollamaModels, openaiModels] = await Promise.allSettled([
      ollamaProvider.fetchModelNames(),
      openaiProvider.fetchModelNames(),
    ]);

    const models = [
      ...(ollamaModels.status === "fulfilled" ? ollamaModels.value : []),
      ...(openaiModels.status === "fulfilled" ? openaiModels.value : []),
    ];

    let error = null;
    if (models.length === 0) {
      error =
        "No models found. Please check if Ollama is running with models installed, or that you have an API key in settings.";
    }

    return { models, error };
  } catch {
    // Error fetching models, silent in production
    return {
      models: [],
      error:
        "Error fetching models. Please check network connection and service availability.",
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
  lastError = null;
  isMessageInProgress = false;
  cancelCurrentRequest = null;
  ollamaProvider.resetContext();
}

/**
 * @param {string} text - Message text
 * @param {string} type - Message type (user or assistant)
 */
function addMessageToHistory(text, type) {
  // Handle empty or invalid text
  if (!text || typeof text !== "string") {
    // Invalid message text, converting to string

    // Handle Promise objects explicitly
    if (text instanceof Promise) {
      // Warning: Attempted to add Promise to history
      text = "Error: Message was a Promise object. Please try again.";
    } else {
      // For other non-string values, convert to string safely
      text = text ? String(text) : "";
    }
  }

  // Add to history immediately rather than using idle_add
  conversationHistory.push({ text, type });

  // Log history size for debugging
  // Added message to history. New history size: ${conversationHistory.length}
}

/**
 * @returns {boolean} True if a message is being processed
 */
export function isProcessingMessage() {
  return isMessageInProgress;
}

/**
 * @returns {string|null} Last error message or null if no error
 */
export function getLastError() {
  return lastError;
}

/**
 * Process the response from the AI provider
 * @param {Object|string} response - Response from the provider
 * @returns {string} Processed response text
 */
function processProviderResponse(response) {
  // Handle Promise objects
  if (response instanceof Promise) {
    // Warning: Response is a Promise, not actual data
    return "Error: Response was a Promise object. Please try again.";
  }

  // If it's already a string, just return it
  if (typeof response === "string") {
    return response;
  }

  // Handle old response format for backward compatibility
  if (response && typeof response === "object" && "response" in response) {
    return response.response;
  }

  // Fallback for unexpected response format
  return "No valid response received";
}

/**
 * Handles errors during API communication
 * @param {Error} error - The error that occurred
 * @param {Function|null} asyncOnData - Optional callback for streaming data
 * @returns {string} Error message
 */
function handleApiError(error, asyncOnData) {
  // Silent error in production

  const provider = getProviderForModel(currentModel);
  let errorMessage =
    provider === openaiProvider
      ? "Error communicating with OpenAI. Please check your API key in settings."
      : "Error communicating with Ollama. Please check if Ollama is installed and running.";

  // Add more detailed error information if available
  if (error && error.message) {
    errorMessage += ` Details: ${error.message}`;
    // Details silent in production
  }

  lastError = errorMessage;
  if (asyncOnData) asyncOnData(errorMessage);
  return errorMessage;
}

/**
 * Creates a callback function that runs on the main thread
 * @param {Function} callback - Original callback function
 * @returns {Function|null} Wrapped callback or null
 */
function createMainThreadCallback(callback) {
  if (!callback) return null;

  return (data) => {
    // Use HIGH priority for UI updates to ensure immediate display of chunks
    GLib.idle_add(GLib.PRIORITY_HIGH, () => {
      try {
        callback(data);
      } catch {
        // Silent error in production
      }
      return GLib.SOURCE_REMOVE;
    });
  };
}

/**
 * Updates the cancel request function atomically
 * @param {Function|null} newCancelFn - The new cancel function
 */
function updateCancelFunction(newCancelFn) {
  // Using a separate function to update the value atomically
  cancelCurrentRequest = newCancelFn;
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
  // Store the cancel function to avoid race conditions
  const previousCancelFn = cancelCurrentRequest;
  if (previousCancelFn) {
    previousCancelFn();
  }

  // Both providers now use object parameter structure
  const { result, cancel } = await provider.sendMessageToAPI({
    messageText,
    modelName,
    context: provider === openaiProvider ? conversationHistory : contextToUse,
    onData: asyncOnData,
  });

  // Update the cancel function atomically through a dedicated function
  updateCancelFunction(cancel);

  return {
    result,
    responseText: result.then((response) => {
      return processProviderResponse(response);
    }),
  };
}

/**
 * Handle successful API response
 * @param {string|Object} responseText - Response from the API
 * @returns {string} Processed response text
 */
function handleSuccessResponse(responseText) {
  // Reset error state
  lastError = null;

  // Make sure we have a string
  const finalResponse = processProviderResponse(responseText);

  // Update the cancel function atomically
  updateCancelFunction(null);

  // Reset message processing state
  isMessageInProgress = false;

  // Add to conversation history if valid
  if (typeof finalResponse === "string") {
    addMessageToHistory(finalResponse, "assistant");
  } else {
    // Skip invalid response, silent in production
  }

  return finalResponse;
}

/**
 * Process the API result and finalize the response
 * @param {Promise} apiResult - API result promise
 * @param {Function} asyncOnData - Callback for streaming data
 * @returns {Promise<string>} The response text
 */
async function processApiResult(apiResult, asyncOnData) {
  try {
    // Extract response from result
    const responseObject = await apiResult.result;

    // Process the response
    const responseText = handleSuccessResponse(responseObject);
    return responseText;
  } catch (error) {
    return handleApiError(error, asyncOnData);
  }
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
  displayMessage,
}) {
  if (!currentModel) {
    currentModel = getSettings().get_string("default-model");
  }

  lastError = null;
  isMessageInProgress = true;

  addMessageToHistory(displayMessage || message, "user");
  const asyncOnData = createMainThreadCallback(onData);

  try {
    const provider = getProviderForModel(currentModel);
    const contextToUse =
      context ||
      (provider === ollamaProvider ? ollamaProvider.getCurrentContext() : null);

    const apiResult = await sendApiRequest({
      provider,
      messageText: message,
      modelName: currentModel,
      contextToUse,
      asyncOnData,
    });

    return await processApiResult(apiResult, asyncOnData);
  } catch (e) {
    const errorMessage = handleApiError(e, asyncOnData);

    // Update the cancel function atomically
    updateCancelFunction(null);
    isMessageInProgress = false;

    return errorMessage;
  }
}

/**
 * Stops the current AI message generation
 * @returns {string|null} Partial response or null if no message was in progress
 */
export function stopAiMessage() {
  if (!isMessageInProgress) {
    return null;
  }

  // Store in a local variable first to avoid race conditions
  const cancelFn = cancelCurrentRequest;
  if (cancelFn) {
    cancelFn();
    updateCancelFunction(null);
  }

  isMessageInProgress = false;
  const provider = getProviderForModel(currentModel);
  return provider.stopMessage();
}
