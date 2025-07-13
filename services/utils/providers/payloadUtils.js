/**
 * Generic utilities for creating API payloads
 */
import { getSettings } from "../../../lib/settings.js";
import Gio from "gi://Gio";
import GLib from "gi://GLib";

/**
 * Converts an image file to base64 string
 * @param {string} filePath - Path to the image file
 * @returns {string|null} Base64 string or null if conversion fails
 */
function convertImageToBase64(filePath) {
  try {
    const file = Gio.File.new_for_path(filePath);
    const [success, contents] = file.load_contents(null);
    
    if (!success) {
      return null;
    }
    
    // Convert bytes to base64
    const base64 = GLib.base64_encode(contents);
    return base64;
  } catch (error) {
    console.error(`Error converting image to base64: ${error.message}`);
    return null;
  }
}

/**
 * Extracts image data from message content and converts to base64
 * @param {string} messageContent - The message content that may contain files
 * @returns {Array} Array of base64 image strings
 */
function extractImagesFromMessage(messageContent) {
  const images = [];
  
  try {
    // Try to parse as JSON first (structured file content)
    const jsonData = JSON.parse(messageContent);
    
    if (jsonData.files && Array.isArray(jsonData.files)) {
      for (const file of jsonData.files) {
        if (file.content && typeof file.content === 'string' && 
            file.content.startsWith('[IMAGE:') && file.content.endsWith(']')) {
          // Extract file path from [IMAGE:path] format
          const imagePath = file.content.slice(7, -1); // Remove '[IMAGE:' and ']'
          const base64 = convertImageToBase64(imagePath);
          if (base64) {
            images.push(base64);
          }
        }
      }
    }
  } catch {
    // If not JSON, check for direct image content in the message
    const imageRegex = /\[IMAGE:([^\]]+)\]/g;
    let match;
    
    while ((match = imageRegex.exec(messageContent)) !== null) {
      const imagePath = match[1];
      const base64 = convertImageToBase64(imagePath);
      if (base64) {
        images.push(base64);
      }
    }
  }
  
  return images;
}

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
 * @param {string} [options.messageContent] - Full message content to extract images from
 * @returns {string} JSON payload string
 */
export function createCompletionPayload(options) {
  const {
    modelName,
    prompt,
    temperature,
    context,
    messageContent
  } = options;
  
  // Get system prompt from settings
  const settings = getSettings();
  const systemPrompt = settings.get_string("model-prompt") || "";
  
  // Extract images from message content
  let images = [""];
  if (messageContent) {
    const extractedImages = extractImagesFromMessage(messageContent);
    if (extractedImages.length > 0) {
      images = extractedImages;
    }
  }
  
  return createGenericPayload({
    modelName,
    temperature,
    extraParams: {
      prompt,
      system: systemPrompt || undefined,
      context: context || null,
      images
    }
  });
} 