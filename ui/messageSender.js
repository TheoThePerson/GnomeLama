/**
 * Message sender functionality for the panel UI
 */
import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import GLib from "gi://GLib";

// Import from reorganized modules
import * as MessageProcessor from "./messageProcessor.js";
import * as PanelElements from "./panelWidgets.js";

// Import from services
import {
  getConversationHistory,
  getLastError,
  isProcessingMessage as isServiceProcessingMessage,
  stopAiMessage,
} from "../services/messaging.js";

import * as LayoutManager from "./layoutManager.js";

export class MessageSender {
  constructor(options) {
    const {
      extensionPath,
      inputField,
      sendButton,
      outputContainer,
      outputScrollView,
      fileHandler = null,
      pasteHandler = null,
      visualContainerManager = null,
    } = options;

    this._extensionPath = extensionPath;
    this._inputField = inputField;
    this._sendButton = sendButton;
    this._outputContainer = outputContainer;
    this._outputScrollView = outputScrollView;
    this._fileHandler = fileHandler;
    this._pasteHandler = pasteHandler;
    this._visualContainerManager = visualContainerManager;

    this._sendIcon = null;
    this._sendButtonClickId = null;
    this._isProcessingMessage = false;
    this._context = null;

    this._setupSendButton();
    this._setupInputField();
  }

  _setupSendButton() {
    // Get send icon from the button's child
    this._sendIcon = this._sendButton.get_child();

    // Set up initial click handler
    this._updateSendButtonState(true);
  }

  _setupInputField() {
    // Set up enter key handler
    this._inputField.clutter_text.connect("key-press-event", (_, event) => {
      const keySymbol = event.get_key_symbol();
      const modifiers = event.get_state();
      
      if (keySymbol === Clutter.KEY_Return || keySymbol === Clutter.KEY_KP_Enter) {
        // Check for Ctrl+Enter or Shift+Enter - these should create new lines
        if (modifiers & Clutter.ModifierType.CONTROL_MASK || 
            modifiers & Clutter.ModifierType.SHIFT_MASK) {
          
          console.log("Modifier detected:", modifiers & Clutter.ModifierType.CONTROL_MASK ? "Ctrl" : "Shift");
          
          // Handle Ctrl+Enter manually since it doesn't insert newline automatically
          if (modifiers & Clutter.ModifierType.CONTROL_MASK) {
            const clutterText = this._inputField.clutter_text;
            const cursorPos = clutterText.get_cursor_position();
            
            // Use insert_text to insert newline at cursor position
            clutterText.insert_text('\n', cursorPos);
            
            // Update height immediately after manual insertion
            this._updateInputFieldHeight();
            return Clutter.EVENT_STOP;
          }
          
          // For Shift+Enter, let the text field handle it naturally
          GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1, () => {
            this._updateInputFieldHeight();
            return GLib.SOURCE_REMOVE;
          });
          
          return Clutter.EVENT_PROPAGATE;
        }
        
        // Plain Enter sends the message
        if (this._isProcessingMessage) {
          this.stopMessage();
        } else {
          this.sendMessage();
        }
        return Clutter.EVENT_STOP;
      }
      return Clutter.EVENT_PROPAGATE;
    });

