/* global imports */
import Clutter from "gi://Clutter";
import GLib from "gi://GLib";
import St from "gi://St";
import { parseMessageContent } from "../lib/messageFormatter.js";
import { getSettings } from "../lib/settings.js";
import { sendMessage } from "../services/messaging.js";
import * as UIComponents from "./uiComponents.js";
import * as PanelElements from "./panelWidgets.js";

let temporaryMessages = new Set();
let lastMessageHadFiles = false;
const FilePathRegistry = new Map();

/**
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
  lastMessageHadFiles =
    displayMessage && displayMessage.includes("[files attached]");

  if (!userMessage || !userMessage.trim()) {
    return;
  }

  removeTemporaryMessages(outputContainer);

  if (!skipAppendUserMessage) {
    appendUserMessage(outputContainer, displayMessage || userMessage);
  }

  const bgColor = getSettings().get_string("ai-message-color");

  let responseContainer = null;
  let fullResponse = "";
  let errorOccurred = false;

  try {
    await sendMessage(
      userMessage,
      context,
      (chunk) => {
        if (!chunk) return;

        if (chunk.includes("Error communicating with")) {
          errorOccurred = true;

          if (!responseContainer) {
            if (onResponseStart) onResponseStart();
            responseContainer = PanelElements.createResponseContainer(bgColor);
            outputContainer.add_child(responseContainer);
          }

          updateResponseContainer(responseContainer, chunk);
          PanelElements.scrollToBottom(scrollView);
          return;
        }

        fullResponse += chunk;

        if (!responseContainer) {
          if (onResponseStart) onResponseStart();
          responseContainer = PanelElements.createResponseContainer(bgColor);
          outputContainer.add_child(responseContainer);
        }

        updateResponseContainer(responseContainer, fullResponse);
        PanelElements.scrollToBottom(scrollView);
      },
      displayMessage
    );

    if (!errorOccurred && onResponseEnd) onResponseEnd();
  } catch (error) {
    console.error("Error processing AI response:", error);
    errorOccurred = true;

    if (!responseContainer) {
      if (onResponseStart) onResponseStart();
      responseContainer = PanelElements.createResponseContainer(bgColor);
      outputContainer.add_child(responseContainer);
    }

    const errorMessage =
      error.message || "An error occurred while processing your request.";
    updateResponseContainer(responseContainer, errorMessage);
    PanelElements.scrollToBottom(scrollView);
  } finally {
    if (errorOccurred && onResponseEnd) onResponseEnd();
  }
}

/**
 * @param {St.BoxLayout} outputContainer - The output container
 * @param {string} message - The message to append
 */
export function appendUserMessage(outputContainer, message) {
  const userContainer = UIComponents.createMessageContainer(
    message,
    true,
    Clutter.ActorAlign.END
  );
  outputContainer.add_child(userContainer);
}

/**
 * @param {St.BoxLayout} container - The container to update
 * @param {string} responseText - The response text
 */
