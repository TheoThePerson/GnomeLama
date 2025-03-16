/**
 * UI component creation and rendering utilities
 */

import St from "gi://St";
import Clutter from "gi://Clutter";
import Pango from "gi://Pango";
import GLib from "gi://GLib";
import { getSettings } from "../lib/settings.js";

/**
 * Creates a message container (user or AI)
 * @param {string} text - Message text
 * @param {boolean} isUser - Whether this is a user message
 * @param {Clutter.ActorAlign} alignment - Alignment of the message box
 * @returns {St.BoxLayout} The created message container
 */
export function createMessageContainer(text, isUser, alignment) {
  const settings = getSettings();
  const bgColor = isUser
    ? settings.get_string("user-message-color")
    : settings.get_string("ai-message-color");

  // Create the outer container with specific styling class and explicit style
  const messageBox = new St.BoxLayout({
    style_class: isUser ? "message-box user-message" : "message-box ai-message",
    style: `background-color: ${bgColor}; padding: 14px 18px; margin: 8px 4px; border-radius: ${
      isUser ? "16px 16px 6px 16px" : "16px 16px 16px 6px"
    };`,
    x_align: alignment,
    vertical: true,
  });

  // Create label with text content
  const label = new St.Label({
    text: text,
    style_class: "text-label",
    style: "padding: 0; margin: 0;",
    x_expand: true,
  });

  label.clutter_text.set_line_wrap(true);
  label.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);
  label.clutter_text.set_selectable(true);

  messageBox.add_child(label);
  return messageBox;
}

/**
 * Creates a message container specifically for AI responses that may contain code blocks
 * @param {Clutter.ActorAlign} alignment - Alignment of the message box
 * @returns {St.BoxLayout} The created message container
 */
export function createAIMessageContainer(alignment) {
  const settings = getSettings();
  const bgColor = settings.get_string("ai-message-color");

  // Create a container with explicit styling
  const container = new St.BoxLayout({
    style_class: "message-box ai-message",
    style: `background-color: ${bgColor}; padding: 14px 18px; margin: 8px 4px; border-radius: 16px 16px 16px 6px;`,
    x_align: alignment,
    vertical: true,
    x_expand: true,
  });

  return container;
}

/**
 * Copies text to clipboard
 * @param {string} text - The text to copy
 */
function copyToClipboard(text) {
  const clipboard = St.Clipboard.get_default();
  clipboard.set_text(St.ClipboardType.CLIPBOARD, text);
}

/**
 * Execute bash script in a new terminal window
 * @param {string} script - The bash script to execute
 */
function executeBashScript(script) {
  if (!script || script.trim() === "") {
    logError(new Error("Empty script"), "Cannot execute empty script");
    return;
  }

  try {
    // Trim script to remove unwanted spaces and newlines
    const trimmedScript = script.trim().replace(/(["`$])/g, "\\$1"); // Escape special characters

    // Use double quotes instead of single quotes
    const fullCommand = `gnome-terminal -- bash -c "${trimmedScript}; exec bash"`;

    GLib.spawn_command_line_async(fullCommand);
  } catch (e) {
    logError(e, "Error launching terminal");
  }
}

/**
 * Creates a code block container
 * @param {string} code - The code content
 * @param {string} language - The language of the code block
 * @returns {St.BoxLayout} The created code container
 */
export function createCodeContainer(code, language = "code") {
  // Main container with dark grey background
  const codeBox = new St.BoxLayout({
    vertical: true,
    style_class: "code-container",
    style:
      "background-color: #222; border: 1px solid #444; border-radius: 8px; margin: 8px 0;",
    x_expand: true,
  });

  // Create a header box with darker background
  const headerBox = new St.BoxLayout({
    style_class: "code-header",
    style:
      "background-color: #333; padding: 6px 8px; border-radius: 8px 8px 0 0;",
    x_expand: true,
  });

  // Add language label
  const languageLabel = new St.Label({
    text: language,
    style_class: "code-language",
    style: "color: #ddd; font-size: 12px; font-weight: bold;",
    x_expand: true,
  });

  languageLabel.clutter_text.set_selectable(true);
  headerBox.add_child(languageLabel);

  // Add copy button with grey styling - more compact
  const copyButton = new St.Button({
    style_class: "code-button",
    style:
      "background-color: #555; color: white; border-radius: 3px; padding: 2px 8px; font-size: 10px;",
    label: "Copy",
  });

  let copyTimeoutId = null;
  copyButton.connect("clicked", () => {
    copyToClipboard(code);
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

  // Add execute button for bash scripts with green styling - more compact
  const isBashScript = language === "bash" || language === "sh";
  if (isBashScript) {
    const executeButton = new St.Button({
      style_class: "execute-button",
      style:
        "background-color: #2e7d32; color: white; border-radius: 3px; padding: 2px 8px; font-size: 10px;",
      label: "Execute",
    });

    let executeTimeoutId = null;
    executeButton.connect("clicked", () => {
      executeBashScript(code);
      executeButton.set_label("Executing...");

      if (executeTimeoutId) {
        GLib.Source.remove(executeTimeoutId);
      }

      executeTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
        if (!executeButton.destroyed) {
          executeButton.set_label("Execute");
        }
        executeTimeoutId = null;
        return GLib.SOURCE_REMOVE;
      });

      executeButton.connect("destroy", () => {
        if (executeTimeoutId) {
          GLib.Source.remove(executeTimeoutId);
          executeTimeoutId = null;
        }
      });
    });

    headerBox.add_child(executeButton);
  }

  codeBox.add_child(headerBox);

  // Create a container for the code content with specific styling
  const codeContent = new St.Label({
    text: code,
    style_class: "code-content",
    style:
      "background-color: #222; color: #eee; padding: 12px; font-family: monospace;",
    x_expand: true,
  });

  codeContent.clutter_text.set_line_wrap(true);
  codeContent.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);
  codeContent.clutter_text.set_selectable(true);

  codeBox.add_child(codeContent);

  return codeBox;
}

/**
 * Creates a text label
 * @param {string} text - The text content
 * @returns {St.Label} The created text label
 */
export function createTextLabel(text) {
  const textLabel = new St.Label({
    text: text,
    style_class: "text-label",
    x_expand: true,
  });

  textLabel.clutter_text.set_line_wrap(true);
  textLabel.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);
  textLabel.clutter_text.set_selectable(true);

  return textLabel;
}

/**
 * Creates a formatted text label (bold or italic)
 * @param {string} text - The text content
 * @param {string} format - The format type ('bold' or 'italic')
 * @returns {St.Label} The created formatted text label
 */
export function createFormattedTextLabel(text, format) {
  let styleAttribute = "";

  if (format === "bold") {
    styleAttribute = "font-weight: bold;";
  } else if (format === "italic") {
    styleAttribute = "font-style: italic;";
  }

  const formattedLabel = new St.Label({
    text: text,
    style_class: "text-label formatted-text",
    style: styleAttribute,
    x_expand: true,
  });

  formattedLabel.clutter_text.set_line_wrap(true);
  formattedLabel.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);
  formattedLabel.clutter_text.set_selectable(true);

  return formattedLabel;
}

/**
 * Creates a temporary message label
 * @param {string} text - The message text
 * @returns {St.Label} The created temporary message label
 */
export function createTemporaryMessageLabel(text) {
  const tempLabel = new St.Label({
    text,
    style_class: "temporary-message",
    x_align: Clutter.ActorAlign.START,
  });

  tempLabel.clutter_text.set_line_wrap(true);
  tempLabel.clutter_text.set_selectable(true);

  return tempLabel;
}
