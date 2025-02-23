import Gio from "gi://Gio";
import GLib from "gi://GLib";

// Global conversation history array and context
let conversationHistory = [];
let currentContext = null;

/**
 * Sends a message to the API and stores both the user message and the response.
 *
 * @param {string} userMessage - The user's message.
 * @param {Array} context - Optional context for the conversation.
 * @returns {Promise<string>} - The response from the API.
 */
export async function sendMessage(userMessage, context) {
  // Store the user's message in conversation history
  conversationHistory.push({ type: "user", text: userMessage });

  const payload = {
    model: "llama3.2:1b",
    prompt: userMessage,
  };

  // Include context if it exists
  if (
    currentContext &&
    Array.isArray(currentContext) &&
    currentContext.length > 0
  ) {
    payload.context = currentContext;
  }

  const curlCommand = [
    "curl",
    "-X",
    "POST",
    "http://localhost:11434/api/generate",
    "-H",
    "Content-Type: application/json",
    "-d",
    JSON.stringify(payload),
  ];

  try {
    let process = new Gio.Subprocess({
      argv: curlCommand,
      flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
    });

    process.init(null);
    const [response, newContext] = await processStream(
      process.get_stdout_pipe()
    );

    // Update context if received
    if (newContext) {
      currentContext = newContext;
    }

    // Store the response in conversation history
    conversationHistory.push({ type: "response", text: response });
    return response;
  } catch (e) {
    const errorMessage = "Error: Unable to execute command.";
    conversationHistory.push({ type: "response", text: errorMessage });
    return errorMessage;
  }
}

async function processStream(outputStream) {
  const stream = new Gio.DataInputStream({
    base_stream: outputStream,
  });

  let fullResponse = "";
  let newContext = null;

  try {
    while (true) {
      const [line] = await stream.read_line_async(GLib.PRIORITY_DEFAULT, null);
      if (!line) break;

      let json;
      try {
        json = JSON.parse(line);
      } catch {
        return ["Error parsing response.", null];
      }

      // Update context if available
      if (json.context && Array.isArray(json.context)) {
        newContext = json.context;
      }

      if (json.response) {
        fullResponse += json.response;
      }
    }
  } catch {
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
      .map((model) => model.name.split(":")[0])
      .filter((value, index, self) => self.indexOf(value) === index)
      .sort();

    console.log("Available Models:", modelNames);
    return modelNames;
  } catch (e) {
    console.error("Error fetching model names:", e);
    throw e;
  }
}
