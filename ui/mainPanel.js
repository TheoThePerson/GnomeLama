import Clutter from "gi://Clutter";
import GObject from "gi://GObject";
import St from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";

import * as LayoutManager from "./layoutManager.js";
import * as MessageProcessor from "./messageProcessor.js";
import * as PanelElements from "./panelWidgets.js";

import { FileHandler } from "./fileHandler.js";
import { MessageSender } from "./messageSender.js";
import { ModelManager } from "./modelManager.js";
import { PasteHandler } from "./pasteHandler.js";

import Gio from "gi://Gio";

import {
  clearConversationHistory,
  getConversationHistory,
} from "../services/messaging.js";

import * as UIComponents from "./uiComponents.js";

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
      this._settingsChangedId = this._settings.connect("changed", () => {
        LayoutManager.invalidateCache(); // Invalidate the layout cache when settings change
        this._updateLayout();
      });
      Main.layoutManager.connect("monitors-changed", () => {
        LayoutManager.invalidateCache(); // Invalidate the layout cache when monitor changes
        this._updateLayout();
      });
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

      // Initialize paste handler
      this._pasteHandler = new PasteHandler(
        this._inputField,
        this._fileHandler,
        this._outputContainer,
        () => this._updateLayout()
      );

      // Connect input field to paste handler
      this._inputField.clutter_text.connect(
        "key-press-event",
        this._pasteHandler.handleKeyPress.bind(this._pasteHandler)
      );

      // Handle text changes, potentially from other paste sources (like right-click menu)
      this._inputField.clutter_text.connect("text-changed", () => {
        // If we're processing a paste via Ctrl+V, skip this handler
        if (this._pasteHandler.isProcessingPaste) {
          return;
        }

        const currentText = this._inputField.get_text();

        // Skip if empty or already processed
        if (
          !currentText ||
          currentText.length === 0 ||
          currentText === this._pasteHandler.lastProcessedText
        ) {
          return;
        }

        // Only process sudden text changes with multiple words (likely pastes)
        const wordCount = currentText
          .split(/\s+/u)
          .filter((word) => word.length > 0).length;

        if (wordCount > 100) {
          // The problem here is that we need to identify which part of the text was pasted
          // Since we can't directly know, we'll look for chunks that have many words together
          this._pasteHandler.isProcessingPaste = true;

          // Get the text before this change event
          const previousTextSnapshot =
            this._pasteHandler.lastProcessedText || "";

          // Find the largest new chunk of text (likely the paste)
          const pastedContent = this._pasteHandler.findLikelyPastedContent(
            previousTextSnapshot,
            currentText
          );

          if (pastedContent) {
            // Update lastProcessedText to current to prevent re-processing
            this._pasteHandler.lastProcessedText = currentText;

            // Increment counter for unique naming
            this._pasteHandler.pastedTextCount++;

            // Create file box for the detected chunk
            if (this._fileHandler) {
              this._fileHandler.createFileBoxFromText(
                pastedContent,
                `Pasted ${this._pasteHandler.pastedTextCount}`
              );

              // Remove just the pasted content from the input field
              const updatedText = currentText.replace(pastedContent, "");
              this._inputField.set_text(updatedText);

              // Update layout and show confirmation
              this._updateLayout();
              MessageProcessor.addTemporaryMessage(
                this._outputContainer,
                `Long text added as file box "Pasted ${this._pasteHandler.pastedTextCount}"`
              );
            }
          }

          // Reset processing flag after delay
          imports.gi.GLib.timeout_add(
            imports.gi.GLib.PRIORITY_DEFAULT,
            500,
            () => {
              this._pasteHandler.isProcessingPaste = false;
              return false;
            }
          );
        } else {
          // For shorter text, update lastProcessedText to prevent repeat processing
          this._pasteHandler.lastProcessedText = currentText;
        }
      });

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
      this._fileHandler = new FileHandler({
        extensionPath: this._extensionPath,
        outputContainer: this._outputContainer,
        panelOverlay: this._panelOverlay,
        inputButtonsContainer: this._inputButtonsContainer,
        updateLayoutCallback: safeUpdateLayout,
      });

      // Initialize message sender
      this._messageSender = new MessageSender({
        extensionPath: this._extensionPath,
        inputField: this._inputField,
        sendButton: this._sendButton,
        outputContainer: this._outputContainer,
        outputScrollView: this._outputScrollView,
        fileHandler: this._fileHandler,
      });

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

    /**
     * Toggle the panel overlay with improved animation
     * @returns {Promise<void>}
     */
    _togglePanelOverlay() {
      // Prevent multiple rapid toggles
      if (this._isTogglingPanel) {
        return;
      }
      this._isTogglingPanel = true;

      try {
        // Toggle visibility flag
        const isOpening = !this._panelOverlay.visible;
        this._panelOverlay.visible = isOpening;

        if (!isOpening) {
          // If closing the panel
          this._inputField.set_text("");

          // Immediately hide sensitive UI elements for faster perceived performance
          this._inputField.opacity = 0;
          this._buttonsContainer.opacity = 0;

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
          // Reset opacity of UI elements that were hidden when closing
          this._inputField.opacity = 255;
          this._buttonsContainer.opacity = 255;

          // Update layout first to ensure proper dimensions
          this._updateLayout();

          // Use a sequence of timed operations to restore file UI
          if (this._fileHandler && this._fileHandler.hasLoadedFiles()) {
            // First restore the basic UI
            this._fileHandler.restoreFileUI();

            // Then update layout
            this._updateLayout();

            // Then apply a sequence of timed refreshes to ensure proper formatting
            const refreshSequence = [10, 50, 100, 200];
            refreshSequence.forEach((delay) => {
              imports.gi.GLib.timeout_add(
                imports.gi.GLib.PRIORITY_DEFAULT,
                delay,
                () => {
                  if (this._fileHandler && this._fileHandler.hasLoadedFiles()) {
                    this._fileHandler.refreshFileBoxFormatting();
                    this._updateLayout();
                  }
                  return imports.gi.GLib.SOURCE_REMOVE;
                }
              );
            });
          }

          // Start loading history in background
          this._loadHistoryAsync();

          // Give focus to input field
          global.stage.set_key_focus(this._inputField.clutter_text);

          // Refresh models in background
          if (this._modelManager) {
            this._modelManager.refreshModels().catch(() => {
              // Silent error in production
            });
          }
        }

        // Update layout
        this._updateLayout();
      } catch {
        // Silent error in production during panel toggle
        // Ensure panel is in a consistent state even if error occurs
        this._panelOverlay.visible = false;
        this._inputField.opacity = 255;
        this._buttonsContainer.opacity = 255;
      } finally {
        // Reset toggle flag after a small delay
        imports.gi.GLib.timeout_add(
          imports.gi.GLib.PRIORITY_DEFAULT,
          300,
          () => {
            this._isTogglingPanel = false;
            return imports.gi.GLib.SOURCE_REMOVE; // Don't repeat
          }
        );
      }
    }

    /**
     * Load conversation history asynchronously
     * @private
     */
    _loadHistoryAsync() {
      // Use a low priority idle callback to update history without blocking other UI
      imports.gi.GLib.idle_add(imports.gi.GLib.PRIORITY_LOW, () => {
        this._updateHistory();
        return imports.gi.GLib.SOURCE_REMOVE; // Don't repeat
      });
    }

    _updateHistory() {
      // Remove temporary messages in case they are not gone
      MessageProcessor.removeTemporaryMessages(this._outputContainer);

      // Clear other messages
      MessageProcessor.clearOutput(this._outputContainer);

      // Get conversation history
      const history = getConversationHistory();

      // Add messages from history
      history.forEach((message, index) => {
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

          // If previous user message had files, set the flag before rendering
          if (
            index > 0 &&
            history[index - 1].type === "user" &&
            (history[index - 1].text.includes("[files attached]") ||
              history[index - 1].text.includes("｢files attached｣"))
          ) {
            MessageProcessor.setLastMessageHadFiles(true);
          } else {
            MessageProcessor.setLastMessageHadFiles(false);
          }

          MessageProcessor.updateResponseContainer(
            responseContainer,
            message.text
          );
        }
      });

      PanelElements.scrollToBottom(this._outputScrollView);

      // Wait for layout before refreshing file box formatting
      imports.gi.GLib.timeout_add(imports.gi.GLib.PRIORITY_DEFAULT, 50, () => {
        if (this._fileHandler && this._fileHandler.hasLoadedFiles()) {
          this._fileHandler.refreshFileBoxFormatting();
        }
        return imports.gi.GLib.SOURCE_REMOVE;
      });
    }

    _clearHistory() {
      // Remove temporary messages
      MessageProcessor.removeTemporaryMessages(this._outputContainer);

      // Clear conversation history
      clearConversationHistory();
      this._context = null;

      // Clear output
      MessageProcessor.clearOutput(this._outputContainer);
    }

    _updateLayout() {
      try {
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

        // Update file boxes if we have a file handler
        if (
          this._fileHandler &&
          typeof this._fileHandler.refreshFileBoxFormatting === "function"
        ) {
          this._fileHandler.refreshFileBoxFormatting();
        }

        // Update message box colors to reflect current settings
        this._updateMessageBoxColors();

        PanelElements.scrollToBottom(this._outputScrollView);
      } catch {
        // Silent error in production when updating layout
      }
    }

    /**
     * Updates all message box colors based on current settings
     * @private
     */
    _updateMessageBoxColors() {
      if (!this._outputContainer) return;

      // Update all user message containers
      const userMessages = this._outputContainer
        .get_children()
        .filter(
          (child) =>
            child.style_class && child.style_class.includes("user-message")
        );

      for (const container of userMessages) {
        UIComponents.updateMessageContainerStyle(container, true);
      }

      // Update all AI message containers
      const aiMessages = this._outputContainer
        .get_children()
        .filter(
          (child) =>
            child.style_class && child.style_class.includes("ai-message")
        );

      for (const container of aiMessages) {
        UIComponents.updateMessageContainerStyle(container, false);
      }
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
