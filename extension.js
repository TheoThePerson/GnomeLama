/**
 * Linux Copilot - GNOME Shell Extension
 * Main extension entry point
 */
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import { Indicator } from "./ui/panel.js";
import { cleanupOnDisable } from "./services/messaging.js";
import * as ExtensionManager from "./lib/extensionManager.js";

export default class LinuxCopilotExtension extends Extension {
  /**
   * Enable the extension
   */
  enable() {
    // Initialize extension manager
    ExtensionManager.init(this);

    // Create indicator and pass extension instance to it
    this._indicator = new Indicator(this);
    Main.panel.addToStatusArea(this.metadata.uuid, this._indicator);
  }

  /**
   * Disable the extension
   */
  disable() {
    this._indicator.destroy();
    this._indicator = null;

    // Clean up extension manager
    ExtensionManager.cleanup();

    // Clean up messaging service
    cleanupOnDisable();
  }
}
