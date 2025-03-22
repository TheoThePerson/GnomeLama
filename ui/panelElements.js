/**
 * UI element creation functions for panel components
 */

import St from "gi://St";
import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as LayoutManager from "./layoutManager.js";
import { getSettings } from "../lib/settings.js";

// Cache for loaded icons to prevent reloading
const iconCache = new Map();

/**
 * Loads an icon from path with caching
 * @param {string} path - Path to the icon file
 * @returns {Gio.Icon} The loaded icon
 */
function loadCachedIcon(path) {
  if (!iconCache.has(path)) {
    try {
      iconCache.set(path, Gio.icon_new_for_string(path));
    } catch (error) {
      console.error(`Error loading icon from ${path}:`, error);
      return Gio.ThemedIcon.new("dialog-error-symbolic");
    }
  }
  return iconCache.get(path);
}

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

  // Force hardware acceleration
  panelOverlay.set_offscreen_redirect(Clutter.OffscreenRedirect.ALWAYS);

  // Add to UI group on next idle cycle
  GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
    try {
      Main.layoutManager.uiGroup.add_child(panelOverlay);
    } catch (error) {
      console.error("Error adding panel overlay to UI group:", error);
    }
    return GLib.SOURCE_REMOVE;
  });

  return panelOverlay;
}

/**
 * Creates an icon-based button with standardized styling
 * @param {string} iconPath - Path to the icon
 * @param {string} styleClass - CSS class for the button
 * @param {number} iconScale - Scale factor for the icon
 * @returns {object} - Object containing button and icon elements
 */
function createIconButton(iconPath, styleClass, iconScale = 1.0) {
  const iconSize = 24 * iconScale;

  // Create icon
  const icon = new St.Icon({
    style_class: "system-status-icon",
    style: "margin: 0 auto;",
    x_align: Clutter.ActorAlign.CENTER,
    y_align: Clutter.ActorAlign.CENTER,
    width: iconSize,
    height: iconSize,
    gicon: loadCachedIcon(iconPath),
  });

  // Create button with icon
  const button = new St.Button({
    child: icon,
    style_class: styleClass,
  });

  return { button, icon };
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
  const { button: clearButton, icon: clearIcon } = createIconButton(
    `${extensionPath}/icons/trash-icon.svg`,
    "clear-button",
    iconScale
  );

  return { clearButton, clearIcon };
}

/**
 * Creates a file selection button with file icon
 * @param {string} extensionPath - Path to the extension
 * @param {number} iconScale - Scale factor for the icon
 * @returns {object} - Object containing button and icon elements
 */
export function createFileButton(extensionPath, iconScale = 1.0) {
  const { button: fileButton, icon: fileIcon } = createIconButton(
    `${extensionPath}/icons/file-icon.svg`,
    "file-button",
    iconScale
  );

  return { fileButton, fileIcon };
}

// Debounce function for scroll handling
function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
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
    const adjustment = vscroll.adjustment;
    if (adjustment) {
      // Debounced scroll handler for better performance
      const debouncedRedraw = debounce(() => {
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
          outputScrollView.queue_redraw();
          vscroll.queue_redraw();
          return GLib.SOURCE_REMOVE;
        });
      }, 16); // ~60fps

      adjustment.connect("notify::value", debouncedRedraw);
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
        try {
          outputScrollView.queue_redraw();
          if (vscroll) {
            vscroll.queue_redraw();
          }
        } catch (error) {
          console.error("Error during scroll redraw:", error);
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

  // Set content box for scroll view
  try {
    outputScrollView.set_child(outputContainer);
  } catch (error) {
    console.error("Error setting scroll view child:", error);

    // Try again with delay
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
      try {
        outputScrollView.set_child(outputContainer);
      } catch (retryError) {
        console.error(
          "Error during retry of setting scroll view child:",
          retryError
        );
      }
      return GLib.SOURCE_REMOVE;
    });
  }

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

  // Create send button with icon
  const { button: sendButton, icon: sendIcon } = createIconButton(
    `${extensionPath}/icons/send-icon.svg`,
    "send-button",
    1.0
  );

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
      try {
        inputField.hint_text = isNewChat
          ? "Start your conversation..."
          : "Your response...";
      } catch (error) {
        console.error("Error updating input field hint:", error);
      }
      return GLib.SOURCE_REMOVE;
    });
  }
}

/**
 * Creates a message container with unified styling
 * @param {string} [bgColor] - Background color for the container
 * @param {boolean} [isUser=false] - Whether this is a user message
 * @param {Clutter.ActorAlign} [alignment=Clutter.ActorAlign.START] - Container alignment
 * @returns {St.BoxLayout} - The created container
 */
export function createMessageContainer(
  bgColor,
  isUser = false,
  alignment = Clutter.ActorAlign.START
) {
  // If no bgColor provided, get from settings
  if (!bgColor) {
    const settings = getSettings();
    bgColor = isUser
      ? settings.get_string("user-message-color")
      : settings.get_string("ai-message-color");
  }

  return new St.BoxLayout({
    style_class: isUser ? "message-box user-message" : "message-box ai-message",
    style: `background-color: ${bgColor}; padding: 14px 18px; margin: 8px 4px; border-radius: ${
      isUser ? "24px 24px 6px 24px" : "24px 24px 24px 6px"
    };`,
    x_align: alignment,
    vertical: true,
    x_expand: true,
    pack_start: false,
  });
}

/**
 * Creates a container for AI responses (convenience function)
 * @param {string} [bgColor] - Background color for the container
 * @returns {St.BoxLayout} - The created container
 */
export function createResponseContainer(bgColor) {
  return createMessageContainer(bgColor, false, Clutter.ActorAlign.START);
}

/**
 * Scrolls the provided scrollView to the bottom
 * @param {St.ScrollView} scrollView - The scroll view to scroll
 */
export function scrollToBottom(scrollView) {
  if (!scrollView) return;

  GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
    try {
      const adjustment = scrollView.vscroll.adjustment;
      if (adjustment) {
        const targetValue = adjustment.upper - adjustment.page_size;
        // Use smooth animation when scrolling
        adjustment.ease(targetValue, {
          duration: 250,
          mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
      }
    } catch (error) {
      console.error("Error scrolling to bottom:", error);
    }
    return GLib.SOURCE_REMOVE;
  });
}

/**
 * Clears the UI element caches
 * Call when unloading the extension to free memory
 */
export function clearCaches() {
  iconCache.clear();
}
