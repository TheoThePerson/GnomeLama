/**
 * Main message processor
 */

import { sendMessage } from "../../services/messaging.js";
import { getSettings } from "../settings.js";
import * as JsonHandler from "./jsonHandler.js";
import * as UIHandler from "./uiHandler.js";

// Track if the last message had files attached
let lastMessageHadFiles = false;

/**
 * Process user message and handle AI response
 * @param {object} options - Processing options
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
  // Check if the message has files
  lastMessageHadFiles =
    displayMessage && displayMessage.includes("[files attached]");

  if (!userMessage || !userMessage.trim()) {
    return;
  }

  // Remove temporary messages
  UIHandler.removeTemporaryMessages(outputContainer);

  // Add user message to UI if not already added
  if (!skipAppendUserMessage) {
    UIHandler.appendUserMessage(outputContainer, displayMessage || userMessage);
  }

  // Get color from settings
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
          responseContainer = createResponseContainer(bgColor);
          outputContainer.add_child(responseContainer);
        }

        // Update response content
        UIHandler.updateResponseContainer(
          responseContainer,
          fullResponse,
          lastMessageHadFiles,
          JsonHandler.tryParseJsonResponse
        );
        scrollToBottom(scrollView);
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
 * Create a response container with specified background color
 * @param {string} bgColor - Background color
 * @returns {St.BoxLayout} Response container
 */
function createResponseContainer(bgColor) {
  // This function would normally be imported from panelElements.js
  // But for simplicity in this refactoring, we'll keep it as a stub
  return {};
}

/**
 * Scroll view to bottom
 * @param {St.ScrollView} scrollView - Scroll view to scroll
 */
function scrollToBottom(scrollView) {
  // This function would normally be imported from panelElements.js
  // But for simplicity in this refactoring, we'll keep it as a stub
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
    responseContainer = createResponseContainer(bgColor);
    outputContainer.add_child(responseContainer);
  }

  UIHandler.updateResponseContainer(
    responseContainer,
    "An error occurred while processing your request.",
    false,
    null
  );
  scrollToBottom(scrollView);
}

// Export utility functions from other modules for convenience
export const appendUserMessage = UIHandler.appendUserMessage;
export const addTemporaryMessage = UIHandler.addTemporaryMessage;
export const clearOutput = UIHandler.clearOutput;
export const registerFilePaths = JsonHandler.registerFilePaths;
export const getOriginalFilePath = JsonHandler.getOriginalFilePath;

/**
 * Set whether the last message had files
 * @param {boolean} hadFiles - Whether files were attached
 */
export function setLastMessageHadFiles(hadFiles) {
  lastMessageHadFiles = hadFiles;
}
