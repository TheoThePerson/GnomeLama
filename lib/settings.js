/**
 * Settings management module
 */
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

// Default configuration values
const DEFAULT_CONFIG = {
  panelWidthFraction: 0.15,
  inputFieldHeightFraction: 0.03,
  paddingFractionX: 0.02,
  paddingFractionY: 0.01,
  topBarHeightFraction: 0.03,
  clearIconScale: 0.9,
  userMessageColor: "#007BFF",
  aiMessageColor: "#FF8800",
  backgroundColor: "#000000",
  topBarColor: "#111111",
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
        } else {
          return this.get_string(key);
        }
      },
    });
  }
}

/**
 * Create a fallback settings object when Gio settings aren't available
 * @returns {Object} A fallback settings object with the same interface
 */
function createFallbackSettings() {
  const fallback = { ...DEFAULT_CONFIG };

  // Add settings methods
  fallback.get_double = (key) => {
    const camelKey = key.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
    return fallback[camelKey] || DEFAULT_CONFIG[camelKey] || 0;
  };

  fallback.get_string = (key) => {
    const camelKey = key.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
    return fallback[camelKey] || DEFAULT_CONFIG[camelKey] || "";
  };

  fallback.set_string = (key, value) => {
    const camelKey = key.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
    fallback[camelKey] = value;
  };

  fallback.set_double = (key, value) => {
    const camelKey = key.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
    fallback[camelKey] = value;
  };

  fallback.connect = () => 0;
  fallback.disconnect = () => {};

  return fallback;
}

/**
 * Gets the singleton settings instance
 * @returns {Object} The settings object
 */
export function getSettings() {
  // Return cached instance if available
  if (settingsInstance) {
    return settingsInstance;
  }

  try {
    // Try to get the extension by URL
    const extension = Extension.lookupByURL(import.meta.url);
    if (extension) {
      settingsInstance = extension.getSettings(
        "org.gnome.shell.extensions.gnomelama"
      );
      addPropertyAccessors(settingsInstance);
      return settingsInstance;
    }
  } catch (e) {
    console.error("Error getting extension settings:", e);
  }

  // If settings couldn't be obtained, use fallback
  console.warn("Using fallback config values - settings system not available");
  settingsInstance = createFallbackSettings();
  return settingsInstance;
}
