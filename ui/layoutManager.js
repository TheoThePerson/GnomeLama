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
  const inputFieldHeight =
    panelHeight * settings.get_double("input-field-height-fraction");
  const paddingY = panelHeight * settings.get_double("padding-fraction-y");
  const horizontalPadding =
    panelWidth * settings.get_double("padding-fraction-x");

  // Calculate derived dimensions
  const outputHeight = panelHeight - inputFieldHeight - paddingY * 2;
  const sendButtonSize = inputFieldHeight;
  const availableInputWidth = panelWidth - horizontalPadding * 2.5;
  const buttonsHeight = inputFieldHeight * 0.8;

  return {
    monitor,
    panelWidth,
    panelHeight,
    paddingY,
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
 * @param {St.Button} fileButton - The file button
 */
export function updateButtonsContainer(
  buttonsBox,
  modelButton,
  clearButton,
  fileButton
) {
  const { panelWidth, buttonsHeight, panelHeight, horizontalPadding } =
    calculatePanelDimensions();
  const settings = getSettings();

  // Position at the bottom of the panel with padding from input field
  buttonsBox.set_size(panelWidth - horizontalPadding * 2, buttonsHeight);
  buttonsBox.set_position(
    horizontalPadding,
    panelHeight - buttonsHeight - horizontalPadding
  );

  // Configure model button
  modelButton.set_width(panelWidth * 0.6);
  modelButton.set_height(buttonsHeight);
  modelButton.set_y_align(Clutter.ActorAlign.CENTER);

  // Calculate consistent icon and button sizes
  const buttonIconScale = settings.get_double("button-icon-scale");
  const iconSize = Math.round(24 * buttonIconScale);
  const buttonSize = Math.max(Math.round(buttonsHeight * 0.9), 32);

  // Update clear button icon size
  if (clearButton.get_child()) {
    const clearIcon = clearButton.get_child();
    clearIcon.set_size(iconSize, iconSize);
    clearIcon.set_style("margin: 0 auto;");
    clearIcon.set_x_align(Clutter.ActorAlign.CENTER);
    clearIcon.set_y_align(Clutter.ActorAlign.CENTER);
  }

  // Update file button icon size
  if (fileButton && fileButton.get_child()) {
    const fileIcon = fileButton.get_child();
    fileIcon.set_size(iconSize, iconSize);
    fileIcon.set_style("margin: 0 auto;");
    fileIcon.set_x_align(Clutter.ActorAlign.CENTER);
    fileIcon.set_y_align(Clutter.ActorAlign.CENTER);
  }

  // Size and align the buttons
  clearButton.set_width(buttonSize);
  clearButton.set_height(buttonSize);
  clearButton.set_style("padding: 0; margin: 0;");
  clearButton.set_x_align(Clutter.ActorAlign.CENTER);
  clearButton.set_y_align(Clutter.ActorAlign.CENTER);

  if (fileButton) {
    fileButton.set_width(buttonSize);
    fileButton.set_height(buttonSize);
    fileButton.set_style("padding: 0; margin: 0;");
    fileButton.set_x_align(Clutter.ActorAlign.CENTER);
    fileButton.set_y_align(Clutter.ActorAlign.CENTER);
  }
}

/**
 * Updates output area layout
 * @param {St.ScrollView} outputScrollView - The output scroll view
 * @param {St.BoxLayout} outputContainer - The output container
 */
export function updateOutputArea(outputScrollView, outputContainer) {
  const { panelWidth, outputHeight, paddingY } = calculatePanelDimensions();

  // Only update width - height will be managed dynamically based on available space
  outputScrollView.set_width(panelWidth);

  // Position at the top of the panel with padding
  outputScrollView.set_position(0, paddingY);

  // Set appropriate padding for the output container
  outputContainer.set_style(`padding: 0 ${Math.round(panelWidth * 0.03)}px;`);

  // Ensure the output area adapts to content
  outputContainer.set_y_expand(true);

  // Ensure scroll view policy is set correctly
  outputScrollView.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
}

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
    outputHeight,
  } = calculatePanelDimensions();

  // Base container size without files
  let baseContainerHeight = inputFieldHeight + buttonsHeight + paddingY;
  let fileBoxHeight = 0;

  // Check if file boxes container exists and has children
  const fileBoxesContainer = inputButtonsContainer
    .get_children()
    .find(
      (child) =>
        child.style_class && child.style_class.includes("file-boxes-container")
    );

  // Only consider the file box container if it exists and has content
  if (fileBoxesContainer && fileBoxesContainer.get_n_children() > 0) {
    // Get the file box container's height
    fileBoxHeight = fileBoxesContainer.get_height();

    // Ensure we're not overtaking more than 60% of panel height
    const maxContainerHeight = panelHeight * 0.6;
    const totalHeight = baseContainerHeight + fileBoxHeight;

    if (totalHeight > maxContainerHeight) {
      // Limit file box height while preserving input and buttons at fixed position
      const availableFileBoxHeight = maxContainerHeight - baseContainerHeight;
      fileBoxHeight = availableFileBoxHeight;
      fileBoxesContainer.set_height(availableFileBoxHeight);

      // Ensure we show scrollbars when content is clipped
      fileBoxesContainer.set_style("overflow-y: auto;");
    }
  }

  // Calculate total container height
  let containerHeight = baseContainerHeight + fileBoxHeight;

  // Update output scrollview height based on remaining space
  const remainingHeight = panelHeight - containerHeight - paddingY * 2;
  if (
    inputButtonsContainer.userData &&
    inputButtonsContainer.userData.outputScrollView
  ) {
    const outputScrollView = inputButtonsContainer.userData.outputScrollView;
    outputScrollView.set_height(remainingHeight);
  }

  // Set container size and position
  inputButtonsContainer.set_height(containerHeight);
  inputButtonsContainer.set_position(
    horizontalPadding,
    panelHeight - containerHeight
  );
  inputButtonsContainer.set_size(
    panelWidth - horizontalPadding * 2,
    containerHeight
  );

  // Set file box container to fixed position at the top of input container
  if (fileBoxesContainer && fileBoxesContainer.get_n_children() > 0) {
    fileBoxesContainer.set_position(0, 0);
  }

  // Apply styling with higher z-index to keep it on top
  inputButtonsContainer.set_style(`
    background-color: rgba(80, 80, 80, 0.2);
    border-radius: 16px 16px 0 0; /* Rounded only at the top */
    padding: 6px;
    z-index: 100;
  `);
}

