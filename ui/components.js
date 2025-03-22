/**
 * UI component creation and rendering utilities
 */

import St from "gi://St";
import Clutter from "gi://Clutter";
import Pango from "gi://Pango";
import GLib from "gi://GLib";
import Gio from "gi://Gio";
import { getSettings } from "../lib/settings.js";
import * as PanelElements from "./panelElements.js";

/**
 * Creates a message container (user or AI)
 * @param {string} text - Message text
 * @param {boolean} isUser - Whether this is a user message
 * @param {Clutter.ActorAlign} alignment - Alignment of the message box
 * @returns {St.BoxLayout} The created message container
 */
export function createMessageContainer(text, isUser, alignment) {
  // Use the unified container creation from PanelElements
  const container = PanelElements.createMessageContainer(
    null,
    isUser,
    alignment
  );

  // Add the text label
  const label = new St.Label({
    text: text,
    style_class: "message-text",
    x_expand: true,
  });

  label.clutter_text.line_wrap = true;
  label.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
  label.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;

  container.add_child(label);
  return container;
}

/**
 * Creates a message container specifically for AI responses that may contain code blocks
 * @param {Clutter.ActorAlign} alignment - Alignment of the message box
 * @returns {St.BoxLayout} The created message container
 */
export function createAIMessageContainer(alignment) {
  // Use the unified container creation from PanelElements
  return PanelElements.createMessageContainer(null, false, alignment);
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

  const trimmedScript = script.trim().replace(/(["`$])/g, "\\$1"); // Escape special characters

  // Create full command to open in terminal
  const fullCommand = `gnome-terminal -- bash -c "${trimmedScript}; exec bash"`;

  try {
    const [success, pid] = GLib.spawn_command_line_async(fullCommand);
    if (!success) {
      logError(
        new Error("Failed to execute script"),
        "spawn_command_line_async returned false"
      );
    }
  } catch (e) {
    logError(e, "Failed to execute script");
  }
}

/**
 * Creates a code container with syntax highlighting styles
 * @param {string} code - Code content
 * @param {string} language - Programming language for styling
 * @returns {St.BoxLayout} The created code container
 */
export function createCodeContainer(code, language = "code") {
  const codeBox = new St.BoxLayout({
    style_class: "code-container",
    style:
      "background-color: #282A36; border-radius: 8px; margin: 8px 0; width: 100%;",
    vertical: true,
    x_expand: true,
  });

  // Create header with language label and copy button
  const headerBox = new St.BoxLayout({
    style_class: "code-header",
    style:
      "background-color: #1E1F29; border-radius: 8px 8px 0 0; padding: 6px 10px;",
    vertical: false,
    x_expand: true,
  });

  // Add language label
  const languageLabel = new St.Label({
    text: language,
    style_class: "code-language",
    style:
      "color: #BD93F9; font-size: 12px; font-family: monospace; padding: 0 4px;",
    x_expand: true,
    y_align: Clutter.ActorAlign.CENTER,
  });

  headerBox.add_child(languageLabel);

  // Add copy button
  const copyButton = new St.Button({
    label: "Copy",
    style_class: "code-copy-button",
    style:
      "color: #8BE9FD; background-color: #44475A; border-radius: 4px; padding: 2px 8px; font-size: 12px;",
    x_align: Clutter.ActorAlign.END,
  });

  let copyTimeoutId = null;
  copyButton.connect("clicked", () => {
    // Copy code to clipboard
    copyToClipboard(code);

    // Change button label temporarily to indicate success
    const originalLabel = copyButton.label;
    copyButton.label = "Copied!";
    copyButton.style =
      "color: #50FA7B; background-color: #44475A; border-radius: 4px; padding: 2px 8px; font-size: 12px;";

    // Restore original label after 2 seconds
    if (copyTimeoutId) {
      GLib.source_remove(copyTimeoutId);
    }

    copyTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
      copyButton.label = originalLabel;
      copyButton.style =
        "color: #8BE9FD; background-color: #44475A; border-radius: 4px; padding: 2px 8px; font-size: 12px;";
      copyTimeoutId = null;
      return GLib.SOURCE_REMOVE;
    });
  });

  headerBox.add_child(copyButton);

  // Add execute button for bash scripts
  const isBashScript = language === "bash" || language === "sh";

  if (isBashScript) {
    const executeButton = new St.Button({
      label: "Run",
      style_class: "code-execute-button",
      style:
        "color: #FFB86C; background-color: #44475A; border-radius: 4px; padding: 2px 8px; margin-left: 8px; font-size: 12px;",
    });

    let executeTimeoutId = null;
    executeButton.connect("clicked", () => {
      // Execute bash script in terminal
      executeBashScript(code);

      // Change button label temporarily to indicate execution
      const originalLabel = executeButton.label;
      executeButton.label = "Running...";
      executeButton.style =
        "color: #FF5555; background-color: #44475A; border-radius: 4px; padding: 2px 8px; margin-left: 8px; font-size: 12px;";

      // Restore original label after 2 seconds
      if (executeTimeoutId) {
        GLib.source_remove(executeTimeoutId);
      }

      executeTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
        executeButton.label = originalLabel;
        executeButton.style =
          "color: #FFB86C; background-color: #44475A; border-radius: 4px; padding: 2px 8px; margin-left: 8px; font-size: 12px;";
        executeTimeoutId = null;
        return GLib.SOURCE_REMOVE;
      });
    });

    headerBox.add_child(executeButton);
  }

  codeBox.add_child(headerBox);

  // Add code content with syntax highlighting styles
  const codeContent = new St.Label({
    text: code,
    style_class: "code-content",
    style:
      "font-family: monospace; color: #F8F8F2; background-color: #282A36; padding: 12px; border-radius: 0 0 8px 8px; font-size: 14px;",
    x_expand: true,
  });

  codeContent.clutter_text.line_wrap = true;
  codeContent.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
  codeContent.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;

  codeBox.add_child(codeContent);

  return codeBox;
}

