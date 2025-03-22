/**
 * Model manager functionality for the panel UI
 */
import St from "gi://St";
import Clutter from "gi://Clutter";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

// Import layout manager
import * as LayoutManager from "./layoutManager.js";

// Import from services
import { fetchModelNames, setModel } from "../services/messaging.js";

export class ModelManager {
  constructor(
    settings,
    outputContainer,
    stopAiMessageCallback,
    inputButtonsContainer
  ) {
    this._settings = settings;
    this._outputContainer = outputContainer;
    this._stopAiMessageCallback = stopAiMessageCallback;
    this._inputButtonsContainer = inputButtonsContainer;
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
          let [x, y] = event.get_coords();
          let menuActor = this._modelMenu.actor || this._modelMenu;
          let [menuX, menuY] = menuActor.get_transformed_position();
          let [menuWidth, menuHeight] = menuActor.get_size();
          let [buttonX, buttonY] = this._modelButton.get_transformed_position();
          let [buttonWidth, buttonHeight] = this._modelButton.get_size();

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
    // Get dimensions from LayoutManager for consistency
    const dimensions = LayoutManager.calculatePanelDimensions();

    // Get menu actor
    let menuActor = this._modelMenu.actor || this._modelMenu;

    // Get model button position and size
    const [buttonX, buttonY] = this._modelButton.get_transformed_position();

    // Get menu height
    const [, menuHeight] = menuActor.get_preferred_height(-1);

    // Position the menu aligned with the model button, just above it
    menuActor.set_position(
      buttonX,
      buttonY - menuHeight - 5 // 5px padding above button
    );
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
      let modelItem = new PopupMenu.PopupMenuItem(name);

      if (name === selectedModel) {
        modelItem.setOrnament(PopupMenu.Ornament.DOT);
      }

      modelItem.connect("activate", () => {
        this._selectModel(name, modelItem);
      });

      this._modelMenu.addMenuItem(modelItem);
    });
  }

  _updateModelLabel(name) {
    this._modelButtonLabel.set_text(name);
    this._modelButtonLabel.set_x_align(Clutter.ActorAlign.START);
  }

  _selectModel(name, modelItem) {
    this._modelMenu.box.get_children().forEach((child) => {
      if (child.setOrnament) {
        child.setOrnament(PopupMenu.Ornament.NONE);
      }
    });

    modelItem.setOrnament(PopupMenu.Ornament.DOT);

    this._updateModelLabel(name);
    setModel(name);

    this._modelMenu.close();

    this._stopAiMessageCallback();
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

    // Remove after a delay
    const timeoutId = setTimeout(() => {
      if (messageBox.get_parent()) {
        messageBox.get_parent().remove_child(messageBox);
        messageBox.destroy();
      }
    }, 5000);

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

  _getFileHandler() {
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
