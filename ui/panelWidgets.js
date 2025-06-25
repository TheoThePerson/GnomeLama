/**
 * UI element creation functions for panel components
 */

import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import St from "gi://St";
import Pango from "gi://Pango";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { getSettings } from "../lib/settings.js";

/**
 * Creates a panel overlay widget
 * @param {object} dimensions - Layout dimensions
 * @returns {St.Widget} - The created panel overlay
 */
export function createPanelOverlay(dimensions) {
  const panelOverlay = new St.Widget({
    style_class: "panel-overlay",
    reactive: true,
    can_focus: true,
    track_hover: true,
    visible: false,
    width: dimensions.panelWidth,
    height: dimensions.panelHeight,
    x: dimensions.monitor.width - dimensions.panelWidth,
    y: Main.panel.actor.height,
    clip_to_allocation: true,
  });

  // Add to UI group asynchronously to avoid blocking the UI
  GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
    try {
      Main.layoutManager.uiGroup.add_child(panelOverlay);
    } catch {
      // Try again after a short delay
      GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
        Main.layoutManager.uiGroup.add_child(panelOverlay);
        return GLib.SOURCE_REMOVE;
      });
    }
    return GLib.SOURCE_REMOVE;
  });

  return panelOverlay;
}

/**
 * Creates a model button with label
 * @param {string} label - Initial button label text
 * @returns {object} - Object containing button and label elements
 */
export function createModelButton(label = "No models found") {
  const modelButton = new St.Button({
    style_class: "model-button",
    style: "padding: 0 8px; height: 32px;",
    can_focus: true,
  });

  const modelButtonLabel = new St.Label({
    text: label,
    style_class: "model-button-label",
    style: "color: #808080;",
    y_align: Clutter.ActorAlign.CENTER,
    x_align: Clutter.ActorAlign.START,
  });

  // Create a container for proper alignment
  const buttonContentBox = new St.BoxLayout({
    style: "padding-left: 12px;",
    x_expand: true,
  });

  // Add the label to the content box
  buttonContentBox.add_child(modelButtonLabel);

  // Set the content box as the button's child
  modelButton.set_child(buttonContentBox);

  return { modelButton, modelButtonLabel };
}

/**
 * Creates a clear button with trash icon
 * @param {string} extensionPath - Path to the extension
 * @param {number} iconScale - Scale factor for the icon
 * @returns {object} - Object containing button and icon elements
 */
export function createClearButton(extensionPath, iconScale = 1.0) {
  const iconSize = 24 * iconScale;

  // Load icon asynchronously
  const clearIcon = new St.Icon({
    style_class: "system-status-icon",
    style: "margin: 0 auto;",
    x_align: Clutter.ActorAlign.CENTER,
    y_align: Clutter.ActorAlign.CENTER,
    width: iconSize,
    height: iconSize,
  });

  GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
    clearIcon.gicon = Gio.icon_new_for_string(
      `${extensionPath}/icons/trash-icon.svg`
    );
    return GLib.SOURCE_REMOVE;
  });

  const clearButton = new St.Button({
    child: clearIcon,
    style_class: "clear-button",
  });

  return { clearButton, clearIcon };
}

/**
 * Creates a settings button with settings icon
 * @param {string} extensionPath - Path to the extension
 * @param {number} iconScale - Scale factor for the icon
 * @returns {object} - Object containing button and icon elements
 */
export function createSettingsButton(extensionPath, iconScale = 1.0) {
  const iconSize = 24 * iconScale;

  // Load icon asynchronously
  const settingsIcon = new St.Icon({
    style_class: "system-status-icon",
    style: "margin: 0 auto;",
    x_align: Clutter.ActorAlign.CENTER,
    y_align: Clutter.ActorAlign.CENTER,
    width: iconSize,
    height: iconSize,
  });

  GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
    settingsIcon.gicon = Gio.icon_new_for_string(
      `${extensionPath}/icons/settings-icon.svg`
    );
    return GLib.SOURCE_REMOVE;
  });

  const settingsButton = new St.Button({
    child: settingsIcon,
    style_class: "settings-button",
  });

  return { settingsButton, settingsIcon };
}

/**
 * Creates a file selection button with file icon
 * @param {string} extensionPath - Path to the extension
 * @param {number} iconScale - Scale factor for the icon
 * @returns {object} - Object containing button and icon elements
 */
export function createFileButton(extensionPath, iconScale = 1.0) {
  const iconSize = 24 * iconScale;

  // Load icon asynchronously
  const fileIcon = new St.Icon({
    style_class: "system-status-icon",
    style: "margin: 0 auto;",
    x_align: Clutter.ActorAlign.CENTER,
    y_align: Clutter.ActorAlign.CENTER,
    width: iconSize,
    height: iconSize,
  });

  GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
    fileIcon.gicon = Gio.icon_new_for_string(
      `${extensionPath}/icons/file-icon.svg`
    );
    return GLib.SOURCE_REMOVE;
  });

  const fileButton = new St.Button({
    child: fileIcon,
    style_class: "file-button",
  });

  return { fileButton, fileIcon };
}

