/**
 * UI element creation functions for panel components
 */

import St from "gi://St";
import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as LayoutManager from "./layoutManager.js";

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
  });

  Main.layoutManager.uiGroup.add_child(panelOverlay);
  return panelOverlay;
}

/**
 * Creates a top bar container
 * @param {object} dimensions - Layout dimensions
 * @returns {St.BoxLayout} - The created top bar
 */
export function createTopBar(dimensions) {
  return new St.BoxLayout({
    style_class: "top-bar",
    width: dimensions.panelWidth,
    height: dimensions.topBarHeight,
    reactive: true,
  });
}

/**
 * Creates a model button with label
 * @param {string} label - Initial button label text
 * @returns {object} - Object containing button and label elements
 */
export function createModelButton(label = "Models ▼") {
  const modelButtonLabel = new St.Label({
    text: label,
    style_class: "model-button-label",
    x_align: Clutter.ActorAlign.START,
    y_align: Clutter.ActorAlign.CENTER,
    x_expand: true,
  });

  const buttonContentBox = new St.BoxLayout({
    style: "padding-left: 12px;",
    x_expand: true,
  });
  buttonContentBox.add_child(modelButtonLabel);

  const modelButton = new St.Button({
    child: buttonContentBox,
    style_class: "model-button",
    x_align: Clutter.ActorAlign.FILL,
  });

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

  const clearIcon = new St.Icon({
    gicon: Gio.icon_new_for_string(`${extensionPath}/icons/trash-icon.svg`),
    style_class: "system-status-icon",
    style: "margin: 0 auto;",
    x_align: Clutter.ActorAlign.CENTER,
    y_align: Clutter.ActorAlign.CENTER,
    width: iconSize,
    height: iconSize,
  });

  const clearButton = new St.Button({
    child: clearIcon,
    style_class: "clear-button",
  });

  return { clearButton, clearIcon };
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
    overlay_scrollbars: true,
    hscrollbar_policy: St.PolicyType.NEVER,
    vscrollbar_policy: St.PolicyType.AUTOMATIC,
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
    })
  );

  outputScrollView.set_child(outputContainer);
  return { outputScrollView, outputContainer };
}

/**
 * Creates an input area with text field and send button
 * @param {string} extensionPath - Path to the extension
 * @returns {object} - Object containing input elements
 */
export function createInputArea(extensionPath) {
  const inputFieldBox = new St.BoxLayout({
    style_class: "input-field-box",
    vertical: false,
  });

  const inputField = new St.Entry({
    hint_text: "Type your message here...",
    can_focus: true,
    style_class: "input-field",
  });

  const sendIcon = new St.Icon({
    gicon: Gio.icon_new_for_string(`${extensionPath}/icons/send-icon.svg`),
    style_class: "system-status-icon",
  });

  const sendButton = new St.Button({
    child: sendIcon,
  });

  inputFieldBox.add_child(inputField);
  inputFieldBox.add_child(sendButton);

  return { inputFieldBox, inputField, sendButton, sendIcon };
}

/**
 * Creates a container for AI responses
 * @param {string} bgColor - Background color for the container
 * @returns {St.BoxLayout} - The created container
 */
export function createResponseContainer(bgColor) {
  return new St.BoxLayout({
    style_class: "message-box ai-message",
    style: `background-color: ${bgColor}; padding: 14px 18px; margin: 8px 4px; border-radius: 16px 16px 16px 6px;`,
    x_align: Clutter.ActorAlign.START,
    vertical: true,
    x_expand: true,
  });
}

/**
 * Scrolls a scroll view to the bottom
 * @param {St.ScrollView} scrollView - The scroll view to scroll
 */
export function scrollToBottom(scrollView) {
  const vscroll = scrollView.get_vscroll_bar();
  const adjustment = vscroll.get_adjustment();

  if (adjustment && adjustment.upper) {
    // In newer GNOME Shell versions, upper is a property not a method
    vscroll.set_value(adjustment.upper - adjustment.page_size);
  } else if (adjustment && typeof adjustment.get_upper === "function") {
    // For older GNOME Shell versions that use methods
    vscroll.set_value(adjustment.get_upper() - adjustment.get_page_size());
  }
}
