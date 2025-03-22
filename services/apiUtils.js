/**
 * Common API utilities for providers
 */
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Soup from "gi://Soup";

// Constants for performance tuning
const CHUNK_PROCESSING_BATCH_SIZE = 8; // Increased batch size for better throughput
const CHUNK_PROCESSING_YIELD_MS = 5; // Reduced time to yield to UI thread for more responsive UI
const MAX_CACHE_SIZE = 20; // Maximum number of cached responses
const CACHE_EXPIRY_MS = 5 * 60 * 1000; // Cache expiry time (5 minutes)

// Simple cache for GET requests
const requestCache = new Map();
let cacheSize = 0;

/**
 * Cleans expired items from the cache
 * @private
 */
function cleanCache() {
  const now = Date.now();
  const expiredKeys = [];

  // Find expired items
  requestCache.forEach((item, key) => {
    if (now - item.timestamp > CACHE_EXPIRY_MS) {
      expiredKeys.push(key);
    }
  });

  // Remove expired items
  expiredKeys.forEach((key) => {
    requestCache.delete(key);
    cacheSize--;
  });
}

/**
 * Adds an item to the cache
 * @param {string} key - Cache key
 * @param {Object} value - Value to cache
 * @private
 */
function addToCache(key, value) {
  // Clean cache if it's reached the limit
  if (cacheSize >= MAX_CACHE_SIZE) {
    cleanCache();

    // If still at limit, remove oldest entry
    if (cacheSize >= MAX_CACHE_SIZE) {
      let oldestKey = null;
      let oldestTime = Date.now();

      requestCache.forEach((item, key) => {
        if (item.timestamp < oldestTime) {
          oldestTime = item.timestamp;
          oldestKey = key;
        }
      });

      if (oldestKey) {
        requestCache.delete(oldestKey);
        cacheSize--;
      }
    }
  }

  // Add new item
  requestCache.set(key, {
    data: value,
    timestamp: Date.now(),
  });
  cacheSize++;
}

/**
 * Creates a cancellable HTTP request session
 * @returns {Object} Object containing session and cancellation methods
 */
export function createCancellableSession() {
  const session = new Soup.Session();
  session.timeout = 30; // 30 second timeout for requests

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
   * Performs a GET request to the API with caching
   * @param {string} url - API endpoint URL
   * @param {Object} headers - Request headers
   * @param {boolean} useCache - Whether to use cache (default: true)
   * @returns {Promise<Object>} JSON response
   */
  async function get(url, headers = {}, useCache = true) {
    // Generate cache key from URL and headers
    const headerKeys = Object.keys(headers).sort();
    const headerString = headerKeys
      .map((key) => `${key}:${headers[key]}`)
      .join("|");
    const cacheKey = `${url}|${headerString}`;

    // Check cache first if enabled
    if (useCache && requestCache.has(cacheKey)) {
      const cachedItem = requestCache.get(cacheKey);
      const now = Date.now();

      // Return cached item if not expired
      if (now - cachedItem.timestamp < CACHE_EXPIRY_MS) {
        return cachedItem.data;
      } else {
        // Remove expired item
        requestCache.delete(cacheKey);
        cacheSize--;
      }
    }

    try {
      const session = new Soup.Session();
      session.timeout = 30; // 30 second timeout for GET requests

      const message = Soup.Message.new("GET", url);

      Object.entries(headers).forEach(([key, value]) => {
        message.request_headers.append(key, value);
      });

      const response = await new Promise((resolve, reject) => {
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

              const responseText = new TextDecoder().decode(bytes.get_data());
              const responseData = JSON.parse(responseText);
              resolve(responseData);
            } catch (e) {
              console.error("Error processing response:", e);
              reject(e);
            }
          }
        );
      });

      // Cache successful response if caching is enabled
      if (useCache) {
        addToCache(cacheKey, response);
      }

      return response;
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

/**
 * Clears the API request cache
 * Useful when needing fresh data or to free memory
 */
export function clearCache() {
  requestCache.clear();
  cacheSize = 0;
}
