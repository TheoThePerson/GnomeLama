/**
 * Request handler utilities
 */
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Soup from "gi://Soup";

/**
 * Processes the stream data
 * @param {Object} options - Processing options
 * @returns {Promise<void>} Completes when stream is processed
 */
async function processRequestStream({
  inputStream,
  dataInputStream,
  processChunk,
  streamProcessor,
  cleanupCallback,
  resolve,
  accumulatedResponse,
}) {
  try {
    await streamProcessor.readStreamLines(dataInputStream, processChunk);
    cleanupCallback({ inputStream, dataInputStream });
    resolve({ response: accumulatedResponse() });
  } catch (error) {
    cleanupCallback();
    throw error;
  }
}

/**
 * Prepares the data input stream
 * @param {Object} options - Stream options
 * @returns {Object|null} Input stream and data input stream or null if cancelled
 */
async function prepareInputStream({
  message,
  httpSession,
  cancellable,
  isCancelled,
  resolve,
  accumulatedResponse,
}) {
  const inputStream = await initializeRequestStream({
    message,
    httpSession,
    cancellable,
    isCancelled,
  });

  if (isCancelled() || !inputStream) {
    resolve({ response: accumulatedResponse() });
    return null;
  }

  return {
    inputStream,
    dataInputStream: new Gio.DataInputStream({
      base_stream: inputStream,
      close_base_stream: true,
    }),
  };
}

/**
 * Handles request errors
 * @param {Error} error - The error that occurred
 * @param {Function} cleanupCallback - Cleanup function
 * @param {Function} isCancelled - Function to check if request was cancelled
 * @param {Function} accumulatedResponse - Function to get accumulated response
 * @param {Function} resolve - Promise resolve function
 * @param {Function} reject - Promise reject function
 */
function handleRequestError(
  error,
  { cleanupCallback, isCancelled, accumulatedResponse, resolve, reject }
) {
  cleanupCallback();
  if (isCancelled() && accumulatedResponse()) {
    resolve({ response: accumulatedResponse() });
  } else {
    reject(error);
  }
}

/**
 * Creates a request handler function
 * @param {Object} options - Handler options
 * @returns {Function} Async function to handle the request
 */
export function createRequestHandler(options) {
  const {
    message,
    processChunk,
    resolve,
    reject,
    httpSession,
    cancellable,
    isCancelled,
    accumulatedResponse,
    streamProcessor,
    cleanupCallback,
  } = options;

  return async function handleRequest() {
    try {
      const streams = await prepareInputStream({
        message,
        httpSession,
        cancellable,
        isCancelled,
        resolve,
        accumulatedResponse,
      });

      if (!streams) return;

      await processRequestStream({
        ...streams,
        processChunk,
        streamProcessor,
        cleanupCallback,
        resolve,
        accumulatedResponse,
      });
    } catch (error) {
      handleRequestError(error, {
        cleanupCallback,
        isCancelled,
        accumulatedResponse,
        resolve,
        reject,
      });
    }
  };
}

/**
 * Initializes the request stream
 * @param {Object} options - Options for initializing the request stream
 * @returns {Promise<Gio.InputStream>} The input stream
 */
export function initializeRequestStream(options) {
  const { message, httpSession, cancellable, isCancelled } = options;

  return new Promise((streamResolve, streamReject) => {
    httpSession.send_async(
      message,
      GLib.PRIORITY_DEFAULT,
      cancellable,
      (_, result) => {
        try {
          if (isCancelled() || (cancellable && cancellable.is_cancelled())) {
            streamResolve(null);
            return;
          }

          if (message.get_status() !== Soup.Status.OK) {
            throw new Error(`HTTP error: ${message.get_status()}`);
          }

          const stream = httpSession.send_finish(result);
          if (!stream) {
            throw new Error("No response stream available");
          }

          streamResolve(stream);
        } catch (error) {
          streamReject(error);
        }
      }
    );
  });
}

/**
 * Creates the request promise
 * @param {Object} options - Request options
 * @returns {Promise<Object>} Promise that resolves with response
 */
export function createRequestPromise(options) {
  const {
    message,
    processChunk,
    httpSession,
    cancellable,
    isCancelled,
    accumulatedResponse,
    streamProcessor,
    cleanupCallback,
  } = options;

  return new Promise((resolve, reject) => {
    const handleRequest = createRequestHandler({
      message,
      processChunk,
      resolve,
      reject,
      httpSession,
      cancellable,
      isCancelled,
      accumulatedResponse,
      streamProcessor,
      cleanupCallback,
    });
    handleRequest().catch(reject);
  });
}
