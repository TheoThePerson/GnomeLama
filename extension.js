import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { Indicator } from "./panel.js";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

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
