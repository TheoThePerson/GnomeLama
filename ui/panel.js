import GObject from "gi://GObject";
import St from "gi://St";
import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";

// Import from reorganized modules
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
    _init(extensionPath, settings) {
      super._init(0.0, "AI Chat Panel");
      this._extensionPath = extensionPath;
      this._settings = settings;
      this._context = null;

      // Initialize UI components
      this._initUI();

      // Connect event handlers
      this._settingsChangedId = this._settings.connect("changed", () =>
        this._updateLayout()
      );
      Main.layoutManager.connect("monitors-changed", () =>
        this._updateLayout()
      );
      this.connect("button-press-event", this._togglePanelOverlay.bind(this));
    }

    // UI INITIALIZATION METHODS

    _initUI() {
      // Create a properly aligned AI text label for the panel button
      this.add_child(
        new St.Label({
          text: "AI",
          y_align: Clutter.ActorAlign.CENTER,
          style: "font-weight: bold; padding: 0 4px;",
        })
      );

      // Create main panel components
      const dimensions = LayoutManager.calculatePanelDimensions();
      this._panelOverlay = PanelElements.createPanelOverlay(dimensions);
      this._topBar = PanelElements.createTopBar(dimensions);

      // Setup scrollable content area
      const { outputScrollView, outputContainer } =
        PanelElements.createOutputArea(dimensions);
      this._outputScrollView = outputScrollView;
      this._outputContainer = outputContainer;

      // Setup input components
      const { inputFieldBox, inputField, sendButton, sendIcon } =
        PanelElements.createInputArea(this._extensionPath);
      this._inputFieldBox = inputFieldBox;
      this._inputField = inputField;
      this._sendButton = sendButton;
      this._sendIcon = sendIcon;

      // Setup model selector and clear button
      this._setupModelMenu();
      this._setupClearButton();

      // Assemble the UI
      this._panelOverlay.add_child(this._topBar);
      this._panelOverlay.add_child(this._outputScrollView);
      this._panelOverlay.add_child(this._inputFieldBox);

      // Ensure the overlay is properly added to Chrome
      if (this._panelOverlay.get_parent()) {
        this._panelOverlay.get_parent().remove_child(this._panelOverlay);
      }
      Main.layoutManager.addChrome(this._panelOverlay, {
        trackFullscreen: true,
        affectsInputRegion: true,
      });

      // Handle scroll events in the overlay
      this._panelOverlay.connect("scroll-event", (_, event) => {
        if (this._outputScrollView) {
          this._outputScrollView.emit("scroll-event", event);
          return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
      });

      // Handle Enter key press in input field
      this._inputField.clutter_text.connect("key-press-event", (_, event) => {
        if (event.get_key_symbol() === Clutter.KEY_Return) {
          this._sendMessage();
          return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
      });

      // Connect send button click
      this._sendButton.connect("clicked", this._sendMessage.bind(this));

      // Update the layout
      this._updateLayout();
    }

    async _setupModelMenu() {
      // Create model button and popup menu
      const { modelButton, modelButtonLabel } =
        PanelElements.createModelButton();
      this._modelButton = modelButton;
      this._modelButtonLabel = modelButtonLabel;

      // Create model selection popup menu
      this._modelMenu = new PopupMenu.PopupMenu(
        new St.Button(),
        0.0,
        St.Side.TOP
      );
      Main.uiGroup.add_child(this._modelMenu.actor);
      this._modelMenu.actor.hide();

      // Configure menu position when opened
      this._modelMenu.connect("open-state-changed", (menu, isOpen) => {
        if (isOpen) {
          const dimensions = LayoutManager.calculatePanelDimensions();
          const panelLeft = dimensions.monitor.width - dimensions.panelWidth;
          let menuActor = this._modelMenu.actor || this._modelMenu;
          menuActor.set_position(
            panelLeft,
            Main.panel.actor.height + dimensions.topBarHeight
          );
        }
      });

      // Toggle menu on button press
      this._modelButton.connect("button-press-event", () => {
        this._modelMenu.toggle();
        return Clutter.EVENT_STOP;
      });

      // Populate model menu items
      await this._addModelMenuItems();
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
      if (!userMessage) return;

      // Clear input field immediately
      this._inputField.set_text("");

      try {
        // Process the user message
        await MessageProcessor.processUserMessage({
          userMessage: userMessage,
          context: this._context,
          outputContainer: this._outputContainer,
          scrollView: this._outputScrollView,
          onResponseStart: () => {},
          onResponseEnd: () => {
            // Context is now managed by the messaging service
            // No need to update it here
          },
        });
      } catch (error) {
        console.error("Error processing message:", error);
        MessageProcessor.addTemporaryMessage(
          this._outputContainer,
          "Error processing your message. Please try again."
        );
      }

      // Give focus back to input field
      global.stage.set_key_focus(this._inputField.clutter_text);
    }

    // HISTORY MANAGEMENT

    _updateHistory() {
      // Clear existing messages
      MessageProcessor.clearOutput(this._outputContainer);

      // Get conversation history
      const history = getConversationHistory();

      // Add messages from history
      history.forEach((message) => {
        if (message.type === "user") {
          MessageProcessor.appendUserMessage(
            this._outputContainer,
            message.text
          );
        } else if (message.type === "assistant") {
          const responseContainer = PanelElements.createResponseContainer(
            this._settings.get_string("ai-message-color")
          );
          this._outputContainer.add_child(responseContainer);
          MessageProcessor.updateResponseContainer(
            responseContainer,
            message.text
          );
        }
      });

      // Scroll to the bottom to show latest messages
      PanelElements.scrollToBottom(this._outputScrollView);
    }

    _clearHistory() {
      // Clear conversation history and context
      clearConversationHistory();
      this._context = null;

      // Clear UI
      MessageProcessor.clearOutput(this._outputContainer);
    }

    // LAYOUT UPDATES

    _updateLayout() {
      // Get the updated panel dimensions
      const dimensions = LayoutManager.calculatePanelDimensions();

      // Update each component's layout
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

      // Scroll to bottom to ensure content is visible after layout change
      PanelElements.scrollToBottom(this._outputScrollView);
    }

    // CLEANUP

    destroy() {
      // Disconnect signals
      if (this._settingsChangedId) {
        this._settings.disconnect(this._settingsChangedId);
        this._settingsChangedId = 0;
      }

      // Clean up model menu
      if (this._modelMenu) {
        this._modelMenu.destroy();
        this._modelMenu = null;
      }

      // Remove the panel overlay
      if (this._panelOverlay && this._panelOverlay.get_parent()) {
        Main.layoutManager.removeChrome(this._panelOverlay);
      }

      if (this._panelOverlay) {
        this._panelOverlay.destroy();
        this._panelOverlay = null;
      }

      // Call parent destroy method
      super.destroy();
    }
  }
);
