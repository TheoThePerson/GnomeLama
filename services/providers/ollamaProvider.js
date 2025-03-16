/**
 * Provider for communicating with Ollama API
 */

import { getSettings } from "../../lib/settings.js";
import { createCancellableSession, invokeCallback } from "../apiUtils.js";

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

    // Create a temporary session for this request
    const tempSession = createCancellableSession();

    // Make the API request
    const data = await tempSession.get(endpoint);

    // Parse and extract model names
    return data.models
      .map((model) => model.name)
      .filter((value, index, self) => self.indexOf(value) === index)
      .sort();
  } catch (e) {
    console.error("Error fetching model names:", e);
    return [];
  }
}

/**
 * Sends a message to the Ollama API endpoint
 * @param {string} messageText - Message to send
 * @param {string} modelName - Model to use
 * @param {string} context - Optional context from previous interactions
 * @param {Function} onData - Callback for streaming data
 * @returns {Promise<{response: string, context: string}>} Complete response and context
 */
export async function sendMessageToAPI(
  messageText,
  modelName,
  context,
  onData
) {
  const settings = getSettings();

  // Create a new API session
  apiSession = createCancellableSession();

  // Prepare payload
  const payload = JSON.stringify({
    model: modelName,
    prompt: messageText,
    stream: true,
    temperature: settings.get_double("temperature"),
    context: context || null,
  });

  // Get the API endpoint
  const endpoint = settings.get_string("api-endpoint");

  // Define how to process each chunk from the Ollama API
  const processChunk = async (lineText) => {
    try {
      const json = JSON.parse(lineText);

      // Save context if provided
      if (json.context) {
        currentContext = json.context;
      }

      // Handle response content
      if (json.response) {
        const chunk = json.response;

        // Call the onData callback if provided
        if (onData) {
          await invokeCallback(onData, chunk);
        }

        return chunk;
      }
    } catch (parseError) {
      console.error("Error parsing JSON chunk:", parseError);
    }

    return null;
  };

  try {
    // Send the request and process streaming response
    const result = await apiSession.sendRequest(
      "POST",
      endpoint,
      { "Content-Type": "application/json" },
      payload,
      processChunk
    );

    // Clean up
    const response = result.response;
    const responseContext = currentContext;
    apiSession = null;

    return { response, context: responseContext };
  } catch (error) {
    console.error("API request error:", error);

    // Clean up on error
    const accumulatedResponse = apiSession
      ? apiSession.getAccumulatedResponse()
      : "";
    apiSession = null;

    // If we have accumulated some response, return it despite the error
    if (accumulatedResponse) {
      return { response: accumulatedResponse, context: currentContext };
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

  // Cancel the request and get the accumulated response
  const partialResponse = apiSession.cancelRequest();

  // Clean up
  apiSession = null;

  return partialResponse;
}
