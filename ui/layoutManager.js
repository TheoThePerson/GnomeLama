/**
 * Functions for calculating and applying UI layouts
 */

import * as Main from "resource:///org/gnome/shell/ui/main.js";
import St from "gi://St";
import Clutter from "gi://Clutter";
import { getSettings } from "../lib/settings.js";

/**
 * Calculates dimensions for the panel layout
 * @returns {Object} Object containing calculated dimensions
 */
export function calculatePanelDimensions() {
  const monitor = Main.layoutManager.primaryMonitor;
  const settings = getSettings();

  // Calculate basic dimensions
  const panelWidth =
    monitor.width * settings.get_double("panel-width-fraction");
  const panelHeight = monitor.height - Main.panel.actor.height;
  const topBarHeight =
    panelHeight * settings.get_double("top-bar-height-fraction");
  const inputFieldHeight =
    panelHeight * settings.get_double("input-field-height-fraction");
  const paddingY = panelHeight * settings.get_double("padding-fraction-y");
  const horizontalPadding =
    panelWidth * settings.get_double("padding-fraction-x");

  // Calculate derived dimensions
  const outputHeight =
    panelHeight - inputFieldHeight - topBarHeight - paddingY * 2;
  const sendButtonSize = inputFieldHeight;
  const availableInputWidth =
    panelWidth - sendButtonSize - 3 * horizontalPadding;

  return {
    monitor,
    panelWidth,
    panelHeight,
    paddingY,
    topBarHeight,
    inputFieldHeight,
    outputHeight,
    sendButtonSize,
    horizontalPadding,
    availableInputWidth,
  };
}

/**
 * Updates panel overlay position and size
 * @param {St.Widget} panelOverlay - The panel overlay widget
 */
export function updatePanelOverlay(panelOverlay) {
  const { panelWidth, panelHeight, monitor } = calculatePanelDimensions();
  const settings = getSettings();

  // Update size and position
  panelOverlay.set_size(panelWidth, panelHeight);
  panelOverlay.set_position(
    monitor.width - panelWidth,
    Main.panel.actor.height
  );

  // Get background color and opacity
  const bgColor = settings.get_string("background-color");
  const opacity = settings.get_double("background-opacity");
  const r = parseInt(bgColor.substring(1, 3), 16);
  const g = parseInt(bgColor.substring(3, 5), 16);
  const b = parseInt(bgColor.substring(5, 7), 16);

  // Update style with configurable opacity
  panelOverlay.set_style(
    `background-color: rgba(${r}, ${g}, ${b}, ${opacity}); border-left: 1px solid rgba(255, 255, 255, 0.1);`
  );
}

/**
 * Updates top bar layout
 * @param {St.BoxLayout} topBar - The top bar container
 * @param {St.Button} modelButton - The model selection button
 * @param {St.Button} clearButton - The clear history button
 */
export function updateTopBar(topBar, modelButton, clearButton) {
  const { panelWidth, topBarHeight } = calculatePanelDimensions();
  const settings = getSettings();

  // Set the top bar properties
  topBar.set_style(
    `background-color: ${settings.get_string("top-bar-color")};`
  );
  topBar.set_size(panelWidth, topBarHeight);
  topBar.remove_all_children();

  // Add components to top bar
  topBar.add_child(modelButton);
  topBar.add_child(new St.Widget({ x_expand: true }));
  topBar.add_child(clearButton);

  // Configure model button
  modelButton.set_width(panelWidth * 0.6);
  modelButton.set_height(topBarHeight);

  // Configure clear button
  const clearIconScale = settings.get_double("clear-icon-scale");
  const iconSize = 24 * clearIconScale;

  // Update icon size
  if (clearButton.get_child()) {
    const clearIcon = clearButton.get_child();
    clearIcon.set_size(iconSize, iconSize);
    clearIcon.set_style("margin: 0 auto;");
    clearIcon.set_x_align(Clutter.ActorAlign.CENTER);
    clearIcon.set_y_align(Clutter.ActorAlign.CENTER);
  }

  // Size and align the button
  const clearButtonSize = Math.max(topBarHeight * 0.9, 32);
  clearButton.set_width(clearButtonSize);
  clearButton.set_height(clearButtonSize);
  clearButton.set_style("padding: 0; margin: 0;");
  clearButton.set_x_align(Clutter.ActorAlign.CENTER);
  clearButton.set_y_align(Clutter.ActorAlign.CENTER);
}

/**
 * Updates output area layout
 * @param {St.ScrollView} outputScrollView - The output scroll view
 * @param {St.BoxLayout} outputContainer - The output container
 */
export function updateOutputArea(outputScrollView, outputContainer) {
  const {
    panelWidth,
    outputHeight,
    topBarHeight,
    paddingY,
    horizontalPadding,
  } = calculatePanelDimensions();

  // Configure scroll view
  outputScrollView.set_size(panelWidth, outputHeight);
  outputScrollView.set_position(0, topBarHeight + paddingY);
  outputScrollView.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);

  // Configure content container
  const contentWidth = panelWidth - 2 * horizontalPadding;
  outputContainer.set_style(
    `padding: 0 ${horizontalPadding}px; width: ${contentWidth}px;`
  );
  outputContainer.set_width(contentWidth);
}

/**
 * Updates input area layout
 * @param {St.BoxLayout} inputFieldBox - The input field container
 * @param {St.Entry} inputField - The text input field
 * @param {St.Button} sendButton - The send button
 * @param {St.Icon} sendIcon - The send icon
 */
export function updateInputArea(
  inputFieldBox,
  inputField,
  sendButton,
  sendIcon
) {
  const {
    panelWidth,
    inputFieldHeight,
    outputHeight,
    topBarHeight,
    paddingY,
    horizontalPadding,
    sendButtonSize,
    availableInputWidth,
  } = calculatePanelDimensions();

  // Configure container
  inputFieldBox.set_size(panelWidth, inputFieldHeight);
  inputFieldBox.set_position(0, outputHeight + topBarHeight + paddingY);
  inputFieldBox.set_style(
    `padding-left: ${horizontalPadding}px; padding-right: ${horizontalPadding}px;`
  );
  inputFieldBox.spacing = 8;

  // Configure input field
  inputField.set_style(
    `border-radius: 9999px; width: ${availableInputWidth}px;`
  );

  // Configure send button
  sendButton.set_width(sendButtonSize);
  sendButton.set_height(sendButtonSize);

  // Configure send icon
  sendIcon.icon_size = sendButtonSize;
}
