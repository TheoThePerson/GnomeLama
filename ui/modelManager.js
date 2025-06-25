/**
 * Model manager functionality for the panel UI
 */
import Clutter from "gi://Clutter";
import St from "gi://St";
import GLib from "gi://GLib";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";

// Import from services
import { fetchModelNames, setModel } from "../services/messaging.js";
import { getPopupManager } from "./popupManager.js";

export class ModelManager {
  constructor(
    settingsOrOptions,
    outputContainer,
    stopAiMessageCallback,
    inputButtonsContainer,
    visualContainerManager = null
  ) {
    // Handle both old and new constructor signatures
    if (typeof settingsOrOptions === 'object' && settingsOrOptions.settings) {
      // New signature with options object
      const { settings, outputContainer: oc, stopAiMessageCallback: cb, inputButtonsContainer: ic, visualContainerManager: vcm } = settingsOrOptions;
      this._settings = settings;
      this._outputContainer = oc;
      this._stopAiMessageCallback = cb;
      this._inputButtonsContainer = ic;
      this._visualContainerManager = vcm;
    } else {
      // Legacy signature
      this._settings = settingsOrOptions;
      this._outputContainer = outputContainer;
      this._stopAiMessageCallback = stopAiMessageCallback;
      this._inputButtonsContainer = inputButtonsContainer;
      this._visualContainerManager = visualContainerManager;
    }

    this._modelMenu = null;
    this._modelButton = null;
    this._modelButtonLabel = null;
    this._stageEventId = null;
    
    // Get the popup manager
    this._popupManager = getPopupManager();
  }

  createModelButton() {
    const modelButton = new St.Button({
      style_class: "model-button",
      style: "padding: 0px; height: 32px;",
      can_focus: true,
    });

    const modelButtonLabel = new St.Label({
      text: "Loading...",
      style_class: "model-button-label",
      style: "color: #808080; padding: 8px;", // do not question the values. these are the only ones that seem to work
      y_align: Clutter.ActorAlign.CENTER,
      x_align: Clutter.ActorAlign.START,
      x_expand: true,
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

    this._modelButton = modelButton;
    this._modelButtonLabel = modelButtonLabel;

    this._setupModelMenu();
    this._modelButton.connect("button-press-event", () => {
      // Notify popup manager before opening
      if (this._popupManager.notifyOpen('model')) {
        this._modelMenu.toggle();
      }
      return Clutter.EVENT_STOP;
    });

    return { modelButton, modelButtonLabel };
  }

  async _setupModelMenu() {
    this._modelMenu = new PopupMenu.PopupMenu(
      new St.Button(),
      0.0,
      St.Side.BOTTOM
    );
    Main.uiGroup.add_child(this._modelMenu.actor);
    this._modelMenu.actor.hide();

    // Apply CSS class to the menu actor
    this._modelMenu.actor.add_style_class_name("model-menu-popup");

    // Add CSS class to the menu box
    if (this._modelMenu.box) {
      this._modelMenu.box.add_style_class_name("model-menu-box");
    }

    // Apply the styling
    this._applyModelMenuStyling();

    this._modelMenu.connect("open-state-changed", (menu, isOpen) => {
      if (isOpen) {
        // Notify popup manager when opening
        this._popupManager.notifyOpen('model');
        this._positionModelMenu();
        
        // Apply styling after positioning to ensure accurate shadow detection
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
          this._applyModelMenuStyling();
          return GLib.SOURCE_REMOVE;
        });
      }
    });

    // Connect to global stage for detecting outside clicks
    this._stageEventId = global.stage.connect(
      "button-press-event",
      (actor, event) => {
        if (this._modelMenu && this._modelMenu.isOpen) {
          const [x, y] = event.get_coords();
          const menuActor = this._modelMenu.actor || this._modelMenu;
          const [menuX, menuY] = menuActor.get_transformed_position();
          const [menuWidth, menuHeight] = menuActor.get_size();
          const [buttonX, buttonY] =
            this._modelButton.get_transformed_position();
          const [buttonWidth, buttonHeight] = this._modelButton.get_size();

          if (
            !(
              x >= menuX &&
              x <= menuX + menuWidth &&
              y >= menuY &&
              y <= menuY + menuHeight
            ) &&
            !(
              x >= buttonX &&
              x <= buttonX + buttonWidth &&
              y >= buttonY &&
              y <= buttonY + buttonHeight
            )
          ) {
            this._modelMenu.close();
          }
        }
        return Clutter.EVENT_PROPAGATE;
      }
    );

    // Register with popup manager
    this._popupManager.registerPopup('model', {
      isOpenFn: () => this._modelMenu && this._modelMenu.isOpen,
      closeFn: () => {
        if (this._modelMenu && this._modelMenu.isOpen) {
          this._modelMenu.close();
        }
      }
    });

    await this._populateModelMenu();
  }

