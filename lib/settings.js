/**
 * Settings management module
 */
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
  modelsApiEndpoint: "http://localhost:11434/api/tags",
  temperature: 0.7,
};

// Store a singleton instance of the settings
let settingsInstance = null;

/**
 * Add camelCase property accessors to the settings object
 * @param {Object} settings - The settings object to enhance
 */
function addPropertyAccessors(settings) {
  // Map kebab-case keys to camelCase properties
  const propertyMap = {
    "panel-width-fraction": "panelWidthFraction",
    "input-field-height-fraction": "inputFieldHeightFraction",
    "padding-fraction-x": "paddingFractionX",
    "padding-fraction-y": "paddingFractionY",
    "top-bar-height-fraction": "topBarHeightFraction",
    "clear-icon-scale": "clearIconScale",
    "clear-button-padding-fraction": "clearButtonPaddingFraction",
    "user-message-color": "userMessageColor",
    "ai-message-color": "aiMessageColor",
    "background-color": "backgroundColor",
    "top-bar-color": "topBarColor",
    "default-model": "defaultModel",
    "api-endpoint": "apiEndpoint",
    "models-api-endpoint": "modelsApiEndpoint",
    temperature: "temperature",
  };

  // Add property accessors
  for (const [key, prop] of Object.entries(propertyMap)) {
    Object.defineProperty(settings, prop, {
      get: function () {
        // Use the appropriate getter based on the schema type
        if (
          key.includes("fraction") ||
          key.includes("scale") ||
          key === "temperature"
        ) {
          return this.get_double(key);
        } else if (
          key.includes("color") ||
          key.includes("model") ||
          key.includes("endpoint")
        ) {
          return this.get_string(key);
        }
        return this.get_value(key).deep_unpack();
      },
      set: function (value) {
        // Use the appropriate setter based on the schema type
        if (
          key.includes("fraction") ||
          key.includes("scale") ||
          key === "temperature"
        ) {
          return this.set_double(key, value);
        } else if (
          key.includes("color") ||
          key.includes("model") ||
          key.includes("endpoint")
        ) {
          return this.set_string(key, value);
        }
        return this.set_value(key, new GLib.Variant(typeof value, value));
      },
    });
  }
}

/**
 * Get the extension object by searching metadata directory
 * @returns {Object|null} Extension object or null if not found
 */
function getExtensionObject() {
  return Extension.lookupByURL(import.meta.url);
}

/**
 * Create a fallback settings object when Gio settings aren't available
 * @returns {Object} A fallback settings object with the same interface
 */
function createFallbackSettings() {
  const fallback = { ...DEFAULT_CONFIG };

  // Add simple versions of the settings methods
  fallback.get_double = (key) => {
    const camelKey = key.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
    return fallback[camelKey] || DEFAULT_CONFIG[camelKey] || 0;
  };

  fallback.get_string = (key) => {
    const camelKey = key.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
    return fallback[camelKey] || DEFAULT_CONFIG[camelKey] || "";
  };

  fallback.connect = () => 0; // Dummy connect function
  fallback.disconnect = () => {}; // Dummy disconnect function

  return fallback;
}

/**
 * Gets the singleton settings instance
 * @returns {Object} The settings object
 */
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
