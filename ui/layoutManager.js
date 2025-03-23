/**
 * Functions for calculating and applying UI layouts
 */

import * as Main from "resource:///org/gnome/shell/ui/main.js";
import St from "gi://St";
import Clutter from "gi://Clutter";
import { getSettings } from "../lib/settings.js";

// Cache calculated dimensions to avoid recalculation
let cachedDimensions = null;
let lastMonitorWidth = 0;
let lastMonitorHeight = 0;

/**
 * Calculates dimensions for the panel layout
 * @returns {Object} Object containing calculated dimensions
 */
export function calculatePanelDimensions() {
  const monitor = Main.layoutManager.primaryMonitor;
  const settings = getSettings();

  // Return cached dimensions if monitor size hasn't changed
  if (
    cachedDimensions &&
    monitor.width === lastMonitorWidth &&
    monitor.height === lastMonitorHeight
  ) {
    return cachedDimensions;
  }

  // Store current monitor dimensions
  lastMonitorWidth = monitor.width;
  lastMonitorHeight = monitor.height;

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

  // Cache the calculated dimensions
  cachedDimensions = {
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

  return cachedDimensions;
}

/**
 * Updates panel overlay position and size
 * @param {St.Widget} panelOverlay - The panel overlay widget
 */
export function updatePanelOverlay(panelOverlay) {
  const { panelWidth, panelHeight, monitor } = calculatePanelDimensions();
  const settings = getSettings();

  // Set size and position
  panelOverlay.set_size(panelWidth, panelHeight);
  panelOverlay.set_position(
    monitor.width - panelWidth,
    Main.panel.actor.height
  );

  // Apply background color with fixed opacity (fully opaque)
  const bgColor = settings.get_string("background-color");

  // Parse color components once
  const r = parseInt(bgColor.substring(1, 3), 16);
  const g = parseInt(bgColor.substring(3, 5), 16);
  const b = parseInt(bgColor.substring(5, 7), 16);

  panelOverlay.set_style(
    `background-color: rgba(${r}, ${g}, ${b}, 1.0); border-left: 1px solid rgba(255, 255, 255, 0.1);`
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

  // Position container
  buttonsBox.set_size(panelWidth - horizontalPadding * 2, buttonsHeight);
  buttonsBox.set_position(
    horizontalPadding,
    panelHeight - buttonsHeight - horizontalPadding
  );

  // Configure model button
  modelButton.set_width(panelWidth * 0.6);
  modelButton.set_height(buttonsHeight);
  modelButton.set_y_align(Clutter.ActorAlign.CENTER);

  // Calculate icon and button sizes once
  const buttonIconScale = settings.get_double("button-icon-scale");
  const iconSize = Math.round(24 * buttonIconScale);
  const buttonSize = Math.max(Math.round(buttonsHeight * 0.9), 32);

  // Common button style
  const buttonStyle = "padding: 0; margin: 0;";
  const buttonProps = {
    width: buttonSize,
    height: buttonSize,
    style: buttonStyle,
    x_align: Clutter.ActorAlign.CENTER,
    y_align: Clutter.ActorAlign.CENTER,
  };

  // Common icon style and properties
  const iconStyle = "margin: 0 auto;";
  const iconProps = {
    size: iconSize,
    style: iconStyle,
    x_align: Clutter.ActorAlign.CENTER,
    y_align: Clutter.ActorAlign.CENTER,
  };

  // Update clear button and its icon
  if (clearButton.get_child()) {
    const clearIcon = clearButton.get_child();
    clearIcon.set_size(iconProps.size, iconProps.size);
    clearIcon.set_style(iconProps.style);
    clearIcon.set_x_align(iconProps.x_align);
    clearIcon.set_y_align(iconProps.y_align);
  }

  clearButton.set_width(buttonProps.width);
  clearButton.set_height(buttonProps.height);
  clearButton.set_style(buttonProps.style);
  clearButton.set_x_align(buttonProps.x_align);
  clearButton.set_y_align(buttonProps.y_align);

  // Update file button and its icon
  if (fileButton && fileButton.get_child()) {
    const fileIcon = fileButton.get_child();
    fileIcon.set_size(iconProps.size, iconProps.size);
    fileIcon.set_style(iconProps.style);
    fileIcon.set_x_align(iconProps.x_align);
    fileIcon.set_y_align(iconProps.y_align);
  }

  if (fileButton) {
    fileButton.set_width(buttonProps.width);
    fileButton.set_height(buttonProps.height);
    fileButton.set_style(buttonProps.style);
    fileButton.set_x_align(buttonProps.x_align);
    fileButton.set_y_align(buttonProps.y_align);
  }
}

/**
 * Updates output area layout
 * @param {St.ScrollView} outputScrollView - The output scroll view
 * @param {St.BoxLayout} outputContainer - The output container
 */
export function updateOutputArea(outputScrollView, outputContainer) {
  const { panelWidth, paddingY } = calculatePanelDimensions();

  // Update width and position
  outputScrollView.set_width(panelWidth);
  outputScrollView.set_position(0, paddingY);

  // Set container padding proportional to panel width
  const containerPadding = Math.round(panelWidth * 0.03);
  outputContainer.set_style(`padding: 0 ${containerPadding}px;`);

  // Ensure the output area adapts to content
  outputContainer.set_y_expand(true);
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
  } = calculatePanelDimensions();

  // Calculate base container height
  let baseContainerHeight = inputFieldHeight + buttonsHeight + paddingY;
  let fileBoxHeight = 0;

  // Find file boxes container
  const fileBoxesContainer = inputButtonsContainer
    .get_children()
    .find(
      (child) =>
        child.style_class && child.style_class.includes("file-boxes-container")
    );

  // Calculate file box container height if it exists
  if (fileBoxesContainer && fileBoxesContainer.get_n_children() > 0) {
    fileBoxHeight = fileBoxesContainer.get_height();

    // Limit file box height if needed
    const maxContainerHeight = panelHeight * 0.6;
    const totalHeight = baseContainerHeight + fileBoxHeight;

    if (totalHeight > maxContainerHeight) {
      // Adjust file box container height and enable scrolling
      const availableFileBoxHeight = maxContainerHeight - baseContainerHeight;
      fileBoxHeight = availableFileBoxHeight;
      fileBoxesContainer.set_height(availableFileBoxHeight);
      fileBoxesContainer.set_style("overflow-y: auto;");
    } else {
      fileBoxesContainer.set_style("overflow-y: visible;");
    }

    fileBoxesContainer.set_position(0, 0);
    fileBoxesContainer.show();
  }

  // Calculate total container height
  const containerHeight = baseContainerHeight + fileBoxHeight;

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

  // Apply styling
  inputButtonsContainer.set_style(`
    background-color: rgba(80, 80, 80, 0.2);
    border-radius: 16px 16px 0 0;
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

  // Position and size input field box
  inputFieldBox.set_size(availableInputWidth, inputFieldHeight);
  inputFieldBox.set_position(
    horizontalPadding,
    panelHeight - inputFieldHeight - horizontalPadding * 2
  );

  // Configure input field
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

  // Update send button icon
  if (sendButton.get_child()) {
    const sendButtonIconScale = settings.get_double("send-button-icon-scale");
    const sendIconSize = 24 * sendButtonIconScale;
    const sendIcon = sendButton.get_child();
    sendIcon.set_size(sendIconSize, sendIconSize);
  }
}
