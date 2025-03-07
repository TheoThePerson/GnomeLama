import GObject from "gi://GObject";
import St from "gi://St";
import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";

// Import from reorganized modules
import { getSettings } from "../lib/settings.js";
import { parseMessageContent } from "../lib/messageParser.js";
import * as UIComponents from "./components.js";
import * as LayoutManager from "./layoutManager.js";

// Import messaging functionality
import {
  sendMessage,
  getConversationHistory,
  clearConversationHistory,
  fetchModelNames,
  setModel,
} from "../services/messaging.js";

export const Indicator = GObject.registerClass(
  class Indicator extends PanelMenu.Button {
    _init(extensionPath) {
      super._init(0.0, "AI Chat Panel");

      // Initialize properties
      this._context = null;
      this._extensionPath = extensionPath;
      this._settings = getSettings();

      // Set up UI components
      this._initUI();

      // Event handlers
      this._connectEventHandlers();
    }

    // Initialize all UI components
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

    // Connect all event handlers
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

    _createIcon() {
      this.add_child(
        new St.Icon({
          gicon: Gio.icon_new_for_string(
            `${this._extensionPath}/icons/TopBar-icon.svg`
          ),
          style_class: "system-status-icon",
        })
      );
    }

    _setupPanelOverlay() {
      const dimensions = LayoutManager.calculatePanelDimensions();

      this._panelOverlay = new St.Widget({
        style_class: "panel-overlay",
        reactive: true,
        visible: false,
        width: dimensions.panelWidth,
        height: dimensions.panelHeight,
        x: dimensions.monitor.width - dimensions.panelWidth,
        y: Main.panel.actor.height,
      });

      Main.layoutManager.uiGroup.add_child(this._panelOverlay);
    }

    _setupTopBar() {
      const dimensions = LayoutManager.calculatePanelDimensions();

      this._topBar = new St.BoxLayout({
        style_class: "top-bar",
        width: dimensions.panelWidth,
        height: dimensions.topBarHeight,
        reactive: true,
      });

      this._panelOverlay.add_child(this._topBar);
    }

    async _setupModelMenu() {
      // Create model button with label
      this._modelButtonLabel = new St.Label({
        text: "Models ▼",
        style_class: "model-button-label",
        x_align: Clutter.ActorAlign.START,
        y_align: Clutter.ActorAlign.CENTER,
        x_expand: true,
      });

      // Create a container for the label with padding
      const buttonContentBox = new St.BoxLayout({
        style: "padding-left: 12px;",
        x_expand: true,
      });
      buttonContentBox.add_child(this._modelButtonLabel);

      this._modelButton = new St.Button({
        child: buttonContentBox,
        style_class: "model-button",
        x_align: Clutter.ActorAlign.FILL,
      });

      // Create a standalone popup menu not anchored to the button
      this._modelMenu = new PopupMenu.PopupMenu(
        new St.Button(),
        0.0,
        St.Side.TOP
      );

      Main.uiGroup.add_child(this._modelMenu.actor);
      this._modelMenu.actor.hide();

      // Configure the menu position
      this._configureModelMenuPosition();

      // Add menu items
      await this._addModelMenuItems();

      // Connect button event
      this._modelButton.connect("button-press-event", () => {
        this._modelMenu.toggle();
        return Clutter.EVENT_STOP;
      });
    }

    _configureModelMenuPosition() {
      this._modelMenu.connect("open-state-changed", (menu, isOpen) => {
        if (isOpen) {
          // Get panel dimensions and position
          const dimensions = LayoutManager.calculatePanelDimensions();
          const panelLeft = dimensions.monitor.width - dimensions.panelWidth;

          // Get the top bar height for vertical positioning
          const topBarHeight = dimensions.topBarHeight;

          // Access the popup menu actor
          let menuActor = this._modelMenu.actor || this._modelMenu;

          // Position the menu at the left edge of the panel, just below the top bar
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

      // Get the default model from settings
      const defaultModel = this._settings.get_string("default-model");

      // Set the default model as the current selection if it exists in the list
      // Otherwise fallback to the first model
      const selectedModel = modelNames.includes(defaultModel)
        ? defaultModel
        : modelNames[0];

      // Update button label and set the model
      this._modelButtonLabel.set_text(selectedModel);
      this._modelButtonLabel.set_x_align(Clutter.ActorAlign.START);
      setModel(selectedModel);

      // Create menu items for each model
      modelNames.forEach((name) => {
        let modelItem = new PopupMenu.PopupMenuItem(name);

        // Mark the current model as active
        if (name === selectedModel) {
          modelItem.setOrnament(PopupMenu.Ornament.DOT);
        }

        modelItem.connect("activate", () => {
          this._selectModel(name, modelItem);
        });

        this._modelMenu.addMenuItem(modelItem);
      });
    }

    _selectModel(name, modelItem) {
      // Update all menu items
      this._modelMenu.box.get_children().forEach((child) => {
        if (child.setOrnament) {
          child.setOrnament(PopupMenu.Ornament.NONE);
        }
      });

      // Set the ornament on the selected item
      modelItem.setOrnament(PopupMenu.Ornament.DOT);

      // Update the button label and set the selected model
      this._modelButtonLabel.set_text(name);
      this._modelButtonLabel.set_x_align(Clutter.ActorAlign.START);
      setModel(name);

      // Close the menu and reset history
      this._modelMenu.close();
      this._clearHistory();
    }

    _setupClearButton() {
      const iconSize = 24 * this._settings.get_double("clear-icon-scale");

      this._clearIcon = new St.Icon({
        gicon: Gio.icon_new_for_string(
          `${this._extensionPath}/icons/trash-icon.svg`
        ),
        style_class: "system-status-icon",
        style: "margin: 0 auto;", // Center the icon
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
        width: iconSize,
        height: iconSize,
      });

      // Create a fixed-size button with centered icon
      this._clearButton = new St.Button({
        child: this._clearIcon,
        style_class: "clear-button",
      });

      this._clearButton.connect("clicked", this._clearHistory.bind(this));
    }

    _clearHistory() {
      clearConversationHistory();
      this._clearOutput();
    }

    _setupOutputArea() {
      const dimensions = LayoutManager.calculatePanelDimensions();

      this._outputScrollView = new St.ScrollView({
        width: dimensions.panelWidth,
        height: dimensions.outputHeight,
        style_class: "output-scrollview",
        y: dimensions.topBarHeight + dimensions.paddingY,
      });

      this._outputContainer = new St.BoxLayout({
        vertical: true,
        reactive: true,
        style: `padding: 0 ${dimensions.horizontalPadding}px;`,
      });

      this._outputScrollView.set_child(this._outputContainer);
      this._panelOverlay.add_child(this._outputScrollView);
    }

    _setupInputArea() {
      // Create input container
      this._inputFieldBox = new St.BoxLayout({
        style_class: "input-field-box",
        vertical: false,
      });

      this._panelOverlay.add_child(this._inputFieldBox);

      // Create input field
      this._inputField = new St.Entry({
        hint_text: "Type your message here...",
        can_focus: true,
        style_class: "input-field",
      });

      // Handle Enter key press
      this._inputField.clutter_text.connect("key-press-event", (_, event) => {
        if (event.get_key_symbol() === Clutter.KEY_Return) {
          this._sendMessage();
          return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
      });

      this._inputFieldBox.add_child(this._inputField);

      // Create send button
      this._sendIcon = new St.Icon({
        gicon: Gio.icon_new_for_string(
          `${this._extensionPath}/icons/send-icon.svg`
        ),
        style_class: "system-status-icon",
      });

      this._sendButton = new St.Button({
        child: this._sendIcon,
      });

      this._sendButton.connect("clicked", this._sendMessage.bind(this));
      this._inputFieldBox.add_child(this._sendButton);
    }

    _togglePanelOverlay() {
      this._panelOverlay.visible = !this._panelOverlay.visible;
      if (this._panelOverlay.visible) {
        this._updateHistory();
        global.stage.set_key_focus(this._inputField.clutter_text);
      }
    }

    async _sendMessage() {
      const userMessage = this._inputField.get_text().trim();
      if (!userMessage) {
        this._addTemporaryMessage("Please enter a message.");
        return;
      }
      this._inputField.set_text("");

      // Append user message
      this._appendUserMessage(userMessage);

      // Process AI response
      await this._processAIResponse(userMessage);
    }

    async _processAIResponse(userMessage) {
      let responseContainer = null;
      let fullResponse = "";

      await sendMessage(userMessage, this._context, (chunk) => {
        fullResponse += chunk;

        // Remove old container if it exists
        if (responseContainer) {
          responseContainer.destroy();
        }

        // Generate response UI
        responseContainer = this._createResponseUI(fullResponse);
      });
    }

    _createResponseUI(responseText) {
      // Parse the response content
      const parts = parseMessageContent(responseText);
      let container = null;

      // Simple text response
      if (
        parts.length === 1 &&
        !["code", "formatted"].includes(parts[0].type)
      ) {
        container = UIComponents.createMessageContainer(
          parts[0].content,
          false,
          Clutter.ActorAlign.START
        );
      }
      // Complex response with code/formatting
      else {
        container = UIComponents.createAIMessageContainer(
          Clutter.ActorAlign.START
        );

        // Add each content part
        parts.forEach((part) => {
          if (part.type === "code") {
            container.add_child(
              UIComponents.createCodeContainer(part.content, part.language)
            );
          } else if (part.type === "formatted") {
            container.add_child(
              UIComponents.createFormattedTextLabel(part.content, part.format)
            );
          } else {
            container.add_child(UIComponents.createTextLabel(part.content));
          }
        });
      }

      this._outputContainer.add_child(container);
      return container;
    }

    _appendUserMessage(message) {
      const userContainer = UIComponents.createMessageContainer(
        message,
        true,
        Clutter.ActorAlign.END
      );
      this._outputContainer.add_child(userContainer);
    }

    _updateHistory() {
      this._clearOutput();
      const history = getConversationHistory();

      if (history.length === 0) return;

      history.forEach((msg) => {
        if (msg.type === "user") {
          this._appendUserMessage(msg.text);
        } else {
          this._createResponseUI(msg.text);
        }
      });
    }

    _clearOutput() {
      this._outputContainer.get_children().forEach((child) => child.destroy());
    }

    _addTemporaryMessage(text) {
      const tempLabel = UIComponents.createTemporaryMessageLabel(text);
      this._outputContainer.add_child(tempLabel);
    }

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

    destroy() {
      // Clean up resources
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
