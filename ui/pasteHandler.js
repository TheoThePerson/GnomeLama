/**
 * PasteHandler - Manages clipboard paste operations
 */
import St from "gi://St";
import Clutter from "gi://Clutter";
import GLib from "gi://GLib";
import * as MessageProcessor from "./messageProcessor.js";

export class PasteHandler {
  /**
   * Create a new PasteHandler
   * @param {St.Entry} inputField - The text input field
   * @param {FileHandler} fileHandler - The file handler for creating file boxes
   * @param {St.Widget} outputContainer - The output container for messages
   * @param {Function} updateLayoutCallback - Callback to update layout after changes
   */
  constructor(inputField, fileHandler, outputContainer, updateLayoutCallback) {
    this.inputField = inputField;
    this.fileHandler = fileHandler;
    this.outputContainer = outputContainer;
    this.updateLayout = updateLayoutCallback;

    // Internal state
    this.isProcessingPaste = false;
    this.lastProcessedText = "";
    this.lastPasteTime = 0;
    this.pastedTextCount = 0;
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

      // Capture the current text and cursor position before paste
      const currentText = this.inputField.get_text() || "";
      const cursorPos = actor.get_cursor_position();
      let selectionStart = -1;
      let selectionEnd = -1;

      // Check if there's a text selection
      if (actor.get_selection_bound() >= 0) {
        selectionStart = Math.min(actor.get_selection_bound(), cursorPos);
        selectionEnd = Math.max(actor.get_selection_bound(), cursorPos);
      }

      // Get clipboard content
      const clipboard = St.Clipboard.get_default();

      // Set this flag before the async operation to prevent text-changed from triggering
      this.isProcessingPaste = true;

      clipboard.get_text(St.ClipboardType.CLIPBOARD, (clipboard, text) => {
        if (!text || text === this.lastProcessedText) {
          this.isProcessingPaste = false;
          return;
        }

        // Count words in pasted text
        const wordCount = text
          .split(/\s+/)
          .filter((word) => word.length > 0).length;

        // If text is longer than a threshold, create a file box
        if (wordCount > 100) {
          this.lastProcessedText = text;

          // Increment the pasted text counter
          this.pastedTextCount++;

          // Create a file box with the pasted text and sequential title
          if (this.fileHandler) {
            this.fileHandler.createFileBoxFromText(
              text,
              `Pasted ${this.pastedTextCount}`
            );

            // Ensure layout is updated
            this.updateLayout();

            // Return focus to input field
            global.stage.set_key_focus(this.inputField.clutter_text);

            // Show a temporary confirmation message
            MessageProcessor.addTemporaryMessage(
              this.outputContainer,
              `Long text added as file box "Pasted ${this.pastedTextCount}"`
            );
          }
        } else {
          // For shorter text, manually insert at cursor position
          let newText;
          if (selectionStart >= 0) {
            // Replace selected text with paste
            newText =
              currentText.substring(0, selectionStart) +
              text +
              currentText.substring(selectionEnd);

            // Set cursor position after pasted text
            const newCursorPos = selectionStart + text.length;
            this.inputField.set_text(newText);
            actor.set_cursor_position(newCursorPos);
          } else {
            // Insert at current cursor position
            newText =
              currentText.substring(0, cursorPos) +
              text +
              currentText.substring(cursorPos);

            // Set cursor position after pasted text
            const newCursorPos = cursorPos + text.length;
            this.inputField.set_text(newText);
            actor.set_cursor_position(newCursorPos);
          }
        }

        // Reset the processing flag after a delay
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
          this.isProcessingPaste = false;
          return false; // Don't repeat
        });
      });

      // Return Clutter.EVENT_STOP to prevent the default paste operation
      // We've manually handled both short and long text above
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
  findLikelyPastedContent(previousText, currentText) {
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
}
