/**
 * Panel UI implementation
 */
import GObject from "gi://GObject";
import St from "gi://St";
import Clutter from "gi://Clutter";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import { gettext as _ } from "resource:///org/gnome/shell/extensions/extension.js";

// Import from reorganized modules
import * as PanelElements from "./panelElements.js";
import * as MessageProcessor from "./messageProcessor.js";
import * as LayoutManager from "./layoutManager.js";

// Import new modular components
import { FileHandler } from "./fileHandler.js";
import { ModelManager } from "./modelManager.js";
import { MessageSender } from "./messageSender.js";

// Import styling
import Gio from "gi://Gio";

// Import messaging
import {
  getConversationHistory,
  clearConversationHistory,
} from "../services/messaging.js";

export const Indicator = GObject.registerClass(
  class Indicator extends PanelMenu.Button {
    _init(extension) {
      super._init(0.0, "AI Chat Panel");

      this._extension = extension;
      this._extensionPath = extension.path;
      this._settings = extension.getSettings(
        "org.gnome.shell.extensions.gnomelama"
      );
      this._context = null;

      // Load stylesheet
      this._loadStylesheet();

      this._initUI();

      // Connect settings and monitor change events
      this._settingsChangedId = this._settings.connect("changed", () =>
        this._updateLayout()
      );
      Main.layoutManager.connect("monitors-changed", () =>
        this._updateLayout()
      );
      this.connect("button-press-event", this._togglePanelOverlay.bind(this));
    }

    _loadStylesheet() {
      const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
      theme.load_stylesheet(
        Gio.File.new_for_path(`${this._extensionPath}/styles/style.css`)
      );
      this._theme = theme;
    }

    _initUI() {
      // Create AI label for panel
      this.add_child(
        new St.Label({
          text: "AI",
          y_align: Clutter.ActorAlign.CENTER,
          style: "font-weight: bold; padding: 0 4px;",
        })
      );

      // Create panel overlay
      const dimensions = LayoutManager.calculatePanelDimensions();
      this._panelOverlay = PanelElements.createPanelOverlay(dimensions);

      // Create containers
      this._inputButtonsContainer = new St.BoxLayout({
        style_class: "input-buttons-container",
        vertical: true,
        reactive: true,
      });

      this._buttonsContainer = new St.BoxLayout({
        style_class: "buttons-container",
        vertical: false,
        reactive: true,
      });

      // Create output area
      const { outputScrollView, outputContainer } =
        PanelElements.createOutputArea(dimensions);
      this._outputScrollView = outputScrollView;
      this._outputContainer = outputContainer;

      // Store output scrollview reference for dynamic layout adjustments
      this._inputButtonsContainer.userData = {
        outputScrollView: this._outputScrollView,
      };

      // Set up input field based on conversation history
      const history = getConversationHistory();
      const isNewChat =
        history.length === 0 ||
        (history.length > 0 && history[history.length - 1].type === "user");

      const { inputFieldBox, inputField, sendButton } =
        PanelElements.createInputArea(this._extensionPath, isNewChat);
      this._inputFieldBox = inputFieldBox;
      this._inputField = inputField;
      this._sendButton = sendButton;

      // Create a safe update layout callback
      let isUpdatingLayout = false;
      const safeUpdateLayout = () => {
        if (!isUpdatingLayout) {
          isUpdatingLayout = true;
          this._updateLayout();
          isUpdatingLayout = false;
        }
      };

      // Initialize components
      this._initializeComponents(safeUpdateLayout);

      // Set up input field events
      this._inputField.connect("button-press-event", () => {
        if (this._modelManager && this._modelManager.isMenuOpen()) {
          this._modelManager.closeMenu();
        }
        return Clutter.EVENT_PROPAGATE;
      });

      // Flag to prevent double processing of pastes
      let isProcessingPaste = false;
      let lastProcessedText = "";
      let lastPasteTime = 0;
      let pastedTextCount = 0; // Counter for naming pasted text boxes

      // Set up paste detection via key press event (Ctrl+V)
      this._inputField.clutter_text.connect(
        "key-press-event",
        (actor, event) => {
          // Check if Ctrl+V was pressed (paste shortcut)
          const symbol = event.get_key_symbol();
          const state = event.get_state();
          const ctrlPressed = (state & Clutter.ModifierType.CONTROL_MASK) !== 0;

          if (
            ctrlPressed &&
            (symbol === Clutter.KEY_v || symbol === Clutter.KEY_V)
          ) {
            // Get current time to prevent double processing
            const currentTime = Date.now();
            if (currentTime - lastPasteTime < 500) {
              return Clutter.EVENT_PROPAGATE; // Prevent double processing
            }
            lastPasteTime = currentTime;

            // Capture the current text and cursor position before paste
            const currentText = this._inputField.get_text() || "";
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
            isProcessingPaste = true;

            clipboard.get_text(
              St.ClipboardType.CLIPBOARD,
              (clipboard, text) => {
                if (!text || text === lastProcessedText) {
                  isProcessingPaste = false;
                  return;
                }

                // Count words in pasted text
                const wordCount = text
                  .split(/\s+/)
                  .filter((word) => word.length > 0).length;

                // If text is longer than a threshold, create a file box
                if (wordCount > 100) {
                  lastProcessedText = text;

                  // Increment the pasted text counter
                  pastedTextCount++;

                  // Create a file box with the pasted text and sequential title
                  if (this._fileHandler) {
                    this._fileHandler.createFileBoxFromText(
                      text,
                      `Pasted ${pastedTextCount}`
                    );

                    // Keep any existing text, just don't add the pasted text
                    // (no need to modify the input field - we prevented the paste)

                    // Ensure layout is updated
                    this._updateLayout();

                    // Return focus to input field
                    global.stage.set_key_focus(this._inputField.clutter_text);

                    // Show a temporary confirmation message
                    MessageProcessor.addTemporaryMessage(
                      this._outputContainer,
                      `Long text added as file box "Pasted ${pastedTextCount}"`
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
                    this._inputField.set_text(newText);
                    actor.set_cursor_position(newCursorPos);
                  } else {
                    // Insert at current cursor position
                    newText =
                      currentText.substring(0, cursorPos) +
                      text +
                      currentText.substring(cursorPos);

                    // Set cursor position after pasted text
                    const newCursorPos = cursorPos + text.length;
                    this._inputField.set_text(newText);
                    actor.set_cursor_position(newCursorPos);
                  }
                }

                // Reset the processing flag after a delay
                imports.gi.GLib.timeout_add(
                  imports.gi.GLib.PRIORITY_DEFAULT,
                  500,
                  () => {
                    isProcessingPaste = false;
                    return false; // Don't repeat
                  }
                );
              }
            );

            // Return Clutter.EVENT_STOP to prevent the default paste operation
            // We've manually handled both short and long text above
            return Clutter.EVENT_STOP;
          }

          return Clutter.EVENT_PROPAGATE;
        }
      );

      // Handle text changes, potentially from other paste sources (like right-click menu)
      this._inputField.clutter_text.connect("text-changed", () => {
        // If we're processing a paste via Ctrl+V, skip this handler
        if (isProcessingPaste) {
          return;
        }

        const currentText = this._inputField.get_text();

        // Skip if empty or already processed
        if (
          !currentText ||
          currentText.length === 0 ||
          currentText === lastProcessedText
        ) {
          return;
        }

        // Only process sudden text changes with multiple words (likely pastes)
        const wordCount = currentText
          .split(/\s+/)
          .filter((word) => word.length > 0).length;

        if (wordCount > 100) {
          // The problem here is that we need to identify which part of the text was pasted
          // Since we can't directly know, we'll look for chunks that have many words together
          isProcessingPaste = true;

          // Get the text before this change event
          const previousTextSnapshot = lastProcessedText || "";

          // Find the largest new chunk of text (likely the paste)
          const pastedContent = findLikelyPastedContent(
            previousTextSnapshot,
            currentText
          );

          if (pastedContent) {
            // Update lastProcessedText to current to prevent re-processing
            lastProcessedText = currentText;

            // Increment counter for unique naming
            pastedTextCount++;

            // Create file box for the detected chunk
            if (this._fileHandler) {
              this._fileHandler.createFileBoxFromText(
                pastedContent,
                `Pasted ${pastedTextCount}`
              );

              // Remove just the pasted content from the input field
              const updatedText = currentText.replace(pastedContent, "");
              this._inputField.set_text(updatedText);

              // Update layout and show confirmation
              this._updateLayout();
              MessageProcessor.addTemporaryMessage(
                this._outputContainer,
                `Long text added as file box "Pasted ${pastedTextCount}"`
              );
            }
          }

          // Reset processing flag after delay
          imports.gi.GLib.timeout_add(
            imports.gi.GLib.PRIORITY_DEFAULT,
            500,
            () => {
              isProcessingPaste = false;
              return false;
            }
          );
        } else {
          // For shorter text, update lastProcessedText to prevent repeat processing
          lastProcessedText = currentText;
        }
      });

      // Helper function to find likely pasted content by comparing before/after text
      function findLikelyPastedContent(previousText, currentText) {
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

      // Set up panel overlay scroll behavior
      this._panelOverlay.connect("scroll-event", (_, event) => {
        if (this._outputScrollView) {
          this._outputScrollView.emit("scroll-event", event);
          return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
      });

      // Finalize UI setup
      this._finalizeUISetup();
      this._updateLayout();
    }

    _initializeComponents(safeUpdateLayout) {
      // Initialize file handler
      this._fileHandler = new FileHandler(
        this._extensionPath,
        this._outputContainer,
        this._panelOverlay,
        this._inputButtonsContainer,
        safeUpdateLayout
      );

      // Initialize message sender
      this._messageSender = new MessageSender(
        this._extensionPath,
        this._inputField,
        this._sendButton,
        this._outputContainer,
        this._outputScrollView,
        this._fileHandler
      );

      // Initialize model manager with clear callback
      this._modelManager = new ModelManager(
        this._settings,
        this._outputContainer,
        () => {
          // Stop any in-progress message
          if (this._messageSender.isProcessingMessage()) {
            this._messageSender.stopMessage();
          }

          // Call the clear history function
          this._clearHistory();
        },
        this._inputButtonsContainer
      );

      // Get UI elements from components
      const { modelButton } = this._modelManager.createModelButton();
      this._modelButton = modelButton;

      // Create file and clear buttons
      const { fileButton, fileIcon } = PanelElements.createFileButton(
        this._extensionPath,
        this._settings.get_double("button-icon-scale")
      );
      this._fileButton = fileButton;
      this._fileIcon = fileIcon;

      this._setupClearButton();

      // Connect file button to handler
      this._fileButton.connect("clicked", () => {
        this._fileHandler.openFileSelector();
      });
    }

    _finalizeUISetup() {
      // Configure the buttons container
      this._buttonsContainer.add_child(this._modelButton);
      this._buttonsContainer.add_child(new St.Widget({ x_expand: true }));
      this._buttonsContainer.add_child(this._fileButton);
      this._buttonsContainer.add_child(this._clearButton);
      this._buttonsContainer.add_child(this._sendButton);

      // Build input container
      this._inputButtonsContainer.add_child(this._inputFieldBox);
      this._inputButtonsContainer.add_child(this._buttonsContainer);

      // Add elements to panel overlay
      this._panelOverlay.add_child(this._outputScrollView);
      this._panelOverlay.add_child(this._inputButtonsContainer);

      // Add to chrome with input region
      Main.layoutManager.addChrome(this._panelOverlay, {
        affectsInputRegion: true,
      });

      // Initially hide overlay
      this._panelOverlay.visible = false;
    }

    _setupClearButton() {
      const { clearButton, clearIcon } = PanelElements.createClearButton(
        this._extensionPath,
        this._settings.get_double("button-icon-scale")
      );

      this._clearButton = clearButton;
      this._clearIcon = clearIcon;

      this._clearButton.connect("clicked", this._clearHistory.bind(this));
    }

    async _togglePanelOverlay() {
      // Toggle visibility
      this._panelOverlay.visible = !this._panelOverlay.visible;

      if (!this._panelOverlay.visible) {
        // If closing the panel
        this._inputField.set_text("");

        // Close model menu
        if (this._modelManager) {
          this._modelManager.closeMenu();
        }

        // Clean up file UI only (preserve file data)
        if (this._fileHandler) {
          this._fileHandler.cleanupFileUI();
        }
      } else {
        // If opening panel

        // Restore file UI if files were previously loaded
        if (this._fileHandler && this._fileHandler.hasLoadedFiles()) {
          this._fileHandler.restoreFileUI();
          this._updateLayout();
        }

        // Restore conversation history
        this._updateHistory();

        // Give focus to input field
        global.stage.set_key_focus(this._inputField.clutter_text);

        // Refresh models (async operation)
        if (this._modelManager) {
          this._modelManager
            .refreshModels()
            .catch((e) => console.error("Error refreshing models:", e));
        }
      }

      // Final layout update
      this._updateLayout();
    }

    _updateHistory() {
      // Save temporary messages
      const tempMessages = this._outputContainer
        .get_children()
        .filter(
          (child) =>
            child.style_class && child.style_class.includes("temporary-message")
        );

      // Clear existing messages
      MessageProcessor.clearOutput(this._outputContainer);

      // Get conversation history
      const history = getConversationHistory();

      // Add messages from history
      history.forEach((message) => {
        if (message.type === "user") {
          MessageProcessor.appendUserMessage(
            this._outputContainer,
            message.text
          );
        } else if (message.type === "assistant") {
          const responseContainer = PanelElements.createResponseContainer(
            this._settings.get_string("ai-message-color")
          );
          this._outputContainer.add_child(responseContainer);
          MessageProcessor.updateResponseContainer(
            responseContainer,
            message.text
          );
        }
      });

      // Restore temporary messages
      tempMessages.forEach((msg) => {
        this._outputContainer.add_child(msg);
      });

      // Refresh file box formatting if needed
      if (this._fileHandler && this._fileHandler.hasLoadedFiles()) {
        this._fileHandler.refreshFileBoxFormatting();
      }

      PanelElements.scrollToBottom(this._outputScrollView);
    }

    _clearHistory() {
      // Clear conversation history
      clearConversationHistory();
      this._context = null;

      // Clear output
      MessageProcessor.clearOutput(this._outputContainer);

      // Clear the input field text
      this._inputField.set_text("");

      // Update input field hint
      PanelElements.updateInputFieldHint(this._inputField, true);

      // Clear file boxes instead of just refreshing formatting
      if (this._fileHandler) {
        this._fileHandler.cleanupFileContentBox(); // Removes UI and data
      }
    }

    _updateLayout() {
      // Update each component's layout
      LayoutManager.updatePanelOverlay(this._panelOverlay);
      LayoutManager.updateInputButtonsContainer(this._inputButtonsContainer);
      LayoutManager.updateButtonsContainer(
        this._buttonsContainer,
        this._modelButton,
        this._clearButton,
        this._fileButton
      );
      LayoutManager.updateOutputArea(
        this._outputScrollView,
        this._outputContainer
      );
      LayoutManager.updateInputArea(
        this._inputFieldBox,
        this._inputField,
        this._sendButton
      );

      PanelElements.scrollToBottom(this._outputScrollView);
    }

    destroy() {
      // Disconnect settings signal
      if (this._settingsChangedId) {
        this._settings.disconnect(this._settingsChangedId);
      }

      // Unload stylesheet
      if (this._theme) {
        this._theme.unload_stylesheet(
          Gio.File.new_for_path(`${this._extensionPath}/styles/style.css`)
        );
      }

      // Destroy components
      if (this._fileHandler) {
        this._fileHandler.destroy();
      }

      if (this._modelManager) {
        this._modelManager.destroy();
      }

      if (this._messageSender) {
        this._messageSender.destroy();
      }

      // Remove chrome
      if (this._panelOverlay) {
        Main.layoutManager.removeChrome(this._panelOverlay);
      }

      super.destroy();
    }
  }
);
