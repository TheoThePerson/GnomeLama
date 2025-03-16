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
// Track active API resources
let activeSession = null;
let activeInputStream = null;
let activeDataInputStream = null;
let isCancelled = false;

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

            // Filter out unwanted models first
            const filteredModels = data.data
              .filter((model) => model.id.includes("gpt"))
              .filter((model) => {
                const id = model.id.toLowerCase();
                // Filter out models with specific keywords
                if (id.includes("instruct")) return false;
                if (id.includes("audio")) return false;
                if (id.includes("search")) return false;
                if (id.includes("realtime")) return false;
                // Filter out models with dates (like -0125 or -2024-01-25)
                if (/-\d{4}/.test(id)) return false; // matches yyyy in dates
                if (/-\d{3,4}$/.test(id)) return false; // matches models ending in numbers like 0125
                return true;
              });

            // Group models by their base name
            const modelGroups = new Map();
            filteredModels.forEach((model) => {
              // Extract base name (remove -preview and date if present)
              const baseName = model.id.replace(
                /-preview(-\d{4}-\d{2}-\d{2})?$/,
                ""
              );
              if (!modelGroups.has(baseName)) {
                modelGroups.set(baseName, []);
              }
              modelGroups.get(baseName).push(model.id);
            });

            // Process each group to select the appropriate model
            const selectedModels = [];
            for (const [baseName, variants] of modelGroups) {
              // First, separate preview and non-preview variants
              const previewVariants = variants.filter((v) =>
                v.includes("-preview")
              );
              const nonPreviewVariants = variants.filter(
                (v) => !v.includes("-preview")
              );

              if (nonPreviewVariants.length > 0) {
                // If non-preview version exists, use it
                selectedModels.push(nonPreviewVariants[0]);
              } else if (previewVariants.length > 0) {
                // If only preview versions exist, prefer the one without a date
                const simplePreview = previewVariants.find(
                  (v) => !v.match(/-preview-\d{4}-\d{2}-\d{2}$/)
                );
                selectedModels.push(simplePreview || previewVariants[0]);
              }
            }

            // Sort and store the filtered models
            availableModels = selectedModels.sort();
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
 * @param {Array<{text: string, type: string}>} context - Array of previous messages
 * @param {Function} onData - Callback for streaming data
 * @returns {Promise<{response: string}>} Complete response
 */
export async function sendMessageToAPI(
  messageText,
  modelName,
  context = [],
  onData
) {
  const settings = getSettings();
  const apiKey = settings.get_string("openai-api-key");

  if (!apiKey) {
    throw new Error(
      "OpenAI API key not configured. Please add it in settings."
    );
  }

  // Reset cancellation flag at the start of a new request
  isCancelled = false;

  // Convert conversation history to OpenAI format
  const messages = context.map((msg) => ({
    role: msg.type === "user" ? "user" : "assistant",
    content: msg.text,
  }));

  // Add the current message
  messages.push({ role: "user", content: messageText });

  // Prepare payload
  const payload = JSON.stringify({
    model: modelName,
    messages: messages,
    stream: true,
    temperature: settings.get_double("temperature"),
  });

  try {
    // Create Soup session and message
    activeSession = new Soup.Session();
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
      activeSession.send_async(
        message,
        GLib.PRIORITY_DEFAULT,
        null,
        (session, result) => {
          try {
            // Check if cancelled before processing result
            if (isCancelled) {
              reject(new Error("Request cancelled"));
              return;
            }

            if (message.get_status() !== Soup.Status.OK) {
              throw new Error(`HTTP error: ${message.get_status()}`);
            }

            const inputStream = session.send_finish(result);
            if (!inputStream) {
              throw new Error("No response stream available");
            }

            activeInputStream = inputStream;
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

    activeDataInputStream = dataInputStream;

    // Process the streaming response
    while (true) {
      // Check if cancelled before reading more data
      if (isCancelled) {
        break;
      }

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

    // Clean up after we're done
    dataInputStream.close(null);
    activeDataInputStream = null;
    activeInputStream = null;
    activeSession = null;

    return { response: fullResponse };
  } catch (error) {
    console.error("API request error:", error);

    // Clean up resources in case of error
    if (activeDataInputStream) {
      try {
        activeDataInputStream.close(null);
        activeDataInputStream = null;
      } catch (e) {
        console.error("Error closing data input stream:", e);
      }
    }

    activeInputStream = null;
    activeSession = null;

    throw error;
  }
}

/**
 * Stops any ongoing API request, closes streams and cleans up resources
 */
export function stopMessage() {
  if (!activeSession) {
    return; // No active session to stop
  }

  isCancelled = true;

  // Close the data input stream if it exists
  if (activeDataInputStream) {
    try {
      activeDataInputStream.close(null);
      activeDataInputStream = null;
    } catch (e) {
      console.error("Error closing data input stream:", e);
    }
  }

  // Close the input stream if it exists
  if (activeInputStream) {
    try {
      activeInputStream.close(null);
      activeInputStream = null;
    } catch (e) {
      console.error("Error closing input stream:", e);
    }
  }

  // Cancel any pending operations on the session
  if (activeSession) {
    try {
      activeSession.abort();
      activeSession = null;
    } catch (e) {
      console.error("Error aborting session:", e);
    }
  }

  console.log("OpenAI API request cancelled");
}
