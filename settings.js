import Gio from "gi://Gio";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

export function getSettings() {
  const extension = Extension.lookupByURL(import.meta.url);
  const settings = extension.getSettings("org.gnomelama");

  // Add proxy getters to maintain compatibility with old camelCase property access
  // This allows code that used to access PanelConfig.propertyName to now access settings.propertyName
  if (!settings.panelWidthFraction) {
    Object.defineProperty(settings, "panelWidthFraction", {
      get: function () {
        return this.get_double("panel-width-fraction");
      },
    });

    Object.defineProperty(settings, "inputFieldHeightFraction", {
      get: function () {
        return this.get_double("input-field-height-fraction");
      },
    });

    Object.defineProperty(settings, "paddingFractionX", {
      get: function () {
        return this.get_double("padding-fraction-x");
      },
    });

    Object.defineProperty(settings, "paddingFractionY", {
      get: function () {
        return this.get_double("padding-fraction-y");
      },
    });

    Object.defineProperty(settings, "topBarHeightFraction", {
      get: function () {
        return this.get_double("top-bar-height-fraction");
      },
    });

    Object.defineProperty(settings, "inputButtonSpacingFraction", {
      get: function () {
        return this.get_double("input-button-spacing-fraction");
      },
    });

    Object.defineProperty(settings, "clearIconScale", {
      get: function () {
        return this.get_double("clear-icon-scale");
      },
    });

    Object.defineProperty(settings, "clearButtonPaddingFraction", {
      get: function () {
        return this.get_double("clear-button-padding-fraction");
      },
    });

    Object.defineProperty(settings, "userMessageColor", {
      get: function () {
        return this.get_string("user-message-color");
      },
    });

    Object.defineProperty(settings, "aiMessageColor", {
      get: function () {
        return this.get_string("ai-message-color");
      },
    });
  }

  return settings;
}

// Example usage:
// import { getSettings } from './settings.js';
// const settings = getSettings();
