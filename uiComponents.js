/**
 * UI component creation and rendering utilities
 */

import St from "gi://St";
import Clutter from "gi://Clutter";
import Pango from "gi://Pango";

/**
 * Creates a message container (user or AI)
 * @param {string} text - Message text
 * @param {boolean} isUser - Whether this is a user message
 * @param {Clutter.ActorAlign} alignment - Alignment of the message box
 * @returns {St.BoxLayout} The created message container
 */
export function createMessageContainer(text, isUser, alignment) {
  const bgColor = isUser ? "#007bff" : "#ff9800"; // Blue for user, orange for AI

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

  messageBox.add_child(label);
  return messageBox;
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

  // Add language label at the top
  const languageLabel = new St.Label({
    text: language,
    style: `
      color: #aaa;
      font-size: 12px;
      font-weight: bold;
      padding: 0 5px 5px 5px;
      border-bottom: 1px solid #555;
      margin-bottom: 5px;
    `,
    x_expand: true,
  });

  codeBox.add_child(languageLabel);

  const codeLabel = new St.Label({
    text: code,
    style: "padding: 5px; white-space: pre-wrap;",
    x_expand: true,
  });

  codeLabel.clutter_text.set_line_wrap(true);
  codeLabel.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);
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

  return formattedLabel;
}

/**
 * Creates a temporary message label
 * @param {string} text - The message text
 * @returns {St.Label} The created temporary message label
 */
export function createTemporaryMessageLabel(text) {
  return new St.Label({
    text,
    x_align: Clutter.ActorAlign.START,
    style: "padding: 5px; margin-bottom: 5px;",
  });
}
