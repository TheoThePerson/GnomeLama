/**
 * UI component creation and rendering utilities
 */

import Clutter from "gi://Clutter";
import GLib from "gi://GLib";
import Pango from "gi://Pango";
import St from "gi://St";
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
  
  // For AI messages, ensure we synchronize opacity first
  if (!isUser) {
    synchronizeMessageOpacity();
  }
    
  // Try to get message-opacity first, then fall back to specific opacities
  let opacity;
  try {
    opacity = settings.get_double("message-opacity");
  } catch (e) {
    // If that fails, try the individual opacity settings
    try {
      opacity = isUser
        ? settings.get_double("user-message-opacity")
        : settings.get_double("ai-message-opacity");
    } catch (e) {
      // If all else fails, default to 1.0 (fully opaque)
      opacity = 1.0;
    }
  }
    
  // Parse color components for rgba
  const r = parseInt(bgColor.substring(1, 3), 16);
  const g = parseInt(bgColor.substring(3, 5), 16);
  const b = parseInt(bgColor.substring(5, 7), 16);

  // Create the outer container with specific styling class and explicit style
  const messageBox = new St.BoxLayout({
    style_class: isUser ? "message-box user-message" : "message-box ai-message",
    style: `background-color: rgba(${r}, ${g}, ${b}, ${opacity}); padding: 14px 18px; margin: 8px 4px; border-radius: ${
      isUser ? "24px 24px 6px 24px" : "24px 24px 24px 6px"
    };`,
    x_align: alignment,
    vertical: true,
    x_expand: true
  });

  // Check if the text contains the files attached marker
  let displayText = text;
  if (text.includes(" ｢files attached｣")) {
    displayText = text.replace(" ｢files attached｣", "");

    // Create a container for text and tag
    const contentBox = new St.BoxLayout({
      vertical: false,
      x_expand: true
    });

    // Create label with text content
    const label = new St.Label({
      text: displayText,
      style_class: "text-label",
      style: "padding: 0; margin: 0;",
      x_expand: true
    });

    label.clutter_text.set_line_wrap(true);
    label.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);
    label.clutter_text.set_selectable(true);

    // Create files attached tag
    const filesTag = new St.Label({
      text: "Files Attached",
      style_class: "files-attached-tag",
      y_align: Clutter.ActorAlign.CENTER
    });

    contentBox.add_child(label);
    contentBox.add_child(filesTag);
    messageBox.add_child(contentBox);
  } else {
    // Create regular label with text content
    const label = new St.Label({
      text,
      style_class: "text-label",
      style: "padding: 0; margin: 0;",
      x_expand: true
    });

    label.clutter_text.set_line_wrap(true);
    label.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);
    label.clutter_text.set_selectable(true);

    messageBox.add_child(label);
  }

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
  if (!script || script.trim() === "") {
    return; // no script to execute
  }

  try {
    // Trim script to remove unwanted spaces and newlines
    const trimmedScript = script.trim().replace(/(["`$])/gu, "\\$1"); // Escape special characters
    // Use double quotes instead of single quotes
    const fullCommand = `gnome-terminal -- bash -c "${trimmedScript}; exec bash"`;
    GLib.spawn_command_line_async(fullCommand);
  } catch (e) {
    // Error handling silently
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

  // Display code content in a single text field
  const contentBox = new St.Entry({
    style_class: "code-content file-content-full",
    x_expand: true,
    can_focus: true
  });

  // Set up the content to display all text without limitations
  contentBox.clutter_text.set_text(code || "");
  contentBox.clutter_text.set_line_wrap(true);
  contentBox.clutter_text.set_single_line_mode(false);
  contentBox.clutter_text.set_activatable(false);
  contentBox.clutter_text.set_editable(false);
  contentBox.clutter_text.set_max_length(0); // Remove any character limit
  contentBox.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);
  contentBox.clutter_text.set_selectable(true);
  
  codeBox.add_child(contentBox);

  return codeBox;
}

/**
 * Creates a text label
 * @param {string} text - The text content
 * @returns {St.Label} The created text label
 */
export function createTextLabel(text) {
  const textLabel = new St.Label({
    text,
    style_class: "text-label",
    style: "display: inline-block;",
    x_expand: true,
  });

  // Enable line wrapping and preserve whitespace
  textLabel.clutter_text.set_line_wrap(true);
  textLabel.clutter_text.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
  textLabel.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);
  textLabel.clutter_text.set_selectable(true);

  return textLabel;
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
    style: "font-style: italic; color: #aaa;",
    x_expand: true,
  });

  tempLabel.clutter_text.set_line_wrap(true);
  tempLabel.clutter_text.set_selectable(true);

  return tempLabel;
}

/**
 * Creates a blockquote element
 * @param {string} content - The blockquote content
 * @returns {St.BoxLayout} The created blockquote element
 */
export function createBlockquoteElement(content) {
  const blockquote = new St.BoxLayout({
    vertical: true,
    style_class: "blockquote",
    style:
      "border-left: 4px solid #888; padding-left: 12px; margin: 10px 0; background-color: rgba(0,0,0,0.03);",
    x_expand: true,
  });

  const label = new St.Label({
    text: content,
    style_class: "blockquote-text",
    x_expand: true,
  });

  label.clutter_text.set_line_wrap(true);
  label.clutter_text.set_selectable(true);
  blockquote.add_child(label);

  return blockquote;
}

