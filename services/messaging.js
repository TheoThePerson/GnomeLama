/**
 * Services for communicating with the AI backend
 */
import GLib from "gi://GLib";
import { getSettings } from "../lib/settings.js";
import * as ollamaProvider from "./providers/ollamaProvider.js";
import * as openaiProvider from "./providers/openaiProvider.js";

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

    return {
      models,
      error: models.length === 0 ? "No models found. Please check if Ollama is running with models installed, or that you have an API key in settings." : null
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
  conversationHistory.push({ text: String(text), type });
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
  if (typeof response === "string") return response;
  if (response?.response) return response.response;
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
  const errorMessage = provider === openaiProvider
    ? "Error communicating with OpenAI. Please check your API key in settings."
    : "Error communicating with Ollama. Please check if Ollama is installed and running.";

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
    GLib.idle_add(GLib.PRIORITY_HIGH, () => {
      callback(data);
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
  if (isMessageInProgress) return;
  if (!currentModel) return;

  isMessageInProgress = true;
  addMessageToHistory(message, "user");

  try {
    const provider = getProviderForModel(currentModel);
    const result = await sendApiRequest({
      provider,
      messageText: message,
      modelName: currentModel,
      contextToUse: context,
      asyncOnData: onData,
    });

    const responseText = processProviderResponse(result);
    addMessageToHistory(responseText, "assistant");
    if (typeof displayMessage === 'function') {
      displayMessage(responseText);
    }
  } catch (error) {
    const errorMessage = handleApiError(error, onData);
    addMessageToHistory(errorMessage, "assistant");
    if (typeof displayMessage === 'function') {
      displayMessage(errorMessage);
    }
  } finally {
    isMessageInProgress = false;
    cancelCurrentRequest = null;
  }
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
