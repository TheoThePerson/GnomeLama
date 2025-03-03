import Gio from "gi://Gio";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

export function getSettings() {
  const extension = Extension.lookupByURL(import.meta.url);
  return extension.getSettings("org.gnomelama");
}

// Example usage:
// import { getSettings } from './settings.js';
// const settings = getSettings();
