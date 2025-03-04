import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

// Legacy configuration values as fallbacks
const DEFAULT_CONFIG = {
  panelWidthFraction: 0.15,
  inputFieldHeightFraction: 0.03,
  paddingFractionX: 0.02,
  paddingFractionY: 0.01,
  topBarHeightFraction: 0.03,
  inputButtonSpacingFraction: 0.01,
  clearIconScale: 0.9,
  clearButtonPaddingFraction: 0.01,
  userMessageColor: "#007BFF",
  aiMessageColor: "#FF8800",
  backgroundColor: "#000000",
  topBarColor: "#111111",
  textColor: "#FFFFFF",
  defaultModel: "llama3.2:1b",
  apiEndpoint: "http://localhost:11434/api/generate",
  temperature: 0.7,
};

// Store a singleton instance of the settings
let settingsInstance = null;

export function getSettings() {
  // If we already have a settings instance, return it
  if (settingsInstance) {
    return settingsInstance;
  }

  try {
    // Try to get the extension using URL lookup
    const extension = Extension.lookupByURL(import.meta.url);
    if (extension) {
      // If extension is found, get settings and enhance them with camelCase accessors
      settingsInstance = extension.getSettings("org.gnomelama");
      addPropertyAccessors(settingsInstance);
      return settingsInstance;
    }
  } catch (e) {
    console.error("Error looking up extension by URL:", e);
  }

  // If we get here, we couldn't get the extension by URL - try a different approach
  try {
    // Try to get extensions by metadata directory
    const extensionObject = getExtensionObject();
    if (extensionObject) {
      settingsInstance = extensionObject.getSettings("org.gnomelama");
      addPropertyAccessors(settingsInstance);
      return settingsInstance;
    }
  } catch (e) {
    console.error("Error getting extension by directory:", e);
  }

  // If we still couldn't get settings, create a fallback object
  console.warn("Using fallback config values - settings system not available");
  return createFallbackSettings();
}

// Try to find the extension object using various methods
function getExtensionObject() {
  try {
    // Try to get the current extension
    const ExtensionUtils = imports.misc.extensionUtils;
    return ExtensionUtils.getCurrentExtension();
  } catch (e) {
    console.error("Could not get current extension:", e);
    return null;
  }
}

// Add camelCase property accessors to settings object
function addPropertyAccessors(settings) {
  if (!settings.panelWidthFraction) {
    // Panel dimensions
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

    // Icon settings
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

    // Color settings
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

    Object.defineProperty(settings, "backgroundColor", {
      get: function () {
        return this.get_string("background-color");
      },
    });

    Object.defineProperty(settings, "topBarColor", {
      get: function () {
        return this.get_string("top-bar-color");
      },
    });

    Object.defineProperty(settings, "textColor", {
      get: function () {
        return this.get_string("text-color");
      },
    });

    // API settings
    Object.defineProperty(settings, "defaultModel", {
      get: function () {
        return this.get_string("default-model");
      },
    });

    Object.defineProperty(settings, "apiEndpoint", {
      get: function () {
        return this.get_string("api-endpoint");
      },
    });

    Object.defineProperty(settings, "temperature", {
      get: function () {
        return this.get_double("temperature");
      },
    });
  }

  return settings;
}

// Create a fallback settings object that uses default values
function createFallbackSettings() {
  const fallbackSettings = {};

  // Create getters for properties to mimic GSettings API
  Object.keys(DEFAULT_CONFIG).forEach((key) => {
    Object.defineProperty(fallbackSettings, key, {
      get: function () {
        return DEFAULT_CONFIG[key];
      },
    });

    // Add kebab-case get_* methods to mimic GSettings API
    const kebabKey = key.replace(
      /[A-Z]/g,
      (letter) => `-${letter.toLowerCase()}`
    );
    if (typeof DEFAULT_CONFIG[key] === "number") {
      fallbackSettings[`get_double`] = function (k) {
        if (k === kebabKey) return DEFAULT_CONFIG[key];
        return 0;
      };
    } else if (typeof DEFAULT_CONFIG[key] === "string") {
      fallbackSettings[`get_string`] = function (k) {
        if (k === kebabKey) return DEFAULT_CONFIG[key];
        return "";
      };
    }
  });

  // Add a stub for the connect method
  fallbackSettings.connect = function () {
    return 0;
  };

  return fallbackSettings;
}

// Example usage:
// import { getSettings } from './settings.js';
// const settings = getSettings();
