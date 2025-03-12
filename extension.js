/**
 * Linux Copilot - GNOME Shell Extension
 * Main extension entry point
 */
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import { Indicator } from "./ui/panel.js";

export default class LinuxCopilotExtension extends Extension {
  /**
   * Enable the extension
   */
  enable() {
    // Get settings
    this._settings = this.getSettings("org.gnome.shell.extensions.gnomelama");

    // Create indicator and pass settings to it
    this._indicator = new Indicator(this.path, this._settings);
    Main.panel.addToStatusArea(this.metadata.uuid, this._indicator);
  }

  /**
   * Disable the extension
   */
  disable() {
    this._indicator.destroy();
    this._indicator = null;
    this._settings = null;
  }
}
