/**
 * Functions for calculating and applying UI layouts
 */

import * as Main from "resource:///org/gnome/shell/ui/main.js";
import St from "gi://St";
import { PanelConfig } from "./config.js";

/**
 * Calculates dimensions for the panel layout
 * @returns {Object} Object containing calculated dimensions
 */
export function calculatePanelDimensions() {
  const monitor = Main.layoutManager.primaryMonitor;
  const panelWidth = monitor.width * PanelConfig.panelWidthFraction;
  const panelHeight = monitor.height - Main.panel.actor.height;
  const paddingY = panelHeight * PanelConfig.paddingFractionY;
  const topBarHeight = panelHeight * PanelConfig.topBarHeightFraction;
  const inputFieldHeight = panelHeight * PanelConfig.inputFieldHeightFraction;
  const outputHeight =
    panelHeight - inputFieldHeight - topBarHeight - paddingY * 2;
  const inputButtonSpacing =
    panelWidth * PanelConfig.inputButtonSpacingFraction;
  const sendButtonSize = inputFieldHeight;
  const horizontalPadding = panelWidth * PanelConfig.paddingFractionX;
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
    inputButtonSpacing,
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

  panelOverlay.set_size(panelWidth, panelHeight);
  panelOverlay.set_position(
    monitor.width - panelWidth,
    Main.panel.actor.height
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

  let clearButtonWidth = 50;
  clearButton.set_width(clearButtonWidth);
  clearButton.set_height(topBarHeight);
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

  inputFieldBox.set_size(panelWidth, inputFieldHeight);
  inputFieldBox.set_position(0, outputHeight + topBarHeight + paddingY);
  inputFieldBox.set_style(
    `padding-left: ${horizontalPadding}px; padding-right: ${horizontalPadding}px;`
  );
  inputFieldBox.spacing = horizontalPadding;

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
