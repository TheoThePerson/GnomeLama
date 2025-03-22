/**
 * Main message processor
 */

import * as UIHandler from "./uiHandler.js";
import * as JsonHandler from "./jsonHandler.js";
import { getSettings } from "../settings.js";
import * as MessagingService from "../messaging.js";
import * as UIComponents from "../../ui/components.js";
import * as PanelElements from "../../ui/panelElements.js";
import Clutter from "gi://Clutter";

// Track if the last message had files attached
let lastMessageHadFiles = false;

/**
 * Process user message and handle AI response
 * @param {object} params - Processing parameters
 * @param {string} params.userMessage - User's message
 * @param {string} params.displayMessage - Optional simplified message for display
 * @param {string} params.context - Optional conversation context
 * @param {St.BoxLayout} params.outputContainer - Container for output
 * @param {St.ScrollView} params.scrollView - Scroll view containing the output
 * @param {Function} params.onResponseStart - Callback when response starts
 * @param {Function} params.onResponseEnd - Callback when response ends
 * @param {boolean} params.skipAppendUserMessage - Whether to skip adding user message
 * @returns {Promise<string>} The AI's response
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
  // Reset error state
  let error = null;
  let responseContainer = null;
  const settings = getSettings();
  const bgColor = settings.get_string("ai-message-color");

  try {
    if (!skipAppendUserMessage) {
      // Add user message to UI
      const userContainer = UIComponents.createMessageContainer(
        displayMessage || userMessage,
        true,
        Clutter.ActorAlign.END
      );
      outputContainer.add_child(userContainer);
    }

    // Create container for AI response
    responseContainer = PanelElements.createResponseContainer(bgColor);
    outputContainer.add_child(responseContainer);

    // Scroll to the new message
    PanelElements.scrollToBottom(scrollView);

    // Notify that we're starting to process
    if (onResponseStart) {
      onResponseStart();
    }

    // Send message and process streaming response
    const response = await MessagingService.sendMessage(
      userMessage,
      context,
      (chunk) => {
        // Add each chunk to the response container
        if (responseContainer) {
          UIComponents.updateResponseContainer(responseContainer, chunk);
          PanelElements.scrollToBottom(scrollView);
        }
      },
      displayMessage
    );

    if (onResponseEnd) {
      onResponseEnd(response);
    }

    return response;
  } catch (err) {
    error = err;
    console.error("Error processing message:", error);

    // Handle error display
    if (responseContainer) {
      handleResponseError(
        error,
        responseContainer,
        outputContainer,
        bgColor,
        scrollView
      );
    }

    if (onResponseEnd) {
      onResponseEnd(null, error);
    }

    return null;
  }
}

/**
 * Handle display of response errors
 * @param {Error} error - The error object
 * @param {St.BoxLayout} responseContainer - Container for the response
 * @param {St.BoxLayout} outputContainer - Overall output container
 * @param {string} bgColor - Background color
 * @param {St.ScrollView} scrollView - Scroll view
 */
function handleResponseError(
  error,
  responseContainer,
  outputContainer,
  bgColor,
  scrollView
) {
  // Remove the existing response container
  outputContainer.remove_child(responseContainer);

  // Create a new container for the error message
  responseContainer = PanelElements.createResponseContainer(bgColor);
  outputContainer.add_child(responseContainer);

  // Add error message
  const errorLabel = UIComponents.createTextLabel(
    `Error: ${error.message || "An unknown error occurred"}`
  );
  responseContainer.add_child(errorLabel);

  // Scroll to show the error
  PanelElements.scrollToBottom(scrollView);
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
