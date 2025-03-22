/**
 * Linux Copilot - GNOME Shell Extension
 *
 * A GNOME extension that integrates AI capabilities directly into the desktop environment.
 * Supports both local AI models via Ollama and cloud-based models via OpenAI.
 *
 * @author TheoThePerson
 * @license MIT
 */

import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import { Indicator } from "./ui/panel.js";
import { cleanupOnDisable } from "./services/messaging.js";
import * as ExtensionManager from "./lib/extensionManager.js";

/**
 * Main extension class that handles initialization and cleanup
 */
export default class LinuxCopilotExtension extends Extension {
  /**
   * Enable the extension
   * Initializes UI components and services when the extension is enabled
   */
  enable() {
    try {
      // Initialize extension manager
      ExtensionManager.init(this);

      // Create indicator and pass extension instance to it
      this._indicator = new Indicator(this);
      Main.panel.addToStatusArea(this.metadata.uuid, this._indicator);
    } catch (error) {
      console.error("Error enabling Linux Copilot extension:", error);
      // Try to clean up if initialization failed
      this._cleanup();
    }
  }

  /**
   * Disable the extension
   * Performs cleanup when the extension is disabled
   */
  disable() {
    this._cleanup();
  }

  /**
   * Internal cleanup method
   * Ensures all resources are properly released
   * @private
   */
  _cleanup() {
    // Clean up UI
    if (this._indicator) {
      this._indicator.destroy();
      this._indicator = null;
    }

    // Clean up extension manager
    ExtensionManager.cleanup();

    // Clean up messaging service
    cleanupOnDisable();

    // Clear API caches if available
    try {
      const apiUtils = import("./services/apiUtils.js");
      if (apiUtils && typeof apiUtils.clearCache === "function") {
        apiUtils.clearCache();
      }
    } catch (error) {
      console.error("Error clearing API cache:", error);
    }

    // Clear UI caches if available
    try {
      const panelElements = import("./ui/panelElements.js");
      if (panelElements && typeof panelElements.clearCaches === "function") {
        panelElements.clearCaches();
      }
    } catch (error) {
      console.error("Error clearing UI caches:", error);
    }

    // Force garbage collection if possible
    if (global.gc) {
      try {
        global.gc();
      } catch (e) {
        console.error("Error triggering garbage collection:", e);
      }
    }
  }
}
