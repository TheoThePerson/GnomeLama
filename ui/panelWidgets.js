/**
 * UI element creation functions for panel components
 */

import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import St from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

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
        try {
          Main.layoutManager.uiGroup.add_child(panelOverlay);
        } catch {
          // Silent error in production
        }
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
  const vscroll = outputScrollView.get_vscroll_bar();
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
  return new St.BoxLayout({
    style_class: "message-box ai-message",
    style: `background-color: ${bgColor}; padding: 14px 18px; margin: 8px 4px; border-radius: 24px 24px 24px 6px;`,
    x_align: Clutter.ActorAlign.START,
    vertical: true,
    x_expand: true,
    pack_start: false,
  });
}

/**
 * Scrolls a scroll view to the bottom
 * @param {St.ScrollView} scrollView - The scroll view to scroll
 */
export function scrollToBottom(scrollView) {
  GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
    const { adjustment } = scrollView.vscroll;
    if (adjustment) {
      const targetValue = adjustment.upper - adjustment.page_size;
      // Use smooth animation when scrolling
      adjustment.ease(targetValue, {
        duration: 250,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
      });
    }
    return GLib.SOURCE_REMOVE;
  });
}
