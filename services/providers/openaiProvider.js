/**
 * Provider for communicating with OpenAI API
 */
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Soup from "gi://Soup";
import { getSettings } from "../../lib/settings.js";
import { createCancellableSession, invokeCallback } from "./apiUtils.js";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODELS_URL = "https://api.openai.com/v1/models";

let availableModels = [];
// API session handler
let apiSession = null;

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
    // Create a temporary session for this request
    const tempSession = createCancellableSession();

    // Make the API request
    const data = await tempSession.get(OPENAI_MODELS_URL, {
      Authorization: `Bearer ${apiKey}`,
    });

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
      const baseName = model.id.replace(/-preview(-\d{4}-\d{2}-\d{2})?$/, "");
      if (!modelGroups.has(baseName)) {
        modelGroups.set(baseName, []);
      }
      modelGroups.get(baseName).push(model.id);
    });

    // Process each group to select the appropriate model
    const selectedModels = [];
    for (const [baseName, variants] of modelGroups) {
      // First, separate preview and non-preview variants
      const previewVariants = variants.filter((v) => v.includes("-preview"));
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
    return availableModels;
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

  // Create a new API session
  apiSession = createCancellableSession();

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

  // Define how to process each chunk from the OpenAI API
  const processChunk = async (lineText) => {
    if (lineText.startsWith("data: ")) {
      const jsonString = lineText.replace("data: ", "").trim();
      if (jsonString === "[DONE]") return null;

      try {
        const json = JSON.parse(jsonString);
        if (json.choices && json.choices[0].delta.content) {
          const chunk = json.choices[0].delta.content;

          // Call the onData callback if provided
          if (onData) {
            await invokeCallback(onData, chunk);
          }

          return chunk;
        }
      } catch (parseError) {
        console.error("Error parsing JSON chunk:", parseError);
      }
    }
    return null;
  };

  try {
    // Send the request and process streaming response
    const result = await apiSession.sendRequest(
      "POST",
      OPENAI_API_URL,
      {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      payload,
      processChunk
    );

    // Clean up
    const response = result.response;
    apiSession = null;

    return { response };
  } catch (error) {
    console.error("API request error:", error);

    // Clean up on error
    const accumulatedResponse = apiSession
      ? apiSession.getAccumulatedResponse()
      : "";
    apiSession = null;

    // If we were cancelled and have data, return it despite the "error"
    if (accumulatedResponse) {
      return { response: accumulatedResponse };
    }

    throw error;
  }
}

/**
 * Stops any ongoing API request
 */
export function stopMessage() {
  if (!apiSession) {
    return;
  }

  // Cancel the request and get the accumulated response
  const partialResponse = apiSession.cancelRequest();
  console.log("OpenAI API request cancelled with partial response saved");

  // Clean up
  apiSession = null;

  return partialResponse;
}
