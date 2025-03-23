/**
 * Provider for communicating with Ollama API
 * Manages Ollama model interactions and streaming responses
 */

import { ErrorType, handleError } from "../../lib/errorHandler.js";
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
    handleError(
      "fetchModelNames",
      "Error fetching Ollama model names",
      error,
      ErrorType.API
    );
    return [];
  }
}

/**
 * Sends a message to the Ollama API endpoint
 * @param {string} messageText - Message to send
 * @param {string} modelName - Model to use
 * @param {string} context - Optional context from previous interactions
 * @param {Function} onData - Callback for streaming data
 * @returns {Promise<{result: Promise<{response: string, context: string}>, cancel: Function}>} Response promise and cancel function
 */
export async function sendMessageToAPI(
  messageText,
  modelName,
  context,
  onData
) {
  const settings = getSettings();
  apiSession = createCancellableSession();

  const payload = JSON.stringify({
    model: modelName,
    prompt: messageText,
    stream: true,
    temperature: settings.get_double("temperature"),
    context: context || null,
  });

  const endpoint = settings.get_string("api-endpoint");

  const processChunk = async (lineText) => {
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
      handleError(
        "processChunk",
        "Error parsing JSON chunk from Ollama API",
        parseError,
        ErrorType.API
      );
    }

    return null;
  };

  try {
    const requestHandler = await apiSession.sendRequest(
      "POST",
      endpoint,
      { "Content-Type": "application/json" },
      payload,
      processChunk
    );

    // Transform the API response to match our provider interface
    return {
      result: requestHandler.result.then((result) => {
        const response = result.response;
        const responseContext = currentContext;

        // Reset the API session once completed successfully
        setTimeout(() => {
          apiSession = null;
        }, 0);

        return { response, context: responseContext };
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
  } catch (error) {
    handleError(
      "sendMessageToAPI",
      "Error sending message to Ollama API",
      error,
      ErrorType.API
    );

    const accumulatedResponse = apiSession
      ? apiSession.getAccumulatedResponse()
      : "";
    apiSession = null;

    if (accumulatedResponse) {
      return {
        result: Promise.resolve({
          response: accumulatedResponse,
          context: currentContext,
        }),
        cancel: () => accumulatedResponse,
      };
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
