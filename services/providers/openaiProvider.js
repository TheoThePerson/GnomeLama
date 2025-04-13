import { getSettings } from "../../lib/settings.js";
import { createCancellableSession, invokeCallback } from "../apiUtils.js";
import {
  createChunkProcessor,
  transformApiResponse,
  sendMessageToAPI as sendToAPI,
  safelyTerminateSession
} from "./providerUtils.js";
import {
  filterModels,
  groupModels,
  sortModels,
  prepareBasicMessages
} from "./modelUtils.js";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODELS_URL = "https://api.openai.com/v1/models";

let availableModels = [];
const errorMessages = [];

/**
 * Records errors without console.log for later reporting
 * @param {string} message - Error message to record
 */
function recordError(message) {
  errorMessages.push(message);
}

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
  // Initial filtering
  const filteredModels = filterModels(modelData, (model) => {
    const id = model.id.toLowerCase();
    return id.includes("gpt") && 
           !id.includes("instruct") &&
           !id.includes("audio") &&
           !id.includes("search") &&
           !id.includes("realtime") &&
           !/-\d{4}/u.test(id) &&
           !/-\d{3,4}$/u.test(id);
  });

  // Group models by base name - extract just the ids for grouping
  const modelGroups = groupModels(
    filteredModels.map(model => model.id), 
    (id) => id.replace(/-preview(-\d{4}-\d{2}-\d{2})?$/u, "")
  );

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

  return sortModels(selectedModels);
}

/**
 * Fetches available OpenAI model names
 * @returns {Promise<string[]>} Array of available model names
 */
export async function fetchModelNames() {
  const settings = getSettings();
  const apiKey = settings.get_string("openai-api-key");

  if (!apiKey) {
    recordError("OpenAI API key not configured");
    return [];
  }

  try {
    const tempSession = createCancellableSession();
    const data = await tempSession.get(OPENAI_MODELS_URL, {
      Authorization: `Bearer ${apiKey}`,
    });

    availableModels = processModelData(data.data);
    return availableModels;
  } catch (error) {
    recordError(
      `Error fetching OpenAI models: ${error.message || "Unknown error"}`
    );
    return [];
  }
}

/**
 * Validates the message array to ensure it meets OpenAI API requirements
 * @param {Array} messages - Array of message objects to validate
 * @returns {Object} Validation result with isValid flag and errors
 */
function validateMessages(messages) {
  const errors = [];

  if (!Array.isArray(messages)) {
    errors.push("Messages must be an array");
    return { isValid: false, errors };
  }

  if (messages.length === 0) {
    errors.push("Messages array cannot be empty");
    return { isValid: false, errors };
  }

  // Check each message
  for (const [index, msg] of messages.entries()) {
    if (!msg.role || !["user", "assistant", "system"].includes(msg.role)) {
      errors.push(`Message at index ${index} has invalid role: ${msg.role}`);
    }

    if (!msg.content || typeof msg.content !== "string") {
      errors.push(`Message at index ${index} has invalid content`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Creates the payload for the OpenAI API
 * @param {string} modelName - Model name to use
 * @param {Array} messages - Formatted messages
 * @returns {string} JSON payload string
 */
function createApiPayload(modelName, messages) {
  // Validate messages before creating payload
  const validation = validateMessages(messages);

  if (!validation.isValid) {
    recordError(
      `Invalid messages for API payload: ${validation.errors.join(", ")}`
    );
  }

  const settings = getSettings();
  return JSON.stringify({
    model: modelName,
    messages,
    stream: true,
    temperature: settings.get_double("temperature"),
  });
}

/**
 * Process JSON from OpenAI API responses
 * @param {Object} json - Parsed JSON from API
 * @returns {string|null} Processed chunk or null
 */
function processOpenAIJson(json) {
  // Process an SSE message from OpenAI
  if (json.choices && json.choices.length > 0) {
    const delta = json.choices[0].delta;
    if (delta && delta.content) {
      return delta.content;
    }
  }
  return null;
}

/**
 * Creates a chunk processor function for OpenAI streaming API responses
 * @param {Function} onData - Callback for streaming data
 * @returns {Function} Chunk processor function
 */
function createOpenAIChunkProcessor(onData) {
  return async (lineText) => {
    // OpenAI uses SSE format with "data: " prefix
    if (!lineText.startsWith("data: ")) {
      return null;
    }

    const jsonString = lineText.replace("data: ", "").trim();
    if (jsonString === "[DONE]") {
      return null;
    }

    try {
      const json = JSON.parse(jsonString);
      const result = processOpenAIJson(json);
      
      if (result && onData) {
        await invokeCallback(onData, result);
      }
      
      return result;
    } catch (error) {
      // Silent error for unparseable chunks
      return null;
    }
  };
}

/**
 * Process result from OpenAI API
 * @param {Object} result - API result
 * @returns {string} Processed response text
 */
function processOpenAIResult(result) {
  return result || "";
}

/**
 * Sends a message to the OpenAI API
 * @param {Object} options - API call options
 * @param {string} options.messageText - Message to send
 * @param {string} options.modelName - Model to use
 * @param {Array} [options.context] - Previous conversation context
 * @param {Function} [options.onData] - Callback for streaming data
 * @returns {Promise<{result: Promise<string>, cancel: Function}>} Response promise and cancel function
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
    recordError("OpenAI API key not configured");
    throw new Error("OpenAI API key not configured");
  }

  const messages = prepareBasicMessages(messageText, context);
  const payload = createApiPayload(modelName, messages);
  
  // Create chunk processor specific to OpenAI
  const processChunk = createOpenAIChunkProcessor(onData);
  
  return sendToAPI({
    method: "POST",
    endpoint: OPENAI_API_URL,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    payload,
    processChunk,
    transformResponse: (requestHandler) => 
      transformApiResponse(requestHandler, processOpenAIResult)
  });
}

/**
 * Stops the current message streaming operation
 * @returns {string} The accumulated response text so far
 */
export function stopMessage() {
  return safelyTerminateSession();
}
