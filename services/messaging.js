/**
 * Services for communicating with the AI backend
 */
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Soup from "gi://Soup";
import { getSettings } from "../lib/settings.js";

let conversationHistory = [];
let currentModel = null;
let currentContext = null; // Store the context from previous interactions

/**
 * Sets the current AI model
 * @param {string} modelName - Name of the model to use
 */
export function setModel(modelName) {
  currentModel = modelName;
  // Save as the default model in settings
  const settings = getSettings();
  settings.set_string("default-model", modelName);
}

/**
 * Fetches model names from the API
 * @returns {Promise<string[]>} Array of available model names
 */
export async function fetchModelNames() {
  try {
    const settings = getSettings();
    const endpoint = settings.get_string("models-api-endpoint");

    // Create Soup session and message
    const session = new Soup.Session();
    const message = Soup.Message.new("GET", endpoint);

    // Send the request asynchronously
    return new Promise((resolve, reject) => {
      session.send_and_read_async(
        message,
        GLib.PRIORITY_DEFAULT,
        null,
        (session, result) => {
          try {
            // Check the HTTP status code
            if (message.get_status() !== Soup.Status.OK) {
              throw new Error(`HTTP error: ${message.get_status()}`);
            }

            // Get response data
            const bytes = session.send_and_read_finish(result);
            if (!bytes) {
              throw new Error("No response data received");
            }

            const response = new TextDecoder().decode(bytes.get_data());
            const data = JSON.parse(response);

            // Parse and extract model names
            resolve(
              data.models
                .map((model) => model.name)
                .filter((value, index, self) => self.indexOf(value) === index)
                .sort()
            );
          } catch (e) {
            console.error("Error processing model names response:", e);
            resolve([]);
          }
        }
      );
    });
  } catch (e) {
    console.error("Error fetching model names:", e);
    return [];
  }
}

/**
 * Gets the current conversation history
 * @returns {Array} The conversation history
 */
export function getConversationHistory() {
  return conversationHistory;
}

/**
 * Clears the conversation history
 */
export function clearConversationHistory() {
  conversationHistory = [];
  currentContext = null;
}

/**
 * Add a message to the conversation history
 * @param {string} text - Message text
 * @param {string} type - Message type (user or assistant)
 */
function addMessageToHistory(text, type) {
  conversationHistory.push({ text, type });
}

/**
 * Send a message to the AI and process the response
 * @param {string} message - The message to send
 * @param {string} context - Optional conversation context
 * @param {Function} onData - Callback function for streaming response
 * @returns {Promise<string>} The complete response
 */
export async function sendMessage(message, context, onData) {
  // Ensure a model is selected
  if (!currentModel) {
    currentModel = getSettings().get_string("default-model");
  }

  // Add user message to history
  addMessageToHistory(message, "user");

  try {
    // Send message to API with context
    const response = await _sendMessageToAPI(
      message,
      context || currentContext,
      onData
    );
    addMessageToHistory(response, "assistant");
    return response;
  } catch (e) {
    console.error("Error sending message to API:", e);
    const errorMsg =
      "Error communicating with Ollama. Please check if Ollama is installed and running.";
    if (onData) onData(errorMsg);
    return errorMsg;
  }
}

/**
 * Sends a message to the API endpoint
 * @param {string} message - Message to send
 * @param {string} context - Optional context from previous interactions
 * @param {Function} onData - Callback for streaming data
 * @returns {Promise<string>} Complete response
 */
async function _sendMessageToAPI(message, context, onData) {
  const settings = getSettings();

  // Prepare payload
  const payload = JSON.stringify({
    model: currentModel,
    prompt: message,
    stream: true,
    temperature: settings.get_double("temperature"),
    context: context || null,
  });

  // Get the API endpoint
  const endpoint = settings.get_string("api-endpoint");

  let fullResponse = "";

  try {
    // Create Soup session and message
    const session = new Soup.Session();
    const message = Soup.Message.new("POST", endpoint);

    // Set headers and body
    message.set_request_body_from_bytes(
      "application/json",
      new GLib.Bytes(new TextEncoder().encode(payload))
    );

    // Handle streaming response
    const inputStream = await new Promise((resolve, reject) => {
      session.send_async(
        message,
        GLib.PRIORITY_DEFAULT,
        null,
        (session, result) => {
          try {
            // Check the HTTP status code
            if (message.get_status() !== Soup.Status.OK) {
              throw new Error(`HTTP error: ${message.get_status()}`);
            }

            // Get the response input stream
            const inputStream = session.send_finish(result);
            if (!inputStream) {
              throw new Error("No response stream available");
            }

            resolve(inputStream);
          } catch (e) {
            console.error("Error sending message:", e);
            reject(e);
          }
        }
      );
    });

    // Read from the stream
    const dataInputStream = new Gio.DataInputStream({
      base_stream: inputStream,
      close_base_stream: true,
    });

    // Process the streaming response
    while (true) {
      const [line] = await dataInputStream.read_line_async(
        GLib.PRIORITY_DEFAULT,
        null
      );
      if (!line) break;

      const lineText = new TextDecoder().decode(line);

      try {
        const json = JSON.parse(lineText);

        // Save context if provided
        if (json.context) {
          currentContext = json.context;
        }

        // Handle response content
        if (json.response) {
          const chunk = json.response;
          fullResponse += chunk;

          if (onData) {
            await GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
              onData(chunk);
              return GLib.SOURCE_REMOVE;
            });
          }
        }
      } catch (parseError) {
        console.error("Error parsing JSON chunk:", parseError);
      }
    }

    dataInputStream.close(null);
    return fullResponse;
  } catch (error) {
    console.error("API request error:", error);
    throw error;
  }
}
