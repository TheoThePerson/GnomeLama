/**
 * Provider for communicating with OpenAI API
 */
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Soup from "gi://Soup";
import { getSettings } from "../../lib/settings.js";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODELS_URL = "https://api.openai.com/v1/models";

let availableModels = [];

/**
 * Checks if a model is an OpenAI model
 * @param {string} modelName - Name of the model to check
 * @returns {boolean} True if the model is an OpenAI model
 */
export function isOpenAIModel(modelName) {
  return availableModels.includes(modelName);
}

/**
 * Fetches model names from the OpenAI API
 * @returns {Promise<string[]>} Array of available model names
 */
export async function fetchModelNames() {
  const settings = getSettings();
  const apiKey = settings.get_string("openai-api-key");

  if (!apiKey) {
    console.warn("OpenAI API key not configured");
    return [];
  }

  try {
    // Create Soup session and message
    const session = new Soup.Session();
    const message = Soup.Message.new("GET", OPENAI_MODELS_URL);

    // Set headers
    message.request_headers.append("Authorization", `Bearer ${apiKey}`);

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
            const data = JSON.parse(response);

            // Filter for chat models only and store them
            availableModels = data.data
              .filter((model) => model.id.includes("gpt"))
              .map((model) => model.id)
              .sort();

            resolve(availableModels);
          } catch (e) {
            console.error("Error processing OpenAI models response:", e);
            resolve([]);
          }
        }
      );
    });
  } catch (e) {
    console.error("Error fetching OpenAI models:", e);
    return [];
  }
}

/**
 * Sends a message to the OpenAI API endpoint
 * @param {string} messageText - Message to send
 * @param {string} modelName - Model to use
 * @param {string} context - Optional context from previous interactions
 * @param {Function} onData - Callback for streaming data
 * @returns {Promise<{response: string}>} Complete response
 */
export async function sendMessageToAPI(
  messageText,
  modelName,
  context,
  onData
) {
  const settings = getSettings();
  const apiKey = settings.get_string("openai-api-key");

  if (!apiKey) {
    throw new Error(
      "OpenAI API key not configured. Please add it in settings."
    );
  }

  // Prepare payload
  const payload = JSON.stringify({
    model: modelName,
    messages: [{ role: "user", content: messageText }],
    stream: true,
    temperature: settings.get_double("temperature"),
  });

  try {
    // Create Soup session and message
    const session = new Soup.Session();
    const message = Soup.Message.new("POST", OPENAI_API_URL);

    // Set headers and body
    message.request_headers.append("Authorization", `Bearer ${apiKey}`);
    message.request_headers.append("Content-Type", "application/json");
    message.set_request_body_from_bytes(
      "application/json",
      new GLib.Bytes(new TextEncoder().encode(payload))
    );

    let fullResponse = "";

    // Handle streaming response
    const inputStream = await new Promise((resolve, reject) => {
      session.send_async(
        message,
        GLib.PRIORITY_DEFAULT,
        null,
        (session, result) => {
          try {
            if (message.get_status() !== Soup.Status.OK) {
              throw new Error(`HTTP error: ${message.get_status()}`);
            }

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
      if (lineText.startsWith("data: ")) {
        const jsonString = lineText.replace("data: ", "").trim();
        if (jsonString === "[DONE]") continue;

        try {
          const json = JSON.parse(jsonString);
          if (json.choices && json.choices[0].delta.content) {
            const chunk = json.choices[0].delta.content;
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
    }

    dataInputStream.close(null);
    return { response: fullResponse };
  } catch (error) {
    console.error("API request error:", error);
    throw error;
  }
}
