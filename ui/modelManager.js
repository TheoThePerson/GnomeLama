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

export class ModelManager {
  constructor(
    settingsOrOptions,
    outputContainer,
    stopAiMessageCallback,
    inputButtonsContainer
  ) {
    // Support both new options object format and old individual parameters format
    if (
      arguments.length === 1 &&
      settingsOrOptions &&
      typeof settingsOrOptions === "object"
    ) {
      // New format with options object
      const options = settingsOrOptions;
      this._settings = options.settings;
      this._outputContainer = options.outputContainer;
      this._stopAiMessageCallback = options.stopAiMessageCallback;
      this._inputButtonsContainer = options.inputButtonsContainer;
    } else {
      // Old format with individual parameters
      this._settings = settingsOrOptions;
      this._outputContainer = outputContainer;
      this._stopAiMessageCallback = stopAiMessageCallback;
      this._inputButtonsContainer = inputButtonsContainer;
    }
    this._modelMenu = null;
    this._modelButton = null;
    this._modelButtonLabel = null;
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
      this._modelMenu.toggle();
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

    this._modelMenu.connect("open-state-changed", (menu, isOpen) => {
      if (isOpen) {
        this._positionModelMenu();
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

    await this._populateModelMenu();
  }

  _positionModelMenu() {
    // Get model button position and size
    const [buttonX] = this._modelButton.get_transformed_position();

    // Get menu actor
    const menuActor = this._modelMenu.actor || this._modelMenu;

    // Get menu height
    const [, menuHeight] = menuActor.get_preferred_height(-1);

    // Position it above the input field container if it exists
    const [, inputY] = this._inputButtonsContainer.get_transformed_position();

    menuActor.set_position(buttonX - 7, inputY - menuHeight - 8); // adjust for padding
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

    if (this._modelMenu) {
      this._modelMenu.close();
      if (this._modelMenu.actor) {
        this._modelMenu.actor.destroy();
      } else {
        this._modelMenu.destroy();
      }
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