export function updateResponseContainer(container, responseText) {
  container.get_children().forEach((child) => child.destroy());

  if (tryParseJsonResponse(container, responseText, lastMessageHadFiles)) {
    return;
  }

  const parts = parseMessageContent(responseText);

  const contentContainer = new St.BoxLayout({
    vertical: true,
    x_expand: true,
  });

  const paragraphs = [];
  let currentParagraph = [];

  parts.forEach((part) => {
    const isBlockElement =
      part.type === "code" ||
      part.type === "blockquote" ||
      part.type === "heading" ||
      part.type === "orderedList" ||
      part.type === "unorderedList" ||
      part.type === "horizontalRule";

    const hasMultipleParas =
      part.type === "text" && part.content.includes("\n\n");

    if (isBlockElement) {
      if (currentParagraph.length > 0) {
        paragraphs.push({ type: "inline", parts: currentParagraph });
        currentParagraph = [];
      }
      paragraphs.push({ type: "block", part: part });
    } else if (hasMultipleParas) {
      if (currentParagraph.length > 0) {
        paragraphs.push({ type: "inline", parts: currentParagraph });
        currentParagraph = [];
      }

      const paraTexts = part.content.split("\n\n");
      paraTexts.forEach((paraText) => {
        if (paraText.trim() !== "") {
          paragraphs.push({
            type: "text",
            content: paraText,
          });
        }
      });
    } else {
      currentParagraph.push(part);
    }
  });

  if (currentParagraph.length > 0) {
    paragraphs.push({ type: "inline", parts: currentParagraph });
  }

  paragraphs.forEach((paragraph) => {
    if (paragraph.type === "block") {
      const element = createContentElement(paragraph.part);
      if (element) {
        contentContainer.add_child(element);
      }
    } else if (paragraph.type === "text") {
      const textLabel = UIComponents.createTextLabel(paragraph.content);
      contentContainer.add_child(textLabel);
    } else if (paragraph.type === "inline") {
      const textBox = new St.BoxLayout({
        style_class: "text-paragraph",
        x_expand: true,
        vertical: true,
      });

      const flowContainer = new St.BoxLayout({
        style_class: "text-flow-container",
        x_expand: true,
        vertical: false,
        style: "flex-wrap: wrap; width: 100%;",
      });

      textBox.add_child(flowContainer);

      paragraph.parts.forEach((part) => {
        if (part.type === "text") {
          const textLabel = UIComponents.createTextLabel(part.content);
          flowContainer.add_child(textLabel);
        }
      });

      contentContainer.add_child(textBox);
    }
  });

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
  let confidenceLevel = 0;

  try {
    jsonData = JSON.parse(responseText);
    confidenceLevel = 5;
  } catch {
    const codeBlockMatch = responseText.match(
      /```(?:json)?\s*\n([\s\S]*?)\n```/
    );
    if (codeBlockMatch) {
      try {
        jsonData = JSON.parse(codeBlockMatch[1]);
        confidenceLevel = 5;
      } catch {
        console.log("Failed to parse JSON in code block");
      }
    }

    if (!jsonData) {
      jsonData = tryExtractJsonFromText(responseText);

      if (jsonData) {
        confidenceLevel = 3;
      } else {
        console.log("Failed to extract any valid JSON from the response");
        return false;
      }
    }
  }

  if (jsonData.files && Array.isArray(jsonData.files) && hadFiles) {
    confidenceLevel += 2;
  }

  if (
    jsonData.files &&
    Array.isArray(jsonData.files) &&
    jsonData.files.length > 0 &&
    jsonData.files[0].filename &&
    "content" in jsonData.files[0]
  ) {
    confidenceLevel += 2;
  }

  if (jsonData.summary && jsonData.files) {
    confidenceLevel += 1;
  }

  if (!jsonData.files && jsonData.filename && "content" in jsonData) {
    jsonData = {
      summary: `File: ${jsonData.filename}`,
      files: [jsonData],
    };
    confidenceLevel += 2;
  }

  if (!jsonData.files || !Array.isArray(jsonData.files)) {
    return false;
  }

  if (hadFiles || confidenceLevel >= 4) {
    if (!jsonData.summary) {
      jsonData.summary = "File modifications";
    }

    const summaryLabel = new St.Label({
      text: jsonData.summary,
      style_class: "text-label",
      x_expand: true,
      style: "font-weight: bold; margin-bottom: 12px;",
    });
    summaryLabel.clutter_text.set_line_wrap(true);
    summaryLabel.clutter_text.set_selectable(true);
    container.add_child(summaryLabel);

    jsonData.files.forEach((file) => {
      if (!file.filename) {
        console.log("Skipping file entry with no filename");
        return;
      }

      if (file.content === undefined || file.content === null) {
        file.content = "";
        console.log(`File ${file.filename} has no content, using empty string`);
      }

      const fileBox = new St.BoxLayout({
        vertical: true,
        style_class: "file-response-box",
        style:
          "background-color: #333; border-radius: 8px; margin: 8px 0 12px 0; border: 1px solid #444;",
        x_expand: true,
      });

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

      const copyButton = new St.Button({
        style_class: "copy-button",
        style:
          "background-color: #555; color: white; border-radius: 4px; padding: 4px 8px; margin-left: 10px; font-size: 12px;",
        label: "Copy",
        x_expand: false,
      });

      let copyTimeoutId = null;
      copyButton.connect("clicked", () => {
        const clipboard = St.Clipboard.get_default();
        clipboard.set_text(St.ClipboardType.CLIPBOARD, file.content);

        copyButton.set_label("Copied!");

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

      const applyButton = new St.Button({
        style_class: "apply-button",
        style:
          "background-color: #2e8b57; color: white; border-radius: 4px; padding: 4px 8px; margin-left: 10px; font-size: 12px;",
        label: `Apply to ${file.filename}`,
        x_expand: false,
      });

      let applyTimeoutId = null;

      applyButton.connect("clicked", () => {
        applyButton.set_label(`Applying to ${file.filename}...`);

        const Gio = imports.gi.Gio;
        const GLib = imports.gi.GLib;

        try {
          if (!file.content) {
            addTemporaryMessage(
              container.get_parent(),
              `Error: No content to save for ${file.filename}`
            );

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

          let fullPath;
          if (file.path && file.path.trim() !== "") {
            fullPath = file.path;
          } else {
            const registeredPath = FilePathRegistry.get(file.filename);

            if (registeredPath) {
              fullPath = registeredPath;
              console.log(
                `Found registered path for ${file.filename}: ${fullPath}`
              );
            } else {
              const homeDir = GLib.get_home_dir();
              fullPath = GLib.build_filenamev([homeDir, file.filename]);
              addTemporaryMessage(
                container.get_parent(),
                `Warning: No original path found for ${file.filename}. Using ${fullPath} instead.`
              );
            }
          }

          const fileObj = Gio.File.new_for_path(fullPath);

          if (!fileObj.query_exists(null)) {
            addTemporaryMessage(
              container.get_parent(),
              `Warning: File ${fullPath} doesn't exist. Creating a new file.`
            );
          }

          try {
            const ByteArray = imports.byteArray;
            const contentBytes = ByteArray.fromString(file.content);

            if (GLib.file_set_contents(fullPath, contentBytes)) {
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
          } catch {
            console.error("Error writing to file");
            addTemporaryMessage(
              container.get_parent(),
              `Error writing to file`
            );
          }

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
        } catch {
          console.error("Error applying file content");
          addTemporaryMessage(
            container.get_parent(),
            `Error: Error applying file content`
          );

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

      applyButton.connect("destroy", () => {
        if (applyTimeoutId) {
          GLib.Source.remove(applyTimeoutId);
          applyTimeoutId = null;
        }
      });

      headerBox.add_child(applyButton);
      fileBox.add_child(headerBox);

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

      container.add_child(fileBox);
    });

    return true;
  }

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
    case "code": {
      const codeElement = UIComponents.createCodeContainer(
        part.content,
        part.language
      );
      codeElement.add_style_class_name("code-block-part");
      return codeElement;
    }

    case "text":
      return UIComponents.createTextLabel(part.content);

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
  removeTemporaryMessages(outputContainer);

  const tempLabel = UIComponents.createTemporaryMessageLabel(text);
  outputContainer.add_child(tempLabel);
  temporaryMessages.add(tempLabel);
}

/**
 * Remove all temporary messages from the output container
 * @param {St.BoxLayout} outputContainer - The container to clear temporary messages from
 */
export function removeTemporaryMessages(outputContainer) {
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
  const tempMessagesToKeep = new Set();
  temporaryMessages.forEach((msg) => {
    if (msg.get_parent() === outputContainer) {
      tempMessagesToKeep.add(msg);
    }
  });

  const children = outputContainer.get_children();
  for (let i = children.length - 1; i >= 0; i--) {
    const child = children[i];
    if (tempMessagesToKeep.has(child)) {
      continue;
    }

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
  } catch {
    console.error("Error registering file paths");
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
 * Safely parse JSON without throwing exceptions
 * @param {string} jsonString - String to parse
 * @returns {object|null} - Parsed object or null if invalid
 */
function safeJsonParse(jsonString) {
  try {
    return JSON.parse(jsonString);
  } catch {
    return null;
  }
}

/**
 * Validate if an object has the expected file structure
 * @param {object} obj - Object to validate
 * @returns {boolean} - Whether it's a valid file object
 */
function isValidFileObject(obj) {
  return obj && typeof obj === "object" && obj.filename && "content" in obj;
}

/**
 * Validate if an object has the expected files array structure
 * @param {object} obj - Object to validate
 * @returns {boolean} - Whether it's a valid files array container
 */
function isValidFilesContainer(obj) {
  return (
    obj &&
    typeof obj === "object" &&
    Array.isArray(obj.files) &&
    obj.files.length > 0 &&
    isValidFileObject(obj.files[0])
  );
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
    .replace(/([^\\])\\([^"\\nrbftu/])/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Tries to extract JSON objects from unformatted text
 * @param {string} text - The text to search for JSON
 * @returns {object|null} - The parsed JSON object or null if none found
 */
function tryExtractJsonFromText(text) {
  try {
    // First attempt: direct parse of the entire text
    const directResult = safeJsonParse(text);
    if (
      directResult &&
      (isValidFilesContainer(directResult) || isValidFileObject(directResult))
    ) {
      console.log("Successfully parsed complete JSON");
      return directResult;
    }

    // Second attempt: Look for JSON with summary and files pattern
    const jsonPattern = /\{[\s\S]*?"summary"[\s\S]*?"files"[\s\S]*?\}/i;
    const jsonMatch = text.match(jsonPattern);
    if (jsonMatch) {
      const result = safeJsonParse(jsonMatch[0]);
      if (result && isValidFilesContainer(result)) {
        console.log("Found JSON with summary and files pattern");
        return result;
      }

      // Try with cleaned version
      const cleanedResult = safeJsonParse(cleanJsonString(jsonMatch[0]));
      if (cleanedResult && isValidFilesContainer(cleanedResult)) {
        console.log("Found JSON with summary and files pattern after cleanup");
        return cleanedResult;
      }
    }

    // Third attempt: Look for file array
    const fileArrayPattern =
      /\[\s*\{\s*"filename"\s*:[\s\S]*?"content"\s*:[\s\S]*?\}\s*\]/i;
    const fileArrayMatch = text.match(fileArrayPattern);
    if (fileArrayMatch) {
      const filesArray = safeJsonParse(fileArrayMatch[0]);
      if (
        filesArray &&
        Array.isArray(filesArray) &&
        filesArray.length > 0 &&
        isValidFileObject(filesArray[0])
      ) {
        console.log("Found file array pattern");
        return { files: filesArray };
      }

      // Try with cleaned version
      const cleanedArray = safeJsonParse(cleanJsonString(fileArrayMatch[0]));
      if (
        cleanedArray &&
        Array.isArray(cleanedArray) &&
        cleanedArray.length > 0 &&
        isValidFileObject(cleanedArray[0])
      ) {
        console.log("Found file array pattern after cleanup");
        return { files: cleanedArray };
      }
    }

    // Fourth attempt: Find potential JSON objects with better depth
    const objectMatches = findPotentialJsonObjects(text);
    if (objectMatches && objectMatches.length > 0) {
      // Sort by length (descending) to prioritize larger objects
      objectMatches.sort((a, b) => b.length - a.length);

      for (const match of objectMatches) {
        const result = safeJsonParse(match);
        if (
          result &&
          (isValidFilesContainer(result) || isValidFileObject(result))
        ) {
          console.log("Found valid JSON object in text");
          return result;
        }

        const cleanedResult = safeJsonParse(cleanJsonString(match));
        if (
          cleanedResult &&
          (isValidFilesContainer(cleanedResult) ||
            isValidFileObject(cleanedResult))
        ) {
          console.log("Found valid JSON after cleanup");
          return cleanedResult;
        }
      }
    }

    // Fifth attempt: Find potential JSON arrays
    const arrayMatches = findPotentialJsonArrays(text);
    if (arrayMatches && arrayMatches.length > 0) {
      arrayMatches.sort((a, b) => b.length - a.length);

      for (const match of arrayMatches) {
        const result = safeJsonParse(match);
        if (
          result &&
          Array.isArray(result) &&
          result.length > 0 &&
          isValidFileObject(result[0])
        ) {
          console.log("Found valid JSON array of files");
          return { files: result };
        }

        const cleanedResult = safeJsonParse(cleanJsonString(match));
        if (
          cleanedResult &&
          Array.isArray(cleanedResult) &&
          cleanedResult.length > 0 &&
          isValidFileObject(cleanedResult[0])
        ) {
          console.log("Found valid JSON array of files after cleanup");
          return { files: cleanedResult };
        }
      }
    }

    // Sixth attempt: Look for a single file object
    const fileObjectPattern =
      /\{\s*"filename"\s*:[\s\S]*?"content"\s*:[\s\S]*?\}/i;
    const fileObjectMatch = text.match(fileObjectPattern);
    if (fileObjectMatch) {
      const fileObj = safeJsonParse(fileObjectMatch[0]);
      if (fileObj && isValidFileObject(fileObj)) {
        console.log("Found single file object");
        return fileObj;
      }

      const cleanedObj = safeJsonParse(cleanJsonString(fileObjectMatch[0]));
      if (cleanedObj && isValidFileObject(cleanedObj)) {
        console.log("Found single file object after cleanup");
        return cleanedObj;
      }
    }

    return null;
  } catch (error) {
    console.error("Error in tryExtractJsonFromText:", error);
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
            results.push(text.substring(start, end + 1));
            break;
          }
        }
      }
    }

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
            results.push(text.substring(start, end + 1));
            break;
          }
        }
      }
    }

    start++;
  }

  return results;
}