/**
 * Updates input area layout
 * @param {St.BoxLayout} inputFieldBox - The input field container
 * @param {St.Entry} inputField - The text input field
 * @param {St.Button} sendButton - The send button
 */
export function updateInputArea(inputFieldBox, inputField, sendButton) {
  const {
    panelWidth,
    panelHeight,
    inputFieldHeight,
    horizontalPadding,
    availableInputWidth,
    sendButtonSize,
  } = calculatePanelDimensions();
  const settings = getSettings();

  // Position the input field box
  inputFieldBox.set_size(availableInputWidth, inputFieldHeight);
  inputFieldBox.set_position(
    horizontalPadding,
    panelHeight - inputFieldHeight - horizontalPadding * 2
  );

  // Configure input field with transparent background
  inputField.set_width(availableInputWidth);
  inputField.set_height(inputFieldHeight);
  inputField.set_style(
    "background-color: transparent; border: none; caret-color: white; color: white;"
  );

  // Configure send button
  sendButton.set_size(sendButtonSize, sendButtonSize);
  sendButton.set_position(
    panelWidth - sendButtonSize - horizontalPadding,
    panelHeight - sendButtonSize - horizontalPadding * 2
  );

  // If the button has a child (the icon), configure it
  if (sendButton.get_child()) {
    const sendButtonIconScale = settings.get_double("send-button-icon-scale");
    const sendIconSize = 24 * sendButtonIconScale;

    const sendIcon = sendButton.get_child();
    sendIcon.set_size(sendIconSize, sendIconSize);
  }
}
