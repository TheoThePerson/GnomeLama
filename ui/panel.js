import GObject from "gi://GObject";
import St from "gi://St";
import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";

// Import from reorganized modules
import { getSettings } from "../lib/settings.js";
import * as UIComponents from "./components.js";
import * as PanelElements from "./panelElements.js";
import * as MessageProcessor from "./messageProcessor.js";
import * as LayoutManager from "./layoutManager.js";

// Import messaging functionality
import {
  getConversationHistory,
  clearConversationHistory,
  fetchModelNames,
  setModel,
} from "../services/messaging.js";

export const Indicator = GObject.registerClass(
  class Indicator extends PanelMenu.Button {
    _init(extensionPath) {
      super._init(0.0, "AI Chat Panel");

      this._context = null;
      this._extensionPath = extensionPath;
      this._settings = getSettings();

      this._initUI();
      this._connectEventHandlers();
    }

    // UI INITIALIZATION METHODS

    _initUI() {
      this._createIcon();
      this._setupPanelOverlay();
      this._setupTopBar();
      this._setupModelMenu();
      this._setupClearButton();
      this._setupOutputArea();
      this._setupInputArea();
      this._updateLayout();
    }

    _createIcon() {
      // Create a properly aligned AI text label
      const aiLabel = new St.Label({
        text: "AI",
        y_align: Clutter.ActorAlign.CENTER,
        style: "font-weight: bold; padding: 0 4px;",
      });

      this.add_child(aiLabel);
    }

    _setupPanelOverlay() {
      const dimensions = LayoutManager.calculatePanelDimensions();
      this._panelOverlay = PanelElements.createPanelOverlay(dimensions);

      // Capture scroll events and forward to scrollview if needed
      this._panelOverlay.connect("scroll-event", (_, event) => {
        if (this._outputScrollView) {
          this._outputScrollView.emit("scroll-event", event);
          return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
      });
    }

    _setupTopBar() {
      const dimensions = LayoutManager.calculatePanelDimensions();
      this._topBar = PanelElements.createTopBar(dimensions);
      this._panelOverlay.add_child(this._topBar);
    }

    async _setupModelMenu() {
      // Create model button and label
      const { modelButton, modelButtonLabel } =
        PanelElements.createModelButton();
      this._modelButton = modelButton;
      this._modelButtonLabel = modelButtonLabel;

      // Create standalone popup menu
      this._modelMenu = new PopupMenu.PopupMenu(
        new St.Button(),
        0.0,
        St.Side.TOP
      );

      Main.uiGroup.add_child(this._modelMenu.actor);
      this._modelMenu.actor.hide();

      this._configureModelMenuPosition();
      await this._addModelMenuItems();

      // Toggle menu on button press
      this._modelButton.connect("button-press-event", () => {
        this._modelMenu.toggle();
        return Clutter.EVENT_STOP;
      });
    }

    _configureModelMenuPosition() {
      this._modelMenu.connect("open-state-changed", (menu, isOpen) => {
        if (isOpen) {
          const dimensions = LayoutManager.calculatePanelDimensions();
          const panelLeft = dimensions.monitor.width - dimensions.panelWidth;
          const topBarHeight = dimensions.topBarHeight;

          let menuActor = this._modelMenu.actor || this._modelMenu;
          menuActor.set_position(
            panelLeft,
            Main.panel.actor.height + topBarHeight
          );
        }
      });
    }

    async _addModelMenuItems() {
      const modelNames = await fetchModelNames();
      if (modelNames.length === 0) return;

      // Get default model or use first available
      const defaultModel = this._settings.get_string("default-model");
      const selectedModel = modelNames.includes(defaultModel)
        ? defaultModel
        : modelNames[0];

      // Update button label and set model
      this._updateModelLabel(selectedModel);
      setModel(selectedModel);

      // Create menu items
      modelNames.forEach((name) => {
        let modelItem = new PopupMenu.PopupMenuItem(name);

        // Mark current model as active
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
      // Update menu item ornaments
      this._modelMenu.box.get_children().forEach((child) => {
        if (child.setOrnament) {
          child.setOrnament(PopupMenu.Ornament.NONE);
        }
      });

      modelItem.setOrnament(PopupMenu.Ornament.DOT);

      this._updateModelLabel(name);
      setModel(name);

      this._modelMenu.close();
      this._clearHistory();
    }

    _setupClearButton() {
      const { clearButton, clearIcon } = PanelElements.createClearButton(
        this._extensionPath,
        this._settings.get_double("clear-icon-scale")
      );

      this._clearButton = clearButton;
      this._clearIcon = clearIcon;

      this._clearButton.connect("clicked", this._clearHistory.bind(this));
    }

    _setupOutputArea() {
      const dimensions = LayoutManager.calculatePanelDimensions();
      const { outputScrollView, outputContainer } =
        PanelElements.createOutputArea(dimensions);

      this._outputScrollView = outputScrollView;
      this._outputContainer = outputContainer;

      this._panelOverlay.add_child(this._outputScrollView);
    }

    _setupInputArea() {
      const { inputFieldBox, inputField, sendButton, sendIcon } =
        PanelElements.createInputArea(this._extensionPath);

      this._inputFieldBox = inputFieldBox;
      this._inputField = inputField;
      this._sendButton = sendButton;
      this._sendIcon = sendIcon;

      // Handle Enter key press
      this._inputField.clutter_text.connect("key-press-event", (_, event) => {
        if (event.get_key_symbol() === Clutter.KEY_Return) {
          this._sendMessage();
          return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
      });

      this._sendButton.connect("clicked", this._sendMessage.bind(this));
      this._panelOverlay.add_child(this._inputFieldBox);
    }

    // EVENT HANDLERS AND CONNECTIVITY

    _connectEventHandlers() {
      // Settings change handler
      this._settingsChangedId = this._settings.connect("changed", () => {
        this._updateLayout();
      });

      // Monitor changes handler
      Main.layoutManager.connect("monitors-changed", () => {
        this._updateLayout();
      });

      // Panel click handler
      this.connect("button-press-event", this._togglePanelOverlay.bind(this));
    }

    _togglePanelOverlay() {
      this._panelOverlay.visible = !this._panelOverlay.visible;
      if (this._panelOverlay.visible) {
        this._updateHistory();
        global.stage.set_key_focus(this._inputField.clutter_text);
      }
    }

    // MESSAGING FUNCTIONALITY

    async _sendMessage() {
      const userMessage = this._inputField.get_text().trim();
      if (!userMessage) {
        MessageProcessor.addTemporaryMessage(
          this._outputContainer,
          "Please enter a message."
        );
        return;
      }
      this._inputField.set_text("");

      // Process the message
      await MessageProcessor.processUserMessage({
        userMessage,
        context: this._context,
        outputContainer: this._outputContainer,
        scrollView: this._outputScrollView,
        aiMessageColor: this._settings.get_string("ai-message-color"),
      });
    }

    // HISTORY MANAGEMENT

    _updateHistory() {
      MessageProcessor.clearOutput(this._outputContainer);
      const history = getConversationHistory();

      if (history.length === 0) return;

      const aiMessageColor = this._settings.get_string("ai-message-color");

      history.forEach((msg) => {
        if (msg.type === "user") {
          MessageProcessor.appendUserMessage(this._outputContainer, msg.text);
        } else {
          const container =
            PanelElements.createResponseContainer(aiMessageColor);
          this._outputContainer.add_child(container);
          MessageProcessor.updateResponseContainer(container, msg.text);
        }
      });

      PanelElements.scrollToBottom(this._outputScrollView);
    }

    _clearHistory() {
      clearConversationHistory();
      MessageProcessor.clearOutput(this._outputContainer);
    }

    // LAYOUT UPDATES

    _updateLayout() {
      LayoutManager.updatePanelOverlay(this._panelOverlay);
      LayoutManager.updateTopBar(
        this._topBar,
        this._modelButton,
        this._clearButton
      );
      LayoutManager.updateOutputArea(
        this._outputScrollView,
        this._outputContainer
      );
      LayoutManager.updateInputArea(
        this._inputFieldBox,
        this._inputField,
        this._sendButton,
        this._sendIcon
      );
    }

    // CLEANUP

    destroy() {
      if (this._settingsChangedId) {
        this._settings.disconnect(this._settingsChangedId);
        this._settingsChangedId = null;
      }

      if (this._modelMenu) {
        this._modelMenu.destroy();
      }

      this._panelOverlay.destroy();
      super.destroy();
    }
  }
);
