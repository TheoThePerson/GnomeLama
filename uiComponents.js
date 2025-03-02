/**
 * UI component creation and rendering utilities
 */

import St from "gi://St";
import Clutter from "gi://Clutter";
import Pango from "gi://Pango";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import { PanelConfig } from "./config.js";

/**
 * Creates a message container (user or AI)
 * @param {string} text - Message text
 * @param {boolean} isUser - Whether this is a user message
 * @param {Clutter.ActorAlign} alignment - Alignment of the message box
 * @returns {St.BoxLayout} The created message container
 */
export function createMessageContainer(text, isUser, alignment) {
  const bgColor = isUser
    ? PanelConfig.userMessageColor
    : PanelConfig.aiMessageColor;

  const messageBox = new St.BoxLayout({
    style: `
      background-color: ${bgColor};
      color: white;
      padding: 10px;
      margin-bottom: 5px;
      border-radius: 10px;
      max-width: 80%;
    `,
    x_align: alignment,
  });

  const label = new St.Label({
    text: text,
    style: "padding: 5px; white-space: normal;",
    x_expand: true,
  });

  label.clutter_text.set_line_wrap(true);
  label.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);
  label.clutter_text.set_selectable(true);

  messageBox.add_child(label);
  return messageBox;
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
  // Safety check
  if (!script || script.trim() === "") {
    logError(new Error("Empty script"), "Cannot execute empty script");
    return;
  }

  try {
    // Properly format the script for execution
    // Escape single quotes in the script
    const escapedScript = script.replace(/'/g, "'\\''");

    // Create the full command
    const fullCommand = `gnome-terminal -- bash -c '${escapedScript}; exec bash'`;

    // Use GLib.spawn_command_line_async which is better suited for launching processes
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
  const codeBox = new St.BoxLayout({
    vertical: true,
    style: `
      background-color: #333;
      color: #f8f8f8;
      padding: 10px;
      margin: 5px 0;
      border-radius: 5px;
      font-family: monospace;
    `,
    x_expand: true,
  });

  // Create a header box to contain language label and buttons
  const headerBox = new St.BoxLayout({
    style: `
      padding-bottom: 5px;
      border-bottom: 1px solid #555;
      margin-bottom: 5px;
    `,
    x_expand: true,
  });

  // Add language label at the top
  const languageLabel = new St.Label({
    text: language,
    style: `
      color: #aaa;
      font-size: 12px;
      font-weight: bold;
      padding: 0 5px;
    `,
    x_expand: true,
  });

  languageLabel.clutter_text.set_selectable(true);
  headerBox.add_child(languageLabel);

  // Add copy button
  const copyButton = new St.Button({
    style_class: "code-button",
    style: `
      background-color: #555;
      color: white;
      border-radius: 3px;
      padding: 2px 8px;
      font-size: 10px;
      margin-right: 5px;
    `,
    label: "Copy",
  });

  copyButton.connect("clicked", () => {
    copyToClipboard(code);

    // Provide visual feedback
    copyButton.set_label("Copied!");
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
      copyButton.set_label("Copy");
      return GLib.SOURCE_REMOVE;
    });
  });

  headerBox.add_child(copyButton);

  // Add execute button for bash scripts
  const isBashScript = language === "bash" || language === "sh";
  if (isBashScript) {
    const executeButton = new St.Button({
      style_class: "execute-button",
      style: `
        background-color: #4CAF50;
        color: white;
        border-radius: 3px;
        padding: 2px 8px;
        font-size: 10px;
      `,
      label: "Execute",
    });

    executeButton.connect("clicked", () => {
      executeBashScript(code);

      // Provide visual feedback
      executeButton.set_label("Executing...");
      GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
        executeButton.set_label("Execute");
        return GLib.SOURCE_REMOVE;
      });
    });

    headerBox.add_child(executeButton);
  }

  codeBox.add_child(headerBox);

  const codeLabel = new St.Label({
    text: code,
    style: "padding: 5px; white-space: pre-wrap;",
    x_expand: true,
  });

  codeLabel.clutter_text.set_line_wrap(true);
  codeLabel.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);
  codeLabel.clutter_text.set_selectable(true);

  codeBox.add_child(codeLabel);

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
    style: "padding: 5px; white-space: normal;",
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
    style: `padding: 5px; white-space: normal; ${styleAttribute}`,
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
    x_align: Clutter.ActorAlign.START,
    style: "padding: 5px; margin-bottom: 5px;",
  });

  tempLabel.clutter_text.set_selectable(true);

  return tempLabel;
}
