import GObject from "gi://GObject";
import St from "gi://St";
import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import {
  sendMessage,
  getConversationHistory,
  clearConversationHistory,
  fetchModelNames,
} from "./messaging.js";

const PanelConfig = {
  panelWidthFraction: 0.2,
  inputFieldWidthFraction: 0.86,
  inputFieldHeightFraction: 0.03,
  paddingFractionX: 0.02,
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

      this.connect("button-press-event", this._togglePanelOverlay.bind(this));
    }

    _createIcon() {
      this.add_child(
        new St.Icon({
          icon_name: "face-smile-symbolic",
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
          width: 100%;
          height: 100%;
        `,
        x_align: Clutter.ActorAlign.FILL,
        y_align: Clutter.ActorAlign.FILL,
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

      this._topBar.add_child(this._modelButton);
    }

    async _addModelMenuItems() {
      const modelNames = await fetchModelNames();
      modelNames.forEach((modelName) => {
        const item = new PopupMenu.PopupMenuItem(modelName);
        item.connect("activate", () => {
          this._modelButtonLabel.set_text(modelName);
          this._modelMenu.close();
        });
        this._modelMenu.addMenuItem(item);
      });
    }

    _setupClearButton() {
      const panelWidth =
        Main.layoutManager.primaryMonitor.width *
        PanelConfig.panelWidthFraction;

      this._clearButton = new St.Button({
        style: `margin: auto ${
          panelWidth * PanelConfig.clearButtonPaddingFraction
        }px auto 0;`,
        child: new St.Icon({
          gicon: Gio.icon_new_for_string(
            `${this._extensionPath}/icons/trash-icon.svg`
          ),
          style_class: "system-status-icon",
          scale_x: PanelConfig.clearIconScale,
          scale_y: PanelConfig.clearIconScale,
          translation_x: -8 * (PanelConfig.clearIconScale - 1),
          translation_y: -8 * (PanelConfig.clearIconScale - 1),
        }),
        style_class: "clear-button",
        x_align: Clutter.ActorAlign.END,
        x_expand: true,
      });

      this._clearButton.connect("clicked", this._clearHistory.bind(this));
      this._topBar.add_child(this._clearButton);
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
        clip_to_allocation: true,
        style: `padding: 0 ${panelWidth * PanelConfig.paddingFractionX}px;`,
      });

      this._outputScrollView.set_child(this._outputContainer);
      this._panelOverlay.add_child(this._outputScrollView);
    }

    _setupInputArea() {
      const monitor = Main.layoutManager.primaryMonitor;
      const panelWidth = monitor.width * PanelConfig.panelWidthFraction;
      const panelHeight = monitor.height - Main.panel.actor.height;
      const paddingY = panelHeight * PanelConfig.paddingFractionY;
      const topBarHeight = panelHeight * PanelConfig.topBarHeightFraction;
      const inputFieldHeight =
        panelHeight * PanelConfig.inputFieldHeightFraction;
      const outputHeight =
        panelHeight - inputFieldHeight - topBarHeight - paddingY * 2;
      const inputFieldWidth = panelWidth * PanelConfig.inputFieldWidthFraction;
      const inputButtonSpacing =
        panelWidth * PanelConfig.inputButtonSpacingFraction;

      this._inputFieldBox = new St.BoxLayout({
        style_class: "input-field-box",
        x_expand: false,
        vertical: false,
        style: `padding: 0 ${panelWidth * PanelConfig.paddingFractionX}px;`,
      });

      this._inputFieldBox.set_height(inputFieldHeight);
      this._inputFieldBox.set_width(panelWidth);
      this._inputFieldBox.set_position(
        0,
        outputHeight + topBarHeight + paddingY
      );
      this._panelOverlay.add_child(this._inputFieldBox);

      this._inputField = new St.Entry({
        hint_text: "Type your message here...",
        can_focus: true,
        style: `border-radius: 9999px; width: ${inputFieldWidth}px; margin-right: ${inputButtonSpacing}px;`,
      });

      this._inputField.clutter_text.connect("key-press-event", (_, event) => {
        if (event.get_key_symbol() === Clutter.KEY_Return) {
          this._sendMessage();
          return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
      });

      this._inputFieldBox.add_child(this._inputField);

      this._sendButton = new St.Button({
        child: new St.Icon({
          gicon: Gio.icon_new_for_string(
            `${this._extensionPath}/icons/send-icon.svg`
          ),
          style_class: "system-status-icon",
        }),
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
        this._clearOutput();
        this._addTemporaryMessage("Please enter a message.");
        return;
      }

      this._inputField.set_text("");
      this._clearOutput();
      this._addTemporaryMessage("Waiting for response...");

      await sendMessage(userMessage, this._context);
      this._updateHistory();
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
          const prefix = isUser ? "You: " : "AI: ";
          const label = new St.Label({
            text: prefix + msg.text,
            x_align: alignment,
            style:
              "padding: 5px; margin-bottom: 5px; max-width: 90%; word-wrap: break-word;",
          });
          this._outputContainer.add_child(label);
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

    destroy() {
      if (this._modelMenu) {
        this._modelMenu.destroy();
      }
      this._panelOverlay.destroy();
      super.destroy();
    }
  }
);
