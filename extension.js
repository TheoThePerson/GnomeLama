/**
 * GnomeLama - Linux Copilot
 * Main extension entry point
 */
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import { Indicator } from "./ui/panel.js";

export default class GnomeLamaExtension extends Extension {
  /**
   * Enable the extension
   */
  enable() {
    this._indicator = new Indicator(this.path);
    Main.panel.addToStatusArea(this.metadata.uuid, this._indicator);
  }

  /**
   * Disable the extension
   */
  disable() {
    this._indicator.destroy();
    this._indicator = null;
  }
}
