const { GObject, St, Clutter, GLib, Gio } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;

const _ = ExtensionUtils.gettext;

const PanelConfig = {
  panelWidthFraction: 0.2,
  inputFieldWidthFraction: 0.8,
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

      // Monitor dimensions
      const monitor = Main.layoutManager.primaryMonitor;
      const panelWidth = monitor.width * PanelConfig.panelWidthFraction;
      const panelHeight = monitor.height - Main.panel.actor.height;
      const panelPaddingX = monitor.width * PanelConfig.paddingFractionX; // Horizontal padding
      const panelPaddingY = monitor.height * PanelConfig.paddingFractionY; // Vertical padding
      const settingsPanelHeight =
        monitor.height * PanelConfig.inputFieldHeightFraction;

      // Chat Panel
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

      // Chat panel content
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

      // Output label for AI response
      this._outputLabel = new St.Label({
        text: _(""),
        style_class: "panel-output-label",
        x_expand: true,
        y_expand: true,
        y_align: Clutter.ActorAlign.START,
      });

      this._contentBox.add_child(this._outputLabel);

      // Input field for user messages
      this._inputFieldBox = new St.BoxLayout({
        style_class: "panel-input-box",
        x_expand: true,
        y_align: Clutter.ActorAlign.END,
        vertical: false,
      });

      this._inputField = new St.Entry({
        style_class: "panel-input-field",
        hint_text: _("Type your message here..."),
        height: inputFieldHeight,
        width: inputFieldWidth,
        can_focus: true,
        style: "border-radius: 9999px;", // Fully rounded corners
      });

      this._inputField.clutter_text.connect("key-press-event", (_, event) => {
        if (event.get_key_symbol() === Clutter.KEY_Return) {
          this._sendMessage();
          return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
      });

      this._inputFieldBox.add_child(this._inputField);

      const sendIconPath = `${
        ExtensionUtils.getCurrentExtension().path
      }/icons/send-icon.svg`;

      this._sendButton = new St.Button({
        style_class: "panel-send-button",
        height: inputFieldHeight,
        child: new St.Icon({
          gicon: Gio.icon_new_for_string(sendIconPath),
          style_class: "system-status-icon",
        }),
      });

      this._sendButton.connect("clicked", () => this._sendMessage());
      this._inputFieldBox.add_child(this._sendButton);

      // Add input field box to the content box
      this._contentBox.add_child(this._inputFieldBox);

      // Settings Panel
      this._settingsPanel = new St.Widget({
        style_class: "settings-panel-overlay",
        reactive: true,
        visible: false,
        width: panelWidth,
        height: settingsPanelHeight,
        x: monitor.width - panelWidth,
        y: Main.panel.actor.height, // Position below the GNOME top bar
        style: `background-color: #222; border-radius: 0px;`,
      });

      Main.layoutManager.uiGroup.add_child(this._settingsPanel);

      // Toggle panel visibility on icon click
      this.connect("button-press-event", () => {
        const isVisible = !this._panelOverlay.visible;
        this._panelOverlay.visible = isVisible;
        this._settingsPanel.visible = isVisible;

        if (isVisible) {
          global.stage.set_key_focus(this._inputField.clutter_text);
        }
      });
    }

    _sendMessage() {
      const userMessage = this._inputField.get_text().trim();
      if (!userMessage) {
        this._outputLabel.set_text(_("Please enter a message."));
        return;
      }

      this._inputField.set_text(""); // Clear the input field
      this._outputLabel.set_text(_("Waiting for response..."));

      const payload = {
        model: "llama3.2:1b",
        prompt: userMessage,
      };

      if (
        this._context &&
        Array.isArray(this._context) &&
        this._context.length > 0
      ) {
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
        this._processStream(process.get_stdout_pipe());
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
          let [line] = await new Promise((resolve, reject) => {
            stream.read_line_async(
              GLib.PRIORITY_DEFAULT,
              null,
              (source, res) => {
                try {
                  resolve(source.read_line_finish_utf8(res));
                } catch (error) {
                  reject(error);
                }
              }
            );
          });

          if (line === null) {
            break;
          }

          let json;
          try {
            json = JSON.parse(line);
          } catch (e) {
            this._outputLabel.set_text(_("Error parsing response."));
            continue;
          }

          if (json.context && Array.isArray(json.context)) {
            this._context = json.context;
            log(`[DEBUG] Updated context: ${JSON.stringify(this._context)}`);
          }

          if (json && json.response) {
            const currentText = this._outputLabel.get_text();
            this._outputLabel.set_text(currentText + json.response);
          }
        }
      } catch (error) {
        this._outputLabel.set_text(_("Stream processing error."));
      } finally {
        stream.close(null);
      }
    }

    getContext() {
      return this._context;
    }

    destroy() {
      this._panelOverlay.destroy();
      super.destroy();
    }
  }
);

class Extension {
  constructor(uuid) {
    this._uuid = uuid;
    ExtensionUtils.initTranslations("ai-chat-panel");
  }

  enable() {
    this._indicator = new Indicator();
    Main.panel.addToStatusArea(this._uuid, this._indicator);
  }

  disable() {
    this._indicator.destroy();
    this._indicator = null;
  }
}

function init(meta) {
  return new Extension(meta.uuid);
}
