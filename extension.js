/**
 * Linux Copilot - GNOME Shell Extension
 *
 * A GNOME extension that integrates AI capabilities directly into the desktop environment.
 * Supports both local AI models via Ollama and cloud-based models via OpenAI.
 *
 * @author TheoThePerson
 * @license MIT
 */

import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as ExtensionManager from "./lib/extensionManager.js";
import { cleanupOnDisable } from "./services/messaging.js";
import { Indicator } from "./ui/mainPanel.js";

export default class LinuxCopilotExtension extends Extension {
  enable() {
    try {
      ExtensionManager.init(this);
      this._indicator = new Indicator(this);
      Main.panel.addToStatusArea(this.metadata.uuid, this._indicator);
    } catch {
      // Silent error in production
      this._cleanup();
    }
  }

  disable() {
    this._cleanup();
  }

  _cleanup() {
    if (this._indicator) {
      this._indicator.destroy();
      this._indicator = null;
    }

    ExtensionManager.cleanup();
    cleanupOnDisable();
  }
}
