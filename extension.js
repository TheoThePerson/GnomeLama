import GObject from "gi://GObject";
import St from "gi://St";
import Clutter from "gi://Clutter";
import GLib from "gi://GLib";
import Gio from "gi://Gio";

import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import {
  Extension,
  gettext as _,
} from "resource:///org/gnome/shell/extensions/extension.js";

const PanelConfig = {
  panelWidthFraction: 0.2,
  inputFieldWidthFraction: 0.75,
  inputFieldHeightFraction: 0.03,
  paddingFractionX: 0.02, // Horizontal padding as a fraction of width
  paddingFractionY: 0.9, // Vertical padding as a fraction of height
};

const Indicator = GObject.registerClass(
  class Indicator extends PanelMenu.Button {
    _init() {
      super._init(0.0, _("AI Chat Panel"));

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
      const panelPaddingX = monitor.width * PanelConfig.paddingFractionX;
      const panelPaddingY = monitor.height * PanelConfig.paddingFractionY;
      const settingsPanelHeight =
        monitor.height * PanelConfig.inputFieldHeightFraction;

      this._panelOverlay = new St.Widget({
        style_class: "panel-overlay",
        reactive: true,
        visible: false,
        width: panelWidth,
        height: panelHeight,
        x: monitor.width - panelWidth,
        y: Main.panel.actor.height,
        style: `background-color: #333; border-radius: 0px;`,
      });

      Main.layoutManager.uiGroup.add_child(this._panelOverlay);

      this._paddedBox = new St.Bin({
        style: `padding: ${panelPaddingY}px ${panelPaddingX}px;`,
        x_expand: true,
        y_expand: true,
      });

      this._panelOverlay.add_child(this._paddedBox);

      this._contentBox = new St.BoxLayout({
        vertical: true,
        style_class: "panel-content-box",
        x_expand: true,
        y_expand: true,
      });

      this._paddedBox.set_child(this._contentBox);

      const inputFieldHeight =
        panelHeight * PanelConfig.inputFieldHeightFraction;
      const inputFieldWidth = panelWidth * PanelConfig.inputFieldWidthFraction;

      this._outputLabel = new St.Label({
        text: "",
        style_class: "panel-output-label",
        x_expand: true,
        y_expand: true,
        y_align: Clutter.ActorAlign.START,
      });

      this._contentBox.add_child(this._outputLabel);

      this._inputFieldBox = new St.BoxLayout({
        style_class: "panel-input-box",
        x_expand: true,
        y_align: Clutter.ActorAlign.END,
        vertical: false,
      });

      this._inputField = new St.Entry({
        style_class: "panel-input-field",
        hint_text: _("Type your message here..."),
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
        style_class: "panel-send-button",
        child: new St.Icon({
          gicon: Gio.icon_new_for_string(this.path + "/icons/send-icon.svg"),
          style_class: "system-status-icon",
        }),
      });

      this._sendButton.connect("clicked", () => this._sendMessage());
      this._inputFieldBox.add_child(this._sendButton);

      this._contentBox.add_child(this._inputFieldBox);

      this._settingsPanel = new St.Widget({
        style_class: "settings-panel-overlay",
        reactive: true,
        visible: false,
        width: panelWidth,
        height: settingsPanelHeight,
        x: monitor.width - panelWidth,
        y: Main.panel.actor.height,
        style: `background-color: #222; border-radius: 0px;`,
      });

      Main.layoutManager.uiGroup.add_child(this._settingsPanel);

      this.connect("button-press-event", () => {
        const isVisible = !this._panelOverlay.visible;
        this._panelOverlay.visible = isVisible;
        this._settingsPanel.visible = isVisible;

        if (isVisible) {
          global.stage.set_key_focus(this._inputField.clutter_text);
        }
      });
    }

    async _sendMessage() {
      const userMessage = this._inputField.get_text().trim();
      if (!userMessage) {
        this._outputLabel.set_text(_("Please enter a message."));
        return;
      }

      this._inputField.set_text("");
      this._outputLabel.set_text(_("Waiting for response..."));

      const payload = {
        model: "llama3.2:1b",
        prompt: userMessage,
      };

      if (this._context?.length > 0) {
        payload.context = this._context;
      }

      const curlCommand = [
        "curl",
        "-X",
        "POST",
        "http://localhost:11434/api/generate",
        "-H",
        "Content-Type: application/json",
        "-d",
        JSON.stringify(payload),
      ];

      try {
        let process = new Gio.Subprocess({
          argv: curlCommand,
          flags:
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
        });

        process.init(null);
        await this._processStream(process.get_stdout_pipe());
      } catch (e) {
        this._outputLabel.set_text(_("Error: Unable to execute command."));
      }
    }

    async _processStream(outputStream) {
      const stream = new Gio.DataInputStream({
        base_stream: outputStream,
      });

      try {
        while (true) {
          const [line] = await stream.read_line_async(
            GLib.PRIORITY_DEFAULT,
            null
          );
          if (!line) break;

          let json;
          try {
            json = JSON.parse(line);
          } catch {
            this._outputLabel.set_text(_("Error parsing response."));
            continue;
          }

          if (Array.isArray(json.context)) {
            this._context = json.context;
          }

          if (json.response) {
            const currentText = this._outputLabel.get_text();
            this._outputLabel.set_text(currentText + json.response);
          }
        }
      } catch {
        this._outputLabel.set_text(_("Stream processing error."));
      } finally {
        stream.close(null);
      }
    }

    destroy() {
      this._panelOverlay.destroy();
      super.destroy();
    }
  }
);

export default class MyExtension extends Extension {
  enable() {
    this._indicator = new Indicator();
    Main.panel.addToStatusArea(this.metadata.uuid, this._indicator);
  }

  disable() {
    this._indicator.destroy();
    this._indicator = null;
  }
}
