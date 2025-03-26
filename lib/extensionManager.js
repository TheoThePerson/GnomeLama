/**
 * Extension instance manager
 * Provides a singleton to access the extension instance throughout the application
 */

let _extension = null;

/**
 * Initializes the extension manager with the extension instance
 * @param {Object} extension - The extension instance to store
 */
export function init(extension) {
  _extension = extension;
}

/**
 * Gets the stored extension instance
 * @returns {Object|null} The extension instance or null if not initialized
 */
export function getExtension() {
  if (!_extension) {
    console.warn("Extension instance not initialized");
  }
  return _extension;
}

/**
 * Cleans up the extension manager by removing the stored extension instance
 */
export function cleanup() {
  _extension = null;
}
