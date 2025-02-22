import Gio from "gi://Gio";
import GLib from "gi://GLib";

// Global conversation history array
const conversationHistory = [];

/**
 * Sends a message to the API and stores both the user message and the response.
 *
 * @param {string} userMessage - The user's message.
 * @param {Array} context - Optional context for the conversation.
 * @returns {Promise<string>} - The response from the API.
 */
export async function sendMessage(userMessage, context) {
  // Store the user's message in conversation history.
  conversationHistory.push({ type: "user", text: userMessage });

  const payload = {
    model: "llama3.2:1b",
    prompt: userMessage,
  };

  if (context?.length > 0) {
    payload.context = context;
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
    const response = await processStream(process.get_stdout_pipe());
    // Store the response in conversation history.
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

  try {
    while (true) {
      const [line] = await stream.read_line_async(GLib.PRIORITY_DEFAULT, null);
      if (!line) break;

      let json;
      try {
        json = JSON.parse(line);
      } catch {
        return "Error parsing response.";
      }

      if (json.response) {
        fullResponse += json.response;
      }
    }
  } catch {
    return "Stream processing error.";
  } finally {
    stream.close(null);
  }

  return fullResponse;
}

/**
 * Returns the complete conversation history.
 *
 * Each entry is an object with:
 *  - type: 'user' or 'response'
 *  - text: the message content
 */
export function getConversationHistory() {
  return conversationHistory;
}

/**
 * Clears the entire conversation history
 */
export function clearConversationHistory() {
  conversationHistory.splice(0, conversationHistory.length);
}
