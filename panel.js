import GObject from "gi://GObject";
import St from "gi://St";
import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import Pango from "gi://Pango";
import {
  sendMessage,
  getConversationHistory,
  clearConversationHistory,
  fetchModelNames,
  setModel,
} from "./messaging.js";

const PanelConfig = {
  panelWidthFraction: 0.15,
  inputFieldHeightFraction: 0.03,
  paddingFractionX: 0.02, // used for horizontal spacing in several areas
  paddingFractionY: 0.01,
  topBarHeightFraction: 0.03,
  inputButtonSpacingFraction: 0.01,
  clearIconScale: 1,
  clearButtonPaddingFraction: 0.01,
};

export const Indicator = GObject.registerClass(
  class Indicator extends PanelMenu.Button {
    _init(extensionPath) {
      super._init(0.0, "AI Chat Panel");
      this._context = null;
      this._extensionPath = extensionPath;

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
      const monitor = Main.layoutManager.primaryMonitor;
      const panelWidth = monitor.width * PanelConfig.panelWidthFraction;
      const panelHeight = monitor.height - Main.panel.actor.height;

      this._panelOverlay = new St.Widget({
        style_class: "panel-overlay",
        reactive: true,
        visible: false,
        width: panelWidth,
        height: panelHeight,
        x: monitor.width - panelWidth,
        y: Main.panel.actor.height,
        style: "background-color: #333; border-radius: 0px;",
      });

      Main.layoutManager.uiGroup.add_child(this._panelOverlay);
    }

    _setupTopBar() {
      const monitor = Main.layoutManager.primaryMonitor;
      const panelWidth = monitor.width * PanelConfig.panelWidthFraction;
      const panelHeight = monitor.height - Main.panel.actor.height;
      const topBarHeight = panelHeight * PanelConfig.topBarHeightFraction;

      this._topBar = new St.BoxLayout({
        style_class: "top-bar",
        width: panelWidth,
        height: topBarHeight,
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
          background-color: rgba(255, 255, 255, 0.1);
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
      modelNames.forEach((modelName) => {
        const item = new PopupMenu.PopupMenuItem(modelName);
        item.connect("activate", () => {
          this._modelButtonLabel.set_text(modelName);
          setModel(modelName);
          this._modelMenu.close();
          this._clearHistory(); // Reset history when a new model is selected
        });
        this._modelMenu.addMenuItem(item);
      });
    }

    _setupClearButton() {
      this._clearButton = new St.Button({
        child: new St.Icon({
          gicon: Gio.icon_new_for_string(
            `${this._extensionPath}/icons/trash-icon.svg`
          ),
          style_class: "system-status-icon",
          scale_x: PanelConfig.clearIconScale,
          scale_y: PanelConfig.clearIconScale,
        }),
        style_class: "clear-button",
      });

      this._clearButton.connect("clicked", this._clearHistory.bind(this));
    }

    _clearHistory() {
      clearConversationHistory();
      this._clearOutput();
    }

    _setupOutputArea() {
      const monitor = Main.layoutManager.primaryMonitor;
      const panelWidth = monitor.width * PanelConfig.panelWidthFraction;
      const panelHeight = monitor.height - Main.panel.actor.height;
      const paddingY = panelHeight * PanelConfig.paddingFractionY;
      const topBarHeight = panelHeight * PanelConfig.topBarHeightFraction;
      const inputFieldHeight =
        panelHeight * PanelConfig.inputFieldHeightFraction;
      const outputHeight =
        panelHeight - inputFieldHeight - topBarHeight - paddingY * 2;

      this._outputScrollView = new St.ScrollView({
        width: panelWidth,
        height: outputHeight,
        style_class: "output-scrollview",
        y: topBarHeight + paddingY,
      });

      this._outputContainer = new St.BoxLayout({
        vertical: true,
        reactive: true,
        style: `padding: 0 ${panelWidth * PanelConfig.paddingFractionX}px;`,
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

      // Append the user’s message to the output area.
      this._appendUserMessage(userMessage);

      // Create a container for the streaming AI response.
      const responseContainer = new St.BoxLayout({
        style: `
      background-color: #ff9800;
      padding: 10px;
      margin-bottom: 5px;
      border-radius: 10px;
      max-width: 80%;
    `,
        x_align: Clutter.ActorAlign.START,
      });
      const responseLabel = new St.Label({
        text: "",
        style: "padding: 5px; white-space: normal;",
        x_expand: true,
      });
      responseLabel.clutter_text.set_line_wrap(true);
      responseLabel.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);
      responseContainer.add_child(responseLabel);
      this._outputContainer.add_child(responseContainer);

      // Call sendMessage with an onData callback that updates the responseLabel.
      await sendMessage(userMessage, this._context, (chunk) => {
        responseLabel.set_text(responseLabel.get_text() + chunk);
      });
    }

    // Helper method to append the user message.
    _appendUserMessage(message) {
      const userContainer = new St.BoxLayout({
        style: `
      background-color: #007bff;
      padding: 10px;
      margin-bottom: 5px;
      border-radius: 10px;
      max-width: 80%;
    `,
        x_align: Clutter.ActorAlign.END,
      });
      const userLabel = new St.Label({
        text: message,
        style: "padding: 5px; white-space: normal;",
        x_expand: true,
      });
      userLabel.clutter_text.set_line_wrap(true);
      userLabel.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);
      userContainer.add_child(userLabel);
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
          const bgColor = isUser ? "#007bff" : "#ff9800"; // Blue for user, orange for AI
          const textColor = "white";

          const messageBox = new St.BoxLayout({
            style: `
          background-color: ${bgColor};
          color: ${textColor};
          padding: 10px;
          margin-bottom: 5px;
          border-radius: 10px;
          max-width: 80%;
          word-wrap: break-word;
          overflow-wrap: break-word;
        `,
            x_align: alignment,
          });

          const label = new St.Label({
            text: msg.text,
            style: "padding: 5px; white-space: normal;", // Ensure text wraps normally
            x_expand: true,
          });

          // Enable line wrapping and disable ellipsizing
          label.clutter_text.set_line_wrap(true);
          label.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);

          messageBox.add_child(label);
          this._outputContainer.add_child(messageBox);
        });
      }
    }

    _clearOutput() {
      this._outputContainer.get_children().forEach((child) => child.destroy());
    }

    _addTemporaryMessage(text) {
      const tempLabel = new St.Label({
        text,
        x_align: Clutter.ActorAlign.START,
        style: "padding: 5px; margin-bottom: 5px;",
      });
      this._outputContainer.add_child(tempLabel);
    }

    _updateLayout() {
      const monitor = Main.layoutManager.primaryMonitor;
      const panelWidth = monitor.width * PanelConfig.panelWidthFraction;
      const panelHeight = monitor.height - Main.panel.actor.height;
      const paddingY = panelHeight * PanelConfig.paddingFractionY;
      const topBarHeight = panelHeight * PanelConfig.topBarHeightFraction;
      const inputFieldHeight =
        panelHeight * PanelConfig.inputFieldHeightFraction;
      const outputHeight =
        panelHeight - inputFieldHeight - topBarHeight - paddingY * 2;
      const inputButtonSpacing =
        panelWidth * PanelConfig.inputButtonSpacingFraction;

      // Update panel overlay.
      this._panelOverlay.set_size(panelWidth, panelHeight);
      this._panelOverlay.set_position(
        monitor.width - panelWidth,
        Main.panel.actor.height
      );

      // Update top bar.
      this._topBar.set_size(panelWidth, topBarHeight);
      if (this._topBar) {
        this._topBar.remove_all_children();
        this._topBar.add_child(this._modelButton);
        this._topBar.add_child(new St.Widget({ x_expand: true }));
        this._topBar.add_child(this._clearButton);
      }
      if (this._modelButton) {
        let modelButtonWidth = panelWidth * 0.3;
        this._modelButton.set_width(modelButtonWidth);
        this._modelButton.set_height(topBarHeight);
      }
      if (this._clearButton) {
        let clearButtonWidth = 50;
        this._clearButton.set_width(clearButtonWidth);
        this._clearButton.set_height(topBarHeight);
      }

      // Update output area.
      if (this._outputScrollView) {
        this._outputScrollView.set_size(panelWidth, outputHeight);
        this._outputScrollView.set_position(0, topBarHeight + paddingY);
      }
      if (this._outputContainer) {
        this._outputContainer.set_style(
          `padding: 0 ${panelWidth * PanelConfig.paddingFractionX}px;`
        );
      }

      // Update input area.
      if (this._inputFieldBox) {
        this._inputFieldBox.set_size(panelWidth, inputFieldHeight);
        this._inputFieldBox.set_position(
          0,
          outputHeight + topBarHeight + paddingY
        );
        const H = panelWidth * PanelConfig.paddingFractionX;
        this._inputFieldBox.set_style(
          `padding-left: ${H}px; padding-right: ${H}px;`
        );
        this._inputFieldBox.spacing = H;
      }
      // Make the send button circular by setting its size equal to the input field height.
      const sendButtonSize = inputFieldHeight;
      const H = panelWidth * PanelConfig.paddingFractionX;
      // Total width = left padding (H) + input field width + gap (H) + send button width + right padding (H)
      // => availableInputWidth = panelWidth - (sendButtonSize + 3 * H)
      const availableInputWidth = panelWidth - sendButtonSize - 3 * H;
      if (this._inputField) {
        this._inputField.set_style(
          `border-radius: 9999px; width: ${availableInputWidth}px;`
        );
      }
      if (this._sendButton) {
        this._sendButton.set_width(sendButtonSize);
        this._sendButton.set_height(sendButtonSize);
      }
      if (this._sendIcon) {
        // Scale the SVG icon inside the button.
        this._sendIcon.icon_size = sendButtonSize;
      }
    }

    destroy() {
      if (this._modelMenu) {
        this._modelMenu.destroy();
      }
      this._panelOverlay.destroy();
      super.destroy();
    }
  }
);
