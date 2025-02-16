import GObject from "gi://GObject";
import St from "gi://St";
import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import { sendMessage } from "./messaging.js";

const PanelConfig = {
  panelWidthFraction: 0.2,
  inputFieldWidthFraction: 0.75,
  inputFieldHeightFraction: 0.03,
  paddingFractionX: 0.02,
  paddingFractionY: 0.9,
};

export const Indicator = GObject.registerClass(
  class Indicator extends PanelMenu.Button {
    _init() {
      super._init(0.0, "AI Chat Panel");

      this._context = null;

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

      // Calculate heights for the two areas:
      const inputFieldHeight =
        panelHeight * PanelConfig.inputFieldHeightFraction;
      const outputHeight = panelHeight - inputFieldHeight;

      // Create a scrollable output area:
      this._outputScrollView = new St.ScrollView({
        width: panelWidth,
        height: outputHeight,
        style_class: "output-scrollview",
      });

      // Wrap the label inside a container that is acceptable to the scroll view
      this._outputContainer = new St.BoxLayout({
        vertical: true,
        reactive: true,
        clip_to_allocation: true,
      });
      this._outputLabel = new St.Label({
        text: "",
        x_expand: true,
        y_align: Clutter.ActorAlign.START,
      });
      this._outputContainer.add_child(this._outputLabel);
      this._outputScrollView.set_child(this._outputContainer);
      this._panelOverlay.add_child(this._outputScrollView);

      // Create the input area and position it at the bottom:
      this._inputFieldBox = new St.BoxLayout({
        style_class: "input-field-box",
        x_expand: true,
        vertical: false,
      });
      this._inputFieldBox.set_height(inputFieldHeight);
      // Position it so its top edge is at the bottom of the output area:
      this._inputFieldBox.set_position(0, outputHeight);
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
          gicon: Gio.icon_new_for_string(this.path + "/icons/send-icon.svg"),
          style_class: "system-status-icon",
        }),
      });

      this._sendButton.connect("clicked", () => this._sendMessage());
      this._inputFieldBox.add_child(this._sendButton);

      // Toggle the overlay when clicking on the panel icon:
      this.connect("button-press-event", () => {
        this._panelOverlay.visible = !this._panelOverlay.visible;
        if (this._panelOverlay.visible) {
          global.stage.set_key_focus(this._inputField.clutter_text);
        }
      });
    }

    async _sendMessage() {
      const userMessage = this._inputField.get_text().trim();
      if (!userMessage) {
        this._outputLabel.set_text("Please enter a message.");
        return;
      }

      this._inputField.set_text("");
      this._outputLabel.set_text("Waiting for response...");

      const response = await sendMessage(userMessage, this._context);
      if (response) {
        this._outputLabel.set_text(response);
      } else {
        this._outputLabel.set_text("Error: Unable to get a response.");
      }
    }

    destroy() {
      this._panelOverlay.destroy();
      super.destroy();
    }
  }
);
