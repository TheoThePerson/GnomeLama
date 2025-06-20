/**
 * Stream processing utilities
 */
import GLib from "gi://GLib";
import { TextDecoder } from "./httpUtils.js";

/**
 * Process a single chunk immediately
 * @param {string} chunk - Text chunk to process
 * @param {Function} processChunk - Processor function
 * @param {Function} accumulatedResponse - Function to accumulate response
 * @returns {Promise<void>}
 */
async function processSingleChunk(chunk, processChunk, accumulatedResponse) {
  if (!chunk) return;
  const result = await processChunk(chunk);
  if (result) {
    accumulatedResponse(result);
  }
}

/**
 * Read all lines from a data input stream and process immediately
 * @param {Gio.DataInputStream} dataInputStream - The data input stream
 * @param {Object} options - Options for reading
 * @param {Function} processChunk - Function to process each line
 * @param {Function} accumulatedResponse - Function to accumulate response
 * @returns {Promise<void>}
 */
async function readAndProcessLines(
  dataInputStream,
  options,
  processChunk,
  accumulatedResponse
) {
  const { isCancelled, cancellable } = options;
  let done = false;

  while (!done && !isCancelled() && !cancellable.is_cancelled()) {
    try {
      const [line] = await dataInputStream.read_line_async(
        GLib.PRIORITY_DEFAULT,
        cancellable
      );

      if (!line) {
        done = true;
      } else {
        const textLine = new TextDecoder().decode(line);
        await processSingleChunk(textLine, processChunk, accumulatedResponse);
      }
    } catch {
      done = true;
    }
  }
}

/**
 * Creates a stream processor with utilities for handling data streams
 * @param {Object} options - Configuration options
 * @returns {Object} Stream processor object with methods
 */
export function createStreamProcessor(options) {
  const { isCancelled, cancellable, accumulatedResponse } = options;

  return {
    /**
     * Reads input stream and processes lines immediately
     * @param {Gio.DataInputStream} dataInputStream - The data input stream
     * @param {Function} processChunk - Function to process each chunk
     * @returns {Promise<void>}
     */
    async readStreamLines(dataInputStream, processChunk) {
      await readAndProcessLines(
        dataInputStream,
        { isCancelled, cancellable },
        processChunk,
        accumulatedResponse
      );
    },

    // Keep legacy methods for backward compatibility
    async readAllLines(dataInputStream) {
      const lines = [];
      let done = false;

      while (!done && !isCancelled() && !cancellable.is_cancelled()) {
          // eslint-disable-next-line no-await-in-loop
          const [line] = await dataInputStream.read_line_async(
            GLib.PRIORITY_DEFAULT,
            cancellable
          );

          if (!line) {
            done = true;
          } else {
            lines.push(new TextDecoder().decode(line));
          }
      }

      return lines;
    },

    async processLinesBatched(lines, processChunk) {
      if (lines.length === 0 || isCancelled()) {
        return;
      }

      // Process each line immediately
      for (const line of lines) {
        if (isCancelled()) break;
        // eslint-disable-next-line no-await-in-loop
        await processSingleChunk(line, processChunk, accumulatedResponse);
      }
    },
  };
}
