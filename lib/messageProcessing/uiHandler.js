/**
 * UI message component handlers
 */

import Clutter from "gi://Clutter";
import St from "gi://St";
import { parseMessageContent } from "../messageFormatter.js";
import * as UIComponents from "../../ui/components.js";
import * as PanelElements from "../../ui/panelElements.js";

// Track temporary messages
let temporaryMessages = new Set();

/**
 * Append a user message to the output container
 * @param {St.BoxLayout} outputContainer - The output container
 * @param {string} message - The message to append
 */
export function appendUserMessage(outputContainer, message) {
  // Create the user message container using the unified component system
  const userContainer = UIComponents.createMessageContainer(
    message,
    true, // This is a user message
    Clutter.ActorAlign.END
  );

  // Add the container to the output
  outputContainer.add_child(userContainer);

  // Scroll to the bottom
  PanelElements.scrollToBottom(outputContainer.get_parent());
}

/**
 * Update response container with parsed content
 * @param {St.BoxLayout} container - The container to update
 * @param {string} responseText - The response text
 * @param {boolean} lastMessageHadFiles - Whether the last message had files
 * @param {Function} jsonHandler - JSON response handler function
 */
export function updateResponseContainer(
  container,
  responseText,
  lastMessageHadFiles,
  jsonHandler
) {
  // Clear previous content
  container.get_children().forEach((child) => child.destroy());

  // Try parsing as JSON response for file handling first
  if (
    jsonHandler &&
    jsonHandler(container, responseText, lastMessageHadFiles)
  ) {
    return; // If JSON was handled, we're done
  }

  // Otherwise, parse and add content normally
  const parts = parseMessageContent(responseText);

  // Create a content element for each part
  parts.forEach((part, index) => {
    const contentElement = createContentElement(part);
    if (contentElement) {
      container.insert_child_at_index(contentElement, index);
    }
  });
}

/**
 * Create a UI element for a content part
 * @param {Object} part - Content part object
 * @returns {St.Widget|null} UI element or null
 */
function createContentElement(part) {
  switch (part.type) {
    case "text":
      return createTextElement(part.content);
    case "formatted":
      return createFormattedTextElement(part.content, part.format);
    case "code":
      return createCodeBlockElement(part.content, part.language);
    default:
      return null;
  }
}

/**
 * Create a text element
 * @param {string} text - Text content
 * @returns {St.Label} Text label
 */
function createTextElement(text) {
  // Basic label for plain text
  const label = new St.Label({
    text: text,
    x_expand: true,
    y_expand: true,
  });
  return label;
}

/**
 * Create a formatted text element
 * @param {string} text - Text content
 * @param {string} format - Format type
 * @returns {St.Label} Formatted text label
 */
function createFormattedTextElement(text, format) {
  // Apply formatting using style classes
  const label = new St.Label({
    text: text,
    x_expand: true,
    y_expand: true,
  });

  if (format === "bold") {
    label.add_style_class_name("bold-text");
  } else if (format === "italic") {
    label.add_style_class_name("italic-text");
  }

  return label;
}

/**
 * Create a code block element
 * @param {string} code - Code content
 * @param {string} language - Programming language
 * @returns {St.Widget} Code block widget
 */
function createCodeBlockElement(code, language) {
  // Placeholder for code block rendering
  const codeBlock = new St.BoxLayout({
    vertical: true,
    style_class: "code-block",
  });

  // Add language indicator if available
  if (language && language !== "code") {
    const langLabel = new St.Label({
      text: language,
      style_class: "code-language",
    });
    codeBlock.add_child(langLabel);
  }

  // Add code content
  const codeLabel = new St.Label({
    text: code,
    style_class: "code-content",
  });
  codeBlock.add_child(codeLabel);

  return codeBlock;
}

/**
 * Add a temporary message to the output container
 * @param {St.BoxLayout} outputContainer - The output container
 * @param {string} text - Message text
 * @returns {St.BoxLayout} The message container
 */
export function addTemporaryMessage(outputContainer, text) {
  const bgColor = "#555555"; // Default color for temp messages

  const container = PanelElements.createResponseContainer(bgColor);
  const label = new St.Label({ text });
  container.add_child(label);

  outputContainer.add_child(container);
  temporaryMessages.add(container);

  return container;
}

/**
 * Remove all temporary messages from container
 * @param {St.BoxLayout} outputContainer - The output container
 */
export function removeTemporaryMessages(outputContainer) {
  temporaryMessages.forEach((msg) => {
    if (msg.get_parent() === outputContainer) {
      outputContainer.remove_child(msg);
    }
  });
  temporaryMessages.clear();
}

/**
 * Clear all messages from output container
 * @param {St.BoxLayout} outputContainer - The output container
 */
export function clearOutput(outputContainer) {
  if (!outputContainer) return;

  const children = outputContainer.get_children();
  for (let i = children.length - 1; i >= 0; i--) {
    outputContainer.remove_child(children[i]);
  }

  temporaryMessages.clear();
}

// Update the createResponseContainer function to use our unified component
export function createResponseContainer(outputContainer, bgColor) {
  // Create response container using the unified component system
  const container = PanelElements.createResponseContainer(bgColor);

  // Add the container to the output
  outputContainer.add_child(container);

  return container;
}