/**
 * Creates a scrollable output area
 * @param {object} dimensions - Layout dimensions
 * @returns {object} - Object containing scroll view and container
 */
export function createOutputArea(dimensions) {
  const outputScrollView = new St.ScrollView({
    width: dimensions.panelWidth,
    height: dimensions.outputHeight,
    style_class: "output-scrollview",
    y: dimensions.topBarHeight + dimensions.paddingY,
    reactive: true,
    can_focus: true,
    overlay_scrollbars: false,
    enable_mouse_scrolling: true,
    hscrollbar_policy: St.PolicyType.NEVER,
    vscrollbar_policy: St.PolicyType.AUTOMATIC,
    x_expand: true,
    y_expand: true,
    style: "padding: 0; margin: 0;",
  });

  // Ensure scrollbar is properly sized
  const {vscroll} = outputScrollView;
  if (vscroll) {
    vscroll.set_width(8);

    // Connect to scroll events to force updates
    const { adjustment } = vscroll;
    if (adjustment) {
      adjustment.connect("notify::value", () => {
        // Use idle_add to defer redraw to prevent UI blocking
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
          outputScrollView.queue_redraw();
          vscroll.queue_redraw();
          return GLib.SOURCE_REMOVE;
        });
      });
    }
  }

  // Connect to scroll events with throttling to improve performance
  let lastScrollTime = 0;
  outputScrollView.connect("scroll-event", () => {
    const currentTime = Date.now();
    if (currentTime - lastScrollTime > 16) {
      // ~60fps, limit redraw frequency
      lastScrollTime = currentTime;
      GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
        outputScrollView.queue_redraw();
        if (vscroll) {
          vscroll.queue_redraw();
        }
        return GLib.SOURCE_REMOVE;
      });
    }
  });

  const outputContainer = new St.BoxLayout({
    vertical: true,
    reactive: true,
    can_focus: true,
    style: `padding: 0 ${dimensions.horizontalPadding}px;`,
    x_expand: true,
    y_expand: true,
  });

  outputContainer.set_layout_manager(
    new Clutter.BoxLayout({
      orientation: Clutter.Orientation.VERTICAL,
      spacing: 8,
      homogeneous: false,
    })
  );

  // Set scroll policy
  outputScrollView.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);

  outputScrollView.set_child(outputContainer);
  return { outputScrollView, outputContainer };
}

/**
 * Creates an input area with text field and send button
 * @param {string} extensionPath - Path to the extension
 * @param {boolean} isNewChat - Whether this is a new chat (no history or last message is from user)
 * @returns {object} - Object containing input elements
 */
export function createInputArea(extensionPath, isNewChat = true) {
  const inputFieldBox = new St.BoxLayout({
    style_class: "input-field-box",
    vertical: false,
    style: "background-color: transparent;",
  });

  const inputField = new St.Entry({
    hint_text: isNewChat ? "Start your conversation..." : "Your response...",
    can_focus: true,
    style_class: "input-field",
    style:
      "background-color: transparent; border: none; caret-color: white; color: white;",
  });

  // Enable multiline support
  inputField.clutter_text.set_single_line_mode(false);
  inputField.clutter_text.set_line_wrap(true);
  inputField.clutter_text.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);

  // Add click handler to focus the input field
  inputField.connect("button-press-event", () => {
    // Try multiple focus methods to ensure it works even when other windows have focus
    const tryFocus = () => {
      // Method 1: Try stage focus
      if (Main && Main.global && Main.global.stage) {
        Main.global.stage.set_key_focus(inputField.clutter_text);
      }

      // Method 2: Try direct grab_key_focus
      if (inputField.clutter_text && inputField.clutter_text.grab_key_focus) {
        inputField.clutter_text.grab_key_focus();
      }

      // Method 3: Try focusing parent first, then input field
      const parent = inputField.get_parent();
      if (parent && parent.grab_key_focus) {
        parent.grab_key_focus();
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
          if (inputField.clutter_text && inputField.clutter_text.grab_key_focus) {
            inputField.clutter_text.grab_key_focus();
          }
          return GLib.SOURCE_REMOVE;
        });
      }
    };

    // Try immediately
    tryFocus();

    // Also try with a small delay to handle timing issues
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
      tryFocus();
      return GLib.SOURCE_REMOVE;
    });

    return Clutter.EVENT_PROPAGATE;
  });

  // Load icon asynchronously
  const sendIcon = new St.Icon({
    style_class: "system-status-icon",
  });

  GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
    sendIcon.gicon = Gio.icon_new_for_string(
      `${extensionPath}/icons/send-icon.svg`
    );
    return GLib.SOURCE_REMOVE;
  });

  const sendButton = new St.Button({
    child: sendIcon,
  });

  // Only add the input field to the box, the send button will be in the buttons container
  inputFieldBox.add_child(inputField);

  // Connect to the input field's parent to handle focus when it's added to the stage
  inputFieldBox.connect("notify::mapped", () => {
    if (inputFieldBox.mapped) {
      GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
        // Try multiple focus methods to ensure it works
        const tryFocus = () => {
          // Method 1: Try stage focus
          if (Main && Main.global && Main.global.stage) {
            Main.global.stage.set_key_focus(inputField.clutter_text);
          }

          // Method 2: Try direct grab_key_focus
          if (inputField.clutter_text && inputField.clutter_text.grab_key_focus) {
            inputField.clutter_text.grab_key_focus();
          }

          // Method 3: Try focusing parent first, then input field
          const parent = inputField.get_parent();
          if (parent && parent.grab_key_focus) {
            parent.grab_key_focus();
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
              if (inputField.clutter_text && inputField.clutter_text.grab_key_focus) {
                inputField.clutter_text.grab_key_focus();
              }
              return GLib.SOURCE_REMOVE;
            });
          }
        };

        tryFocus();
        return GLib.SOURCE_REMOVE;
      });
    }
  });

  return { inputFieldBox, inputField, sendButton };
}

