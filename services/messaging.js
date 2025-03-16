/**
 * Services for communicating with the AI backend
 */
import { getSettings } from "../lib/settings.js";
import * as ollamaProvider from "./providers/ollamaProvider.js";
import * as openaiProvider from "./providers/openaiProvider.js";

let conversationHistory = [];
let currentModel = null;

/**
 * Sets the current AI model
 * @param {string} modelName - Name of the model to use
 */
export function setModel(modelName) {
  currentModel = modelName;
  // Save as the default model in settings
  const settings = getSettings();
  settings.set_string("default-model", modelName);
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
      "No models found. Please check if Ollama is running with models installed,or that you have an API key in settings.";
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
 * Send a message to the AI and process the response
 * @param {string} message - The message to send
 * @param {string} context - Optional conversation context
 * @param {Function} onData - Callback function for streaming response
 * @returns {Promise<string>} The complete response
 */
export async function sendMessage(message, context, onData) {
  // Ensure a model is selected
  if (!currentModel) {
    currentModel = getSettings().get_string("default-model");
  }

  // Add user message to history
  addMessageToHistory(message, "user");

  try {
    let result;

    // Determine which provider to use based on whether it's an OpenAI model
    if (openaiProvider.isOpenAIModel(currentModel)) {
      result = await openaiProvider.sendMessageToAPI(
        message,
        currentModel,
        conversationHistory,
        onData
      );
    } else {
      // Get current context if not provided
      const currentContext = context || ollamaProvider.getCurrentContext();
      result = await ollamaProvider.sendMessageToAPI(
        message,
        currentModel,
        currentContext,
        onData
      );
    }

    // Add assistant response to history
    addMessageToHistory(result.response, "assistant");
    return result.response;
  } catch (e) {
    console.error("Error sending message to API:", e);
    const errorMsg = openaiProvider.isOpenAIModel(currentModel)
      ? "Error communicating with OpenAI. Please check your API key in settings."
      : "Error communicating with Ollama. Please check if Ollama is installed and running.";
    if (onData) onData(errorMsg);
    return errorMsg;
  }
}

export function stopAiMessage() {
  if (openaiProvider.isOpenAIModel(currentModel)) {
    // openaiProvider.stopMessage(); something like this not implemented yet
  } else {
    // ollamaProvider.stopMessage(); something like this not implemented yet
  }
}
