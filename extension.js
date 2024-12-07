const { GObject, St, Clutter, GLib, Gio } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const _ = ExtensionUtils.gettext;

const PanelConfig = {
  panelWidthFraction: 0.3,
  inputFieldHeight: 100,
};

const Indicator = GObject.registerClass(
  class Indicator extends PanelMenu.Button {
    _init() {
      super._init(0.0, _("AI Chat Panel"));

      // Initialize the context storage
      this._context = null;

      // Icon in the top bar
      this.add_child(
        new St.Icon({
          icon_name: "face-smile-symbolic",
          style_class: "system-status-icon",
        })
      );

      // Create overlay panel
      this._panelOverlay = new St.Widget({
        style_class: "panel-overlay",
        reactive: true,
        visible: false, // Initially hidden
        width: Math.floor(
          Main.layoutManager.primaryMonitor.width *
            PanelConfig.panelWidthFraction
        ),
        height:
          Main.layoutManager.primaryMonitor.height - Main.panel.actor.height,
        x:
          Main.layoutManager.primaryMonitor.width -
          Math.floor(
            Main.layoutManager.primaryMonitor.width *
              PanelConfig.panelWidthFraction
          ),
        y: Main.panel.actor.height,
        style: "background-color: #333; border-radius: 5px;", // Dark gray background
      });

      Main.layoutManager.uiGroup.add_child(this._panelOverlay);

      this._contentBox = new St.BoxLayout({
        vertical: true,
        style_class: "panel-content-box",
        x_expand: true,
        y_expand: true,
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

      // Toggle panel visibility on icon click
      this.connect("button-press-event", () => {
        this._panelOverlay.visible = !this._panelOverlay.visible;

        if (this._panelOverlay.visible) {
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

      // Construct the curl command
      const curlCommand = [
        "curl",
        "-X",
        "POST",
        "http://localhost:11434/api/generate",
        "-H",
        "Content-Type: application/json",
        "-d",
        JSON.stringify({ model: "llama3.2:1b", prompt: userMessage }),
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

          // Update the stored context if available
          if (json.context && Array.isArray(json.context)) {
            this._context = json.context;
            log(`[DEBUG] Updated context: ${JSON.stringify(this._context)}`);
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

    // Method to retrieve the current context
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