/**
 * Updates the hint text of an input field based on conversation state
 * @param {St.Entry} inputField - The input field to update
 * @param {boolean} isNewChat - Whether this is a new chat (no history or last message is from user)
 */
export function updateInputFieldHint(inputField, isNewChat) {
  if (inputField) {
    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
      inputField.hint_text = isNewChat
        ? "Start your conversation..."
        : "Your response...";
      return GLib.SOURCE_REMOVE;
    });
  }
}

/**
 * Creates a container for AI responses
 * @param {string} bgColor - Background color for the container
 * @returns {St.BoxLayout} - The created container
 */
export function createResponseContainer(bgColor) {
  const settings = getSettings();
  const opacity = settings.get_double("message-opacity");
  
  // Parse color components for rgba
  const r = parseInt(bgColor.substring(1, 3), 16);
  const g = parseInt(bgColor.substring(3, 5), 16);
  const b = parseInt(bgColor.substring(5, 7), 16);
  
  // Get shadow CSS
  const shadowCss = generateMessageShadowCss();
  
  return new St.BoxLayout({
    style_class: "message-box ai-message",
    style: `background-color: rgba(${r}, ${g}, ${b}, ${opacity}); padding: 14px 18px; margin: 8px 4px; border-radius: 24px 24px 24px 6px; ${shadowCss}`,
    x_align: Clutter.ActorAlign.START,
    vertical: true,
    x_expand: true
  });
}

/**
 * Scrolls a scroll view to the bottom
 * @param {St.ScrollView} scrollView - The scroll view to scroll
 */
export function scrollToBottom(scrollView) {
  if (!scrollView) return;

  // Use idle_add to ensure the scroll happens after the content is added
  GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
    try {
      const {vscroll} = scrollView;
      if (vscroll && vscroll.adjustment) {
        const {adjustment} = vscroll;
        adjustment.value = adjustment.upper - adjustment.page_size;
      }
    } catch (error) {
      console.error(`Error scrolling to bottom: ${error.message}`);
    }
    return GLib.SOURCE_REMOVE;
  });
}

/**
 * Generates CSS for message shadows based on current settings
 * @returns {string} CSS string for box-shadow
 */
function generateMessageShadowCss() {
  const settings = getSettings();
  
  // Try to get the settings, but use fallback values if not available
  let shadowColor, shadowOpacity, shadowBlur, shadowOffsetX, shadowOffsetY;
  
  try {
    shadowColor = settings.get_string("message-shadow-color");
    shadowOpacity = settings.get_double("message-shadow-opacity");
    shadowBlur = settings.get_double("message-shadow-blur");
    shadowOffsetX = settings.get_double("message-shadow-offset-x");
    shadowOffsetY = settings.get_double("message-shadow-offset-y");
  } catch (e) {
    // Fallback to defaults if settings aren't available yet
    shadowColor = "#000000";
    shadowOpacity = 0.5;
    shadowBlur = 8.0;
    shadowOffsetX = 2.0;
    shadowOffsetY = 4.0;
  }
  
  // Parse shadow color components
  let shadowR, shadowG, shadowB;
  if (shadowColor.startsWith("#")) {
    shadowR = parseInt(shadowColor.substring(1, 3), 16);
    shadowG = parseInt(shadowColor.substring(3, 5), 16);
    shadowB = parseInt(shadowColor.substring(5, 7), 16);
  } else {
    // Default to black if parsing fails
    shadowR = 0;
    shadowG = 0;
    shadowB = 0;
  }
  
  return `box-shadow: ${shadowOffsetX}px ${shadowOffsetY}px ${shadowBlur}px rgba(${shadowR}, ${shadowG}, ${shadowB}, ${shadowOpacity});`;
}
