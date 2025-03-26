/**
 * Settings management module
 */
import * as ExtensionManager from "./extensionManager.js";

// Default configuration values
const DEFAULT_CONFIG = {
  panelWidthFraction: 0.15,
  inputFieldHeightFraction: 0.03,
  paddingFractionX: 0.02,
  paddingFractionY: 0.01,
  topBarHeightFraction: 0.03,
  inputFieldSpacingFraction: 0.005,
  clearIconScale: 0.9,
  userMessageColor: "#007BFF",
  aiMessageColor: "#FF8800",
  backgroundColor: "#000000",
  backgroundOpacity: 1.0,
  topBarColor: "#111111",
  defaultModel: "llama3.2:1b",
  apiEndpoint: "http://localhost:11434/api/generate",
  modelsApiEndpoint: "http://localhost:11434/api/tags",
  temperature: 0.7,
  fileBoxSize: 100,
};

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
    "input-field-spacing-fraction": "inputFieldSpacingFraction",
    "clear-icon-scale": "clearIconScale",
    "user-message-color": "userMessageColor",
    "ai-message-color": "aiMessageColor",
    "background-color": "backgroundColor",
    "background-opacity": "backgroundOpacity",
    "top-bar-color": "topBarColor",
    "default-model": "defaultModel",
    "api-endpoint": "apiEndpoint",
    "models-api-endpoint": "modelsApiEndpoint",
    temperature: "temperature",
    "file-box-size": "fileBoxSize",
  };

  // Add property accessors
  for (const [key, prop] of Object.entries(propertyMap)) {
    Object.defineProperty(settings, prop, {
      get() {
        // Use the appropriate getter based on the schema type
        if (
          key.includes("fraction") ||
          key.includes("scale") ||
          key === "temperature" ||
          key === "background-opacity"
        ) {
          return this.get_double(key);
        }
        return this.get_string(key);
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
    const camelKey = key.replace(/-([a-z])/gu, (g) => g[1].toUpperCase());
    return fallback[camelKey] || DEFAULT_CONFIG[camelKey] || 0;
  };

  fallback.get_string = (key) => {
    const camelKey = key.replace(/-([a-z])/gu, (g) => g[1].toUpperCase());
    return fallback[camelKey] || DEFAULT_CONFIG[camelKey] || "";
  };

  fallback.set_string = (key, value) => {
    const camelKey = key.replace(/-([a-z])/gu, (g) => g[1].toUpperCase());
    fallback[camelKey] = value;
  };

  fallback.set_double = (key, value) => {
    const camelKey = key.replace(/-([a-z])/gu, (g) => g[1].toUpperCase());
    fallback[camelKey] = value;
  };

  fallback.connect = () => 0;
  fallback.disconnect = () => {
    /* No-op function for interface compatibility */
  };

  return fallback;
}

/**
 * Get extension settings with fallback values
 * @returns {Object} Extension settings
 */
export function getSettings() {
  try {
    const extension = ExtensionManager.getExtension();
    if (!extension) {
      // Extension instance unavailable, use fallback settings
      return createFallbackSettings();
    }
    const settings = extension.getSettings(
      "org.gnome.shell.extensions.gnomelama"
    );
    addPropertyAccessors(settings);
    return settings;
  } catch {
    // Error loading settings, use fallback
    return createFallbackSettings();
  }
}
