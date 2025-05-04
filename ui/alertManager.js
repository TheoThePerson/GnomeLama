import Clutter from "gi://Clutter";
import St from "gi://St";
import GLib from "gi://GLib";
import Pango from "gi://Pango";
import { getPopupManager } from "./popupManager.js";

/**
 * A generic dialog system for the extension
 */
export class DialogSystem {
  /**
   * Creates a new DialogSystem instance
   * 
   * @param {Object} options - Configuration options
   * @param {St.Widget} options.panelOverlay - The panel overlay to attach dialogs to
   */
  constructor(options) {
    this._panelOverlay = options.panelOverlay;
    this._popupManager = getPopupManager();
    this._currentDialog = null;
    this._currentOverlay = null;
    
    // Register with popup manager
    this._popupManager.registerPopup('dialog', {
      isOpenFn: () => this._currentDialog !== null,
      closeFn: () => this.closeCurrentDialog(),
      beforeOpenFn: () => {
        // Close any existing dialog first
        if (this._currentDialog) {
          this.closeCurrentDialog();
        }
        return true;
      }
    });
  }

  /**
   * Close the current dialog if one is open
   */
  closeCurrentDialog() {
    if (this._currentOverlay) {
      this._currentOverlay.destroy();
      this._currentOverlay = null;
      this._currentDialog = null;
    }
  }

  /**
   * Shows a dialog with custom options
   * 
   * @param {Object} options - Dialog options
   * @param {string} options.message - The message to display
   * @param {Array<{label: string, action: string}>} options.buttons - Array of button configurations
   * @param {string} [options.title] - Optional title for the dialog
   * @returns {Promise<string>} - Promise resolving to the chosen action
   */
  showDialog(options) {
    return new Promise((resolve) => {
      // Notify popup manager before showing dialog
      if (!this._popupManager.notifyOpen('dialog')) {
        resolve('cancel');
        return;
      }
      
      const { message, buttons, title } = options;

      // Create a simple overlay
      const overlay = new St.Widget({
        style_class: "dialog-overlay",
        reactive: true
      });
      
      overlay.set_size(this._panelOverlay.width, this._panelOverlay.height);
      overlay.set_position(0, 0);
      
      // Store reference to current overlay
      this._currentOverlay = overlay;

      // Calculate dialog width (80% of panel width, with min/max constraints)
      const panelWidth = this._panelOverlay.width;
      const dialogWidth = Math.min(Math.max(Math.floor(panelWidth * 0.8), 320), 600);
      
      // Create dialog container
      const dialog = new St.BoxLayout({
        vertical: true,
        style_class: "dialog-container"
      });
      
      // Store reference to current dialog
      this._currentDialog = dialog;
      
      // Set the width directly on the dialog
      dialog.set_width(dialogWidth);

      // Add title if provided
      if (title) {
        const titleLabel = new St.Label({
          text: title,
          style_class: "dialog-title"
        });
        dialog.add_child(titleLabel);
      }

      // Calculate appropriate line length based on dialog width
      const approxCharsPerWidth = dialogWidth / 8; // Approximate characters per width unit
      const lineLength = Math.floor(approxCharsPerWidth * 0.9); // Leave some margin
      
      // Add message with manual line breaks if needed to ensure wrapping
      const processedMessage = this._ensureTextWrapping(message, lineLength);
      
      const messageLabel = new St.Label({
        text: processedMessage,
        style_class: "dialog-message"
      });

      // Enable text wrapping
      messageLabel.clutter_text.line_wrap = true;
      messageLabel.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
      messageLabel.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;

      dialog.add_child(messageLabel);

      // Create buttons
      const buttonsTable = new St.BoxLayout({
        style_class: "dialog-buttons-container",
        x_align: Clutter.ActorAlign.CENTER
      });

      buttons.forEach((button) => {
        const btn = new St.Button({
          label: button.label,
          style_class: "dialog-button"
        });

        btn.connect("clicked", () => {
          // Close the dialog
          this.closeCurrentDialog();
          
          // Resolve the promise with the action
          resolve(button.action);
        });

        buttonsTable.add_child(btn);
      });

      // Handle clicks outside the dialog to dismiss
      overlay.connect("button-press-event", (actor, event) => {
        const [x, y] = event.get_coords();
        const [dialogX, dialogY] = dialog.get_transformed_position();
        const [dialogWidth, dialogHeight] = dialog.get_size();

        if (
          !(
            x >= dialogX &&
            x <= dialogX + dialogWidth &&
            y >= dialogY &&
            y <= dialogY + dialogHeight
          )
        ) {
          this.closeCurrentDialog();
          resolve("cancel");
        }
        return Clutter.EVENT_STOP;
      });

      dialog.add_child(buttonsTable);
      overlay.add_child(dialog);
      this._panelOverlay.add_child(overlay);
      
      // Position the dialog after everything is allocated
      overlay.connect('notify::allocation', () => {
        if (!dialog.get_allocation_box || !dialog.width || !dialog.height) return;
        
        // Center the dialog
        const dialogX = Math.floor((overlay.width - dialog.width) / 2);
        const dialogY = Math.floor((overlay.height - dialog.height) / 2);
        
        dialog.set_position(dialogX, dialogY);
      });
    });
  }

  /**
   * Ensures text will wrap properly by adding manual line breaks if needed
   * 
   * @private
   * @param {string} text - The text to process
   * @param {number} lineLength - Target line length for wrapping
   * @returns {string} - Processed text with appropriate line breaks
   */
  _ensureTextWrapping(text, lineLength) {
    // Simple algorithm to ensure text wrapping by adding manual breaks as needed
    if (!text || lineLength <= 0) return text;
    
    // Let the UI handle wrapping naturally
    return text;
  }
  
  /**
   * Clean up resources
   */
  destroy() {
    this.closeCurrentDialog();
    this._popupManager.unregisterPopup('dialog');
  }
} 