  _positionModelMenu() {
    // Get menu actor
    const menuActor = this._modelMenu.actor || this._modelMenu;

    // Get menu height
    const [, menuHeight] = menuActor.get_preferred_height(-1);

    // Use visual container if available, otherwise fall back to input container
    let containerX, containerY, containerWidth;
    
    if (this._visualContainerManager && this._visualContainerManager._visualContainer) {
      const visualContainer = this._visualContainerManager._visualContainer;
      [containerX, containerY] = visualContainer.get_transformed_position();
      containerWidth = visualContainer.get_width();
    } else {
      // Fallback to input container
      const [buttonX] = this._modelButton.get_transformed_position();
      [, containerY] = this._inputButtonsContainer.get_transformed_position();
      containerX = buttonX - 7; // Use button-based positioning as fallback
      containerWidth = this._inputButtonsContainer.get_width();
    }

    // Set menu width to match the container (like settings menu)
    menuActor.set_width(containerWidth);

    // Position above the container with a small gap (exactly like settings menu)
    menuActor.set_position(containerX, containerY - menuHeight - 8);
  }

  _applyModelMenuStyling() {
    if (!this._modelMenu) return;
    
    // Get the same color settings as the visual container
    const inputBgColor = this._settings.get_string("input-container-background-color");
    const inputOpacity = this._settings.get_double("input-container-opacity");
    
    // Parse the color and apply opacity
    let r, g, b;
    if (inputBgColor.startsWith("#")) {
      const hex = inputBgColor.slice(1);
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    } else if (inputBgColor.startsWith("rgb(")) {
      const match = inputBgColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (match) {
        r = parseInt(match[1]);
        g = parseInt(match[2]);
        b = parseInt(match[3]);
      }
    } else {
      // Default to dark grey if parsing fails
      r = 30;
      g = 30;
      b = 30;
    }
    
    // Apply the color with opacity to the menu
    const menuActor = this._modelMenu.actor || this._modelMenu;
    const menuBox = this._modelMenu.box;
    
    const backgroundColor = `rgba(${r}, ${g}, ${b}, ${inputOpacity})`;
    
    // Smart shadow detection to prevent overlap with visual container
    let shadowCss = '';
    if (this._visualContainerManager && this._visualContainerManager._visualContainer) {
      const visualContainer = this._visualContainerManager._visualContainer;
      
      try {
        const [menuX, menuY] = menuActor.get_transformed_position();
        const [menuWidth, menuHeight] = menuActor.get_size();
        const [visualX, visualY] = visualContainer.get_transformed_position();
        const [visualWidth, visualHeight] = visualContainer.get_size();
        
        // Get shadow offset settings
        let shadowOffsetY;
        try {
          shadowOffsetY = this._settings.get_double("shadow-offset-y");
        } catch (e) {
          shadowOffsetY = 4.0; // fallback
        }
        
        // Calculate if shadow would overlap with visual container
        const menuBottom = menuY + menuHeight;
        const shadowBottom = menuBottom + Math.abs(shadowOffsetY);
        const shadowWouldOverlap = shadowBottom > visualY && 
                                   menuX < visualX + visualWidth && 
                                   menuX + menuWidth > visualX;
        
        if (!shadowWouldOverlap) {
          shadowCss = this._generateShadowCss();
        }
      } catch (e) {
        // If position detection fails, apply shadow anyway
        shadowCss = this._generateShadowCss();
      }
    } else {
      // No visual container to check against, apply shadow
      shadowCss = this._generateShadowCss();
    }
    
    if (menuBox) {
      menuBox.set_style(`
        background-color: ${backgroundColor};
        border-radius: 16px;
        padding: 12px;
        margin: 0;
        spacing: 2px;
        border: none;
        ${shadowCss}
      `);
    }
  }

