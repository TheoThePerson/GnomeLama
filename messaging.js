import Gio from "gi://Gio";
import GLib from "gi://GLib";

// Global conversation history array and context
let conversationHistory = [];
let currentContext = null;

// Global variable to hold the selected model
let selectedModel = "llama3.2:1b"; // Default model

/**
 * Sets the model to be used for sending messages.
 * @param {string} model - The model to set.
 */
export function setModel(model) {
  selectedModel = model;
}

/**
 * Sends a message to the API and stores both the user message and the response.
 *
 * @param {string} userMessage - The user's message.
 * @param {Array} context - Optional context for the conversation.
 * @returns {Promise<string>} - The response from the API.
 */
export async function sendMessage(userMessage, context, onData) {
  // Store the user's message in conversation history.
  conversationHistory.push({ type: "user", text: userMessage });

  const payload = {
    model: selectedModel,
    prompt: userMessage,
    stream: true, // Explicitly request streaming
    options: {
      num_ctx: 4096, // Set context window
      temperature: 0.7, // Add temperature control
    },
  };

  if (
    currentContext &&
    Array.isArray(currentContext) &&
    currentContext.length > 0
  ) {
    payload.context = currentContext;
  }

  // Use a cancellable to allow aborting the request
  const cancellable = new Gio.Cancellable();

  try {
    // Use Gio.Subprocess for better performance
    const curlCommand = [
      "curl",
      "-X",
      "POST",
      "http://localhost:11434/api/generate",
      "-H",
      "Content-Type: application/json",
      "--no-buffer", // Disable output buffering
      "-d",
      JSON.stringify(payload),
    ];

    const process = new Gio.Subprocess({
      argv: curlCommand,
      flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
    });

    process.init(cancellable);

    // Optional: Add process status monitoring
    process.wait_check_async(cancellable, (proc, result) => {
      try {
        proc.wait_check_finish(result);
      } catch (e) {
        console.error("Process error:", e.message);
      }
    });

    const [response, newContext] = await processStream(
      process.get_stdout_pipe(),
      onData
    );

    if (newContext) {
      currentContext = newContext;
    }

    // Store the complete response in conversation history.
    conversationHistory.push({ type: "response", text: response });
    return response;
  } catch (e) {
    console.error("API error:", e);
    const errorMessage = `Error: ${e.message || "Unable to execute command."}`;
    conversationHistory.push({ type: "response", text: errorMessage });
    return errorMessage;
  }
}

// Add a function to cancel ongoing requests
export function cancelRequest() {
  if (currentCancellable && !currentCancellable.is_cancelled()) {
    currentCancellable.cancel();
  }
}

async function processStream(outputStream, onData) {
  const stream = new Gio.DataInputStream({ base_stream: outputStream });
  let fullResponse = "";
  let newContext = null;
  let buffer = ""; // Buffer to hold partial words

  try {
    while (true) {
      const [line] = await stream.read_line_async(GLib.PRIORITY_DEFAULT, null);
      if (!line) break;

      let json;
      try {
        json = JSON.parse(line);
      } catch {
        if (onData) onData("Error parsing response.");
        return ["Error parsing response.", null];
      }

      if (json.context && Array.isArray(json.context)) {
        newContext = json.context;
      }

      if (json.response) {
        fullResponse += json.response;

        // Process the response character by character
        buffer += json.response;

        // Find complete words and send them immediately
        const words = buffer.split(/(\s+)/);

        // If we have more than one item, we can send all but the last one
        // (the last one might be incomplete)
        if (words.length > 1) {
          const completeContent = words.slice(0, -1).join("");
          if (completeContent) {
            if (onData) onData(completeContent);
          }
          // Keep the potentially incomplete word in the buffer
          buffer = words[words.length - 1];
        }
      }
    }

    // Send any remaining content in the buffer
    if (buffer && onData) {
      onData(buffer);
    }
  } catch (error) {
    console.error("Stream processing error:", error);
    if (onData) onData("Stream processing error.");
    return ["Stream processing error.", null];
  } finally {
    stream.close(null);
  }

  return [fullResponse, newContext];
}

/**
 * Returns the complete conversation history.
 */
export function getConversationHistory() {
  return conversationHistory;
}

/**
 * Clears the entire conversation history and context
 */
export function clearConversationHistory() {
  conversationHistory = [];
  currentContext = null;
}

/**
 * Gets the current context
 */
export function getContext() {
  return currentContext;
}

/**
 * Sets the current context
 * @param {Array} context - The context to set
 */
export function setContext(context) {
  currentContext = context;
}

/**
 * Fetches model names from the API and outputs them in a sorted list format.
 */
export async function fetchModelNames() {
  const curlCommand = ["curl", "-s", "http://localhost:11434/api/tags"];
  try {
    let process = new Gio.Subprocess({
      argv: curlCommand,
      flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
    });
    process.init(null);

    const outputStream = process.get_stdout_pipe();
    const stream = new Gio.DataInputStream({
      base_stream: outputStream,
    });

    // Read the entire response as a single string
    let jsonData = "";
    while (true) {
      const [readLine] = await stream.read_line_async(
        GLib.PRIORITY_DEFAULT,
        null
      );
      if (!readLine) break;
      jsonData += readLine;
    }
    stream.close(null);

    // Parse JSON and extract model names
    const data = JSON.parse(jsonData);
    const modelNames = data.models
      .map((model) => model.name)
      .filter((value, index, self) => self.indexOf(value) === index)
      .sort();

    console.log("Available Models:", modelNames);
    return modelNames;
  } catch (e) {
    console.error("Error fetching model names:", e);
    throw e;
  }
}
