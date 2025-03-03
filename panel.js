import GObject from "gi://GObject";
import St from "gi://St";
import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import Pango from "gi://Pango";

// Import our modular components
import { getSettings } from "./settings.js";
import { parseMessageContent } from "./messageParser.js";
import * as UIComponents from "./uiComponents.js";
import * as LayoutManager from "./layoutManager.js";

// Import messaging functionality
import {
  sendMessage,
  getConversationHistory,
  clearConversationHistory,
  fetchModelNames,
  setModel,
} from "./messaging.js";

export const Indicator = GObject.registerClass(
  class Indicator extends PanelMenu.Button {
    _init(extensionPath) {
      super._init(0.0, "AI Chat Panel");
      this._context = null;
      this._extensionPath = extensionPath;
      this._settings = getSettings();

      // Connect to settings changes to update the UI when preferences change
      this._settingsChangedId = this._settings.connect("changed", () => {
        this._updateLayout();
      });

      this._createIcon();
      this._setupPanelOverlay();
      this._setupTopBar();
      this._setupModelMenu();
      this._setupClearButton();
      this._setupOutputArea();
      this._setupInputArea();

      // Listen for monitor changes and update the layout dynamically.
      Main.layoutManager.connect("monitors-changed", () => {
        this._updateLayout();
      });
      // Do an initial layout update.
      this._updateLayout();

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
        style: "background-color: #333; border-radius: 0px;",
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
        style: `
          background-color: rgba(255, 255, 255, 0.2);
          border-bottom: 1px solid rgba(255, 255, 255, 0.3);
          padding: 0;
          margin: 0;
        `,
      });

      this._panelOverlay.add_child(this._topBar);
    }

    async _setupModelMenu() {
      this._modelButtonLabel = new St.Label({
        text: "Models ▼",
        style: "color: white; padding: 5px;",
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
      });

      this._modelButton = new St.Button({
        child: this._modelButtonLabel,
        style: `
          background-color: transparent;
          border-radius: 0px;
          margin: 0;
        `,
      });

      this._modelMenu = new PopupMenu.PopupMenu(
        this._modelButton,
        0.0,
        St.Side.TOP
      );
      Main.uiGroup.add_child(this._modelMenu.actor);
      this._modelMenu.actor.hide();

      await this._addModelMenuItems();

      this._modelButton.connect("button-press-event", () => {
        this._modelMenu.toggle();
        return Clutter.EVENT_STOP;
      });
    }

    async _addModelMenuItems() {
      const modelNames = await fetchModelNames();
      if (modelNames.length > 0) {
        // Get the default model from settings
        const defaultModel = this._settings.get_string("default-model");

        // Set the default model as the current selection if it exists in the list
        // Otherwise fallback to the first model
        const selectedModel = modelNames.includes(defaultModel)
          ? defaultModel
          : modelNames[0];

        // Update button label and set the model
        this._modelButtonLabel.set_text(selectedModel);
        setModel(selectedModel);

        // Create menu items for each model
        modelNames.forEach((name) => {
          let modelItem = new PopupMenu.PopupMenuItem(name);

          // Mark the current model as active
          if (name === selectedModel) {
            modelItem.setOrnament(PopupMenu.Ornament.DOT);
          }

          modelItem.connect("activate", () => {
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
            setModel(name);

            // Close the menu and reset history
            this._modelMenu.close();
            this._clearHistory();
          });

          this._modelMenu.addMenuItem(modelItem);
        });
      }
    }

    _setupClearButton() {
      const iconSize = 24 * this._settings.get_double("clear-icon-scale"); // Adjust base size dynamically

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
        style: "padding: 0; margin: 0;", // Remove padding to prevent sizing issues
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
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
      this._inputFieldBox = new St.BoxLayout({
        style_class: "input-field-box",
        vertical: false,
        style: `padding: 0;`,
      });

      this._panelOverlay.add_child(this._inputFieldBox);

      this._inputField = new St.Entry({
        hint_text: "Type your message here...",
        can_focus: true,
        style: `border-radius: 9999px;`,
      });

      this._inputField.clutter_text.connect("key-press-event", (_, event) => {
        if (event.get_key_symbol() === Clutter.KEY_Return) {
          this._sendMessage();
          return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
      });

      this._inputFieldBox.add_child(this._inputField);

      // Create a scalable send icon.
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

      // Append the user's message to the output area.
      this._appendUserMessage(userMessage);

      // Create a placeholder for the AI response
      let responseContainer = null;

      // Call sendMessage with an onData callback
      let fullResponse = "";

      await sendMessage(userMessage, this._context, (chunk) => {
        fullResponse += chunk;

        // Parse the current full response for code blocks
        const parts = parseMessageContent(fullResponse);

        // Remove old container if it exists
        if (responseContainer) {
          responseContainer.destroy();
        }

        // Use different container types depending on content
        if (
          parts.length === 1 &&
          parts[0].type !== "code" &&
          parts[0].type !== "formatted"
        ) {
          // Simple text response - use standard message container
          responseContainer = UIComponents.createMessageContainer(
            parts[0].content,
            false,
            Clutter.ActorAlign.START
          );
          this._outputContainer.add_child(responseContainer);
        } else {
          // Complex response with code or formatting - use AI container
          responseContainer = UIComponents.createAIMessageContainer(
            Clutter.ActorAlign.START
          );
          this._outputContainer.add_child(responseContainer);

          // Add each part to the container
          parts.forEach((part) => {
            if (part.type === "code") {
              const codeBox = UIComponents.createCodeContainer(
                part.content,
                part.language
              );
              responseContainer.add_child(codeBox);
            } else if (part.type === "formatted") {
              const formattedLabel = UIComponents.createFormattedTextLabel(
                part.content,
                part.format
              );
              responseContainer.add_child(formattedLabel);
            } else {
              const textLabel = UIComponents.createTextLabel(part.content);
              responseContainer.add_child(textLabel);
            }
          });
        }
      });
    }

    // Helper method to append the user message.
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
      if (history.length > 0) {
        history.forEach((msg) => {
          const isUser = msg.type === "user";
          const alignment = isUser
            ? Clutter.ActorAlign.END
            : Clutter.ActorAlign.START;

          if (isUser) {
            // User messages remain unchanged
            const messageBox = UIComponents.createMessageContainer(
              msg.text,
              isUser,
              alignment
            );
            this._outputContainer.add_child(messageBox);
          } else {
            // Parse AI messages for code blocks
            const parts = parseMessageContent(msg.text);

            // For single plain text messages, use the simpler container
            if (
              parts.length === 1 &&
              parts[0].type !== "code" &&
              parts[0].type !== "formatted"
            ) {
              const messageBox = UIComponents.createMessageContainer(
                parts[0].content,
                false,
                alignment
              );
              this._outputContainer.add_child(messageBox);
            } else {
              // For complex messages with code blocks or formatting, use the AI container
              const messageBox =
                UIComponents.createAIMessageContainer(alignment);

              parts.forEach((part) => {
                if (part.type === "code") {
                  const codeBox = UIComponents.createCodeContainer(
                    part.content,
                    part.language
                  );
                  messageBox.add_child(codeBox);
                } else if (part.type === "formatted") {
                  const formattedLabel = UIComponents.createFormattedTextLabel(
                    part.content,
                    part.format
                  );
                  messageBox.add_child(formattedLabel);
                } else {
                  const textLabel = UIComponents.createTextLabel(part.content);
                  messageBox.add_child(textLabel);
                }
              });

              this._outputContainer.add_child(messageBox);
            }
          }
        });
      }
    }

    _clearOutput() {
      this._outputContainer.get_children().forEach((child) => child.destroy());
    }

    _addTemporaryMessage(text) {
      const tempLabel = UIComponents.createTemporaryMessageLabel(text);
      this._outputContainer.add_child(tempLabel);
    }

    _updateLayout() {
      // Update panel overlay
      LayoutManager.updatePanelOverlay(this._panelOverlay);

      // Update top bar
      LayoutManager.updateTopBar(
        this._topBar,
        this._modelButton,
        this._clearButton
      );

      // Update output area
      LayoutManager.updateOutputArea(
        this._outputScrollView,
        this._outputContainer
      );

      // Update input area
      LayoutManager.updateInputArea(
        this._inputFieldBox,
        this._inputField,
        this._sendButton,
        this._sendIcon
      );
    }

    destroy() {
      // Disconnect settings signal
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
