/**
 * Services for communicating with the AI backend
 */
import { getSettings } from "../lib/settings.js";
import * as ollamaProvider from "./providers/ollamaProvider.js";
import * as openaiProvider from "./providers/openaiProvider.js";
import GLib from "gi://GLib";

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
  // Use idle_add to prevent blocking when updating settings
  GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
    const settings = getSettings();
    settings.set_string("default-model", modelName);
    return GLib.SOURCE_REMOVE;
  });
}

/**
 * Gets the current AI model
 * @returns {string} Current model name
 */
export function getCurrentModel() {
  if (!currentModel) {
    currentModel = getSettings().get_string("default-model");
  }
  return currentModel;
}

/**
 * Get the appropriate provider for the current model
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
    // Fetch both providers in parallel to improve responsiveness
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
  } catch (error) {
    console.error("Error fetching model names:", error);
    return {
      models: [],
      error:
        "Error fetching models. Please check network connection and service availability.",
    };
  }
}

/**
 * Gets the current conversation history
 * @returns {Array} The conversation history
 */
export function getConversationHistory() {
  return conversationHistory;
}

/**
 * Clears the conversation history
 */
export function clearConversationHistory() {
  // Use idle_add to prevent blocking
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
  // Cancel any ongoing requests
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
 * Add a message to the conversation history
 * @param {string} text - Message text
 * @param {string} type - Message type (user or assistant)
 */
function addMessageToHistory(text, type) {
  GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
    conversationHistory.push({ text, type });
    return GLib.SOURCE_REMOVE;
  });
}

/**
 * Checks if a message is currently being processed
 * @returns {boolean} True if a message is being processed
 */
export function isProcessingMessage() {
  return isMessageInProgress;
}

/**
 * Gets the last error that occurred during message processing
 * @returns {string|null} Last error message or null if no error
 */
export function getLastError() {
  return lastError;
}

/**
 * Send a message to the AI and process the response
 * @param {string} message - The message to send
 * @param {string} context - Optional conversation context
 * @param {Function} onData - Callback function for streaming response
 * @param {string} displayMessage - Optional simplified message for history (without file content)
 * @returns {Promise<string>} The complete response
 */
export async function sendMessage(message, context, onData, displayMessage) {
  if (!currentModel) {
    currentModel = getSettings().get_string("default-model");
  }

  // Reset error state
  lastError = null;
  isMessageInProgress = true;

  // Use displayMessage for history if provided, otherwise use the full message
  addMessageToHistory(displayMessage || message, "user");

  // Create a wrapper for the onData callback that doesn't block the UI
  const asyncOnData = onData
    ? (data) => {
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
          onData(data);
          return GLib.SOURCE_REMOVE;
        });
      }
    : null;

  try {
    const provider = getProviderForModel(currentModel);
    const contextToUse =
      context ||
      (provider === ollamaProvider ? ollamaProvider.getCurrentContext() : null);

    // If previous request is in progress, cancel it
    if (cancelCurrentRequest) {
      cancelCurrentRequest();
    }

    // Get a new cancellable function from the provider
    const { result, cancel } = await provider.sendMessageToAPI(
      message,
      currentModel,
      provider === openaiProvider ? conversationHistory : contextToUse,
      asyncOnData
    );

    // Store cancel function for potential cancellation
    cancelCurrentRequest = cancel;

    try {
      // Process the result with proper error handling
      const response = await result;

      // Validate response object before using it
      const responseText =
        response && typeof response === "object" && "response" in response
          ? response.response
          : typeof response === "string"
          ? response
          : "No valid response received";

      // Add validated response to history
      addMessageToHistory(responseText, "assistant");

      // Clean up
      cancelCurrentRequest = null;
      isMessageInProgress = false;

      return responseText;
    } catch (resultError) {
      console.error("Error processing AI response:", resultError);

      // Set friendly error message
      lastError =
        "Error processing the AI's response. The message may be incomplete.";

      // Try to return partial response if available
      if (asyncOnData) asyncOnData(lastError);

      // Clean up even if there's an error
      cancelCurrentRequest = null;
      isMessageInProgress = false;

      return lastError;
    }
  } catch (e) {
    console.error("Error sending message to API:", e);

    // Set error message based on provider
    const provider = getProviderForModel(currentModel);
    lastError =
      provider === openaiProvider
        ? "Error communicating with OpenAI. Please check your API key in settings."
        : "Error communicating with Ollama. Please check if Ollama is installed and running.";

    if (asyncOnData) asyncOnData(lastError);

    // Ensure cleanup
    cancelCurrentRequest = null;
    isMessageInProgress = false;

    return lastError;
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

  // Use the stored cancel function
  if (cancelCurrentRequest) {
    cancelCurrentRequest();
    cancelCurrentRequest = null;
  }

  isMessageInProgress = false;
  const provider = getProviderForModel(currentModel);
  return provider.stopMessage();
}
