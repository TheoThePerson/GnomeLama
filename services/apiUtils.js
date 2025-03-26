/**
 * Common API utilities for providers
 */
import Gio from "gi://Gio";
import Soup from "gi://Soup";
import {
  cleanupStreams,
  createHttpMessage,
  executeGetRequest,
  invokeCallback,
} from "./httpUtils.js";
import { createStreamProcessor } from "./streamProcessor.js";
import { createRequestPromise } from "./requestHandlers.js";

/**
 * Creates a cancellable HTTP request session
 * @returns {Object} Object containing session and cancellation methods
 */
export function createCancellableSession() {
  const httpSession = new Soup.Session();
  const cancellable = new Gio.Cancellable();
  let activeInputStream = null;
  let activeDataInputStream = null;
  let isCancelled = false;
  let accumulatedResponse = "";

  // Configure stream processor with callbacks
  const streamProcessor = createStreamProcessor({
    isCancelled: () => isCancelled,
    cancellable,
    accumulatedResponse: (chunk) => {
      accumulatedResponse += chunk;
    },
  });

  /**
   * Clean up resources (streams, etc.)
   * @param {Object} streams - Optional streams to clean up
   */
  function cleanupResources(streams = null) {
    if (streams) {
      cleanupStreams(streams.inputStream, streams.dataInputStream);
      activeInputStream = null;
      activeDataInputStream = null;
    } else {
      cleanupStreams(activeInputStream, activeDataInputStream);
      activeInputStream = null;
      activeDataInputStream = null;
    }
  }

  /**
   * Stops any ongoing request
   * @returns {string} Accumulated response so far
   */
  function cancelRequest() {
    isCancelled = true;

    if (cancellable && !cancellable.is_cancelled()) {
      cancellable.cancel();
    }

    cleanupResources();

    console.log("API request cancelled with partial response saved");
    return accumulatedResponse;
  }

  /**
   * Sends a request and handles streaming response
   * @param {Object} requestOptions - Request options
   * @returns {Object} Object containing result promise and cancel function
   */
  function sendRequest(requestOptions) {
    const {
      method,
      url,
      processChunk,
      headers = {},
      body = null,
    } = requestOptions;

    isCancelled = false;
    accumulatedResponse = "";

    try {
      const message = createHttpMessage({ method, url, headers, body });

      const requestPromiseOptions = {
        message,
        processChunk,
        httpSession,
        cancellable,
        isCancelled: () => isCancelled,
        accumulatedResponse: () => accumulatedResponse,
        streamProcessor,
        cleanupCallback: cleanupResources,
      };

      const result = createRequestPromise(requestPromiseOptions);

      return {
        result,
        cancel: cancelRequest,
      };
    } catch (error) {
      console.error("API request setup error:", error);
      cleanupResources();
      throw error;
    }
  }

  /**
   * Performs a GET request to the API
   * @param {string} url - API endpoint URL
   * @param {Object} headers - Request headers
   * @returns {Promise<Object>} JSON response
   */
  async function get(url, headers = {}) {
    try {
      const localSession = new Soup.Session();
      const message = createHttpMessage({ method: "GET", url, headers });
      return await executeGetRequest(localSession, message);
    } catch (e) {
      console.error("Error in GET request:", e);
      throw e;
    }
  }

  /**
   * Interface adapter for compatibility with old API
   * @param {string} method - HTTP method
   * @param {string} url - API endpoint URL
   * @param {Object} headers - Request headers
   * @param {string|null} body - Request body
   * @param {Function} processChunk - Function to process each chunk
   * @returns {Object} Object containing result promise and cancel function
   */
  function sendRequestAdapter(method, url, headers, body, processChunk) {
    // Fix parameter order to match what providers expect
    return sendRequest({
      method,
      url,
      headers,
      body,
      processChunk,
    });
  }

  return {
    session: httpSession,
    cancellable,
    sendRequest: sendRequestAdapter,
    get,
    cancelRequest,
    getAccumulatedResponse: () => accumulatedResponse,
  };
}

// Re-export invokeCallback for backwards compatibility
export { invokeCallback };