  _generateShadowCss() {
    let shadowColor, shadowOpacity, shadowBlur, shadowOffsetX, shadowOffsetY;
    
    try {
      shadowColor = this._settings.get_string("shadow-color");
      shadowOpacity = this._settings.get_double("shadow-opacity");
      shadowBlur = this._settings.get_double("shadow-blur");
      shadowOffsetX = this._settings.get_double("shadow-offset-x");
      shadowOffsetY = this._settings.get_double("shadow-offset-y");
    } catch (e) {
      // Fallback to defaults if settings aren't available yet
      shadowColor = "#000000";
      shadowOpacity = 0.3;
      shadowBlur = 20.0;
      shadowOffsetX = 0.0;
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

  async _populateModelMenu() {
    this._updateModelLabel("Fetching models");

    const { models, error } = await fetchModelNames();

    if (error) {
      this._updateModelLabel("No models found");
      this._addTemporaryMessage(error);
      return;
    }

    if (models.length === 0) {
      this._updateModelLabel("No models found");
      return;
    }

    this._modelMenu.removeAll();

    const defaultModel = this._settings.get_string("default-model");
    const selectedModel = models.includes(defaultModel)
      ? defaultModel
      : models[0];
    this._updateModelLabel(selectedModel);
    setModel(selectedModel);

    models.forEach((name) => {
      // Create a custom menu item
      const menuItem = new PopupMenu.PopupBaseMenuItem({
        style_class: "model-menu-item",
      });

      // Add a spacer for the ornament
      const ornamentSpace = new St.Bin({
        style_class: "popup-menu-ornament",
        x_expand: false,
      });
      menuItem.actor.add_child(ornamentSpace);

      // Add the label
      const label = new St.Label({
        text: name,
        y_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
      });
      menuItem.actor.add_child(label);

      // Store ornament bin reference for selection
      menuItem._ornamentBin = ornamentSpace;

      // Add the dot ornament for the selected model
      if (name === selectedModel) {
        const dot = new St.Icon({
          icon_name: "media-record-symbolic",
          style_class: "popup-menu-icon model-selection-dot",
        });
        ornamentSpace.set_child(dot);
      }

      // Connect activation handler
      menuItem.connect("activate", () => {
        this._selectCustomModel(name, menuItem);
      });

      this._modelMenu.addMenuItem(menuItem);
    });
  }

  _selectCustomModel(name, menuItem) {
    // Clear all ornaments
    this._modelMenu.box.get_children().forEach((child) => {
      if (child.actor && child._ornamentBin) {
        child._ornamentBin.set_child(null);
      }
    });

    // Add ornament to the selected item
    if (menuItem._ornamentBin) {
      const dot = new St.Icon({
        icon_name: "media-record-symbolic",
        style_class: "popup-menu-icon model-selection-dot",
      });
      menuItem._ornamentBin.set_child(dot);
    }

    this._updateModelLabel(name);
    setModel(name);
    this._modelMenu.close();
    this._stopAiMessageCallback();

    // Get the panel indicator to update the model button
    const extensionUuid = "linux-copilot@TheoThePerson";
    const extension = Main.panel.statusArea[extensionUuid];
    if (extension && typeof extension._updateModelButton === "function") {
      extension._updateModelButton();
    }

    // Refresh file box formatting after model change
    const fileHandler = ModelManager._getFileHandler();
    if (fileHandler && fileHandler.hasLoadedFiles()) {
      // Use a sequence of delays to ensure proper formatting
      [10, 50, 150, 300].forEach((delay) => {
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
          if (fileHandler && fileHandler.hasLoadedFiles()) {
            fileHandler.refreshFileBoxFormatting();
          }
          return GLib.SOURCE_REMOVE;
        });
      });
    }
  }

  _updateModelLabel(name) {
    this._modelButtonLabel.set_text(name);
    this._modelButtonLabel.set_x_align(Clutter.ActorAlign.START);
  }

  _addTemporaryMessage(message) {
    // Create a message box with temporary message style
    const messageBox = new St.BoxLayout({
      style_class: "temporary-message",
      style:
        "background-color: rgba(255, 200, 0, 0.2); " +
        "border-radius: 16px; " +
        "padding: 10px 15px; " +
        "margin: 5px 0; " +
        "border-left: 3px solid rgba(255, 200, 0, 0.7);",
      vertical: true,
    });

    // Add the message text
    const messageLabel = new St.Label({
      text: message,
      style: "font-size: 14px; color: rgba(0, 0, 0, 0.8);",
      x_expand: true,
    });
    messageLabel.clutter_text.set_line_wrap(true);
    messageBox.add_child(messageLabel);

    // Add to the output container
    this._outputContainer.add_child(messageBox);

    // Remove after a delay (using GLib.timeout_add instead of setTimeout)
    const timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 5000, () => {
      if (messageBox.get_parent()) {
        messageBox.get_parent().remove_child(messageBox);
        messageBox.destroy();
      }
      return GLib.SOURCE_REMOVE;
    });

    // Store timeout ID to cancel if needed
    messageBox._timeoutId = timeoutId;
  }

  closeMenu() {
    if (this._modelMenu && this._modelMenu.isOpen) {
      this._modelMenu.close();
    }
  }

  isMenuOpen() {
    return this._modelMenu && this._modelMenu.isOpen;
  }

  refreshModels() {
    return this._populateModelMenu();
  }

  destroy() {
    if (this._stageEventId) {
      global.stage.disconnect(this._stageEventId);
      this._stageEventId = null;
    }

    // Unregister from popup manager
    this._popupManager.unregisterPopup('model');

    if (this._modelMenu) {
      this._modelMenu.destroy();
      this._modelMenu = null;
    }
  }

  static _getFileHandler() {
    // Find the panel indicator that contains the file handler
    // Get the extension UUID from metadata (or use the hardcoded value as fallback)
    const extensionUuid = "linux-copilot@TheoThePerson";
    const extension = Main.panel.statusArea[extensionUuid];
    if (extension && extension._fileHandler) {
      return extension._fileHandler;
    }
    return null;
  }
}
