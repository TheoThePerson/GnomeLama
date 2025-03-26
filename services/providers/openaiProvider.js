import GLib from "gi://GLib";
import { getSettings } from "../../lib/settings.js";
import { createCancellableSession, invokeCallback } from "../apiUtils.js";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODELS_URL = "https://api.openai.com/v1/models";

let availableModels = [];
let apiSession = null;

/**
 * Checks if the given model name is an OpenAI model
 * @param {string} modelName - The name of the model to check
 * @returns {boolean} True if the model is an OpenAI model
 */
export function isOpenAIModel(modelName) {
  return availableModels.includes(modelName);
}

/**
 * Filters and processes model data from the API response
 * @param {Array} modelData - Raw model data from the API
 * @returns {Array} Filtered and processed model names
 */
function processModelData(modelData) {
  const filteredModels = modelData
    .filter((model) => model.id.includes("gpt"))
    .filter((model) => {
      const id = model.id.toLowerCase();
      if (id.includes("instruct")) return false;
      if (id.includes("audio")) return false;
      if (id.includes("search")) return false;
      if (id.includes("realtime")) return false;
      if (/-\d{4}/u.test(id)) return false;
      if (/-\d{3,4}$/u.test(id)) return false;
      return true;
    });

  const modelGroups = new Map();
  filteredModels.forEach((model) => {
    const baseName = model.id.replace(/-preview(-\d{4}-\d{2}-\d{2})?$/u, "");
    if (!modelGroups.has(baseName)) {
      modelGroups.set(baseName, []);
    }
    modelGroups.get(baseName).push(model.id);
  });

  return selectFinalModels(modelGroups);
}

/**
 * Selects the best model variant from each group
 * @param {Map} modelGroups - Grouped model variants
 * @returns {Array} Selected model names
 */
function selectFinalModels(modelGroups) {
  const selectedModels = [];

  for (const [, variants] of modelGroups) {
    const previewVariants = variants.filter((v) => v.includes("-preview"));
    const nonPreviewVariants = variants.filter((v) => !v.includes("-preview"));

    if (nonPreviewVariants.length > 0) {
      selectedModels.push(nonPreviewVariants[0]);
    } else if (previewVariants.length > 0) {
      const simplePreview = previewVariants.find(
        (v) => !v.match(/-preview-\d{4}-\d{2}-\d{2}$/u)
      );
      selectedModels.push(simplePreview || previewVariants[0]);
    }
  }

  return selectedModels.sort();
}

/**
 * Fetches available OpenAI model names
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
    const tempSession = createCancellableSession();
    const data = await tempSession.get(OPENAI_MODELS_URL, {
      Authorization: `Bearer ${apiKey}`,
    });

    availableModels = processModelData(data.data);
    return availableModels;
  } catch (e) {
    console.error("Error fetching OpenAI models:", e);
    return [];
  }
}

/**
 * Prepares messages format for the OpenAI API
 * @param {string} messageText - The user's message
 * @param {Array} context - Previous conversation context
 * @returns {Array} Formatted messages for the API
 */
function prepareMessages(messageText, context = []) {
  const messages = context.map((msg) => ({
    role: msg.type === "user" ? "user" : "assistant",
    content: msg.text,
  }));

  messages.push({ role: "user", content: messageText });
  return messages;
}

/**
 * Creates the payload for the OpenAI API
 * @param {string} modelName - Model name to use
 * @param {Array} messages - Formatted messages
 * @returns {string} JSON payload string
 */
function createApiPayload(modelName, messages) {
  const settings = getSettings();
  return JSON.stringify({
    model: modelName,
    messages,
    stream: true,
    temperature: settings.get_double("temperature"),
  });
}

/**
 * Creates a chunk processor for the API response
 * @param {Function} onData - Callback for streaming data
 * @returns {Function} Chunk processor function
 */
function createChunkProcessor(onData) {
  return async (lineText) => {
    if (lineText.startsWith("data: ")) {
      const jsonString = lineText.replace("data: ", "").trim();
      if (jsonString === "[DONE]") return null;

      try {
        const json = JSON.parse(jsonString);
        if (json.choices && json.choices[0].delta.content) {
          const chunk = json.choices[0].delta.content;

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
}

/**
 * Transforms the API response to match provider interface
 * @param {Object} requestHandler - Request handler from API session
 * @returns {Object} Provider interface response
 */
function transformApiResponse(requestHandler) {
  return {
    result: requestHandler.result.then((result) => {
      const { response } = result;

      // Reset the API session once completed successfully
      GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
        apiSession = null;
        return GLib.SOURCE_REMOVE;
      });

      return { response };
    }),
    cancel: () => {
      if (apiSession) {
        const partial = apiSession.cancelRequest();
        apiSession = null;
        return partial;
      }
      return "";
    },
  };
}

/**
 * Handle errors during API calls
 * @returns {Object|null} Error response or null to throw
 */
function handleApiError() {
  const accumulatedResponse = apiSession
    ? apiSession.getAccumulatedResponse()
    : "";
  apiSession = null;

  if (accumulatedResponse) {
    return {
      result: Promise.resolve({ response: accumulatedResponse }),
      cancel: () => accumulatedResponse,
    };
  }

  return null;
}

/**
 * Sends a message to the OpenAI API
 * @param {Object} options - API call options
 * @param {string} options.messageText - The message to send
 * @param {string} options.modelName - The name of the model to use
 * @param {Array} options.context - Previous conversation context
 * @param {Function} options.onData - Callback function for streaming data
 * @returns {Object} Object containing result promise and cancel function
 */
export async function sendMessageToAPI({
  messageText,
  modelName,
  context = [],
  onData,
}) {
  const settings = getSettings();
  const apiKey = settings.get_string("openai-api-key");

  if (!apiKey) {
    throw new Error(
      "OpenAI API key not configured. Please add it in settings."
    );
  }

  apiSession = createCancellableSession();
  const messages = prepareMessages(messageText, context);
  const payload = createApiPayload(modelName, messages);
  const processChunk = createChunkProcessor(onData);

  try {
    const requestHandler = await apiSession.sendRequest(
      "POST",
      OPENAI_API_URL,
      {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      payload,
      processChunk
    );

    return transformApiResponse(requestHandler);
  } catch (error) {
    console.error("API request error:", error);

    const errorResponse = handleApiError();
    if (errorResponse) {
      return errorResponse;
    }

    throw error;
  }
}

/**
 * Stops the current message request to the OpenAI API
 * @returns {string} Partial response if available, empty string otherwise
 */
export function stopMessage() {
  if (!apiSession) {
    return "";
  }

  const partialResponse = apiSession.cancelRequest();
  console.log("OpenAI API request cancelled with partial response saved");

  apiSession = null;

  return partialResponse;
}
