/**
 * Request handler utilities
 */
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Soup from "gi://Soup";

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

  // Create a process function that gracefully handles errors
  const enhancedProcessChunk = async (chunk) => {
    try {
      return await processChunk(chunk);
    } catch (error) {
      console.error("Error in processing chunk", error);
      return null;
    }
  };

  return async function handleRequest() {
    try {
      const inputStream = await initializeRequestStream({
        message,
        httpSession,
        cancellable,
        isCancelled,
      });

      if (isCancelled() || !inputStream) {
        resolve({ response: accumulatedResponse() });
        return;
      }

      const dataInputStream = new Gio.DataInputStream({
        base_stream: inputStream,
        close_base_stream: true,
      });

      // Set active streams for cleanup
      const activeStreams = { inputStream, dataInputStream };

      // Process the stream data with our enhanced processor
      await streamProcessor.readStreamLines(
        dataInputStream,
        enhancedProcessChunk
      );

      cleanupCallback(activeStreams);
      resolve({ response: accumulatedResponse() });
    } catch (error) {
      console.error("API request error:", error);
      cleanupCallback();

      if (isCancelled() && accumulatedResponse()) {
        resolve({ response: accumulatedResponse() });
      } else {
        reject(error);
      }
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
          console.error("Error sending request:", error);
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
    const handlerOptions = {
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
    };

    const handleRequest = createRequestHandler(handlerOptions);
    handleRequest().catch(reject);
  });
}