/**
 * Creates a text label for normal text content
 * @param {string} text - Text content
 * @returns {St.Label} The created text label
 */
export function createTextLabel(text) {
  const textLabel = new St.Label({
    text: text,
    style_class: "response-text",
    style: "margin: 4px 0;",
    x_expand: true,
  });

  textLabel.clutter_text.line_wrap = true;
  textLabel.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
  textLabel.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;

  return textLabel;
}

/**
 * Creates a temporary message label (e.g., for status messages)
 * @param {string} text - Message text
 * @returns {St.Label} The created temporary message label
 */
export function createTemporaryMessageLabel(text) {
  const tempLabel = new St.Label({
    text: text,
    style_class: "temporary-message",
    style: "font-style: italic; color: #888888; margin: 8px 0;",
    x_expand: true,
    x_align: Clutter.ActorAlign.CENTER,
  });

  tempLabel.clutter_text.line_wrap = true;
  tempLabel.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
  tempLabel.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;

  return tempLabel;
}

/**
 * Creates a blockquote element for quoted text
 * @param {string} content - Text content
 * @returns {St.BoxLayout} The created blockquote element
 */
export function createBlockquoteElement(content) {
  const blockquote = new St.BoxLayout({
    style_class: "blockquote",
    style:
      "border-left: 4px solid #50FA7B; padding: 0 0 0 12px; margin: 8px 0;",
    vertical: true,
    x_expand: true,
  });

  const label = new St.Label({
    text: content,
    style: "font-style: italic; color: #BBBBBB;",
    x_expand: true,
  });

  label.clutter_text.line_wrap = true;
  label.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
  label.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;

  blockquote.add_child(label);

  return blockquote;
}

/**
 * Creates a heading element with appropriate sizing
 * @param {string} content - Heading text
 * @param {number} level - Heading level (1-6)
 * @returns {St.Label} The created heading label
 */
export function createHeadingElement(content, level) {
  // Adjust font size based on heading level
  const fontSize = 18 - (level - 1) * 2;

  const heading = new St.Label({
    text: content,
    style_class: `heading heading-${level}`,
    style: `font-size: ${fontSize}px; font-weight: bold; margin: 16px 0 8px 0;`,
    x_expand: true,
  });

  heading.clutter_text.line_wrap = true;
  heading.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
  heading.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;

  return heading;
}

/**
 * Creates a list element (ordered or unordered)
 * @param {string[]} items - Array of list items
 * @param {string} type - List type ('ordered' or 'unordered')
 * @returns {St.BoxLayout} The created list container
 */
export function createListElement(items, type) {
  const listContainer = new St.BoxLayout({
    style_class: `list-container ${type}-list`,
    style: "margin: 8px 0;",
    vertical: true,
    x_expand: true,
  });

  items.forEach((item, index) => {
    // Create a container for each list item
    const listItem = new St.BoxLayout({
      style_class: "list-item",
      style: "padding: 2px 0;",
      vertical: false,
      x_expand: true,
    });

    // Create appropriate prefix based on list type
    const prefix = new St.Label({
      text: type === "ordered" ? `${index + 1}.` : "•",
      style_class: "list-prefix",
      style: "min-width: 24px; color: #BD93F9;",
      y_align: Clutter.ActorAlign.START,
    });

    listItem.add_child(prefix);

    // Create the content for the list item
    const content = new St.Label({
      text: item,
      style_class: "list-content",
      x_expand: true,
    });

    content.clutter_text.line_wrap = true;
    content.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
    content.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;

    listItem.add_child(content);
    listContainer.add_child(listItem);
  });

  return listContainer;
}

/**
 * Creates a horizontal rule (divider) element
 * @returns {St.BoxLayout} The created horizontal rule
 */
export function createHorizontalRuleElement() {
  const rule = new St.BoxLayout({
    style_class: "horizontal-rule",
    style: "background-color: #44475A; height: 1px; margin: 16px 0;",
    x_expand: true,
  });

  return rule;
}
