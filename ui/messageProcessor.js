/**
 * UI message processing functionalities
 */

import Clutter from "gi://Clutter";
import { parseMessageContent } from "../lib/messageParser.js";
import * as UIComponents from "./components.js";
import * as PanelElements from "./panelElements.js";
import { sendMessage } from "../services/messaging.js";
import { getSettings } from "../lib/settings.js";

/**
 * Process user message and handle AI response
 * @param {object} options - Processing options
 * @param {string} options.userMessage - The user message to process
 * @param {string} options.context - Optional conversation context
 * @param {St.BoxLayout} options.outputContainer - Container for output messages
 * @param {St.ScrollView} options.scrollView - Scroll view for output
 * @param {Function} options.onResponseStart - Called when response starts
 * @param {Function} options.onResponseEnd - Called when response ends
 * @param {string} options.aiMessageColor - Background color for AI messages
 * @returns {Promise<void>}
 */
export async function processUserMessage({
  userMessage,
  context,
  outputContainer,
  scrollView,
  onResponseStart,
  onResponseEnd,
  aiMessageColor,
}) {
  if (!userMessage || !userMessage.trim()) {
    return;
  }

  // Add user message to UI
  appendUserMessage(outputContainer, userMessage);

  // Process AI response
  await processAIResponse({
    userMessage,
    context,
    outputContainer,
    scrollView,
    onResponseStart,
    onResponseEnd,
    aiMessageColor,
  });
}

/**
 * Process AI response to user message
 * @param {object} options - Processing options
 * @returns {Promise<void>}
 */
async function processAIResponse({
  userMessage,
  context,
  outputContainer,
  scrollView,
  onResponseStart,
  onResponseEnd,
  aiMessageColor,
}) {
  let responseContainer = null;
  let fullResponse = "";

  // Use provided color or get from settings as fallback
  const bgColor =
    aiMessageColor || getSettings().get_string("ai-message-color");

  try {
    await sendMessage(userMessage, context, (chunk) => {
      fullResponse += chunk;

      // Create or update response container
      if (!responseContainer) {
        if (onResponseStart) {
          onResponseStart();
        }
        responseContainer = PanelElements.createResponseContainer(bgColor);
        outputContainer.add_child(responseContainer);
      }

      updateResponseContainer(responseContainer, fullResponse);
      PanelElements.scrollToBottom(scrollView);

      // Ensure UI updates immediately
      global.window_manager.ensure_redraw();
    });

    if (onResponseEnd) {
      onResponseEnd(fullResponse);
    }
  } catch (error) {
    console.error("Error processing AI response:", error);

    // Handle error case
    if (!responseContainer) {
      responseContainer = PanelElements.createResponseContainer(bgColor);
      outputContainer.add_child(responseContainer);
    }

    const errorMessage = "An error occurred while processing your request.";
    updateResponseContainer(responseContainer, errorMessage);
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

  parts.forEach((part) => {
    let contentElement;

    if (part.type === "code") {
      contentElement = UIComponents.createCodeContainer(
        part.content,
        part.language
      );
    } else if (part.type === "formatted") {
      contentElement = UIComponents.createFormattedTextLabel(
        part.content,
        part.format
      );
    } else if (part.type === "text") {
      contentElement = UIComponents.createTextLabel(part.content);
    }

    if (contentElement) {
      container.add_child(contentElement);
    }
  });
}

/**
 * Add a temporary message to the output
 * @param {St.BoxLayout} outputContainer - The output container
 * @param {string} text - The message text
 */
export function addTemporaryMessage(outputContainer, text) {
  const tempLabel = UIComponents.createTemporaryMessageLabel(text);
  outputContainer.add_child(tempLabel);
}

/**
 * Clear all messages from the output container
 * @param {St.BoxLayout} outputContainer - The container to clear
 */
export function clearOutput(outputContainer) {
  outputContainer.get_children().forEach((child) => child.destroy());
}
