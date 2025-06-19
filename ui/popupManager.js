/**
 * Global popup management system
 * Handles coordination between all popups in the extension
 */

class PopupManager {
  constructor() {
    this._popups = new Map(); // Stores registered popups by ID
    this._activePopup = null; // Currently active popup ID
  }

  /**
   * Register a popup with the manager
   * @param {string} id - Unique identifier for the popup
   * @param {object} popup - The popup object with open/close methods
   * @param {Function} isOpenFn - Function that returns whether the popup is open
   * @param {Function} closeFn - Function to close the popup
   * @param {Function} beforeOpenFn - Optional function to run before opening (can return false to prevent opening)
   * @param {Function} afterCloseFn - Optional function to run after closing
   */
  registerPopup(id, { isOpenFn, closeFn, beforeOpenFn = null, afterCloseFn = null }) {
    this._popups.set(id, {
      id,
      isOpen: isOpenFn,
      close: closeFn,
      beforeOpen: beforeOpenFn,
      afterClose: afterCloseFn
    });
  }

  /**
   * Unregister a popup from the manager
   * @param {string} id - Unique identifier for the popup
   */
  unregisterPopup(id) {
    this._popups.delete(id);
    if (this._activePopup === id) {
      this._activePopup = null;
    }
  }

  /**
   * Close all popups except for the specified one
   * @param {string|null} except - ID of popup to keep open (or null to close all)
   */
  closeAllExcept(except) {
    for (const [id, popup] of this._popups.entries()) {
      if (id !== except && popup.isOpen()) {
        popup.close();
        if (popup.afterClose) {
          popup.afterClose();
        }
      }
    }
    
    if (except) {
      this._activePopup = except;
    } else {
      this._activePopup = null;
    }
  }

  /**
   * Notify that a popup is about to open
   * @param {string} id - ID of the popup that's opening
   * @returns {boolean} - Whether the popup should be allowed to open
   */
  notifyOpen(id) {
    const popup = this._popups.get(id);
    if (!popup) return true;
    
    // Check if this popup wants to prevent itself from opening
    if (popup.beforeOpen && popup.beforeOpen() === false) {
      return false;
    }
    
    // Close all other popups
    this.closeAllExcept(id);
    return true;
  }

  /**
   * Check if any popup is currently open
   * @returns {boolean} - True if any popup is open
   */
  isAnyPopupOpen() {
    for (const popup of this._popups.values()) {
      if (popup.isOpen()) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get the ID of the currently active popup
   * @returns {string|null} - ID of the active popup or null if none
   */
  getActivePopup() {
    return this._activePopup;
  }
}

// Create a singleton instance
const _instance = new PopupManager();

/**
 * Get the global popup manager instance
 * @returns {PopupManager} - The popup manager instance
 */
export function getPopupManager() {
  return _instance;
} 