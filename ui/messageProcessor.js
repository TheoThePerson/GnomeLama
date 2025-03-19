/**
 * UI message processing functionalities
 */

import Clutter from "gi://Clutter";
import { parseMessageContent } from "../lib/messageFormater.js";
import * as UIComponents from "./components.js";
import * as PanelElements from "./panelElements.js";
import { sendMessage } from "../services/messaging.js";
import { getSettings } from "../lib/settings.js";

// Track temporary messages
let temporaryMessages = new Set();

/**
 * Process user message and handle AI response
 * @param {object} options - Processing options
 * @param {string} options.userMessage - The user message to process
 * @param {string} options.displayMessage - Optional simplified message for history and display
 * @param {string} options.context - Optional conversation context
 * @param {St.BoxLayout} options.outputContainer - Container for output messages
 * @param {St.ScrollView} options.scrollView - Scroll view for output
 * @param {Function} options.onResponseStart - Called when response starts
 * @param {Function} options.onResponseEnd - Called when response ends
 * @param {boolean} options.skipAppendUserMessage - Skip appending user message (when already added)
 * @returns {Promise<void>}
 */
export async function processUserMessage({
  userMessage,
  displayMessage,
  context,
  outputContainer,
  scrollView,
  onResponseStart,
  onResponseEnd,
  skipAppendUserMessage = false,
}) {
  if (!userMessage || !userMessage.trim()) {
    return;
  }

  // Remove temporary messages
  removeTemporaryMessages(outputContainer);

  // Add user message to UI if not already added
  if (!skipAppendUserMessage) {
    appendUserMessage(outputContainer, displayMessage || userMessage);
  }

  // Get color from settings once
  const bgColor = getSettings().get_string("ai-message-color");

  // Variables for response processing
  let responseContainer = null;
  let fullResponse = "";

  try {
    // Process AI response with streaming
    await sendMessage(
      userMessage,
      context,
      (chunk) => {
        fullResponse += chunk;

        // Create response container if needed
        if (!responseContainer) {
          if (onResponseStart) onResponseStart();
          responseContainer = PanelElements.createResponseContainer(bgColor);
          outputContainer.add_child(responseContainer);
        }

        // Update response content
        updateResponseContainer(responseContainer, fullResponse);
        PanelElements.scrollToBottom(scrollView);
      },
      displayMessage // Pass display message for history
    );

    // Notify response completion
    if (onResponseEnd) onResponseEnd();
  } catch (error) {
    console.error("Error processing AI response:", error);
    handleResponseError(
      error,
      responseContainer,
      outputContainer,
      bgColor,
      scrollView
    );
  }
}

/**
 * Handles errors during response processing
 * @private
 */
function handleResponseError(
  error,
  responseContainer,
  outputContainer,
  bgColor,
  scrollView
) {
  if (!responseContainer) {
    responseContainer = PanelElements.createResponseContainer(bgColor);
    outputContainer.add_child(responseContainer);
  }

  updateResponseContainer(
    responseContainer,
    "An error occurred while processing your request."
  );
  PanelElements.scrollToBottom(scrollView);
}

/**
 * Append a user message to the output container
 * @param {St.BoxLayout} outputContainer - The output container
 * @param {string} message - The message to append
 */
export function appendUserMessage(outputContainer, message) {
  const userContainer = UIComponents.createMessageContainer(
    message,
    true, // isUser
    Clutter.ActorAlign.END
  );
  outputContainer.add_child(userContainer);
}

/**
 * Update response container with parsed content
 * @param {St.BoxLayout} container - The container to update
 * @param {string} responseText - The response text
 */
export function updateResponseContainer(container, responseText) {
  // Clear previous content
  container.get_children().forEach((child) => child.destroy());

  // Parse and add new content
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
 * Creates the appropriate UI element for a content part
 * @private
 * @param {Object} part - The content part to create an element for
 * @returns {St.Widget|null} The created UI element or null
 */
function createContentElement(part) {
  switch (part.type) {
    case "code":
      const codeElement = UIComponents.createCodeContainer(
        part.content,
        part.language
      );
      codeElement.add_style_class_name("code-block-part");
      return codeElement;

    case "formatted":
      return UIComponents.createFormattedTextLabel(part.content, part.format);

    case "text":
      return UIComponents.createTextLabel(part.content);

    default:
      return null;
  }
}

/**
 * Add a temporary message to the output
 * @param {St.BoxLayout} outputContainer - The output container
 * @param {string} text - The message text
 */
export function addTemporaryMessage(outputContainer, text) {
  // Clean up existing temporary messages
  removeTemporaryMessages(outputContainer);

  // Create and add new temporary message
  const tempLabel = UIComponents.createTemporaryMessageLabel(text);
  outputContainer.add_child(tempLabel);
  temporaryMessages.add(tempLabel);
}

/**
 * Remove all temporary messages from the output container
 * @param {St.BoxLayout} outputContainer - The container to clear temporary messages from
 */
function removeTemporaryMessages(outputContainer) {
  temporaryMessages.forEach((message) => {
    if (message.get_parent() === outputContainer) {
      message.destroy();
    }
  });
  temporaryMessages.clear();
}

/**
 * Clear all messages from the output container except temporary ones
 * @param {St.BoxLayout} outputContainer - The container to clear
 */
export function clearOutput(outputContainer) {
  // Identify which temporary messages to preserve
  const tempMessagesToKeep = new Set();
  temporaryMessages.forEach((msg) => {
    if (msg.get_parent() === outputContainer) {
      tempMessagesToKeep.add(msg);
    }
  });

  // Remove all non-temporary message containers
  const children = outputContainer.get_children();
  for (let i = children.length - 1; i >= 0; i--) {
    const child = children[i];
    // Skip temporary messages
    if (tempMessagesToKeep.has(child)) {
      continue;
    }

    // Remove all message containers, whether user or AI
    // Check for common message classes and also check for response containers
    if (
      child.style_class &&
      (child.style_class.includes("message-box") ||
        child.style_class.includes("user-message") ||
        child.style_class.includes("ai-message") ||
        child.style_class.includes("assistant-message"))
    ) {
      child.destroy();
    }
  }

  // Update tracking set
  temporaryMessages = tempMessagesToKeep;
}
