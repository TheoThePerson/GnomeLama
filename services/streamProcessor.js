/**
 * Stream processing utilities
 */
import GLib from "gi://GLib";
import { TextDecoder, yieldToMainThread } from "./httpUtils.js";

// Constants for performance tuning
const CHUNK_PROCESSING_BATCH_SIZE = 5; // Process this many chunks before yielding to UI
const CHUNK_PROCESSING_YIELD_MS = 10; // Time to yield to UI thread between batches

/**
 * Creates batches of chunks for processing
 * @param {Array<string>} chunks - Array of chunks to process
 * @param {Function} isCancelled - Function that returns cancellation status
 * @returns {Array<Array<string>>} Batches of chunks
 */
function createChunkBatches(chunks, isCancelled) {
  const batches = [];
  for (
    let i = 0;
    i < chunks.length && !isCancelled();
    i += CHUNK_PROCESSING_BATCH_SIZE
  ) {
    batches.push(chunks.slice(i, i + CHUNK_PROCESSING_BATCH_SIZE));
  }
  return batches;
}

/**
 * Process batches sequentially with yield between batches
 * @param {Object} options - Processing options
 * @param {Array<Array<string>>} options.batches - Batches of chunks
 * @param {Function} options.processChunk - Function to process each chunk
 * @param {Function} options.isCancelled - Function that returns cancellation status
 * @param {Function} options.accumulatedResponse - Function to add to accumulated response
 * @returns {Promise<void>}
 */
async function processBatchesSequentially(options) {
  const { batches, processChunk, isCancelled, accumulatedResponse } = options;

  const processBatch = async (batch) => {
    if (isCancelled()) return;

    // Process each chunk sequentially
    for (const chunk of batch) {
      if (isCancelled()) return;

      try {
        // Process each chunk and add the result to accumulated response
        // eslint-disable-next-line no-await-in-loop
        const result = await processChunk(chunk);

        if (result) {
          // Call the accumulation function with the result
          accumulatedResponse(result);
        }
      } catch (error) {
        console.error("Error processing chunk:", error);
      }
    }
  };

  // Process each batch sequentially
  for (let i = 0; i < batches.length && !isCancelled(); i++) {
    // eslint-disable-next-line no-await-in-loop
    await processBatch(batches[i]);

    if (i < batches.length - 1 && !isCancelled()) {
      // eslint-disable-next-line no-await-in-loop
      await yieldToMainThread(CHUNK_PROCESSING_YIELD_MS);
    }
  }
}

/**
 * Process chunks in batches without awaiting in loops
 * @param {Object} options - Processing options
 * @param {Array<string>} options.chunks - Array of chunks to process
 * @param {Function} options.processChunk - Function to process each chunk
 * @param {Function} options.isCancelled - Function that returns cancellation status
 * @param {Function} options.accumulatedResponse - Function to add to accumulated response
 * @returns {Promise<void>}
 */
async function processBatchedChunks(options) {
  const { chunks, processChunk, isCancelled, accumulatedResponse } = options;

  if (chunks.length === 0 || isCancelled()) {
    return;
  }

  try {
    // Create batches of chunks
    const batches = createChunkBatches(chunks, isCancelled);

    // Process batches sequentially with yield between batches
    await processBatchesSequentially({
      batches,
      processChunk,
      isCancelled,
      accumulatedResponse,
    });
  } catch (error) {
    console.error("Error in processBatchedChunks:", error);
  }
}

/**
 * Read all lines from a data input stream
 * @param {Gio.DataInputStream} dataInputStream - The data input stream
 * @param {Object} options - Options for reading
 * @returns {Promise<string[]>} Array of lines
 */
async function readAllLinesFromStream(dataInputStream, options) {
  const { isCancelled, cancellable } = options;
  const lines = [];
  let done = false;

  while (!done && !isCancelled() && !cancellable.is_cancelled()) {
    try {
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
    } catch (error) {
      console.error("Error reading line:", error);
      done = true;
    }
  }

  return lines;
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
     * Reads all lines from a data input stream
     * @param {Gio.DataInputStream} dataInputStream - The data input stream
     * @returns {Promise<string[]>} Array of lines
     */
    readAllLines(dataInputStream) {
      return readAllLinesFromStream(dataInputStream, {
        isCancelled,
        cancellable,
      });
    },

    /**
     * Processes lines in batches
     * @param {string[]} lines - Array of lines to process
     * @param {Function} processChunk - Function to process each chunk
     * @returns {Promise<void>}
     */
    async processLinesBatched(lines, processChunk) {
      if (lines.length === 0 || isCancelled()) {
        return;
      }

      try {
        // Process lines in batches
        const batchSize = CHUNK_PROCESSING_BATCH_SIZE * 2;

        for (let i = 0; i < lines.length && !isCancelled(); i += batchSize) {
          const batch = lines.slice(i, i + batchSize);

          // eslint-disable-next-line no-await-in-loop
          await processBatchedChunks({
            chunks: batch,
            processChunk,
            isCancelled,
            accumulatedResponse,
          });

          if (i + batchSize < lines.length && !isCancelled()) {
            // eslint-disable-next-line no-await-in-loop
            await yieldToMainThread(CHUNK_PROCESSING_YIELD_MS);
          }
        }
      } catch (error) {
        console.error("Error in batch processing:", error);
      }
    },

    /**
     * Reads input stream and processes lines
     * @param {Gio.DataInputStream} dataInputStream - The data input stream
     * @param {Function} processChunk - Function to process each chunk
     * @returns {Promise<void>}
     */
    async readStreamLines(dataInputStream, processChunk) {
      try {
        // Read all lines
        const lines = await this.readAllLines(dataInputStream);

        if (lines.length > 0) {
          // Process all lines in batches
          await this.processLinesBatched(lines, processChunk);
        }
      } catch (error) {
        console.error("Error reading stream lines:", error);
      }
    },
  };
}
