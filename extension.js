const { GObject, St, Clutter, GLib, Gio } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const _ = ExtensionUtils.gettext;

const PanelConfig = {
  panelWidthFraction: 0.3,
  inputFieldHeight: 40,
};

const Indicator = GObject.registerClass(
  class Indicator extends PanelMenu.Button {
    _init() {
      super._init(0.0, _("AI Chat Panel"));

      // Icon in the top bar
      this.add_child(
        new St.Icon({
          icon_name: "face-smile-symbolic",
          style_class: "system-status-icon",
        })
      );

      // Menu item to toggle panel visibility
      const toggleItem = new PopupMenu.PopupMenuItem(_("Show Panel"));
      toggleItem.connect("activate", () => this._togglePanel());
      this.menu.addMenuItem(toggleItem);

      // Create overlay panel
      this._panelOverlay = new St.Widget({
        style_class: "panel-overlay",
        reactive: true,
        visible: false,
        width: Math.floor(
          Main.layoutManager.primaryMonitor.width *
            PanelConfig.panelWidthFraction
        ),
        height: Math.floor(Main.layoutManager.primaryMonitor.height * 0.5),
      });

      Main.layoutManager.uiGroup.add_child(this._panelOverlay);

      // Position the panel at the right side of the screen
      this._panelOverlay.set_position(
        Main.layoutManager.primaryMonitor.width - this._panelOverlay.width,
        Main.panel.height
      );

      this._contentBox = new St.BoxLayout({
        vertical: true,
        style_class: "panel-content-box",
      });
      this._panelOverlay.add_child(this._contentBox);

      // Input field for user messages
      this._inputField = new St.Entry({
        style_class: "panel-input-field",
        hint_text: _("Type your message here..."),
        height: PanelConfig.inputFieldHeight,
        width: 300,
        can_focus: true,
      });

      this._inputField.clutter_text.connect("key-press-event", (_, event) => {
        if (event.get_key_symbol() === Clutter.KEY_Return) {
          this._sendMessage();
          return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
      });

      this._contentBox.add_child(this._inputField);

      // Button to send the message
      this._sendButton = new St.Button({
        label: _("Send"),
        style_class: "panel-send-button",
      });

      this._sendButton.connect("clicked", () => this._sendMessage());
      this._contentBox.add_child(this._sendButton);

      // Output label to display the AI's response
      this._outputLabel = new St.Label({
        text: _(""),
        style_class: "panel-output-label",
      });

      this._contentBox.add_child(this._outputLabel);
    }

    _togglePanel() {
      this._panelOverlay.visible = !this._panelOverlay.visible;

      if (this._panelOverlay.visible) {
        global.stage.set_key_focus(this._inputField.clutter_text);
      }
    }

    _sendMessage() {
      const userMessage = this._inputField.get_text().trim();
      if (!userMessage) {
        this._outputLabel.set_text(_("Please enter a message."));
        return;
      }

      this._inputField.set_text(""); // Clear the input field
      this._outputLabel.set_text(_("Waiting for response..."));

      // Construct the curl command
      const curlCommand = [
        "curl",
        "-X",
        "POST",
        "http://localhost:11434/api/generate",
        "-H",
        "Content-Type: application/json",
        "-d",
        JSON.stringify({ model: "llama3.2", prompt: userMessage }),
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
          let [line, length] = await new Promise((resolve, reject) => {
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
            break; // End of stream
          }

          // Parse the JSON response
          let json;
          try {
            json = JSON.parse(line);
          } catch (e) {
            this._outputLabel.set_text(_("Error parsing response."));
            continue;
          }

          // Update the output label with the response
          if (json && json.response) {
            const currentText = this._outputLabel.get_text();
            this._outputLabel.set_text(currentText + json.response);
          }
        }
      } catch (error) {
        this._outputLabel.set_text(_("Stream processing error."));
      } finally {
        stream.close(null); // Close the stream
      }
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
