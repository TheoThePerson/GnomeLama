/**
 * Message formatting utilities for AI models
 */

import { getSettings } from "../../../lib/settings.js";

/**
 * Prepares message context for API call
 * @param {string} messageText - User's message text
 * @param {Array} context - Previous conversation context
 * @param {Object} options - Optional parameters
 * @returns {Array} Formatted messages
 */
export function prepareBasicMessages(messageText, context = [], options = {}) {
  const settings = getSettings();
  const customModelPrompt = settings.get_string("model-prompt");
  
  const { 
    defaultSystemMessage = customModelPrompt || "You are a helpful assistant.",
    roleMapping = (type) => type === "user" ? "user" : type === "system" ? "system" : "assistant"
  } = options;
  
  if (!Array.isArray(context)) {
    console.error("Context is not an array:", context);
    return [{
      role: "system",
      content: defaultSystemMessage
    }, {
      role: "user",
      content: messageText
    }];
  }
  
  const messages = [];
  
  // Add system message at the beginning if not already present
  const hasSystemMessage = context.some((msg) => msg && msg.type === "system");
  if (!hasSystemMessage) {
    messages.push({
      role: "system",
      content: defaultSystemMessage,
    });
  }

  // Add context messages
  context.forEach((msg) => {
    if (!msg || !msg.text || typeof msg.text !== "string") {
      console.log("Skipping invalid message in context:", msg);
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
    content: messageText 
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