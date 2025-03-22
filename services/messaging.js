/**
 * Services for communicating with the AI backend
 */
import { getSettings } from "../lib/settings.js";
import * as ollamaProvider from "./providers/ollamaProvider.js";
import * as openaiProvider from "./providers/openaiProvider.js";

let conversationHistory = [];
let currentModel = null;
let lastError = null;
let isMessageInProgress = false;

/**
 * Sets the current AI model
 * @param {string} modelName - Name of the model to use
 */
export function setModel(modelName) {
  currentModel = modelName;
  const settings = getSettings();
  settings.set_string("default-model", modelName);
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
  const ollamaModels = await ollamaProvider.fetchModelNames();
  const openaiModels = await openaiProvider.fetchModelNames();

  const models = [...ollamaModels, ...openaiModels];
  let error = null;

  if (models.length === 0) {
    error =
      "No models found. Please check if Ollama is running with models installed, or that you have an API key in settings.";
  }

  return { models, error };
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
  conversationHistory = [];
  ollamaProvider.resetContext();
}

/**
 * Clean up all module state when the extension is disabled
 * Resets all variables to their initial state
 */
export function cleanupOnDisable() {
  conversationHistory = [];
  currentModel = null;
  lastError = null;
  isMessageInProgress = false;
  ollamaProvider.resetContext();
}

/**
 * Add a message to the conversation history
 * @param {string} text - Message text
 * @param {string} type - Message type (user or assistant)
 */
function addMessageToHistory(text, type) {
  conversationHistory.push({ text, type });
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

  try {
    const provider = getProviderForModel(currentModel);
    const contextToUse =
      context ||
      (provider === ollamaProvider ? ollamaProvider.getCurrentContext() : null);

    const result = await provider.sendMessageToAPI(
      message,
      currentModel,
      provider === openaiProvider ? conversationHistory : contextToUse,
      onData
    );

    addMessageToHistory(result.response, "assistant");
    isMessageInProgress = false;
    return result.response;
  } catch (e) {
    console.error("Error sending message to API:", e);

    // Set error message based on provider
    const provider = getProviderForModel(currentModel);
    lastError =
      provider === openaiProvider
        ? "Error communicating with OpenAI. Please check your API key in settings."
        : "Error communicating with Ollama. Please check if Ollama is installed and running.";

    if (onData) onData(lastError);
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

  isMessageInProgress = false;
  const provider = getProviderForModel(currentModel);
  return provider.stopMessage();
}
