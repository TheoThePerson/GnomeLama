/**
 * Common utilities for provider implementations
 * Contains shared functionality to reduce duplication across providers
 */

import GLib from "gi://GLib";
import { createCancellableSession, invokeCallback } from "../apiUtils.js";

// Module state
let apiSession = null;

/**
 * Safely terminates any existing API session
 * @param {Function} resetContextFn - Optional function to reset context
 * @returns {string} Any partial response
 */
export function safelyTerminateSession(resetContextFn = null) {
  if (!apiSession) return "";

  try {
    const partial = apiSession.cancelRequest();
    apiSession = null;
    
    if (resetContextFn) {
      resetContextFn();
    }
    
    return partial;
  } catch (error) {
    apiSession = null;
    return "";
  }
}

/**
 * Creates a chunk processor function for streaming API responses
 * @param {Function} onData - Callback for streaming data
 * @param {Function} processJson - Function to process the JSON data
 * @param {Object} options - Additional options
 * @param {boolean} options.parseJson - Whether to parse the chunk as JSON
 * @returns {Function} Chunk processor function
 */
export function createChunkProcessor(onData, processJson, options = { parseJson: true }) {
  return async (lineText) => {
    try {
      let result;
      
      if (options.parseJson) {
        // Try to parse as JSON
        const json = JSON.parse(lineText);
        // Process with the provider-specific function
        result = processJson(json);
      } else {
        // Use the processor directly on the text
        result = processJson(lineText);
      }
      
      // Handle streaming data callback
      if (result && onData) {
        await invokeCallback(onData, result);
      }
      
      return result;
    } catch (error) {
      // Silent error - just return null for unparseable chunks
      return null;
    }
  };
}

/**
 * Transform raw API response to standardized provider interface
 * @param {Object} requestHandler - Request handler from API session
 * @param {Function} processResult - Function to process the result
 * @returns {Object} Standardized provider interface response
 */
export function transformApiResponse(requestHandler, processResult) {
  return {
    result: requestHandler.result.then((result) => {
      const processedResult = processResult(result);
      
      // Reset the API session once completed successfully
      GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
        apiSession = null;
        return GLib.SOURCE_REMOVE;
      });
      
      return processedResult;
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
export function handleApiError() {
  const accumulatedResponse = apiSession ? apiSession.getAccumulatedResponse() : "";
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
 * Sends a message to an API endpoint
 * @param {Object} options - Setup options
 * @param {string} options.method - HTTP method
 * @param {string} options.endpoint - API endpoint
 * @param {Object} options.headers - HTTP headers
 * @param {string} options.payload - Request payload
 * @param {Function} options.processChunk - Function to process chunks
 * @param {Function} options.transformResponse - Function to transform response
 * @returns {Object} Response object with result and cancel function
 */
export async function sendMessageToAPI(options) {
  const {
    method,
    endpoint,
    headers,
    payload,
    processChunk,
    transformResponse
  } = options;
  
  apiSession = createCancellableSession();
  
  try {
    const requestHandler = await apiSession.sendRequest(
      method,
      endpoint,
      headers,
      payload,
      processChunk
    );

    return transformResponse(requestHandler);
  } catch (error) {
    const errorResponse = handleApiError();
    if (errorResponse) {
      return errorResponse;
    }

    throw error;
  }
}

/**
 * Gets the current API session
 * @returns {Object} Current API session
 */
export function getApiSession() {
  return apiSession;
} 