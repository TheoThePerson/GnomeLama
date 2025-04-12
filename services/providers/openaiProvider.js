import { getSettings } from "../../lib/settings.js";
import { createCancellableSession, invokeCallback } from "../apiUtils.js";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODELS_URL = "https://api.openai.com/v1/models";

let availableModels = [];
let apiSession = null;
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
 * Safely terminates any existing API session
 * @returns {string} Any partial response
 */
function safelyTerminateSession() {
  if (!apiSession) return "";

  try {
    const partial = apiSession.cancelRequest();
    apiSession = null;
    return partial;
  } catch (error) {
    recordError(`Failed to terminate API session: ${error.message}`);
    apiSession = null;
    return "";
  }
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
 * Prepares messages format for the OpenAI API
 * @param {string} messageText - The user's message
 * @param {Array} context - Previous conversation context
 * @returns {Array} Formatted messages for the API
 */
function prepareMessages(messageText, context = []) {
  // Add a system message if there isn't one
  const messages = [];
  const invalidMessages = [];

  // Add system message at the beginning if not already present
  const hasSystemMessage = context.some((msg) => msg.type === "system");
  if (!hasSystemMessage) {
    messages.push({
      role: "system",
      content: "You are a helpful assistant.",
    });
  }

  // Map context messages to the format expected by OpenAI API
  context.forEach((msg, index) => {
    // Validate message format
    if (!msg.text || typeof msg.text !== "string") {
      invalidMessages.push(`Message at index ${index} has invalid format`);
      return; // Skip invalid messages
    }

    messages.push({
      role:
        msg.type === "user"
          ? "user"
          : msg.type === "system"
          ? "system"
          : "assistant",
      content: msg.text,
    });
  });

  // Add the current user message
  messages.push({ role: "user", content: messageText });

  // Validate all messages have the correct format
  const fixedMessages = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg.role || !msg.content || typeof msg.content !== "string") {
      invalidMessages.push(
        `Message at position ${i} has invalid role or content`
      );

      // Fix the message if possible
      const fixedMsg = { ...msg };
      if (!fixedMsg.role) fixedMsg.role = "user";
      if (!fixedMsg.content || typeof fixedMsg.content !== "string") {
        fixedMsg.content = "";
      }

      fixedMessages.push(fixedMsg);
    } else {
      fixedMessages.push(msg);
    }
  }

  if (invalidMessages.length > 0) {
    recordError(`Message preparation issues: ${invalidMessages.join(", ")}`);
  }

  return fixedMessages;
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

    // Try to fix messages as a last resort
    const fixedMessages = messages.filter(
      (msg) => msg && msg.role && typeof msg.content === "string"
    );

    if (fixedMessages.length === 0) {
      // Add a fallback message if nothing else is valid
      fixedMessages.push({
        role: "user",
        content: "Hello",
      });
      recordError("All messages were invalid, using fallback message");
    }

    messages = fixedMessages;
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
 * Creates a chunk processor for the API response
 * @param {Function} onData - Callback for streaming data
 * @returns {Function} Chunk processor function
 */
function createChunkProcessor(onData) {
  return (lineText) => {
    if (!lineText.startsWith("data: ")) {
      return null;
    }

    const jsonString = lineText.replace("data: ", "").trim();
    if (jsonString === "[DONE]") return null;

    try {
      const json = JSON.parse(jsonString);
      if (
        !json.choices ||
        !json.choices[0].delta ||
        !json.choices[0].delta.content
      ) {
        return null;
      }

      const chunk = json.choices[0].delta.content;

      // Send the chunk immediately without waiting for async operations
      if (onData) {
        try {
          // Call directly without awaiting to avoid blocking the stream
          invokeCallback(onData, chunk);
        } catch (error) {
          recordError(
            `Error in streaming callback: ${error.message || "Unknown error"}`
          );
        }
      }

      return chunk;
    } catch (error) {
      recordError(
        `Error parsing JSON chunk: ${error.message || "Invalid JSON"}`
      );
      return null;
    }
  };
}

/**
 * Transforms the API response to match provider interface
 * @param {Object} requestHandler - Request handler from API session
 * @returns {Object} Provider interface response
 */
function transformApiResponse(requestHandler) {
  const resultPromise = requestHandler.result.then((result) => {
    // Extract just the response text string, not an object with response property
    const responseText = result && result.response ? result.response : "";
    // Reset the API session once completed successfully
    apiSession = null;
    return responseText; // Return just the string, not an object
  });

  const cancelFn = () => {
    if (apiSession) {
      const partial = apiSession.cancelRequest();
      apiSession = null;
      return partial;
    }
    return "";
  };

  return {
    result: resultPromise, // This Promise resolves to a string, not an object
    cancel: cancelFn,
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

  // Ensure previous session is properly closed before creating a new one
  if (apiSession) {
    safelyTerminateSession();
  }

  try {
    apiSession = createCancellableSession();
    const messages = prepareMessages(messageText, context);

    // Log message stats for debugging
    const contextSize = context.length;
    const messagesSize = messages.length;
    if (contextSize > 0 && messagesSize !== contextSize + 1) {
      // Only record if there's a discrepancy that might indicate a problem
      recordError(
        `Message count mismatch: context size ${contextSize}, messages formatted ${messagesSize}`
      );
    }

    const payload = createApiPayload(modelName, messages);
    const processChunk = createChunkProcessor(onData);

    const requestHandler = await apiSession.sendRequest({
      method: "POST",
      url: OPENAI_API_URL,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: payload,
      processChunk,
    });

    return transformApiResponse(requestHandler);
  } catch (error) {
    recordError(
      `OpenAI API request error: ${error.message || "Unknown error"}`
    );

    // Try to extract more detailed error information
    let errorMessage = "Error communicating with OpenAI API";
    if (error.message) {
      errorMessage += `: ${error.message}`;
    }

    // Check for accumulated partial response
    const errorResponse = handleApiError();
    if (errorResponse) {
      return errorResponse;
    }

    // Ensure apiSession is cleaned up on error
    apiSession = null;

    // Re-throw with more context
    throw new Error(errorMessage);
  }
}

/**
 * Stops the current message request to the OpenAI API
 * @returns {string} Partial response if available, empty string otherwise
 */
export function stopMessage() {
  return safelyTerminateSession();
}
