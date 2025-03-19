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

  // Remove any existing temporary messages when user sends a message
  removeTemporaryMessages(outputContainer);

  // Add user message to UI (if not skipped)
  if (!skipAppendUserMessage) {
    appendUserMessage(outputContainer, displayMessage || userMessage);
  }

  // Get color from settings
  const settings = getSettings();
  const bgColor = settings.get_string("ai-message-color");

  // Create response container
  let responseContainer = null;
  let fullResponse = "";

  try {
    // Process AI response with streaming
    await sendMessage(
      userMessage,
      context,
      (chunk) => {
        fullResponse += chunk;

        // Create response container if not exists
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

    // Notify that response is complete without passing the response
    if (onResponseEnd) onResponseEnd();
  } catch (error) {
    console.error("Error processing AI response:", error);

    // Handle error case
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

  // Add each part to the container in the correct order
  parts.forEach((part, index) => {
    let contentElement;

    if (part.type === "code") {
      contentElement = UIComponents.createCodeContainer(
        part.content,
        part.language
      );

      // Add special class to ensure code blocks behave correctly
      contentElement.add_style_class_name("code-block-part");
    } else if (part.type === "formatted") {
      contentElement = UIComponents.createFormattedTextLabel(
        part.content,
        part.format
      );
    } else if (part.type === "text") {
      contentElement = UIComponents.createTextLabel(part.content);
    }

    if (contentElement) {
      // Ensure each part is added in sequence
      container.insert_child_at_index(contentElement, index);
    }
  });
}

/**
 * Add a temporary message to the output
 * @param {St.BoxLayout} outputContainer - The output container
 * @param {string} text - The message text
 */
export function addTemporaryMessage(outputContainer, text) {
  // Remove any existing temporary messages first
  removeTemporaryMessages(outputContainer);

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
  // Save temporary messages
  const tempMessages = new Set();
  temporaryMessages.forEach((msg) => {
    if (msg.get_parent() === outputContainer) {
      tempMessages.add(msg);
    }
  });

  // Clear all messages
  outputContainer.get_children().forEach((child) => {
    // Only remove message containers, identified by having either 'user-message' or 'assistant-message' style class
    if (
      !tempMessages.has(child) &&
      child.style_class &&
      (child.style_class.includes("user-message") ||
        child.style_class.includes("assistant-message"))
    ) {
      child.destroy();
    }
  });

  // Update our tracking set to only include remaining messages
  temporaryMessages = tempMessages;
}
