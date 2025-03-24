/**
 * Extension instance manager
 * Provides a singleton to access the extension instance throughout the application
 */

let _extension = null;

export function init(extension) {
  _extension = extension;
}

export function getExtension() {
  if (!_extension) {
    console.warn("Extension instance not initialized");
  }
  return _extension;
}

export function cleanup() {
  _extension = null;
}
