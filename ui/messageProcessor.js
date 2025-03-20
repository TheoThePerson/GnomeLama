/**
 * UI message processing functionalities
 */

import Clutter from "gi://Clutter";
import St from "gi://St";
import GLib from "gi://GLib";
import Gio from "gi://Gio";
import { parseMessageContent } from "../lib/messageFormatter.js";
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

  // Check if this is a JSON response
  // First try parsing as JSON response for file handling
  if (tryParseJsonResponse(container, responseText, lastMessageHadFiles)) {
    // If the JSON was successfully parsed and displayed, we're done
    return;
  }

  // Otherwise, parse and add content normally
  const parts = parseMessageContent(responseText);

  // Create a container for inline elements to prevent line breaks between formatted texts
  const contentContainer = new St.BoxLayout({
    vertical: true,
    x_expand: true,
  });

  // Use a flow container for each line to keep inline elements together
  let currentLineFlow = new St.BoxLayout({
    x_expand: true,
  });
  contentContainer.add_child(currentLineFlow);

  // Process each part
  parts.forEach((part) => {
    const contentElement = createContentElement(part);
    if (!contentElement) return;

    // Block-level elements get their own line
    if (
      part.type === "code" ||
      part.type === "blockquote" ||
      part.type === "heading" ||
      part.type === "orderedList" ||
      part.type === "unorderedList" ||
      part.type === "horizontalRule"
    ) {
      // If there's content in the current line, start a new line
      if (currentLineFlow.get_children().length > 0) {
        currentLineFlow = new St.BoxLayout({
          x_expand: true,
        });
        contentContainer.add_child(currentLineFlow);
      }

      // Add block element directly to container
      contentContainer.add_child(contentElement);

      // Start a new line for content after the block
      currentLineFlow = new St.BoxLayout({
        x_expand: true,
      });
      contentContainer.add_child(currentLineFlow);
    } else {
      // For inline elements (text, formatted, inlineCode, links), add to the current line
      currentLineFlow.add_child(contentElement);
    }
  });

  // Add the content container to the response container
  container.add_child(contentContainer);
}

/**
 * Tries to parse and display a JSON response for file prompts
 * @param {St.BoxLayout} container - The container to update
 * @param {string} responseText - The response text
 * @param {boolean} hadFiles - Whether the last message had files attached
 * @returns {boolean} Whether the response was handled as JSON
 */
