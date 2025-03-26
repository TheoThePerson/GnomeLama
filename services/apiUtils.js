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
 * Cleans up stream resources
 * @param {Object} activeInputStream - The input stream
 * @param {Object} activeDataInputStream - The data input stream
 */
function cleanupResourcesHelper(activeInputStream, activeDataInputStream) {
  cleanupStreams(activeInputStream, activeDataInputStream);
}

/**
 * Creates a GET request function for a session
 * @returns {Function} GET request function
 */
function createGetFunction() {
  return async function get(url, headers = {}) {
    const localSession = new Soup.Session();
    const message = createHttpMessage({ method: "GET", url, headers });
    return executeGetRequest(localSession, message);
  };
}

/**
 * Processes a request setup and returns the result objects
 * @param {Object} options - Request setup options
 * @returns {Object} Object containing result promise and functions
 */
function processRequestSetup(options) {
  const {
    message,
    processChunk,
    httpSession,
    cancellable,
    isCancelledFn,
    accumulatedResponseFn,
    streamProcessor,
    cleanupCallback,
  } = options;

  const requestPromiseOptions = {
    message,
    processChunk,
    httpSession,
    cancellable,
    isCancelled: isCancelledFn,
    accumulatedResponse: accumulatedResponseFn,
    streamProcessor,
    cleanupCallback,
  };

  return createRequestPromise(requestPromiseOptions);
}

/**
 * Creates a function to clean up resources
 * @param {Object} state - Current state containing streams
 * @returns {Function} Cleanup function
 */
function createResourceCleaner(state) {
  return function (streams = null) {
    if (streams) {
      cleanupResourcesHelper(streams.inputStream, streams.dataInputStream);
      state.activeInputStream = null;
      state.activeDataInputStream = null;
    } else {
      cleanupResourcesHelper(
        state.activeInputStream,
        state.activeDataInputStream
      );
      state.activeInputStream = null;
      state.activeDataInputStream = null;
    }
  };
}

/**
 * Creates a request cancellation function
 * @param {Object} config - Object with cancellation dependencies
 * @returns {Function} Cancel function
 */
function createCancelFunction(config) {
  const { cancellable, setIsCancelled, cleanupResources } = config;

  return function cancelRequest() {
    setIsCancelled(true);
    if (cancellable && !cancellable.is_cancelled()) {
      cancellable.cancel();
    }
    cleanupResources();
    return config.getAccumulatedResponse();
  };
}

/**
 * Creates a request sender function
 * @param {Object} config - Configuration for sending requests
 * @returns {Function} Request sender function
 */
function createRequestSender(config) {
  const {
    httpSession,
    cancellable,
    streamProcessor,
    cleanupResources,
    setIsCancelled,
    setAccumulatedResponse,
    getIsCancelled,
    getAccumulatedResponse,
  } = config;

  return function sendRequest(requestOptions) {
    const {
      method,
      url,
      processChunk,
      headers = {},
      body = null,
    } = requestOptions;

    setIsCancelled(false);
    setAccumulatedResponse("");

    try {
      const message = createHttpMessage({ method, url, headers, body });
      const result = processRequestSetup({
        message,
        processChunk,
        httpSession,
        cancellable,
        isCancelledFn: getIsCancelled,
        accumulatedResponseFn: getAccumulatedResponse,
        streamProcessor,
        cleanupCallback: cleanupResources,
      });

      return {
        result,
        cancel: config.cancelRequest,
      };
    } catch (error) {
      cleanupResources();
      throw error;
    }
  };
}

/**
 * Creates initial state for the session
 * @returns {Object} Initial state object
 */
function createInitialState() {
  return {
    activeInputStream: null,
    activeDataInputStream: null,
    isCancelled: false,
    accumulatedResponse: "",
  };
}

/**
 * Creates stream processor with callbacks
 * @param {Object} state - State object reference
 * @param {Object} cancellable - Cancellable object
 * @returns {Object} Stream processor
 */
function setupStreamProcessor(state, cancellable) {
  return createStreamProcessor({
    isCancelled: () => state.isCancelled,
    cancellable,
    accumulatedResponse: (chunk) => {
      state.accumulatedResponse += chunk;
    },
  });
}

/**
 * Sets up state mutators and accessors
 * @param {Object} state - State object reference
 * @returns {Object} Object with state mutator and accessor functions
 */
function setupStateFunctions(state) {
  return {
    setIsCancelled: (value) => {
      state.isCancelled = value;
    },
    setAccumulatedResponse: (value) => {
      state.accumulatedResponse = value;
    },
    getIsCancelled: () => state.isCancelled,
    getAccumulatedResponse: () => state.accumulatedResponse,
  };
}

/**
 * Creates a cancellable HTTP request session
 * @returns {Object} Object containing session and cancellation methods
 */
export function createCancellableSession() {
  const httpSession = new Soup.Session();
  const cancellable = new Gio.Cancellable();

  // Initialize state
  const state = createInitialState();

  // Setup stream processor
  const streamProcessor = setupStreamProcessor(state, cancellable);

  // Setup state functions
  const {
    setIsCancelled,
    setAccumulatedResponse,
    getIsCancelled,
    getAccumulatedResponse,
  } = setupStateFunctions(state);

  // Create resource cleaner
  const cleanupResources = createResourceCleaner(state);

  // Config object for cancel and request functions
  const config = {
    cancellable,
    setIsCancelled,
    cleanupResources,
    getAccumulatedResponse,
    httpSession,
    streamProcessor,
    setAccumulatedResponse,
    getIsCancelled,
  };

  // Create cancel function and request sender
  const cancelRequest = createCancelFunction(config);
  config.cancelRequest = cancelRequest;
  const sendRequest = createRequestSender(config);
  const get = createGetFunction();

  return {
    session: httpSession,
    cancellable,
    sendRequest: (...args) => {
      if (args.length === 1 && typeof args[0] === "object") {
        return sendRequest(args[0]);
      }
      // Legacy support
      const [method, url, headers, body, processChunk] = args;
      return sendRequest({ method, url, headers, body, processChunk });
    },
    get,
    cancelRequest,
    getAccumulatedResponse,
  };
}

// Re-export invokeCallback for backwards compatibility
export { invokeCallback };
