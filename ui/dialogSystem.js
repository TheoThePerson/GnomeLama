import Clutter from "gi://Clutter";
import St from "gi://St";
import GLib from "gi://GLib";
import Pango from "gi://Pango";

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
      const { message, buttons, title } = options;

      // Create a simple overlay
      const overlay = new St.Widget({
        style_class: "dialog-overlay",
        reactive: true
      });
      
      overlay.set_size(this._panelOverlay.width, this._panelOverlay.height);
      overlay.set_position(0, 0);

      // Create dialog container
      const dialog = new St.BoxLayout({
        vertical: true,
        style_class: "dialog-container"
      });

      // Add title if provided
      if (title) {
        const titleLabel = new St.Label({
          text: title,
          style_class: "dialog-title"
        });
        dialog.add_child(titleLabel);
      }

      // Add message with manual line breaks if needed to ensure wrapping
      const processedMessage = this._ensureTextWrapping(message, 55);
      
      const messageLabel = new St.Label({
        text: processedMessage,
        style_class: "dialog-message"
      });
      
      // Force text wrapping settings
      if (messageLabel.clutter_text) {
        messageLabel.clutter_text.set_line_wrap(true);
        messageLabel.clutter_text.set_ellipsize(0); // Use 0 instead of enum
        messageLabel.clutter_text.set_single_line_mode(false);
      }
      
      dialog.add_child(messageLabel);

      // Use a simple BoxLayout for buttons with spacing
      const buttonsContainer = new St.BoxLayout({
        style_class: "dialog-buttons",
        x_align: Clutter.ActorAlign.CENTER
      });

      // Create and add buttons with even spacing
      buttons.forEach(buttonConfig => {
        const button = new St.Button({
          label: buttonConfig.label,
          style_class: "dialog-button"
        });

        button.connect("clicked", () => {
          overlay.destroy();
          resolve(buttonConfig.action);
        });

        buttonsContainer.add_child(button);
      });

      dialog.add_child(buttonsContainer);
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
   * Ensures text is properly wrapped by inserting manual line breaks if needed
   * 
   * @param {string} text - Text to wrap
   * @param {number} maxLineLength - Maximum character count per line 
   * @returns {string} Text with manual line breaks
   */
  _ensureTextWrapping(text, maxLineLength) {
    // First normalize the text by replacing multiple spaces with single spaces
    text = text.replace(/\s+/g, ' ').trim();
    
    // Split into words
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';
    
    // Build lines of appropriate length
    for (const word of words) {
      if (currentLine.length + word.length + 1 <= maxLineLength) {
        // Add word to current line
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        // Start a new line
        lines.push(currentLine);
        currentLine = word;
      }
    }
    
    // Add the last line if it's not empty
    if (currentLine) {
      lines.push(currentLine);
    }
    
    // Join lines with newlines
    return lines.join('\n');
  }
} 