function tryParseJsonResponse(container, responseText, hadFiles) {
  let jsonData;
  let confidenceLevel = 0; // Track how confident we are this is a file response

  // First try to parse the entire responseText as JSON
  try {
    jsonData = JSON.parse(responseText);
    confidenceLevel = 5; // Direct JSON parsing succeeded, high confidence
  } catch (e) {
    // If direct parsing fails, check for JSON in a code block
    const codeBlockMatch = responseText.match(
      /```(?:json)?\s*\n([\s\S]*?)\n```/
    );
    if (codeBlockMatch) {
      try {
        jsonData = JSON.parse(codeBlockMatch[1]);
        confidenceLevel = 5; // JSON in code block, high confidence
      } catch (e) {
        // Not valid JSON in code block either
        console.log("Failed to parse JSON in code block:", e);
      }
    }

    // If both methods fail, attempt to extract JSON from the text
    if (!jsonData) {
      // Try a more robust approach to find JSON objects
      jsonData = tryExtractJsonFromText(responseText);

      if (jsonData) {
        confidenceLevel = 3; // Extracted JSON from text, medium confidence
      } else {
        console.log("Failed to extract any valid JSON from the response");
        return false;
      }
    }
  }

  // VALIDATION: Check if what we found looks like a file modification response

  // If we have files array and had files in request, that's a strong signal
  if (jsonData.files && Array.isArray(jsonData.files) && hadFiles) {
    confidenceLevel += 2;
  }

  // If we detect filename and content properties, that's another signal
  if (
    jsonData.files &&
    Array.isArray(jsonData.files) &&
    jsonData.files.length > 0 &&
    jsonData.files[0].filename &&
    "content" in jsonData.files[0]
  ) {
    confidenceLevel += 2;
  }

  // If we have a summary and files, that's the expected format
  if (jsonData.summary && jsonData.files) {
    confidenceLevel += 1;
  }

  // If this is a single file object, convert to our expected format
  if (!jsonData.files && jsonData.filename && "content" in jsonData) {
    // Convert single file object to expected format
    jsonData = {
      summary: `File: ${jsonData.filename}`,
      files: [jsonData],
    };
    confidenceLevel += 2;
  }

  // If we don't have files or suitable structure, it's not a file response
  if (!jsonData.files || !Array.isArray(jsonData.files)) {
    return false;
  }

  // If we had files attached OR we're very confident this is a file response, proceed
  if (hadFiles || confidenceLevel >= 4) {
    // Create a default summary if missing
    if (!jsonData.summary) {
      jsonData.summary = "File modifications";
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
      // Skip if no filename
      if (!file.filename) {
        console.log("Skipping file entry with no filename");
        return;
      }

      // Make sure file has content (even if empty string)
      if (file.content === undefined || file.content === null) {
        file.content = "";
        console.log(`File ${file.filename} has no content, using empty string`);
      }

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

            applyTimeoutId = GLib.timeout_add(
              GLib.PRIORITY_DEFAULT,
              1000,
              () => {
                if (!applyButton.destroyed) {
                  applyButton.set_label(`Apply to ${file.filename}`);
                }
                applyTimeoutId = null;
                return GLib.SOURCE_REMOVE;
              }
            );

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
          addTemporaryMessage(
            container.get_parent(),
            `Error: ${error.message}`
          );

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

  // If we get here, it wasn't a file response or we're not confident enough to display it as one
  return false;
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

    case "inlineCode":
      return UIComponents.createInlineCodeElement(part.content);

    case "link":
      return UIComponents.createLinkElement(part.content, part.url, part.title);

    case "image":
      return UIComponents.createImageElement(part.alt, part.url, part.title);

    case "blockquote":
      return UIComponents.createBlockquoteElement(part.content);

    case "heading":
      return UIComponents.createHeadingElement(part.content, part.level);

    case "orderedList":
      return UIComponents.createListElement(part.items, "orderedList");

    case "unorderedList":
      return UIComponents.createListElement(part.items, "unorderedList");

    case "horizontalRule":
      return UIComponents.createHorizontalRuleElement();

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

/**
 * Tries to extract JSON objects from unformatted text
 * @param {string} text - The text to search for JSON
 * @returns {object|null} - The parsed JSON object or null if none found
 */
function tryExtractJsonFromText(text) {
  try {
    // First, try a more aggressive approach to find complete JSON objects
    // by looking for patterns that typically indicate JSON file responses

    // Try to find a section with "summary" and "files" properties
    const jsonPattern = /\{[\s\S]*?"summary"[\s\S]*?"files"[\s\S]*?\}/i;
    const jsonMatch = text.match(jsonPattern);

    if (jsonMatch) {
      try {
        const result = JSON.parse(jsonMatch[0]);
        console.log("Found JSON with summary and files pattern");
        return result;
      } catch (e) {
        console.log("Found pattern but failed to parse:", e);
        // Continue with other methods
      }
    }

    // Look for patterns with file objects (arrays with filename and content)
    const fileArrayPattern =
      /\[\s*\{\s*"filename"\s*:[\s\S]*?"content"\s*:[\s\S]*?\}\s*\]/i;
    const fileArrayMatch = text.match(fileArrayPattern);

    if (fileArrayMatch) {
      try {
        const filesArray = JSON.parse(fileArrayMatch[0]);
        console.log("Found file array pattern");
        return { files: filesArray };
      } catch (e) {
        // Continue with other methods
      }
    }

    // Try to find the largest valid JSON object in the text
    // First look for { ... } patterns with better balanced braces
    // This is a simplistic approach - for full balance checking we'd need a parser
    const objectMatches = findPotentialJsonObjects(text);

    if (objectMatches && objectMatches.length > 0) {
      // Sort matches by length (descending) to try the largest first
      objectMatches.sort((a, b) => b.length - a.length);

      // Try to parse each match
      for (const match of objectMatches) {
        try {
          const result = JSON.parse(match);
          console.log("Found valid JSON object in text");
          return result;
        } catch (e) {
          // Try to clean up and retry
          try {
            // Remove extra text and retry
            const cleanedMatch = cleanJsonString(match);
            const result = JSON.parse(cleanedMatch);
            console.log("Found valid JSON after cleanup");
            return result;
          } catch (innerE) {
            // Continue to next match
          }
        }
      }
    }

    // If no object matches worked, try to find complete arrays
    const arrayMatches = findPotentialJsonArrays(text);

    if (arrayMatches && arrayMatches.length > 0) {
      // Sort matches by length (descending)
      arrayMatches.sort((a, b) => b.length - a.length);

      // Try to parse each array match
      for (const match of arrayMatches) {
        try {
          const result = JSON.parse(match);

          // If we have an array of file objects, convert to expected format
          if (
            Array.isArray(result) &&
            result.length > 0 &&
            result[0].filename &&
            "content" in result[0]
          ) {
            console.log("Found valid JSON array of files");
            return { files: result };
          }
        } catch (e) {
          // Try cleaning
          try {
            const cleanedMatch = cleanJsonString(match);
            const result = JSON.parse(cleanedMatch);

            if (
              Array.isArray(result) &&
              result.length > 0 &&
              result[0].filename &&
              "content" in result[0]
            ) {
              console.log("Found valid JSON array of files after cleanup");
              return { files: result };
            }
          } catch (innerE) {
            // Continue to next match
          }
        }
      }
    }

    // Look for single file objects
    const fileObjectPattern =
      /\{\s*"filename"\s*:[\s\S]*?"content"\s*:[\s\S]*?\}/i;
    const fileObjectMatch = text.match(fileObjectPattern);

    if (fileObjectMatch) {
      try {
        const fileObj = JSON.parse(fileObjectMatch[0]);
        if (fileObj.filename && "content" in fileObj) {
          console.log("Found single file object");
          return fileObj;
        }
      } catch (e) {
        // Try with cleaning
        try {
          const cleanedMatch = cleanJsonString(fileObjectMatch[0]);
          const fileObj = JSON.parse(cleanedMatch);
          if (fileObj.filename && "content" in fileObj) {
            return fileObj;
          }
        } catch (innerE) {
          // Continue
        }
      }
    }

    return null;
  } catch (e) {
    console.error("Error in tryExtractJsonFromText:", e);
    return null;
  }
}

/**
 * Find potential JSON objects in text with better matching of balanced braces
 * @param {string} text - Text to search in
 * @returns {Array} - Array of potential JSON object strings
 */
function findPotentialJsonObjects(text) {
  const results = [];
  let start = 0;

  // Find all starting positions of "{"
  while ((start = text.indexOf("{", start)) !== -1) {
    let openBraces = 0;
    let inString = false;
    let escapeNext = false;
    let end;

    for (end = start; end < text.length; end++) {
      const char = text[end];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === "\\") {
        escapeNext = true;
        continue;
      }

      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === "{") {
          openBraces++;
        } else if (char === "}") {
          openBraces--;
          if (openBraces === 0) {
            // We found a balanced object
            results.push(text.substring(start, end + 1));
            break;
          }
        }
      }
    }

    // Move to next position
    start++;
  }

  return results;
}

