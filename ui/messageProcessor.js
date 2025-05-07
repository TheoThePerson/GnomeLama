// ESLint handles imports as globals in the config, no need for directive
import Clutter from "gi://Clutter";
import GLib from "gi://GLib";
import St from "gi://St";
import { parseMessageContent } from "../lib/messageFormatter.js";
import { getSettings } from "../lib/settings.js";
import { sendMessage } from "../services/messaging.js";
import * as UIComponents from "./uiComponents.js";
import * as PanelElements from "./panelWidgets.js";

const temporaryMessages = new Set();
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
  // Check if this message has files attached
  const hasFilesAttached = 
    displayMessage &&
    (displayMessage.includes("[files attached]") ||
      displayMessage.includes("｢files attached｣"));

  // Store this value for use in rendering responses
  lastMessageHadFiles = hasFilesAttached;

  // Don't process empty messages
  if (!userMessage || !userMessage.trim()) {
    return;
  }

  // Clean up any temporary messages
  removeTemporaryMessages(outputContainer);

  // Get UI color from settings
  const bgColor = getSettings().get_string("ai-message-color");

  // Prepare for response handling
  let responseContainer = null;
  let fullResponse = "";
  let errorOccurred = false;
  let userMessageAppended = skipAppendUserMessage;

  try {
    // If message contains raw JSON with files, we'll use the displayMessage for UI
    // but send the full JSON content to the API
    const messageToSend = userMessage;
    const messageToDisplay = displayMessage || userMessage;

    await sendMessage({
      message: messageToSend,
      context,
      onData: (chunk) => {
        if (!chunk) return;

        // Handle error messages as temporary messages, not in message bubbles
        if (chunk.includes("Error communicating with")) {
          errorOccurred = true;
          addTemporaryMessage(outputContainer, chunk);
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
      displayMessage: (text, type) => {
        // Custom display message handler that skips system messages
        if (type === "system") {
          // System messages are now kept in history but not displayed in UI
          return;
        } else if (type === "user" && !userMessageAppended) {
          // Display the clean version (displayMessage) for user messages with files
          const textToDisplay = (hasFilesAttached) ? messageToDisplay : text;
          
          // Then append user message if not already done
          appendUserMessage(outputContainer, textToDisplay);
          userMessageAppended = true;
          PanelElements.scrollToBottom(scrollView);
        }
        // For assistant messages, handled by onData
      },
    });

    if (!errorOccurred && onResponseEnd) onResponseEnd();
  } catch (error) {
    // Error handling without console.error
    errorOccurred = true;

    // Display errors as temporary messages instead of in a response container
    const errorMessage = error.message || "An error occurred while processing your request.";
    addTemporaryMessage(outputContainer, errorMessage);
    PanelElements.scrollToBottom(scrollView);

    if (onResponseEnd) onResponseEnd();
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
 * Append a system message to the conversation UI
 * @param {St.BoxLayout} outputContainer - The output container 
 * @param {string} message - The system message to display
 */
export function appendSystemMessage(outputContainer, message) {
  // Create a special system message container with distinct styling
  const systemContainer = new St.BoxLayout({
    style_class: "system-message",
    x_expand: true,
    y_expand: false,
    x_align: Clutter.ActorAlign.CENTER,
    vertical: true,
    style: "background-color: rgba(128, 128, 128, 0.1); border-radius: 8px; padding: 8px; margin: 4px 24px; max-width: 90%;"
  });
  
  // Create the message label
  const messageLabel = new St.Label({
    text: message,
    style_class: "system-message-text",
    x_expand: true,
    style: "font-style: italic; color: #888888; font-size: 13px;"
  });
  
  messageLabel.clutter_text.set_line_wrap(true);
  messageLabel.clutter_text.set_selectable(true);
  systemContainer.add_child(messageLabel);
  
  outputContainer.add_child(systemContainer);
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
    style: "min-height: auto;"
  });

  // Group parts into paragraphs
  const paragraphs = [];
  let currentParagraph = [];

  for (const part of parts) {
    const isBlockElement = ["code", "blockquote", "heading", "orderedList", "unorderedList", "horizontalRule"].includes(part.type);
    
    if (isBlockElement) {
      if (currentParagraph.length > 0) {
        paragraphs.push({ type: "inline", parts: currentParagraph });
        currentParagraph = [];
      }
      paragraphs.push({ type: "block", part });
    } else if (part.type === "text" && part.content.includes("\n\n")) {
      if (currentParagraph.length > 0) {
        paragraphs.push({ type: "inline", parts: currentParagraph });
        currentParagraph = [];
      }
      part.content.split("\n\n")
        .filter(text => text.trim())
        .forEach(text => paragraphs.push({ type: "text", content: text }));
    } else {
      currentParagraph.push(part);
    }
  }

  if (currentParagraph.length > 0) {
    paragraphs.push({ type: "inline", parts: currentParagraph });
  }

  // Render paragraphs
  for (const paragraph of paragraphs) {
    let element;
    if (paragraph.type === "block") {
      element = createContentElement(paragraph.part);
    } else if (paragraph.type === "text") {
      element = UIComponents.createTextLabel(paragraph.content);
    } else if (paragraph.type === "inline") {
      element = new St.BoxLayout({
        style_class: "text-paragraph",
        x_expand: true,
        vertical: true,
      });
      paragraph.parts.forEach(part => {
        const partElement = createContentElement(part);
        if (partElement) element.add_child(partElement);
      });
    }
    if (element) contentContainer.add_child(element);
  }

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
  // Don't try to parse if it doesn't look like a potential JSON response
  if (!responseText.includes('{') && !responseText.includes('[')) {
    return false;
  }

  // Check if it contains patterns that strongly indicate it's a file-related response
  const isLikelyFileResponse = 
    (responseText.includes('"files"') && responseText.includes('"filename"')) ||
    (responseText.includes('"content"') && hadFiles);

  let jsonData;
  let confidenceLevel = 0;

  // Try to parse the JSON
  jsonData = parseJsonFromResponse(responseText);
  if (!jsonData) {
    return false;
  }

  // Calculate how confident we are this is a proper file response
  confidenceLevel = calculateConfidenceLevel(jsonData, hadFiles);

  // Normalize the JSON structure (for consistent handling)
  jsonData = normalizeJsonStructure(jsonData);

  // Basic validation of JSON structure
  if (!jsonData.files || !Array.isArray(jsonData.files)) {
    return false;
  }

  // Check if any files actually have content
  const hasContentfulFiles = jsonData.files.some(file => 
    file.content && file.content.trim() !== ''
  );

  // Only render as JSON with high confidence or when we're sure (had files in prompt AND has content)
  if ((hasContentfulFiles && hadFiles) || 
      (isLikelyFileResponse && confidenceLevel >= 4) ||
      (jsonData.summary && hadFiles)) {
    renderJsonResponse(container, jsonData);
    return true;
  }

  // When in doubt, render as regular text
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
 * Clear all messages from the output container including temporary ones
 * @param {St.BoxLayout} outputContainer - The container to clear
 */
export function clearOutput(outputContainer) {
  const children = outputContainer.get_children();
  for (let i = children.length - 1; i >= 0; i--) {
    const child = children[i];
    if (
      child.style_class &&
      (child.style_class.includes("message-box") ||
        child.style_class.includes("user-message") ||
        child.style_class.includes("ai-message") ||
        child.style_class.includes("assistant-message") ||
        child.style_class.includes("system-message"))
    ) {
      child.destroy();
    }
  }

  // Clear any references to temporary messages
  temporaryMessages.clear();
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
        }
      });
    }
  } catch {
    // Error registering file paths, silently fail in production
  }
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
 * Tries to extract JSON objects from unformatted text
 * @param {string} text - The text to search for JSON
 * @returns {object|null} - The parsed JSON object or null if none found
 */