    // Monitor text changes to handle input field expansion
    this._inputField.clutter_text.connect("text-changed", () => {
      // Use a longer delay to allow layout recalculation for text wrapping detection
      GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
        this._updateInputFieldHeight();
        return GLib.SOURCE_REMOVE;
      });
    });

    // Register input field as expandable container
    this._registerInputFieldExpansion();

    // Update input field hint based on conversation history
    this._updateInputFieldHint();

    // Connect to the input field's parent to handle focus when it's added to the stage
    this._inputField.get_parent().connect("notify::mapped", () => {
      if (this._inputField.get_parent().mapped) {
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
          this._tryFocusInputField();
          return GLib.SOURCE_REMOVE;
        });
      }
    });
  }

  /**
   * Registers the input field with the visual container manager for expansion
   * @private
   */
  _registerInputFieldExpansion() {
    // Use the visual container manager if available
    if (this._visualContainerManager && this._inputField) {
      // Store a reference to track expansion
      this._currentInputExpansion = 0;
      
      // Register the input field for expansion tracking with a simple getter
      this._visualContainerManager.registerInputFieldExpansion(
        this._inputField,
        () => this._currentInputExpansion
      );
    }
  }

  /**
   * Updates the input field height and container layout
   * @private
   */
  _updateInputFieldHeight() {
    if (!this._inputField || !this._inputField.clutter_text) {
      return;
    }

    const text = this._inputField.get_text();
    if (!text) {
      this._currentInputExpansion = 0;
      this._inputField.set_height(40);
      if (this._visualContainerManager) {
        this._visualContainerManager.updateLayout();
      }
      return;
    }

    // Count manual newlines (this was working)
    const lines = text.split('\n').length;
    const extraLines = Math.max(0, lines - 1);
    
    // Calculate expansion for manual newlines
    const expansionPerLine = 19;
    let newExpansion = extraLines * expansionPerLine;
    
    // Add text wrapping detection
    try {
      const clutterText = this._inputField.clutter_text;
      if (clutterText) {
        const layout = clutterText.get_layout();
        if (layout) {
          const layoutLineCount = layout.get_line_count();
          console.log("Layout line count:", layoutLineCount, "Manual lines:", lines);
          const actualLines = Math.max(lines, layoutLineCount); // Use whichever is higher
          const totalExtraLines = Math.max(0, actualLines - 1);
          newExpansion = totalExtraLines * expansionPerLine;
          console.log("Using layout-based expansion:", newExpansion);
        } else {
          console.log("No layout available");
        }
      } else {
        console.log("No clutter text available");
      }
    } catch (e) {
      // Fall back to just counting manual newlines if layout detection fails
      console.log("Layout detection failed:", e.message, "using manual line count");
    }
    
    console.log("Manual lines:", lines, "Total expansion:", newExpansion);
    
    // Update our expansion tracker
    this._currentInputExpansion = newExpansion;
    
    // Set the input field height
    const baseHeight = 40;
    this._inputField.set_height(baseHeight + newExpansion);
    
    // Update the visual container manager layout
    if (this._visualContainerManager) {
      this._visualContainerManager.updateLayout();
    }
  }

  /**
   * Prepare message content for sending, dealing with files
   * @param {string} userInput - Raw user input text
   * @returns {Object} Object containing messageToSend and displayMessage
   */
  _prepareMessageContent(userInput) {
    if (!this._fileHandler?.hasLoadedFiles()) {
      return { messageToSend: userInput, displayMessage: userInput };
    }

    const fileContent = this._fileHandler.getFormattedFileContent();
    if (!fileContent) {
      return { messageToSend: userInput, displayMessage: userInput };
    }

    try {
      // Remove marker and parse JSON
      const jsonContentOnly = fileContent.replace(" ｢files attached｣", "");
      const jsonData = JSON.parse(jsonContentOnly);
      jsonData.prompt = userInput;
      
      // Register file paths for lookup during apply operations
      MessageProcessor.registerFilePaths(jsonContentOnly);
      
      return {
        messageToSend: JSON.stringify(jsonData, null, 2),
        displayMessage: userInput + " ｢files attached｣"
      };
    } catch {
      // If parsing fails, append content without marker
      return {
        messageToSend: userInput + "\n\n" + fileContent.replace(" ｢files attached｣", ""),
        displayMessage: userInput + " ｢files attached｣"
      };
    }
  }

  /**
   * Handle pre-send UI updates
   */
  _handlePreSendUpdates() {
    // Clean up file boxes if fileHandler is available
    if (this._fileHandler) {
      this._fileHandler.cleanupFileContentBox();
    }

    // Update input field hint to "Your response..." immediately after sending
    PanelElements.updateInputFieldHint(this._inputField, false);

    // Set processing state
    this._isProcessingMessage = true;
    this._updateSendButtonState(false);
  }

  /**
   * Handle post-send UI updates and error recovery
   * @param {Error} error - Optional error object if an error occurred
   */
  _handlePostSendUpdates(error = null) {
    // Reset processing state
    this._isProcessingMessage = false;
    this._updateSendButtonState(true);
    this._updateInputFieldHint();

    // Handle errors
    const serviceError = getLastError();
    if (serviceError || error) {
      const errorMessage = this._formatErrorMessage(serviceError, error);
      MessageProcessor.removeTemporaryMessages(this._outputContainer);
      MessageProcessor.addTemporaryMessage(this._outputContainer, errorMessage);
    }

    // Give focus back to input field
    this._focusInputField();
  }

  /**
   * Format error message from service and local errors
   * @private
   */
  _formatErrorMessage(serviceError, localError) {
    let message = serviceError || "Error processing your message. Please try again.";
    if (localError?.message && !message.includes(localError.message)) {
      message += ` (${localError.message})`;
    }
    return message;
  }

  /**
   * Public method to focus the input field - can be called from main panel
   */
  focusInputField() {
    this._focusInputField();
  }

  /**
   * Force focus the input field immediately
   */
  forceFocusInputField() {
    this._tryFocusInputField();
  }

  /**
   * Focus the input field with a small delay
   * @private
   */
  _focusInputField() {
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
      this._tryFocusInputField();
      return GLib.SOURCE_REMOVE;
    });
  }

  /**
   * Try different methods to focus the input field
   * @private
   */
  _tryFocusInputField() {
    if (!this._inputField || !this._inputField.clutter_text) {
      // Retry after a short delay if input field is not ready
      GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
        this._tryFocusInputField();
        return GLib.SOURCE_REMOVE;
      });
      return;
    }

    // Method 1: Try stage focus
    if (Main?.global?.stage) {
      Main.global.stage.set_key_focus(this._inputField.clutter_text);
    }

    // Method 2: Try direct grab_key_focus
    if (this._inputField.clutter_text.grab_key_focus) {
      this._inputField.clutter_text.grab_key_focus();
    }

    // Method 3: Try focusing parent first, then input field
    const parent = this._inputField.get_parent();
    if (parent && parent.grab_key_focus) {
      parent.grab_key_focus();
      GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
        if (this._inputField.clutter_text && this._inputField.clutter_text.grab_key_focus) {
          this._inputField.clutter_text.grab_key_focus();
        }
        return GLib.SOURCE_REMOVE;
      });
    }

    // Method 4: Try with a longer delay as fallback
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
      if (this._inputField && this._inputField.clutter_text) {
        if (Main?.global?.stage) {
          Main.global.stage.set_key_focus(this._inputField.clutter_text);
        }
        if (this._inputField.clutter_text.grab_key_focus) {
          this._inputField.clutter_text.grab_key_focus();
        }
      }
      return GLib.SOURCE_REMOVE;
    });
  }

  /**
   * Send a message
   */
  async sendMessage() {
    const userInput = this._inputField.get_text().trim();
    if (!userInput || this._isProcessingMessage || isServiceProcessingMessage()) {
      return;
    }

    // Clear input field and prepare message
    this._inputField.set_text("");
    
    // Reset input field height after clearing text
    this._resetInputFieldHeight();
    
    const { messageToSend, displayMessage } = this._prepareMessageContent(userInput);

    // Update UI for sending
    this._handlePreSendUpdates();
    if (this._pasteHandler) {
      this._pasteHandler.onMessageSent();
    }

    try {
      MessageProcessor.removeTemporaryMessages(this._outputContainer);
      await MessageProcessor.processUserMessage({
        userMessage: messageToSend,
        displayMessage,
        context: this._context,
        outputContainer: this._outputContainer,
        scrollView: this._outputScrollView,
        onResponseStart: () => this._updateSendButtonState(false),
        onResponseEnd: () => this._handlePostSendUpdates(),
        skipAppendUserMessage: false,
      });
    } catch (error) {
      this._handlePostSendUpdates(error);
    }
  }

  /**
   * Resets the input field to its base height
   * @private
   */
  _resetInputFieldHeight() {
    // Reset expansion tracker
    this._currentInputExpansion = 0;
    
    // Reset input field height
    const baseHeight = 40;
    this._inputField.set_height(baseHeight);
    
    if (this._visualContainerManager) {
      this._visualContainerManager.resetToBaseState();
    }
  }

  /**
   * Stop the current AI message generation
   */
  stopMessage() {
    if (!this._isProcessingMessage && !isServiceProcessingMessage()) {
      return;
    }

    stopAiMessage();
    
    // Reset paste handler state to allow pasting the same content again
    if (this._pasteHandler) {
      this._pasteHandler.onMessageSent();
    }
    
    this._handlePostSendUpdates();
  }

  /**
   * Update the send button state based on whether message processing is active
   * @param {boolean} enabled - Whether the button should be in send mode (vs stop mode)
   */
  _updateSendButtonState(enabled) {
    // Update button state
    this._sendButton.reactive = true; // Always keep reactive to allow stopping
    this._sendButton.can_focus = true;

    // Switch between send and stop icons
    const iconPath = enabled ? "send-icon.svg" : "stop-icon.svg";
    this._sendIcon.set_gicon(
      Gio.icon_new_for_string(`${this._extensionPath}/icons/${iconPath}`)
    );

    // Update click handler based on state
    if (this._sendButtonClickId) {
      this._sendButton.disconnect(this._sendButtonClickId);
    }

    this._sendButtonClickId = this._sendButton.connect(
      "clicked",
      enabled ? this.sendMessage.bind(this) : this.stopMessage.bind(this)
    );
  }

  /**
   * Check if a message is currently being processed
   */
  isProcessingMessage() {
    return this._isProcessingMessage || isServiceProcessingMessage();
  }

  /**
   * Update the input field hint based on conversation history
   */
  _updateInputFieldHint() {
    const history = getConversationHistory();
    const isNewChat =
      history.length === 0 ||
      (history.length > 0 && history[history.length - 1].type === "user");

    PanelElements.updateInputFieldHint(this._inputField, isNewChat);
  }

  /**
   * Cleanup resources when the component is destroyed
   */
  destroy() {
    if (this._sendButtonClickId) {
      this._sendButton.disconnect(this._sendButtonClickId);
      this._sendButtonClickId = null;
    }

    // Unregister input field from expansion manager
    if (this._visualContainerManager) {
      this._visualContainerManager.unregisterInputFieldExpansion();
    }

    // Ensure any in-progress messages are stopped
    if (this._isProcessingMessage || isServiceProcessingMessage()) {
      stopAiMessage();
    }
  }

  /**
   * Set the file handler
   * @param {Object} fileHandler - The file handler object
   */
  setFileHandler(fileHandler) {
    this._fileHandler = fileHandler;
  }
}