/**
 * Creates a heading element
 * @param {string} content - The heading content
 * @param {number} level - The heading level (1-6)
 * @returns {St.Label} The created heading element
 */
export function createHeadingElement(content, level) {
  // Calculate font size based on heading level
  const fontSize = 18 - (level - 1) * 2;

  const heading = new St.Label({
    text: content,
    style_class: `heading heading-${level}`,
    style: `font-size: ${fontSize}px; font-weight: bold; margin: ${
      level === 1 ? "16px 0 8px" : "12px 0 8px"
    }; padding-bottom: 4px; ${
      level <= 2 ? "border-bottom: 1px solid #ddd;" : ""
    }`,
    x_expand: true,
  });

  heading.clutter_text.set_line_wrap(true);
  heading.clutter_text.set_selectable(true);

  return heading;
}

/**
 * Creates a list element (ordered or unordered)
 * @param {Array} items - Array of list item objects with content and prefix
 * @param {string} type - Type of list ('orderedList' or 'unorderedList')
 * @returns {St.BoxLayout} The created list element
 */
export function createListElement(items, type) {
  const listContainer = new St.BoxLayout({
    vertical: true,
    style_class: type === "orderedList" ? "ordered-list" : "unordered-list",
    style: "margin: 8px 0;",
    x_expand: true,
  });

  items.forEach((item) => {
    const listItem = new St.BoxLayout({
      style_class: "list-item",
      x_expand: true,
      style: "margin: 2px 0;",
    });

    // Use proper bullet for unordered lists based on prefix character
    let bulletText;
    if (type === "orderedList") {
      bulletText = `${item.prefix} `;
    } else {
      // Use Unicode bullet character regardless of the original prefix
      bulletText = "• ";
    }

    // Add bullet or number
    const prefix = new St.Label({
      text: bulletText,
      style:
        "min-width: 25px; font-weight: " +
        (type === "orderedList" ? "normal" : "bold") +
        ";",
    });
    listItem.add_child(prefix);

    // Add content
    const content = new St.Label({
      text: item.content,
      x_expand: true,
      style: "word-wrap: break-word; overflow-wrap: break-word; width: 100%;",
    });
    content.clutter_text.set_line_wrap(true);
    content.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);
    content.clutter_text.set_selectable(true);
    listItem.add_child(content);

    listContainer.add_child(listItem);
  });

  return listContainer;
}

/**
 * Creates a horizontal rule element
 * @returns {St.BoxLayout} The created horizontal rule
 */
export function createHorizontalRuleElement() {
  const rule = new St.BoxLayout({
    style_class: "horizontal-rule",
    style: "background-color: #ddd; height: 1px; margin: 16px 0;",
    x_expand: true,
  });

  return rule;
}

/**
 * Explicitly applies opacity to both user and AI messages with same value
 * To be called when initializing or when opacity settings change
 */
export function synchronizeMessageOpacity() {
  const settings = getSettings();
  let opacity;
  
  try {
    // Get the unified message opacity
    opacity = settings.get_double("message-opacity");
  } catch (e) {
    // If that fails, get user message opacity as fallback
    try {
      opacity = settings.get_double("user-message-opacity");
    } catch (e) {
      // Default to 1.0 if nothing exists
      opacity = 1.0;
    }
  }
  
  // Apply this opacity to both settings
  try {
    settings.set_double("user-message-opacity", opacity);
    settings.set_double("ai-message-opacity", opacity);
  } catch (e) {
    // Error handling silently
  }
  
  return opacity;
}

/**
 * Updates an existing message container with current settings colors
 * @param {St.BoxLayout} container - Message container to update
 * @param {boolean} isUser - Whether this is a user message
 */
export function updateMessageContainerStyle(container, isUser) {
  const settings = getSettings();
  const bgColor = isUser
    ? settings.get_string("user-message-color")
    : settings.get_string("ai-message-color");
  
  // For AI messages, ensure we synchronize opacity first
  if (!isUser) {
    synchronizeMessageOpacity();
  }
  
  // Try to get message-opacity first, then fall back to specific opacities
  let opacity;
  try {
    opacity = settings.get_double("message-opacity");
  } catch (e) {
    // If that fails, try the individual opacity settings
    try {
      opacity = isUser
        ? settings.get_double("user-message-opacity")
        : settings.get_double("ai-message-opacity");
    } catch (e) {
      // If all else fails, default to 1.0 (fully opaque)
      opacity = 1.0;
    }
  }
    
  // Parse color components for rgba
  const r = parseInt(bgColor.substring(1, 3), 16);
  const g = parseInt(bgColor.substring(3, 5), 16);
  const b = parseInt(bgColor.substring(5, 7), 16);

  const borderRadius = isUser ? "24px 24px 6px 24px" : "24px 24px 24px 6px";

  container.set_style(
    `background-color: rgba(${r}, ${g}, ${b}, ${opacity}); padding: 14px 18px; margin: 8px 4px; border-radius: ${borderRadius};`
  );
}