function tryExtractJsonFromText(text) {
  try {
    // Direct parsing approach
    const directResult = safeJsonParse(text);
    if (
      directResult &&
      (isValidFilesContainer(directResult) || isValidFileObject(directResult))
    ) {
      return directResult;
    }

    // Try parsing with cleaned text if direct parsing fails
    const cleanedResult = safeJsonParse(cleanJsonString(text));
    if (
      cleanedResult &&
      (isValidFilesContainer(cleanedResult) || isValidFileObject(cleanedResult))
    ) {
      return cleanedResult;
    }

    return null;
  } catch {
    // Error in JSON extraction, silently fail in production
    return null;
  }
}

/**
 * Clean a JSON string for better parsing
 * @param {string} jsonString - The JSON string to clean
 * @returns {string} - Cleaned JSON string
 */
function cleanJsonString(jsonString) {
  return jsonString
    .replace(/\n+/gu, " ")
    .replace(/\\n/gu, "\\\\n")
    .replace(/\\"/gu, '\\\\"')
    .replace(/`/gu, "")
    .replace(/\\+/gu, "\\")
    .replace(/([^\\])\\([^"\\nrbftu/])/gu, "$1$2")
    .replace(/\s+/gu, " ")
    .trim();
}

// Refactoring tryParseJsonResponse by extracting helper methods
function parseJsonFromResponse(responseText) {
  try {
    // Try direct parsing first
    return JSON.parse(responseText);
  } catch {
    // Try multiple approaches to find JSON in code blocks
    
    // 1. Standard code block with json tag
    let codeBlockMatch = responseText.match(/```(?:json)[\s\n]*([\s\S]*?)[\s\n]*```/);
    if (codeBlockMatch && codeBlockMatch[1]) {
      try {
        const jsonContent = codeBlockMatch[1].trim();
        return JSON.parse(jsonContent);
      } catch {}
    }
    
    // 2. Code block without language tag
    codeBlockMatch = responseText.match(/```[\s\n]*([\s\S]*?)[\s\n]*```/);
    if (codeBlockMatch && codeBlockMatch[1]) {
      try {
        const jsonContent = codeBlockMatch[1].trim();
        return JSON.parse(jsonContent);
      } catch {}
    }
    
    // 3. Try to find JSON-like structures with curly braces - more aggressive approach
    if (responseText.includes('{') && responseText.includes('}')) {
      const possibleJson = responseText.substring(
        responseText.indexOf('{'),
        responseText.lastIndexOf('}') + 1
      );
      
      try {
        return JSON.parse(possibleJson);
      } catch {}
    }

    // 4. Try extracting JSON from text with our helper
    const extractedJson = tryExtractJsonFromText(responseText);
    if (extractedJson) {
      return extractedJson;
    }

    // Failed to extract JSON with all approaches
    return null;
  }
}

// Helper function to calculate confidence level
function calculateConfidenceLevel(jsonData, hadFiles) {
  let confidence = 5; // Base confidence from successful parse

  if (jsonData.files && Array.isArray(jsonData.files) && hadFiles) {
    confidence += 2;
  }

  if (
    jsonData.files &&
    Array.isArray(jsonData.files) &&
    jsonData.files.length > 0 &&
    jsonData.files[0].filename &&
    "content" in jsonData.files[0]
  ) {
    confidence += 2;
  }

  if (jsonData.summary && jsonData.files) {
    confidence += 1;
  }

  return confidence;
}

// Helper function to normalize JSON structure
function normalizeJsonStructure(jsonData) {
  // Handle single file format
  if (!jsonData.files && jsonData.filename && "content" in jsonData) {
    return {
      summary: `File: ${jsonData.filename}`,
      files: [jsonData],
    };
  }

  // Only add a summary if files have been modified
  if (jsonData.files && !jsonData.summary) {
    // Check if any files have been modified
    const filesModified = jsonData.files.some(file => 
      file.content && file.content.trim() !== ''
    );
    
    if (filesModified) {
      jsonData.summary = "File modifications";
    }
  }

  return jsonData;
}

// Helper function to render the JSON response
function renderJsonResponse(container, jsonData) {
  // Create main content container
  const contentBox = new St.BoxLayout({
    vertical: true,
    x_expand: true,
    style_class: "json-response-content"
  });
  
  // Add a simple text summary if one exists
  if (jsonData.summary) {
    const summaryLabel = new St.Label({
      text: jsonData.summary,
      style_class: "text-label",
      x_expand: true,
      y_expand: false,
      y_align: Clutter.ActorAlign.START,
      style: "margin-bottom: 12px; max-width: 100%;"
    });
    
    // Improve text wrapping behavior
    summaryLabel.clutter_text.set_line_wrap(true);
    summaryLabel.clutter_text.set_line_wrap_mode(imports.gi.Pango.WrapMode.WORD_CHAR);
    summaryLabel.clutter_text.set_ellipsize(imports.gi.Pango.EllipsizeMode.NONE);
    summaryLabel.clutter_text.set_selectable(true);
    
    contentBox.add_child(summaryLabel);
  }

  // Render each file
  if (jsonData.files && jsonData.files.length > 0) {
    jsonData.files.forEach((file) => {
      if (file && file.filename) {
        renderFileItem(contentBox, file);
      }
    });
  }
  
  // Add the content box to the container
  container.add_child(contentBox);
}

// Add the renderFileItem function that's missing
function renderFileItem(container, file) {
  if (!file.filename) {
    // Skip file entries with no filename - silently fail in production
    return;
  }

  if (file.content === null) {
    file.content = "";
    // File has no content, using empty string - silently continue in production
  }

  // Create a code-like container using the same style classes as code blocks
  const fileBox = new St.BoxLayout({
    vertical: true,
    style_class: "code-container",
    x_expand: true,
  });

  // Create header with same style as code blocks
  const headerBox = new St.BoxLayout({
    style_class: "code-header",
    x_expand: true,
  });

  // Create file name label similar to language label in code blocks
  const filenameLabel = new St.Label({
    text: file.filename,
    style_class: "code-language",
    x_expand: true,
  });

  filenameLabel.clutter_text.set_selectable(true);
  headerBox.add_child(filenameLabel);

  // Copy button with same style as code blocks
  const copyButton = new St.Button({
    style_class: "code-button",
    label: "Copy",
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

  // Check if this is a document type that can't be converted back to original format
  const isNonConvertibleDocument =
    file.filename &&
    (file.filename.toLowerCase().endsWith(".pdf") ||
      file.filename.toLowerCase().endsWith(".doc") ||
      file.filename.toLowerCase().endsWith(".docx") ||
      file.filename.toLowerCase().endsWith(".rtf") ||
      file.filename.toLowerCase().endsWith(".odt"));

  // Add Save As button for all file types
  const saveAsButton = new St.Button({
    style_class: "code-button save-as-button",
    label: `Save As txt`,
  });

  let saveAsTimeoutId = null;

  saveAsButton.connect("clicked", () => {
    saveAsButton.set_label(`Saving...`);

    const { Gio } = imports.gi;

    try {
      if (!file.content) {
        addTemporaryMessage(
          container.get_parent(),
          `Error: No content to save for ${file.filename}`
        );

        if (saveAsTimeoutId) {
          GLib.Source.remove(saveAsTimeoutId);
        }
        
        saveAsTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
          if (!saveAsButton.destroyed) {
            saveAsButton.set_label(`Save As TXT`);
          }
          saveAsTimeoutId = null;
          return GLib.SOURCE_REMOVE;
        });
        return;
      }

      // Use zenity to get a file save location
      const baseFilename =
        file.filename.substring(0, file.filename.lastIndexOf(".")) ||
        file.filename;
      const saveCommand = [
        "zenity",
        "--file-selection",
        "--save",
        `--filename=${GLib.get_home_dir()}/${baseFilename}.txt`,
        "--title=Save file as TXT",
        `--file-filter=*.txt`,
      ];

      try {
        // Run the zenity dialog asynchronously to avoid freezing the shell
        const subprocess = new Gio.Subprocess({
          argv: saveCommand,
          flags:
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
        });

        subprocess.init(null);
        subprocess.communicate_utf8_async(null, null, (proc, result) => {
          try {
            const [, stdout, stderr] = proc.communicate_utf8_finish(result);

            if (proc.get_exit_status() === 0 && stdout && stdout.trim()) {
              const savePath = stdout.trim();

              if (savePath) {
                const ByteArray = imports.byteArray;
                const contentBytes = ByteArray.fromString(file.content);

                if (GLib.file_set_contents(savePath, contentBytes)) {
                  addTemporaryMessage(
                    container.get_parent(),
                    `Successfully saved to ${savePath}`
                  );
                } else {
                  addTemporaryMessage(
                    container.get_parent(),
                    `Error: Failed to write to ${savePath}. Check file permissions.`
                  );
                }
              }
            } else if (stderr && stderr.trim()) {
              // Save dialog error - silently fail in production
            }

            if (saveAsTimeoutId) {
              GLib.Source.remove(saveAsTimeoutId);
            }
            
            saveAsTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
              if (!saveAsButton.destroyed) {
                saveAsButton.set_label(`Save As TXT`);
              }
              saveAsTimeoutId = null;
              return GLib.SOURCE_REMOVE;
            });
          } catch {
            // Error handling save dialog result
            if (saveAsTimeoutId) {
              GLib.Source.remove(saveAsTimeoutId);
            }
            
            saveAsTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
              if (!saveAsButton.destroyed) {
                saveAsButton.set_label(`Save As TXT`);
              }
              saveAsTimeoutId = null;
              return GLib.SOURCE_REMOVE;
            });
          }
        });
      } catch (error) {
        // Error launching save dialog - silently fail in production
        addTemporaryMessage(
          container.get_parent(),
          `Error launching save dialog: ${error}`
        );

        if (saveAsTimeoutId) {
          GLib.Source.remove(saveAsTimeoutId);
        }
        
        saveAsTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
          if (!saveAsButton.destroyed) {
            saveAsButton.set_label(`Save As TXT`);
          }
          saveAsTimeoutId = null;
          return GLib.SOURCE_REMOVE;
        });
      }
    } catch (error) {
      // Error in Save As operation - silently fail in production
      addTemporaryMessage(
        container.get_parent(),
        `Error: ${error.message || "Unknown error during Save As operation"}`
      );

      if (saveAsTimeoutId) {
        GLib.Source.remove(saveAsTimeoutId);
      }
      
      saveAsTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
        if (!saveAsButton.destroyed) {
          saveAsButton.set_label(`Save As TXT`);
        }
        saveAsTimeoutId = null;
        return GLib.SOURCE_REMOVE;
      });
    }
  });

  saveAsButton.connect("destroy", () => {
    if (saveAsTimeoutId) {
      GLib.Source.remove(saveAsTimeoutId);
      saveAsTimeoutId = null;
    }
  });

  headerBox.add_child(saveAsButton);

  // Only show Apply button for files that can be converted back
  if (!isNonConvertibleDocument) {
    const pathToApply = findFilePathForApply(file.filename);
    if (pathToApply) {
      const applyButton = new St.Button({
        style_class: "execute-button",
        label: `Apply to ${file.filename}`,
      });

      let applyTimeoutId = null;
      applyButton.connect("clicked", () => {
        applyButton.set_label(`Applying to ${file.filename}...`);

        if (applyTimeoutId) {
          GLib.Source.remove(applyTimeoutId);
        }

        try {
          let fullPath = pathToApply;

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
            // Error writing to file - silently fail in production
            addTemporaryMessage(container.get_parent(), `Error writing to file`);
          }

          applyTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
            if (!applyButton.destroyed) {
              applyButton.set_label(`Apply to ${file.filename}`);
            }
            applyTimeoutId = null;
            return GLib.SOURCE_REMOVE;
          });
        } catch {
          // Error applying file content - silently fail in production
          addTemporaryMessage(
            container.get_parent(),
            `Error: Error applying file content`
          );

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
    }
  }
  fileBox.add_child(headerBox);

  // Display file content in a single text field
  const contentBox = new St.Entry({
    style_class: "code-content file-content-full",
    x_expand: true,
    can_focus: true
  });

  // Set up the content to display all text without limitations
  contentBox.clutter_text.set_text(file.content || "");
  contentBox.clutter_text.set_line_wrap(true);
  contentBox.clutter_text.set_single_line_mode(false);
  contentBox.clutter_text.set_activatable(false);
  contentBox.clutter_text.set_editable(false);
  contentBox.clutter_text.set_max_length(0); // Remove any character limit
  contentBox.clutter_text.set_ellipsize(imports.gi.Pango.EllipsizeMode.NONE);
  contentBox.clutter_text.set_selectable(true);
  
  fileBox.add_child(contentBox);
  container.add_child(fileBox);
}

/**
 * Find the path to apply changes for a given filename
 * @param {string} filename - The filename to look up
 * @returns {string|null} - The path to apply changes to, or null if not found
 */
function findFilePathForApply(filename) {
  if (!filename) return null;
  
  // First try to get the path from the registry
  const registeredPath = FilePathRegistry.get(filename);
  if (registeredPath) {
    return registeredPath;
  }
  
  // If no registered path, use home directory
  const homeDir = GLib.get_home_dir();
  return GLib.build_filenamev([homeDir, filename]);
}
