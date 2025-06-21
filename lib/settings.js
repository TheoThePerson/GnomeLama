/**
 * Settings management module
 */
import * as ExtensionManager from "./extensionManager.js";

/**
 * Add camelCase property accessors to the settings object
 * @param {Object} settings - The settings object to enhance
 */
function addPropertyAccessors(settings) {
  const propertyMap = {
    "panel-width-fraction": "panelWidthFraction",
    "input-field-height-fraction": "inputFieldHeightFraction",
    "padding-fraction-x": "paddingFractionX",
    "padding-fraction-y": "paddingFractionY",
    "top-bar-height-fraction": "topBarHeightFraction",
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
  const fallback = {};

  // Add settings methods with minimal fallback values
  fallback.get_double = () => 0;
  fallback.get_string = () => "";
  fallback.set_string = () => {};
  fallback.set_double = () => {};
  fallback.connect = () => 0;
  fallback.disconnect = () => {};

  return fallback;
}

/**
 * Get extension settings with fallback values
 * @param {Function} [onChanged] - Optional callback for when settings change
 * @returns {Object} Extension settings
 */
export function getSettings(onChanged) {
  try {
    const extension = ExtensionManager.getExtension();
    if (!extension) {
      // Extension instance unavailable, use fallback settings
      return createFallbackSettings();
    }
    const settings = extension.getSettings(
      "org.gnome.shell.extensions.gnomelama"
    );

    // Add property accessors
    addPropertyAccessors(settings);

    // Connect onChanged callback if provided
    if (typeof onChanged === "function") {
      settings.connect("changed", onChanged);
    }

    return settings;
  } catch {
    // Error loading settings, use fallback
    return createFallbackSettings();
  }
}
