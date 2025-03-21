/**
 * Message sender functionality for the panel UI
 */
import Gio from "gi://Gio";
import Clutter from "gi://Clutter";

// Import from reorganized modules
import * as PanelElements from "./panelElements.js";
import * as MessageProcessor from "./messageProcessor.js";

// Import from services
import {
  stopAiMessage,
  getConversationHistory,
} from "../services/messaging.js";

export class MessageSender {
  constructor(
    extensionPath,
    inputField,
    sendButton,
    outputContainer,
    outputScrollView,
    fileHandler = null // Add fileHandler parameter with default value
  ) {
    this._extensionPath = extensionPath;
    this._inputField = inputField;
    this._sendButton = sendButton;
    this._outputContainer = outputContainer;
    this._outputScrollView = outputScrollView;
    this._fileHandler = fileHandler; // Store fileHandler reference

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
  }

  /**
   * Send a message
   */
  async sendMessage() {
    const userMessage = this._inputField.get_text().trim();
    if (!userMessage || this._isProcessingMessage) return;

    // Clear input field immediately
    this._inputField.set_text("");

    // Create display message for UI and history (simpler version)
    let displayMessage = userMessage;
    let messageToSend = "";
    let fileContentAdded = false;

    if (this._fileHandler && this._fileHandler.hasLoadedFiles()) {
      // Get JSON formatted file content
      let fileContent = this._fileHandler.getFormattedFileContent();

      if (fileContent) {
        // Parse the JSON to add the prompt
        try {
          const jsonData = JSON.parse(fileContent);
          jsonData.prompt = userMessage;
          messageToSend = JSON.stringify(jsonData, null, 2);
          fileContentAdded = true;
          displayMessage += " [files attached]";

          // Register file paths for lookup during apply operations
          MessageProcessor.registerFilePaths(fileContent);
        } catch (error) {
          console.error("Error parsing JSON file content:", error);
          // Fallback in case of error
          messageToSend = "Prompt: " + userMessage + "\n\n" + fileContent;
        }
      }
    } else {
      // No files, just use the standard format
      messageToSend = "Prompt: " + userMessage;
    }

    // Clean up file boxes if fileHandler is available
    if (this._fileHandler) {
      this._fileHandler.cleanupFileContentBox(); // This clears both UI and file data after sending
    }

    // Update input field hint to "Your response..." immediately after sending
    PanelElements.updateInputFieldHint(this._inputField, false);

    // Set processing state
    this._isProcessingMessage = true;
    this._updateSendButtonState(false);

    try {
      // Show the simplified message in UI
      MessageProcessor.appendUserMessage(this._outputContainer, displayMessage);

      // Process the user message with files included, but store the display message in history
      await MessageProcessor.processUserMessage({
        userMessage: messageToSend,
        displayMessage: displayMessage, // Add display message for history
        context: this._context,
        outputContainer: this._outputContainer,
        scrollView: this._outputScrollView,
        onResponseStart: () => {
          // Update send button to show stop icon
          this._updateSendButtonState(false);
        },
        onResponseEnd: () => {
          // Reset processing state
          this._isProcessingMessage = false;
          this._updateSendButtonState(true);
        },
        skipAppendUserMessage: true, // Skip appending again since we did it above
      });
    } catch (error) {
      console.error("Error processing message:", error);
      MessageProcessor.addTemporaryMessage(
        this._outputContainer,
        "Error processing your message. Please try again."
      );

      // Reset processing flag on error
      this._isProcessingMessage = false;
      this._updateSendButtonState(true);
      // Update input field hint
      this._updateInputFieldHint();
    }

    // Give focus back to input field
    global.stage.set_key_focus(this._inputField.clutter_text);
  }

  /**
   * Stop the current AI message generation
   */
  stopMessage() {
    stopAiMessage();
    this._isProcessingMessage = false;
    this._updateSendButtonState(true);
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
    return this._isProcessingMessage;
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
   * Clean up resources when destroying this object
   */
  destroy() {
    if (this._sendButtonClickId) {
      this._sendButton.disconnect(this._sendButtonClickId);
      this._sendButtonClickId = null;
    }
  }

  /**
   * Set the file handler
   * @param {FileHandler} fileHandler - The file handler instance
   */
  setFileHandler(fileHandler) {
    this._fileHandler = fileHandler;
  }
}