/**
 * Find potential JSON arrays in text
 * @param {string} text - Text to search in
 * @returns {Array} - Array of potential JSON array strings
 */
function findPotentialJsonArrays(text) {
  const results = [];
  let start = 0;

  // Find all starting positions of "["
  while ((start = text.indexOf("[", start)) !== -1) {
    let openBrackets = 0;
    let inString = false;
    let escapeNext = false;
    let end;

    for (end = start; end < text.length; end++) {
      const char = text[end];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === "\\") {
        escapeNext = true;
        continue;
      }

      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === "[") {
          openBrackets++;
        } else if (char === "]") {
          openBrackets--;
          if (openBrackets === 0) {
            // We found a balanced array
            results.push(text.substring(start, end + 1));
            break;
          }
        }
      }
    }

    // Move to next position
    start++;
  }

  return results;
}

/**
 * Clean a JSON string for better parsing
 * @param {string} jsonString - The JSON string to clean
 * @returns {string} - Cleaned JSON string
 */
function cleanJsonString(jsonString) {
  return jsonString
    .replace(/\n+/g, " ")
    .replace(/\\n/g, "\\\\n")
    .replace(/\\"/g, '\\\\"')
    .replace(/`/g, "")
    .replace(/\\+/g, "\\")
    .replace(/([^\\])\\([^"\\nrbftu/])/g, "$1$2") // Remove invalid escapes
    .replace(/\s+/g, " ")
    .trim();
}
