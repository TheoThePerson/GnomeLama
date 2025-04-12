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

      // Create panel overlay with initial dimensions
      const dimensions = LayoutManager.calculatePanelDimensions();
      this._panelOverlay = PanelElements.createPanelOverlay(dimensions);

      // Create containers with proper initialization
      this._inputButtonsContainer = new St.BoxLayout({
        style_class: "input-buttons-container",
        vertical: true,
        reactive: true,
        x_expand: true,
        y_expand: false
      });

      this._buttonsContainer = new St.BoxLayout({
        style_class: "buttons-container",
        vertical: false,
        reactive: true,
        x_expand: true,
        y_expand: false
      });

      // Create output area with proper initialization
      const { outputScrollView, outputContainer } = PanelElements.createOutputArea(dimensions);
      this._outputScrollView = outputScrollView;
      this._outputContainer = outputContainer;

      // Store output scrollview reference for dynamic layout adjustments
      this._inputButtonsContainer.userData = {
        outputScrollView: this._outputScrollView,
      };

      // Set up input field based on conversation history
      const history = getConversationHistory();
      const isNewChat = history.length === 0 || 
                       (history.length > 0 && history[history.length - 1].type === "user");

      const { inputFieldBox, inputField, sendButton } = 
        PanelElements.createInputArea(this._extensionPath, isNewChat);
      this._inputFieldBox = inputFieldBox;
      this._inputField = inputField;
      this._sendButton = sendButton;

      // Create a safe update layout callback with proper error handling
      let isUpdatingLayout = false;
      const safeUpdateLayout = () => {
        if (!isUpdatingLayout) {
          isUpdatingLayout = true;
          try {
            this._updateLayout();
          } catch (error) {
            if (typeof global.log !== "undefined") {
              global.log(`Error in safeUpdateLayout: ${error.message}`);
            }
          } finally {
            isUpdatingLayout = false;
          }
        }
      };

      // Initialize components with proper error handling
      try {
        this._initializeComponents(safeUpdateLayout);
      } catch (error) {
        if (typeof global.log !== "undefined") {
          global.log(`Error initializing components: ${error.message}`);
        }
      }

      // Set up panel overlay scroll behavior
      this._panelOverlay.connect("scroll-event", (_, event) => {
        if (this._outputScrollView) {
          this._outputScrollView.emit("scroll-event", event);
          return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
      });

      // Finalize UI setup with proper error handling
      try {
        this._finalizeUISetup();
        this._updateLayout();
      } catch (error) {
        if (typeof global.log !== "undefined") {
          global.log(`Error finalizing UI setup: ${error.message}`);
        }
      }
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
     * Initialize or reset the panel state
     * @private
     */
    _initializePanelState() {
      // Reset input field
      this._inputField.set_text("");
      
      // Reset UI element opacity
      this._inputField.opacity = 255;
      this._buttonsContainer.opacity = 255;

      // Update layout first to ensure proper dimensions
      this._updateLayout(true); // Force full update on initialization

      // Restore file UI if needed
      if (this._fileHandler && this._fileHandler.hasLoadedFiles()) {
        this._fileHandler.restoreFileUI();
        this._updateLayout(true); // Force full update after file UI restore

        // Apply a sequence of timed refreshes to ensure proper formatting
        const refreshSequence = [10, 50, 100, 200];
        refreshSequence.forEach((delay) => {
          imports.gi.GLib.timeout_add(
            imports.gi.GLib.PRIORITY_DEFAULT,
            delay,
            () => {
              if (this._fileHandler && this._fileHandler.hasLoadedFiles()) {
                this._fileHandler.refreshFileBoxFormatting();
                this._updateLayout(false); // No need for full update during refresh
              }
              return imports.gi.GLib.SOURCE_REMOVE;
            }
          );
        });
      }

      // Load history in background
      this._loadHistoryAsync();

      // Give focus to input field
      global.stage.set_key_focus(this._inputField.clutter_text);

      // Refresh models in background
      if (this._modelManager) {
        this._modelManager.refreshModels();
      }
    }

    /**
     * Clean up panel state
     * @private
     */
    _cleanupPanelState() {
      // Clear input field
      this._inputField.set_text("");

      // Hide sensitive UI elements
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

        if (isOpening) {
          this._initializePanelState();
        } else {
          this._cleanupPanelState();
        }

        // Update layout
        this._updateLayout();
      } catch (error) {
        // Ensure panel is in a consistent state even if error occurs
        this._panelOverlay.visible = false;
        this._inputField.opacity = 255;
        this._buttonsContainer.opacity = 255;
        
        if (typeof global.log !== "undefined") {
          global.log(`Error toggling panel: ${error.message}`);
        }
      } finally {
        // Reset toggle flag after a small delay
        imports.gi.GLib.timeout_add(
          imports.gi.GLib.PRIORITY_DEFAULT,
          300,
          () => {
            this._isTogglingPanel = false;
            return imports.gi.GLib.SOURCE_REMOVE;
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

    _updateLayout(forceFullUpdate = false) {
      try {
        // Ensure all components exist before updating
        if (!this._panelOverlay || !this._inputButtonsContainer || 
            !this._buttonsContainer || !this._outputScrollView || 
            !this._outputContainer || !this._inputFieldBox || 
            !this._inputField || !this._sendButton) {
          return;
        }

        // Only do full layout updates when forced or when panel visibility changes
        if (forceFullUpdate || this._panelOverlay.visible !== this._lastPanelVisibility) {
          this._lastPanelVisibility = this._panelOverlay.visible;
          
          // Update each component's layout in a specific order
          LayoutManager.updatePanelOverlay(this._panelOverlay);
          LayoutManager.updateOutputArea(this._outputScrollView, this._outputContainer);
          LayoutManager.updateInputButtonsContainer(this._inputButtonsContainer);
          LayoutManager.updateButtonsContainer(
            this._buttonsContainer,
            this._modelButton,
            this._clearButton,
            this._fileButton
          );
          LayoutManager.updateInputArea(
            this._inputFieldBox,
            this._inputField,
            this._sendButton
          );

          // Update file boxes if we have a file handler
          if (this._fileHandler && typeof this._fileHandler.refreshFileBoxFormatting === "function") {
            this._fileHandler.refreshFileBoxFormatting();
          }

          // Update message box colors to reflect current settings
          this._updateMessageBoxColors();
        }

        // Always ensure proper scrolling after updates
        imports.gi.GLib.idle_add(imports.gi.GLib.PRIORITY_DEFAULT, () => {
          PanelElements.scrollToBottom(this._outputScrollView);
          return imports.gi.GLib.SOURCE_REMOVE;
        });
      } catch (error) {
        // Log error in development, silent in production
        if (typeof global.log !== "undefined") {
          global.log(`Error updating layout: ${error.message}`);
        }
      }
    }

    /**
     * Update only the model button and related components
     * @private
     */
    _updateModelButton() {
      if (!this._modelButton || !this._buttonsContainer) {
        return;
      }

      try {
        // Update only the buttons container and model button
        LayoutManager.updateButtonsContainer(
          this._buttonsContainer,
          this._modelButton,
          this._clearButton,
          this._fileButton
        );

        // Ensure the model button is properly positioned
        this._modelButton.queue_relayout();
      } catch (error) {
        if (typeof global.log !== "undefined") {
          global.log(`Error updating model button: ${error.message}`);
        }
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
