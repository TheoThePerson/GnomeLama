/**
 * UI message processing functionalities
 */

import Clutter from "gi://Clutter";
import St from "gi://St";
import GLib from "gi://GLib";
import Gio from "gi://Gio";
import { parseMessageContent } from "../lib/messageFormater.js";
import * as UIComponents from "./components.js";
import * as PanelElements from "./panelElements.js";
import { sendMessage } from "../services/messaging.js";
import { getSettings } from "../lib/settings.js";

// Track temporary messages
let temporaryMessages = new Set();
// Track if the last message had files attached
let lastMessageHadFiles = false;
// Registry to keep track of file paths between sessions
const FilePathRegistry = new Map(); // filename -> path

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
  // Check if the message has files
  lastMessageHadFiles =
    displayMessage && displayMessage.includes("[files attached]");

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

  // Check if this is a JSON response to a file prompt
  if (lastMessageHadFiles && tryParseJsonResponse(container, responseText)) {
    // If the JSON was successfully parsed and displayed, we're done
    return;
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
 * Tries to parse and display a JSON response for file prompts
 * @param {St.BoxLayout} container - The container to update
 * @param {string} responseText - The response text
 * @returns {boolean} Whether the response was handled as JSON
 */
function tryParseJsonResponse(container, responseText) {
  let jsonData;

  // First try to parse the entire responseText as JSON
  try {
    jsonData = JSON.parse(responseText);
  } catch (e) {
    // If direct parsing fails, check for JSON in a code block
    const codeBlockMatch = responseText.match(
      /```(?:json)?\s*\n([\s\S]*?)\n```/
    );
    if (codeBlockMatch) {
      try {
        jsonData = JSON.parse(codeBlockMatch[1]);
      } catch (e) {
        // Not valid JSON in code block either
        return false;
      }
    } else {
      // No JSON found
      return false;
    }
  }

  // Verify this is a file modification response with the expected format
  if (!jsonData || !jsonData.summary || !jsonData.files) {
    return false;
  }

  // Add the summary at the top
  const summaryLabel = new St.Label({
    text: jsonData.summary,
    style_class: "text-label",
    x_expand: true,
    style: "font-weight: bold; margin-bottom: 12px;",
  });
  summaryLabel.clutter_text.set_line_wrap(true);
  summaryLabel.clutter_text.set_selectable(true);
  container.add_child(summaryLabel);

  // Add each file in a box
  jsonData.files.forEach((file) => {
    // Create a box for this file
    const fileBox = new St.BoxLayout({
      vertical: true,
      style_class: "file-response-box",
      style:
        "background-color: #333; border-radius: 8px; margin: 8px 0 12px 0; border: 1px solid #444;",
      x_expand: true,
    });

    // Create a header with the filename
    const headerBox = new St.BoxLayout({
      style_class: "file-response-header",
      style:
        "background-color: #444; padding: 8px 10px; border-radius: 8px 8px 0 0;",
      x_expand: true,
    });

    const filenameLabel = new St.Label({
      text: file.filename,
      style_class: "filename-label",
      style: "color: #fff; font-weight: bold; font-size: 14px;",
      x_expand: true,
    });

    filenameLabel.clutter_text.set_selectable(true);
    headerBox.add_child(filenameLabel);

    // Add copy button
    const copyButton = new St.Button({
      style_class: "copy-button",
      style:
        "background-color: #555; color: white; border-radius: 4px; padding: 4px 8px; margin-left: 10px; font-size: 12px;",
      label: "Copy",
      x_expand: false,
    });

    // Connect copy button click handler with temporary label change
    let copyTimeoutId = null;
    copyButton.connect("clicked", () => {
      // Copy file content to clipboard
      const clipboard = St.Clipboard.get_default();
      clipboard.set_text(St.ClipboardType.CLIPBOARD, file.content);

      // Change label temporarily
      copyButton.set_label("Copied!");

      // Reset label after delay
      if (copyTimeoutId) {
        GLib.Source.remove(copyTimeoutId);
      }

      copyTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
        if (!copyButton.destroyed) {
          copyButton.set_label("Copy");
        }
        copyTimeoutId = null;
        return GLib.SOURCE_REMOVE;
      });

      copyButton.connect("destroy", () => {
        if (copyTimeoutId) {
          GLib.Source.remove(copyTimeoutId);
          copyTimeoutId = null;
        }
      });
    });

    headerBox.add_child(copyButton);

    // Add "Apply to [filename]" button
    const applyButton = new St.Button({
      style_class: "apply-button",
      style:
        "background-color: #2e8b57; color: white; border-radius: 4px; padding: 4px 8px; margin-left: 10px; font-size: 12px;",
      label: `Apply to ${file.filename}`,
      x_expand: false,
    });

    // Variable to track apply button timeout
    let applyTimeoutId = null;

    // Connect button click handler
    applyButton.connect("clicked", () => {
      // Change label temporarily while applying
      applyButton.set_label(`Applying to ${file.filename}...`);

      // Use direct file writing
      const Gio = imports.gi.Gio;
      const GLib = imports.gi.GLib;

      try {
        // Validate content
        if (!file.content) {
          addTemporaryMessage(
            container.get_parent(),
            `Error: No content to save for ${file.filename}`
          );

          // Reset the button label
          if (applyTimeoutId) {
            GLib.Source.remove(applyTimeoutId);
          }

          applyTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
            if (!applyButton.destroyed) {
              applyButton.set_label(`Apply to ${file.filename}`);
            }
            applyTimeoutId = null;
            return GLib.SOURCE_REMOVE;
          });

          return;
        }

        // Use the original path if available, otherwise fall back to home directory
        let fullPath;
        if (file.path && file.path.trim() !== "") {
          fullPath = file.path;
        } else {
          // Check the registry for the original path
          const registeredPath = FilePathRegistry.get(file.filename);

          if (registeredPath) {
            fullPath = registeredPath;
            console.log(
              `Found registered path for ${file.filename}: ${fullPath}`
            );
          } else {
            // Fallback to home directory if no path is found
            const homeDir = GLib.get_home_dir();
            fullPath = GLib.build_filenamev([homeDir, file.filename]);
            addTemporaryMessage(
              container.get_parent(),
              `Warning: No original path found for ${file.filename}. Using ${fullPath} instead.`
            );
          }
        }

        // Check if the file exists first
        const fileObj = Gio.File.new_for_path(fullPath);

        if (!fileObj.query_exists(null)) {
          addTemporaryMessage(
            container.get_parent(),
            `Warning: File ${fullPath} doesn't exist. Creating a new file.`
          );
        }

        try {
          // Convert string to byte array (the GJS way)
          const ByteArray = imports.byteArray;
          const contentBytes = ByteArray.fromString(file.content);

          // Write content to file at the original path
          if (GLib.file_set_contents(fullPath, contentBytes)) {
            // Show success message
            addTemporaryMessage(
              container.get_parent(),
              `Successfully applied changes to ${fullPath}`
            );
          } else {
            addTemporaryMessage(
              container.get_parent(),
              `Error: Failed to write to ${fullPath}. Check file permissions.`
            );
          }
        } catch (writeError) {
          console.error(`Error writing to file: ${writeError}`);
          addTemporaryMessage(
            container.get_parent(),
            `Error writing to file: ${writeError.message}`
          );
        }

        // Reset the button label after a delay
        if (applyTimeoutId) {
          GLib.Source.remove(applyTimeoutId);
        }

        applyTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
          if (!applyButton.destroyed) {
            applyButton.set_label(`Apply to ${file.filename}`);
          }
          applyTimeoutId = null;
          return GLib.SOURCE_REMOVE;
        });
      } catch (error) {
        console.error(`Error applying file content: ${error}`);
        addTemporaryMessage(container.get_parent(), `Error: ${error.message}`);

        // Reset the button label after error
        if (applyTimeoutId) {
          GLib.Source.remove(applyTimeoutId);
        }

        applyTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
          if (!applyButton.destroyed) {
            applyButton.set_label(`Apply to ${file.filename}`);
          }
          applyTimeoutId = null;
          return GLib.SOURCE_REMOVE;
        });
      }
    });

    // Clean up timeout when button is destroyed
    applyButton.connect("destroy", () => {
      if (applyTimeoutId) {
        GLib.Source.remove(applyTimeoutId);
        applyTimeoutId = null;
      }
    });

    headerBox.add_child(applyButton);
    fileBox.add_child(headerBox);

    // Create the file content area
    const contentBox = new St.BoxLayout({
      vertical: true,
      style: "padding: 10px;",
      x_expand: true,
    });

    const contentLabel = new St.Label({
      text: file.content,
      style: "font-family: monospace; white-space: pre-wrap;",
      x_expand: true,
    });

    contentLabel.clutter_text.set_line_wrap(true);
    contentLabel.clutter_text.set_selectable(true);
    contentBox.add_child(contentLabel);
    fileBox.add_child(contentBox);

    // Add file box to container
    container.add_child(fileBox);
  });

  return true;
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

/**
 * Sets the flag indicating if the last message had files attached
 * @param {boolean} hadFiles - Whether the last message had files
 */
export function setLastMessageHadFiles(hadFiles) {
  lastMessageHadFiles = hadFiles;
}

/**
 * Register file paths from a JSON structure before sending to AI
 * @param {string} jsonString - JSON string containing file information
 */
export function registerFilePaths(jsonString) {
  try {
    const jsonData = JSON.parse(jsonString);

    if (jsonData && jsonData.files && Array.isArray(jsonData.files)) {
      jsonData.files.forEach((file) => {
        if (file.filename && file.path) {
          FilePathRegistry.set(file.filename, file.path);
          console.log(`Registered path for ${file.filename}: ${file.path}`);
        }
      });
    }
  } catch (error) {
    console.error("Error registering file paths:", error);
  }
}

/**
 * Get the original path for a filename
 * @param {string} filename - The filename to look up
 * @returns {string|null} - The original path or null if not found
 */
export function getOriginalFilePath(filename) {
  return FilePathRegistry.get(filename) || null;
}
