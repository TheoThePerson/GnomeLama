/**
 * Common API utilities for providers
 */
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Soup from "gi://Soup";

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
   * Sends a request and handles streaming response
   * @param {string} method - HTTP method (GET, POST)
   * @param {string} url - API endpoint URL
   * @param {Object} headers - Request headers
   * @param {string|null} body - Request body (for POST requests)
   * @param {Function} processChunk - Function to process each chunk of data
   * @returns {Promise<{response: string}>} The accumulated response
   */
  async function sendRequest(
    method,
    url,
    headers = {},
    body = null,
    processChunk
  ) {
    // Reset cancellation state
    isCancelled = false;
    accumulatedResponse = "";

    try {
      // Create message
      const message = Soup.Message.new(method, url);

      // Set headers
      Object.entries(headers).forEach(([key, value]) => {
        message.request_headers.append(key, value);
      });

      // Set body if provided (for POST requests)
      if (body && method === "POST") {
        message.set_request_body_from_bytes(
          "application/json",
          new GLib.Bytes(new TextEncoder().encode(body))
        );
      }

      // Send the request
      const inputStream = await new Promise((resolve, reject) => {
        session.send_async(
          message,
          GLib.PRIORITY_DEFAULT,
          cancellable,
          (session, result) => {
            try {
              // Check if cancelled
              if (isCancelled || (cancellable && cancellable.is_cancelled())) {
                resolve(null);
                return;
              }

              // Check HTTP status
              if (message.get_status() !== Soup.Status.OK) {
                throw new Error(`HTTP error: ${message.get_status()}`);
              }

              // Get input stream
              const stream = session.send_finish(result);
              if (!stream) {
                throw new Error("No response stream available");
              }

              activeInputStream = stream;
              resolve(stream);
            } catch (error) {
              console.error("Error sending request:", error);
              reject(error);
            }
          }
        );
      });

      // Return early if cancelled or no input stream
      if (isCancelled || !inputStream) {
        return { response: accumulatedResponse };
      }

      // Read from the stream
      const dataInputStream = new Gio.DataInputStream({
        base_stream: inputStream,
        close_base_stream: true,
      });

      activeDataInputStream = dataInputStream;

      // Process the streaming response
      let fullResponse = "";
      while (!isCancelled) {
        // Check if cancelled before reading more data
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

          try {
            // Process the chunk using the provided function
            const chunk = await processChunk(lineText);

            if (chunk) {
              fullResponse += chunk;
              accumulatedResponse += chunk;
            }
          } catch (parseError) {
            console.error("Error processing chunk:", parseError);
          }
        } catch (readError) {
          // Check if this is a cancellation error
          if (isCancelled || (cancellable && cancellable.is_cancelled())) {
            break;
          }
          console.error("Error reading from stream:", readError);
          break;
        }
      }

      // Clean up
      cleanupResources();

      return { response: fullResponse };
    } catch (error) {
      console.error("API request error:", error);
      cleanupResources();

      // If we were cancelled and have data, return it despite the error
      if (isCancelled && accumulatedResponse) {
        return { response: accumulatedResponse };
      }

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

      // Set headers
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
    isCancelled: () => isCancelled,
  };
}

/**
 * Helper to invoke callback with streaming data
 * @param {Function} callback - Callback function to invoke
 * @param {string} data - Data to pass to callback
 * @returns {Promise<void>}
 */
export async function invokeCallback(callback, data) {
  if (!callback) return;

  return new Promise((resolve) => {
    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
      callback(data);
      resolve();
      return GLib.SOURCE_REMOVE;
    });
  });
}
