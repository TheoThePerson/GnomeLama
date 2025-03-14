/**
 * Provider for communicating with Ollama API
 */
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Soup from "gi://Soup";
import { getSettings } from "../../lib/settings.js";

let currentContext = null; // Store the context from previous interactions

/**
 * Gets the current context from previous interactions
 * @returns {string|null} The current context
 */
export function getCurrentContext() {
  return currentContext;
}

/**
 * Resets the current context
 */
export function resetContext() {
  currentContext = null;
}

/**
 * Fetches model names from the Ollama API
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
 * Sends a message to the Ollama API endpoint
 * @param {string} messageText - Message to send
 * @param {string} modelName - Model to use
 * @param {string} context - Optional context from previous interactions
 * @param {Function} onData - Callback for streaming data
 * @returns {Promise<{response: string, context: string}>} Complete response and context
 */
export async function sendMessageToAPI(
  messageText,
  modelName,
  context,
  onData
) {
  const settings = getSettings();

  // Prepare payload
  const payload = JSON.stringify({
    model: modelName,
    prompt: messageText,
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
    return { response: fullResponse, context: currentContext };
  } catch (error) {
    console.error("API request error:", error);
    throw error;
  }
}
