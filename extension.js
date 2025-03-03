import * as Main from "resource:///org/gnome/Shell/Extensions/js/ui/main.js";
import { Indicator } from "./panel.js";
import { Extension } from "resource:///org/gnome/Shell/Extensions/js/extensions/extension.js";

export default class GnomeLamaExtension extends Extension {
  enable() {
    this._indicator = new Indicator(this.path); // Pass the path to the Indicator
    Main.panel.addToStatusArea(this.metadata.uuid, this._indicator);
  }

  disable() {
    this._indicator.destroy();
    this._indicator = null;
  }
}
