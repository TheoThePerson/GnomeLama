/**
 * Message formatting utilities for AI models
 */

import { getSettings } from "../../../lib/settings.js";

// Keep a reference to the current model prompt
let currentModelPrompt = "";

// Get settings and listen for changes
const settings = getSettings();
currentModelPrompt = settings.get_string("model-prompt") || "";

// Listen for changes to the model-prompt setting
settings.connect("changed::model-prompt", () => {
  currentModelPrompt = settings.get_string("model-prompt") || "";
});

/**
 * Prepares message context for API call
 * @param {string} messageText - User's message text
 * @param {Array} context - Previous conversation context
 * @param {Object} options - Optional parameters
 * @returns {Array} Formatted messages
 */
export function prepareBasicMessages(messageText, context = [], options = {}) {
  const { 
    roleMapping = (type) => type === "user" ? "user" : type === "system" ? "system" : "assistant",
    isOllama = false
  } = options;
  
  if (!Array.isArray(context)) {
    console.error("Context is not an array:", context);
    
    // If this is the first message and we have a model prompt, inject it
    // But only for non-Ollama models as Ollama handles system prompt separately
    let firstMessage = messageText;
    if (!isOllama && currentModelPrompt && currentModelPrompt.trim() !== "") {
      firstMessage = `${currentModelPrompt}\n\n${messageText}`;
    }
    
    return [{
      role: "user",
      content: firstMessage
    }];
  }
  
  const messages = [];
  
  // Add current user message
  // ONLY prepend system prompt for non-Ollama models
  let userContent = messageText;
  if (!isOllama && currentModelPrompt && currentModelPrompt.trim() !== "") {
    userContent = `${currentModelPrompt}\n\n${messageText}`;
  }
  
  // Add context messages
  context.forEach((msg) => {
    if (!msg || !msg.text || typeof msg.text !== "string") {
      return;
    }
    
    messages.push({
      role: roleMapping(msg.type),
      content: msg.text,
    });
  });

  // Add current user message
  messages.push({ 
    role: "user", 
    content: userContent 
  });
  
  return messages;
}

/**
 * Validates the message array for chat models
 * @param {Array} messages - Array of message objects to validate
 * @returns {Object} Validation result with isValid flag and errors
 */
export function validateMessages(messages) {
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