/**
 * HTTP utilities for API requests
 */
import GLib from "gi://GLib";
import Soup from "gi://Soup";

// Polyfills for TextEncoder and TextDecoder if not available
export const TextEncoder =
  globalThis.TextEncoder ||
  function () {
    this.encode = (str) => {
      return new Uint8Array([...str].map((c) => c.charCodeAt(0)));
    };
  };

export const TextDecoder =
  globalThis.TextDecoder ||
  function () {
    this.decode = (bytes) => {
      return String.fromCharCode.apply(null, bytes);
    };
  };

/**
 * Helper to yield to the main thread
 * @param {number} ms - Milliseconds to yield
 * @returns {Promise<void>}
 */
export function yieldToMainThread(ms) {
  return new Promise((resolve) => {
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
      resolve();
      return GLib.SOURCE_REMOVE;
    });
  });
}

/**
 * Clean up resources (streams, etc.)
 * @param {Gio.InputStream} inputStream - Input stream to close
 * @param {Gio.DataInputStream} dataInputStream - Data input stream to close
 */
export function cleanupStreams(inputStream, dataInputStream) {
  if (dataInputStream) {
    try {
      dataInputStream.close(null);
    } catch (e) {
      console.error("Error closing data input stream:", e);
    }
  }

  if (inputStream) {
    try {
      inputStream.close(null);
    } catch (e) {
      console.error("Error closing input stream:", e);
    }
  }
}

/**
 * Creates an HTTP message with headers and body
 * @param {Object} options - Request options
 * @returns {Soup.Message} The configured HTTP message
 */
export function createHttpMessage(options) {
  const { method, url, headers, body } = options;
  const message = Soup.Message.new(method, url);

  Object.entries(headers || {}).forEach(([key, value]) => {
    message.request_headers.append(key, value);
  });

  if (body && method === "POST") {
    message.set_request_body_from_bytes(
      "application/json",
      new GLib.Bytes(new TextEncoder().encode(body))
    );
  }

  return message;
}

/**
 * Executes a GET request
 * @param {Soup.Session} session - Soup session
 * @param {Soup.Message} message - HTTP message
 * @returns {Promise<Object>} JSON response
 */
export function executeGetRequest(session, message) {
  return new Promise((resolve, reject) => {
    session.send_and_read_async(
      message,
      GLib.PRIORITY_DEFAULT,
      null,
      (_, result) => {
        try {
          if (message.get_status() !== Soup.Status.OK) {
            throw new Error(`HTTP error: ${message.get_status()}`);
          }

          const bytes = session.send_and_read_finish(result);
          if (!bytes) {
            throw new Error("No response data received");
          }

          const responseText = new TextDecoder().decode(bytes.get_data());
          resolve(JSON.parse(responseText));
        } catch (e) {
          console.error("Error processing response:", e);
          reject(e);
        }
      }
    );
  });
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
