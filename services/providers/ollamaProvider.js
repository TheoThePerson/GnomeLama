/**
 * Provider for communicating with Ollama API
 * Manages Ollama model interactions and streaming responses
 */

import GLib from "gi://GLib";
import { getSettings } from "../../lib/settings.js";
import { createCancellableSession, invokeCallback } from "../apiUtils.js";

// Module state
let currentContext = null; // Store the context from previous interactions
let apiSession = null; // API session handler

/**
 * Gets the current context from previous interactions
 * @returns {string|null} The current context
 */
export function getCurrentContext() {
  return currentContext;
}

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

    return data.models
      .map((model) => model.name)
      .filter((value, index, self) => self.indexOf(value) === index)
      .sort();
  } catch (error) {
    console.error("Error fetching Ollama model names:", error);
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
 * Creates a processor function for API response chunks
 * @param {Function} onData - Callback for streaming data
 * @returns {Function} Chunk processor function
 */
function createChunkProcessor(onData) {
  return async (lineText) => {
    try {
      const json = JSON.parse(lineText);

      if (json.context) {
        currentContext = json.context;
      }

      if (json.response) {
        const chunk = json.response;

        if (onData) {
          await invokeCallback(onData, chunk);
        }

        return chunk;
      }
    } catch (parseError) {
      console.error("Error parsing JSON chunk from Ollama API:", parseError);
    }

    return null;
  };
}

/**
 * Transforms API response to match provider interface
 * @param {Object} requestHandler - Request handler from API session
 * @returns {Object} Provider interface response
 */
function transformApiResponse(requestHandler) {
  return {
    result: requestHandler.result.then((result) => {
      // Extract just the response text
      const responseText = result && result.response ? result.response : "";

      // Store context separately but return just the string
      if (result && result.context) {
        currentContext = result.context;
      }

      // Reset the API session once completed successfully
      GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
        apiSession = null;
        return GLib.SOURCE_REMOVE;
      });

      return responseText;
    }),
    cancel: () => {
      if (apiSession) {
        const partial = apiSession.cancelRequest();
        apiSession = null;
        return partial;
      }
      return "";
    },
  };
}

/**
 * Handle errors during API calls
 * @returns {Object|null} Error response or null to throw
 */
function handleApiError() {
  const accumulatedResponse = apiSession
    ? apiSession.getAccumulatedResponse()
    : "";
  apiSession = null;

  if (accumulatedResponse) {
    return {
      result: Promise.resolve(accumulatedResponse),
      cancel: () => accumulatedResponse,
    };
  }

  return null;
}

/**
 * Sends a message to the Ollama API endpoint
 * @param {Object} options - API call options
 * @param {string} options.messageText - Message to send
 * @param {string} options.modelName - Model to use
 * @param {string} [options.context] - Optional context from previous interactions
 * @param {Function} [options.onData] - Callback for streaming data
 * @returns {Promise<{result: Promise<{response: string, context: string}>, cancel: Function}>} Response promise and cancel function
 */
export async function sendMessageToAPI({
  messageText,
  modelName,
  context,
  onData,
}) {
  const settings = getSettings();
  apiSession = createCancellableSession();

  const payload = createApiPayload(modelName, messageText, context);
  const endpoint = settings.get_string("api-endpoint");
  const processChunk = createChunkProcessor(onData);

  try {
    const requestHandler = await apiSession.sendRequest(
      "POST",
      endpoint,
      { "Content-Type": "application/json" },
      payload,
      processChunk
    );

    return transformApiResponse(requestHandler);
  } catch (error) {
    console.error("Error sending message to Ollama API:", error);

    const errorResponse = handleApiError();
    if (errorResponse) {
      return errorResponse;
    }

    throw error;
  }
}

/**
 * Stops the current message streaming operation
 * @returns {string} The accumulated response text so far
 */
export function stopMessage() {
  if (!apiSession) {
    return "";
  }

  console.log("Cancelling message stream");
  const partialResponse = apiSession.cancelRequest();
  apiSession = null;

  return partialResponse;
}
