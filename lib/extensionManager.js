/**
 * Extension instance manager
 * Provides a singleton to access the extension instance throughout the application
 */

let _extension = null;

/**
 * Initialize the extension manager with the extension instance
 * @param {Extension} extension - The extension instance
 */
export function init(extension) {
  _extension = extension;
}

/**
 * Get the extension instance
 * @returns {Extension} The extension instance
 */
export function getExtension() {
  if (!_extension) {
    console.warn("Extension instance not initialized");
  }
  return _extension;
}

/**
 * Clean up the extension manager
 */
export function cleanup() {
  _extension = null;
}
