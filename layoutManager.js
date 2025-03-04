/**
 * Functions for calculating and applying UI layouts
 */

import * as Main from "resource:///org/gnome/shell/ui/main.js";
import St from "gi://St";
import { getSettings } from "./settings.js";
import Clutter from "gi://Clutter";

/**
 * Calculates dimensions for the panel layout
 * @returns {Object} Object containing calculated dimensions
 */
export function calculatePanelDimensions() {
  const monitor = Main.layoutManager.primaryMonitor;
  const settings = getSettings();
  const panelWidth =
    monitor.width * settings.get_double("panel-width-fraction");
  const panelHeight = monitor.height - Main.panel.actor.height;
  const paddingY = panelHeight * settings.get_double("padding-fraction-y");
  const topBarHeight =
    panelHeight * settings.get_double("top-bar-height-fraction");
  const inputFieldHeight =
    panelHeight * settings.get_double("input-field-height-fraction");
  const outputHeight =
    panelHeight - inputFieldHeight - topBarHeight - paddingY * 2;
  const sendButtonSize = inputFieldHeight;
  const horizontalPadding =
    panelWidth * settings.get_double("padding-fraction-x");
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

  panelOverlay.set_size(panelWidth, panelHeight);
  panelOverlay.set_position(
    monitor.width - panelWidth,
    Main.panel.actor.height
  );

  panelOverlay.set_style(
    `background-color: ${settings.get_string("background-color")};`
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

  // Set the top bar color
  topBar.set_style(
    `background-color: ${settings.get_string("top-bar-color")};`
  );
  topBar.set_size(panelWidth, topBarHeight);
  topBar.remove_all_children();

  // Add components to top bar
  topBar.add_child(modelButton);
  topBar.add_child(new St.Widget({ x_expand: true }));
  topBar.add_child(clearButton);

  // Set sizes
  let modelButtonWidth = panelWidth * 0.6;
  modelButton.set_width(modelButtonWidth);
  modelButton.set_height(topBarHeight);

  // Calculate clear button size based on clear-icon-scale
  const clearIconScale = settings.get_double("clear-icon-scale");
  const baseSize = 24; // Base size for the icon
  const iconSize = baseSize * clearIconScale;

  // Update the clear button icon size
  if (clearButton.get_child()) {
    const clearIcon = clearButton.get_child();
    clearIcon.set_size(iconSize, iconSize);

    // Ensure the icon stays centered
    clearIcon.set_style("margin: 0 auto;");
    clearIcon.set_x_align(Clutter.ActorAlign.CENTER);
    clearIcon.set_y_align(Clutter.ActorAlign.CENTER);
  }

  // Keep a fixed button size but center the icon
  const clearButtonSize = Math.max(topBarHeight * 0.9, 32); // Fixed size for button
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

  outputScrollView.set_size(panelWidth, outputHeight);
  outputScrollView.set_position(0, topBarHeight + paddingY);

  outputContainer.set_style(`padding: 0 ${horizontalPadding}px;`);
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

  // Position and size the container
  inputFieldBox.set_size(panelWidth, inputFieldHeight);
  inputFieldBox.set_position(0, outputHeight + topBarHeight + paddingY);
  inputFieldBox.set_style(
    `padding-left: ${horizontalPadding}px; padding-right: ${horizontalPadding}px;`
  );

  // Use a fixed value for spacing instead of the setting
  inputFieldBox.spacing = 8; // Fixed spacing of 8px

  // Update input field
  inputField.set_style(
    `border-radius: 9999px; width: ${availableInputWidth}px;`
  );

  // Update send button
  sendButton.set_width(sendButtonSize);
  sendButton.set_height(sendButtonSize);

  // Update send icon
  sendIcon.icon_size = sendButtonSize;
}
