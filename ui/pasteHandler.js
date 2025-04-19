/**
 * PasteHandler - Manages clipboard paste operations
 */
import Clutter from "gi://Clutter";
import GLib from "gi://GLib";
import St from "gi://St";
import Shell from "gi://Shell";
import * as MessageProcessor from "./messageProcessor.js";

const global = Shell.Global.get();

export class PasteHandler {
  /**
   * Create a new PasteHandler
   * @param {Object} options - Configuration options
   * @param {St.Entry} options.inputField - The text input field
   * @param {FileHandler} options.fileHandler - The file handler for creating file boxes
   * @param {St.Widget} options.outputContainer - The output container for messages
   * @param {Function} options.updateLayoutCallback - Callback to update layout after changes
   */
  constructor({
    inputField,
    fileHandler,
    outputContainer,
    updateLayoutCallback,
  }) {
    this.inputField = inputField;
    this.fileHandler = fileHandler;
    this.outputContainer = outputContainer;
    this.updateLayout = updateLayoutCallback;

    // Internal state
    this.isProcessingPaste = false;
    this.lastProcessedText = "";
    this.lastPasteTime = 0;
    this.pastedTextCount = 0;
    
    // Connect clipboard context menu functionality
    this._setupMiddleware();
  }
  
  /**
   * Sets up middleware to intercept text input changes
   * for detecting context menu paste operations
   * @private
   */
  _setupMiddleware() {
    // Get the clutter text inside the St.Entry
    const clutterText = this.inputField.clutter_text;
    
    // Store original set_text to intercept paste operations
    const originalSetText = clutterText.set_text;
    
    // Save reference to original method for cleanup
    this._originalSetText = originalSetText;
    
    // Keep reference to this for use in callback
    const self = this;
    
    // Replace the set_text method with our middleware
    clutterText.set_text = function(text) {
      // Get current text to compare
      const currentText = clutterText.get_text();
      
      // Check if this might be a paste operation that wasn't triggered by Ctrl+V
      if (!self.isProcessingPaste && text !== currentText && text && text.length > currentText.length) {
        // Try to detect pasted content
        const possiblePaste = PasteHandler.findLikelyPastedContent(currentText, text);
        
        if (possiblePaste && possiblePaste.length > 0) {
          // Handle as a paste operation
          self.handleClipboardPaste(possiblePaste);
          return;
        }
      }
      
      // Call the original implementation if not handled as paste
      return originalSetText.call(this, text);
    };
  }

  /**
   * Handle pasted text from clipboard
   * @param {string} text - The pasted text
   */
  handleClipboardPaste(text) {
    if (!text || text === this.lastProcessedText) {
      return;
    }

    // Set flag and save text to prevent duplicate processing
    this.isProcessingPaste = true;
    this.lastProcessedText = text;

    // Create a file box with the pasted text
    if (this.fileHandler) {
      // Increment the pasted text counter
      this.pastedTextCount++;

      // Create a file box with the pasted text
      this.fileHandler.createFileBoxFromText(
        text,
        "Pasted Text"
      );

      // Ensure layout is updated
      this.updateLayout();

      // Return focus to input field
      global.stage.set_key_focus(this.inputField.clutter_text);
    }

    // Reset processing flag after a short delay
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
      this.isProcessingPaste = false;
      return false; // Don't repeat
    });
  }

  /**
   * Handle key press events to detect paste operations
   * @param {St.Entry} actor - The actor (text field)
   * @param {Clutter.Event} event - The key event
   * @returns {Clutter.EventType} Whether to propagate the event
   */
  handleKeyPress(actor, event) {
    // Check if Ctrl+V was pressed (paste shortcut)
    const symbol = event.get_key_symbol();
    const state = event.get_state();
    const ctrlPressed = (state & Clutter.ModifierType.CONTROL_MASK) !== 0;

    if (ctrlPressed && (symbol === Clutter.KEY_v || symbol === Clutter.KEY_V)) {
      // Get current time to prevent double processing
      const currentTime = Date.now();
      if (currentTime - this.lastPasteTime < 500) {
        return Clutter.EVENT_PROPAGATE; // Prevent double processing
      }
      this.lastPasteTime = currentTime;

      // Get clipboard content
      const clipboard = St.Clipboard.get_default();

      // Set this flag before the async operation to prevent text-changed from triggering
      this.isProcessingPaste = true;

      clipboard.get_text(St.ClipboardType.CLIPBOARD, (clipboardObj, text) => {
        if (!text || text === this.lastProcessedText) {
          this.isProcessingPaste = false;
          return;
        }

        this.lastProcessedText = text;

        // Always create a file box with the pasted text
        if (this.fileHandler) {
          // Increment the pasted text counter
          this.pastedTextCount++;

          // Create a file box with the pasted text and title "Pasted Text"
          this.fileHandler.createFileBoxFromText(
            text,
            "Pasted Text"
          );

          // Ensure layout is updated
          this.updateLayout();

          // Return focus to input field
          global.stage.set_key_focus(this.inputField.clutter_text);
        }

        // Reset the processing flag after a delay
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
          this.isProcessingPaste = false;
          return false; // Don't repeat
        });
      });

      // Return Clutter.EVENT_STOP to prevent the default paste operation
      return Clutter.EVENT_STOP;
    }

    return Clutter.EVENT_PROPAGATE;
  }

  /**
   * Find likely pasted content by comparing before/after text
   * @param {string} previousText - The text before paste
   * @param {string} currentText - The text after paste
   * @returns {string|null} The likely pasted content or null
   */
  static findLikelyPastedContent(previousText, currentText) {
    // If no previous text, the entire current text was likely pasted
    if (!previousText) {
      return currentText;
    }

    // If they're identical, nothing was pasted
    if (previousText === currentText) {
      return null;
    }

    // Find the likely pasted content by checking for large chunks of new text
    // First, try to find where they start to differ
    let differenceIndex = 0;
    while (
      differenceIndex < previousText.length &&
      differenceIndex < currentText.length &&
      previousText[differenceIndex] === currentText[differenceIndex]
    ) {
      differenceIndex++;
    }

    // Then find where they start to be the same again after the difference
    // (looking from the end backward)
    let endMatchIndex = 0;
    while (
      endMatchIndex < previousText.length &&
      endMatchIndex < currentText.length &&
      previousText[previousText.length - 1 - endMatchIndex] ===
        currentText[currentText.length - 1 - endMatchIndex]
    ) {
      endMatchIndex++;
    }

    // Extract the differing portion (likely the paste)
    const pastedContent = currentText.substring(
      differenceIndex,
      currentText.length - endMatchIndex
    );

    return pastedContent;
  }

  /**
   * Clean up the paste handler and restore original methods
   */
  cleanup() {
    if (this._originalSetText && this.inputField && this.inputField.clutter_text) {
      this.inputField.clutter_text.set_text = this._originalSetText;
      this._originalSetText = null;
    }
  }
}
