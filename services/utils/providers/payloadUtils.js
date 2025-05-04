/**
 * Generic utilities for creating API payloads
 */
import { getSettings } from "../../../lib/settings.js";

/**
 * Creates a generic API payload
 * @param {Object} options - Payload options
 * @param {string} options.modelName - Model name to use
 * @param {number} options.temperature - Temperature setting
 * @param {boolean} [options.stream=true] - Whether to stream responses
 * @param {Object} [options.extraParams={}] - Additional provider-specific params
 * @returns {string} JSON payload string
 */
function createGenericPayload(options) {
  const {
    modelName,
    temperature,
    stream = true,
    extraParams = {}
  } = options;
  
  return JSON.stringify({
    model: modelName,
    stream,
    temperature,
    ...extraParams
  });
}

/**
 * Creates a payload for chat-based APIs (e.g. OpenAI)
 * @param {Object} options - Payload options
 * @param {string} options.modelName - Model name to use
 * @param {Array} options.messages - Array of message objects
 * @param {number} options.temperature - Temperature setting
 * @param {Function} [options.validateFn] - Optional validation function
 * @param {Function} [options.recordError] - Optional error recording function
 * @returns {string} JSON payload string
 */
export function createChatPayload(options) {
  const {
    modelName,
    messages,
    temperature,
    validateFn,
    recordError
  } = options;
  
  // Validate messages if validation function provided
  if (validateFn) {
    const validation = validateFn(messages);
    if (!validation.isValid && recordError) {
      recordError(`Invalid messages for API payload: ${validation.errors.join(", ")}`);
    }
  }
  
  return createGenericPayload({
    modelName,
    temperature,
    extraParams: { messages }
  });
}

/**
 * Creates a payload for completion-based APIs (e.g. Ollama)
 * @param {Object} options - Payload options
 * @param {string} options.modelName - Model name to use
 * @param {string} options.prompt - Prompt text to send
 * @param {number} options.temperature - Temperature setting
 * @param {string} [options.context] - Optional context from previous interactions
 * @returns {string} JSON payload string
 */
export function createCompletionPayload(options) {
  const {
    modelName,
    prompt,
    temperature,
    context
  } = options;
  
  // Get system prompt from settings
  const settings = getSettings();
  const systemPrompt = settings.get_string("model-prompt") || "";
  
  return createGenericPayload({
    modelName,
    temperature,
    extraParams: {
      prompt,
      system: systemPrompt || undefined,
      context: context || null
    }
  });
} 