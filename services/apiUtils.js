/**
 * Common API utilities for providers
 */
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Soup from "gi://Soup";

// Constants for performance tuning
const CHUNK_PROCESSING_BATCH_SIZE = 5; // Process this many chunks before yielding to UI
const CHUNK_PROCESSING_YIELD_MS = 10; // Time to yield to UI thread between batches

/**
 * Creates a cancellable HTTP request session
 * @returns {Object} Object containing session and cancellation methods
 */
export function createCancellableSession() {
  const session = new Soup.Session();
  const cancellable = new Gio.Cancellable();
  let activeInputStream = null;
  let activeDataInputStream = null;
  let isCancelled = false;
  let accumulatedResponse = "";

  /**
   * Process chunks in batches to avoid blocking UI
   * @param {Array<string>} chunks - Array of chunks to process
   * @param {Function} processChunk - Function to process each chunk
   * @returns {Promise<string>} The accumulated text from all chunks
   */
  async function processBatchedChunks(chunks, processChunk) {
    let result = "";
    let batchCount = 0;

    for (let i = 0; i < chunks.length; i++) {
      if (isCancelled) break;

      try {
        const chunk = await processChunk(chunks[i]);
        if (chunk) {
          result += chunk;
          accumulatedResponse += chunk;
        }
      } catch (error) {
        console.error("Error processing chunk:", error);
      }

      // After processing a batch, yield to UI thread
      batchCount++;
      if (batchCount % CHUNK_PROCESSING_BATCH_SIZE === 0) {
        // Use a promise with timeout to yield to the main thread
        await new Promise((resolve) =>
          GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            CHUNK_PROCESSING_YIELD_MS,
            () => {
              resolve();
              return GLib.SOURCE_REMOVE;
            }
          )
        );
      }
    }

    return result;
  }

  /**
   * Sends a request and handles streaming response
   * @param {string} method - HTTP method (GET, POST)
   * @param {string} url - API endpoint URL
   * @param {Object} headers - Request headers
   * @param {string|null} body - Request body (for POST requests)
   * @param {Function} processChunk - Function to process each chunk of data
   * @returns {Promise<{result: Promise<{response: string}>, cancel: Function}>} The response promise and cancel function
   */
  async function sendRequest(
    method,
    url,
    headers = {},
    body = null,
    processChunk
  ) {
    isCancelled = false;
    accumulatedResponse = "";

    try {
      const message = Soup.Message.new(method, url);

      Object.entries(headers).forEach(([key, value]) => {
        message.request_headers.append(key, value);
      });

      if (body && method === "POST") {
        message.set_request_body_from_bytes(
          "application/json",
          new GLib.Bytes(new TextEncoder().encode(body))
        );
      }

      // Return both the result promise and a cancel function
      return {
        result: new Promise(async (resolve, reject) => {
          try {
            const inputStream = await new Promise(
              (streamResolve, streamReject) => {
                session.send_async(
                  message,
                  GLib.PRIORITY_DEFAULT,
                  cancellable,
                  (session, result) => {
                    try {
                      if (
                        isCancelled ||
                        (cancellable && cancellable.is_cancelled())
                      ) {
                        streamResolve(null);
                        return;
                      }

                      if (message.get_status() !== Soup.Status.OK) {
                        throw new Error(`HTTP error: ${message.get_status()}`);
                      }

                      const stream = session.send_finish(result);
                      if (!stream) {
                        throw new Error("No response stream available");
                      }

                      activeInputStream = stream;
                      streamResolve(stream);
                    } catch (error) {
                      console.error("Error sending request:", error);
                      streamReject(error);
                    }
                  }
                );
              }
            );

            if (isCancelled || !inputStream) {
              // If cancelled during initial connection, just return current response
              resolve({ response: accumulatedResponse });
              return;
            }

            const dataInputStream = new Gio.DataInputStream({
              base_stream: inputStream,
              close_base_stream: true,
            });

            activeDataInputStream = dataInputStream;

            // Collect all lines first to process in batches
            const lines = [];

            while (!isCancelled) {
              if (cancellable && cancellable.is_cancelled()) {
                break;
              }

              try {
                const [line] = await dataInputStream.read_line_async(
                  GLib.PRIORITY_DEFAULT,
                  cancellable
                );

                if (!line) break;

                const lineText = new TextDecoder().decode(line);
                lines.push(lineText);

                // Process in small batches if we've accumulated enough lines
                if (lines.length >= CHUNK_PROCESSING_BATCH_SIZE * 2) {
                  const batchLines = lines.splice(0, lines.length);
                  await processBatchedChunks(batchLines, processChunk);
                }
              } catch (readError) {
                if (
                  isCancelled ||
                  (cancellable && cancellable.is_cancelled())
                ) {
                  break;
                }
                console.error("Error reading from stream:", readError);
                break;
              }
            }

            // Process any remaining lines
            if (lines.length > 0 && !isCancelled) {
              await processBatchedChunks(lines, processChunk);
            }

            cleanupResources();
            resolve({ response: accumulatedResponse });
          } catch (error) {
            console.error("API request error inside promise:", error);
            cleanupResources();

            if (isCancelled && accumulatedResponse) {
              resolve({ response: accumulatedResponse });
            } else {
              reject(error);
            }
          }
        }),
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
      const session = new Soup.Session();
      const message = Soup.Message.new("GET", url);

      Object.entries(headers).forEach(([key, value]) => {
        message.request_headers.append(key, value);
      });

      return new Promise((resolve, reject) => {
        session.send_and_read_async(
          message,
          GLib.PRIORITY_DEFAULT,
          null,
          (session, result) => {
            try {
              if (message.get_status() !== Soup.Status.OK) {
                throw new Error(`HTTP error: ${message.get_status()}`);
              }

              const bytes = session.send_and_read_finish(result);
              if (!bytes) {
                throw new Error("No response data received");
              }

              const response = new TextDecoder().decode(bytes.get_data());
              resolve(JSON.parse(response));
            } catch (e) {
              console.error("Error processing response:", e);
              reject(e);
            }
          }
        );
      });
    } catch (e) {
      console.error("Error in GET request:", e);
      throw e;
    }
  }

  /**
   * Clean up resources (streams, etc.)
   */
  function cleanupResources() {
    if (activeDataInputStream) {
      try {
        activeDataInputStream.close(null);
        activeDataInputStream = null;
      } catch (e) {
        console.error("Error closing data input stream:", e);
      }
    }

    if (activeInputStream) {
      try {
        activeInputStream.close(null);
        activeInputStream = null;
      } catch (e) {
        console.error("Error closing input stream:", e);
      }
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

  return {
    session,
    cancellable,
    sendRequest,
    get,
    cancelRequest,
    getAccumulatedResponse: () => accumulatedResponse,
  };
}

/**
 * Helper to invoke callback with streaming data
 * @param {Function} callback - Callback function to invoke
 * @param {string} data - Data to pass to callback
 * @returns {Promise<void>}
 */
export async function invokeCallback(callback, data) {
  if (typeof callback === "function") {
    try {
      await callback(data);
    } catch (e) {
      console.error("Error in callback:", e);
    }
  }
}
