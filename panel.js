import GObject from "gi://GObject";
import St from "gi://St";
import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import { sendMessage, getConversationHistory } from "./messaging.js";

const PanelConfig = {
  panelWidthFraction: 0.2,
  inputFieldWidthFraction: 0.75,
  inputFieldHeightFraction: 0.03,
  paddingFractionX: 0.02,
  paddingFractionY: 0.9,
  topBarHeight: 40,
};

export const Indicator = GObject.registerClass(
  class Indicator extends PanelMenu.Button {
    _init(extensionPath) {
      super._init(0.0, "AI Chat Panel");

      this._context = null;
      this._extensionPath = extensionPath;

      this.add_child(
        new St.Icon({
          icon_name: "face-smile-symbolic",
          style_class: "system-status-icon",
        })
      );

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

      // Create top bar with explicit height
      this._topBar = new St.BoxLayout({
        style_class: "top-bar",
        width: panelWidth,
        height: PanelConfig.topBarHeight,
        reactive: true,
        style:
          "background-color: rgba(255, 255, 255, 0.2); border-bottom: 1px solid rgba(255, 255, 255, 0.3); padding: 5px;",
      });

      this._panelOverlay.add_child(this._topBar);

      // Calculate heights for output and input areas
      const inputFieldHeight =
        panelHeight * PanelConfig.inputFieldHeightFraction;
      const outputHeight =
        panelHeight - inputFieldHeight - PanelConfig.topBarHeight - 10;

      this._outputScrollView = new St.ScrollView({
        width: panelWidth,
        height: outputHeight,
        style_class: "output-scrollview",
        y: PanelConfig.topBarHeight + 10,
      });

      this._outputContainer = new St.BoxLayout({
        vertical: true,
        reactive: true,
        clip_to_allocation: true,
      });
      this._outputScrollView.set_child(this._outputContainer);
      this._panelOverlay.add_child(this._outputScrollView);

      this._inputFieldBox = new St.BoxLayout({
        style_class: "input-field-box",
        x_expand: true,
        vertical: false,
      });
      this._inputFieldBox.set_height(inputFieldHeight);
      this._inputFieldBox.set_position(
        0,
        outputHeight + PanelConfig.topBarHeight + 10
      );
      this._panelOverlay.add_child(this._inputFieldBox);

      this._inputField = new St.Entry({
        hint_text: "Type your message here...",
        can_focus: true,
        style: "border-radius: 9999px;",
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
      this._sendButton.connect("clicked", () => this._sendMessage());
      this._inputFieldBox.add_child(this._sendButton);

      // Restore original panel toggle behavior
      this.connect("button-press-event", () => {
        this._panelOverlay.visible = !this._panelOverlay.visible;
        if (this._panelOverlay.visible) {
          this._updateHistory();
          global.stage.set_key_focus(this._inputField.clutter_text);
        }
      });
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
      this._outputContainer.get_children().forEach((child) => child.destroy());

      const history = getConversationHistory();
      for (const msg of history) {
        const isUser = msg.type === "user";
        const alignment = isUser
          ? Clutter.ActorAlign.END
          : Clutter.ActorAlign.START;
        const prefix = isUser ? "You: " : "AI: ";
        const label = new St.Label({
          text: prefix + msg.text,
          x_align: alignment,
          style: "padding: 5px; margin-bottom: 5px; max-width: 90%;",
        });
        this._outputContainer.add_child(label);
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
      this._panelOverlay.destroy();
      super.destroy();
    }
  }
);
