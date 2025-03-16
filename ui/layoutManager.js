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
    panelWidth - sendButtonSize / 2 - 3 * horizontalPadding;
  const buttonsHeight = topBarHeight;

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
    buttonsHeight,
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
 * Updates buttons container layout
 * @param {St.BoxLayout} buttonsBox - The buttons container
 * @param {St.Button} modelButton - The model selection button
 * @param {St.Button} clearButton - The clear history button
 */
export function updateButtonsContainer(buttonsBox, modelButton, clearButton) {
  const {
    panelWidth,
    buttonsHeight,
    panelHeight,
    inputFieldHeight,
    horizontalPadding,
  } = calculatePanelDimensions();

  // Position at the bottom of the panel
  buttonsBox.set_size(panelWidth - horizontalPadding * 2, buttonsHeight);
  buttonsBox.set_position(
    horizontalPadding,
    panelHeight - buttonsHeight - horizontalPadding
  );

  // Configure model button
  modelButton.set_width(panelWidth * 0.6);
  modelButton.set_height(buttonsHeight);

  // Configure clear button
  const settings = getSettings();
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
  const clearButtonSize = Math.max(buttonsHeight * 0.9, 32);
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
  const { panelWidth, outputHeight, paddingY, horizontalPadding } =
    calculatePanelDimensions();

  // Configure scroll view - now positioned below padding
  outputScrollView.set_size(panelWidth, outputHeight);
  outputScrollView.set_position(0, paddingY);
  outputScrollView.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);

  // Configure content container
  const contentWidth = panelWidth - 2 * horizontalPadding;
  outputContainer.set_style(
    `padding: 0 ${horizontalPadding}px; width: ${contentWidth}px;`
  );
  outputContainer.set_width(contentWidth);
}

/**
 * Updates the input-buttons container position
 * @param {St.BoxLayout} inputButtonsContainer - The container for input field and buttons
 */
/**
 * Updates the input-buttons container position
 * @param {St.BoxLayout} inputButtonsContainer - The container for input field and buttons
 */
export function updateInputButtonsContainer(inputButtonsContainer) {
  const {
    panelWidth,
    panelHeight,
    inputFieldHeight,
    horizontalPadding,
    buttonsHeight,
    paddingY,
  } = calculatePanelDimensions();

  // The container should go all the way to the bottom of the screen
  // Add extra space for gap between input and buttons (16px)
  const containerHeight = inputFieldHeight + buttonsHeight + paddingY;

  // Position at the bottom with only horizontal padding
  inputButtonsContainer.set_position(
    horizontalPadding,
    panelHeight - containerHeight
  );

  // Set the width to span most of the panel with padding on both sides
  inputButtonsContainer.set_size(
    panelWidth - horizontalPadding * 2,
    containerHeight
  );

  // Apply rounded lighter grey container styling to the entire input+buttons area
  inputButtonsContainer.set_style(`
    background-color: rgba(80, 80, 80, 0.5);
    border-radius: 16px 16px 0 0; /* Rounded only at the top */
    padding: 6px;
  `);
}
/**
 * Updates input area layout
 * @param {St.BoxLayout} inputFieldBox - The input field container
 * @param {St.Entry} inputField - The text input field
 * @param {St.Button} sendButton - The send button
 * @param {St.Icon} sendIcon - The send icon
 */
/**
 * Updates input area layout
 * @param {St.BoxLayout} inputFieldBox - The input field container
 * @param {St.Entry} inputField - The text input field
 * @param {St.Button} sendButton - The send button
 * @param {St.Icon} sendIcon - The send icon
 */
export function updateInputArea(inputFieldBox, inputField) {
  const {
    availableInputWidth,
    sendButtonSize,
    inputFieldHeight,
    panelWidth,
    horizontalPadding,
  } = calculatePanelDimensions();

  // Set proper alignment for the input field box
  inputFieldBox.set_style(`
    padding: 0;
    height: ${inputFieldHeight}px;
  `);

  // Center the input field box horizontally
  inputFieldBox.set_x_align(Clutter.ActorAlign.CENTER);
  inputFieldBox.set_y_align(Clutter.ActorAlign.CENTER);
  inputFieldBox.spacing = 8;

  // Calculate remaining space to ensure proper centering
  const totalContentWidth = availableInputWidth + sendButtonSize + 8; // width + button + spacing
  const leftPadding = Math.max(
    0,
    (panelWidth - 2 * horizontalPadding - totalContentWidth) / 2
  );

  // Add padding to the left side to center the content if needed
  if (leftPadding > 0) {
    inputFieldBox.set_style(`
      padding: 0 0 0 ${leftPadding}px;
      height: ${inputFieldHeight}px;
    `);
  }

  // Configure input field with proper centering
  inputField.set_style(`
    background-color: transparent;
    border: none;
    width: ${availableInputWidth}px;
  `);

  // Ensure the input field's height is properly set
  inputField.set_height(-1); // Let it use natural height
}
