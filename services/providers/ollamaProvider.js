/**
 * Provider for communicating with Ollama API
 * Manages Ollama model interactions and streaming responses
 */

import { getSettings } from "../../lib/settings.js";
import { createCancellableSession } from "../apiUtils.js";
import {
  createChunkProcessor,
  transformApiResponse,
  sendMessageToAPI as sendToAPI,
  safelyTerminateSession
} from "./providerUtils.js";
import {
  removeDuplicateModels,
  sortModels
} from "./modelUtils.js";

// Module state
let currentContext = null; // Store the context from previous interactions

/**
 * Resets the current context
 */
export function resetContext() {
  currentContext = null;
}

/**
 * Fetches model names from the Ollama API
 * @returns {Promise<string[]>} Array of available model names
 */
export async function fetchModelNames() {
  try {
    const settings = getSettings();
    const endpoint = settings.get_string("models-api-endpoint");

    const tempSession = createCancellableSession();
    const data = await tempSession.get(endpoint);

    // Extract model names, remove duplicates, and sort
    const modelNames = data.models.map((model) => model.name);
    return sortModels(removeDuplicateModels(modelNames));
  } catch {
    // Error fetching Ollama model names
    return [];
  }
}

/**
 * Creates a JSON payload for the Ollama API
 * @param {string} modelName - Model to use
 * @param {string} messageText - Message to send
 * @param {string} context - Optional context from previous interactions
 * @returns {string} JSON payload string
 */
function createApiPayload(modelName, messageText, context) {
  const settings = getSettings();
  return JSON.stringify({
    model: modelName,
    prompt: messageText,
    stream: true,
    temperature: settings.get_double("temperature"),
    context: context || null,
  });
}

/**
 * Process JSON from Ollama API responses
 * @param {Object} json - Parsed JSON from API
 * @returns {string|null} Processed chunk or null
 */
function processOllamaJson(json) {
  if (json.context) {
    currentContext = json.context;
  }

  if (json.response) {
    return json.response;
  }

  return null;
}

/**
 * Process result from Ollama API
 * @param {Object} result - API result
 * @returns {string} Processed response text
 */
function processOllamaResult(result) {
  // Extract just the response text
  const responseText = result && result.response ? result.response : "";

  // Store context separately but return just the string
  if (result && result.context) {
    currentContext = result.context;
  }

  return responseText;
}

/**
 * Sends a message to the Ollama API endpoint
 * @param {Object} options - API call options
 * @param {string} options.messageText - Message to send
 * @param {string} options.modelName - Model to use
 * @param {string} [options.context] - Optional context from previous interactions
 * @param {Function} [options.onData] - Callback for streaming data
 * @returns {Promise<{result: Promise<string>, cancel: Function}>} Response promise and cancel function
 */
export async function sendMessageToAPI({
  messageText,
  modelName,
  context,
  onData,
}) {
  const settings = getSettings();
  const endpoint = settings.get_string("api-endpoint");
  const payload = createApiPayload(modelName, messageText, context || currentContext);
  
  // Create chunk processor specific to Ollama
  const processChunk = createChunkProcessor(onData, processOllamaJson);
  
  return sendToAPI({
    method: "POST",
    endpoint,
    headers: { "Content-Type": "application/json" },
    payload,
    processChunk,
    transformResponse: (requestHandler) => 
      transformApiResponse(requestHandler, processOllamaResult)
  });
}

/**
 * Stops the current message streaming operation
 * @returns {string} The accumulated response text so far
 */
export function stopMessage() {
  return safelyTerminateSession(resetContext);
}
