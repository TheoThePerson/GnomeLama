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

export class MessageSender {
  constructor(options) {
    const {
      extensionPath,
      inputField,
      sendButton,
      outputContainer,
      outputScrollView,
      fileHandler = null,
    } = options;

    this._extensionPath = extensionPath;
    this._inputField = inputField;
    this._sendButton = sendButton;
    this._outputContainer = outputContainer;
    this._outputScrollView = outputScrollView;
    this._fileHandler = fileHandler;

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
      if (event.get_key_symbol() === Clutter.KEY_Return) {
        if (this._isProcessingMessage) {
          this.stopMessage();
        } else {
          this.sendMessage();
        }
        return Clutter.EVENT_STOP;
      }
      return Clutter.EVENT_PROPAGATE;
    });

    // Update input field hint based on conversation history
    this._updateInputFieldHint();

    // Connect to the input field's parent to handle focus when it's added to the stage
    this._inputField.get_parent().connect("notify::mapped", () => {
      if (this._inputField.get_parent().mapped) {
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
          if (Main && Main.global && Main.global.stage) {
            Main.global.stage.set_key_focus(this._inputField.clutter_text);
          }
          return GLib.SOURCE_REMOVE;
        });
      }
    });
  }

  /**
   * Prepare message content for sending
   * @param {string} userInput - Raw user input text
   * @returns {Object} Object containing messageToSend and displayMessage
   */
  _prepareMessageContent(userInput) {
    let displayMessage = userInput;
    let messageToSend = "";

    if (this._fileHandler && this._fileHandler.hasLoadedFiles()) {
      // Get JSON formatted file content
      const fileContent = this._fileHandler.getFormattedFileContent();

      if (fileContent) {
        // Parse the JSON to add the prompt
        try {
          const jsonData = JSON.parse(fileContent);
          jsonData.prompt = userInput;
          messageToSend = JSON.stringify(jsonData, null, 2);
          displayMessage += " ｢files attached｣";

          // Register file paths for lookup during apply operations
          MessageProcessor.registerFilePaths(fileContent);
        } catch {
          messageToSend = "Prompt: " + userInput + "\n\n" + fileContent;
        }
      }
    } else {
      // No files, just use the standard format
      messageToSend = "Prompt: " + userInput;
    }

    return { messageToSend, displayMessage };
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

    // Update input field hint
    this._updateInputFieldHint();

    // If there was an error, show it - prioritize service errors
    const serviceError = getLastError();
    if (serviceError || error) {
      MessageProcessor.addTemporaryMessage(
        this._outputContainer,
        serviceError || "Error processing your message. Please try again."
      );
    }

    // Give focus back to input field with a small delay
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
      if (Main && Main.global && Main.global.stage) {
        Main.global.stage.set_key_focus(this._inputField.clutter_text);
      }
      return GLib.SOURCE_REMOVE;
    });
  }

  /**
   * Send a message
   */
  async sendMessage() {
    const userInput = this._inputField.get_text().trim();
    if (
      !userInput ||
      this._isProcessingMessage ||
      isServiceProcessingMessage()
    ) {
      return;
    }

    // Clear input field immediately
    this._inputField.set_text("");

    // Prepare the message content
    const { messageToSend, displayMessage } =
      this._prepareMessageContent(userInput);

    // Update UI for sending
    this._handlePreSendUpdates();

    try {
      // Show the simplified message in UI
      MessageProcessor.appendUserMessage(this._outputContainer, displayMessage);
      MessageProcessor.removeTemporaryMessages(this._outputContainer);

      // Process the user message with files included, but store the display message in history
      await MessageProcessor.processUserMessage({
        userMessage: messageToSend,
        displayMessage,
        context: this._context,
        outputContainer: this._outputContainer,
        scrollView: this._outputScrollView,
        onResponseStart: () => this._updateSendButtonState(false),
        onResponseEnd: () => this._handlePostSendUpdates(),
        skipAppendUserMessage: true, // Skip appending again since we did it above
      });
    } catch (error) {
      this._handlePostSendUpdates(error);
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
