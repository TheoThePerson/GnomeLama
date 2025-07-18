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
import { DialogSystem } from "./alertManager.js";
import { SettingsManager } from "./settingsManager.js";
import { getPopupManager } from "./popupManager.js";

import Gio from "gi://Gio";

import {
  clearConversationHistory,
  getConversationHistory,
} from "../services/messaging.js";

import * as UIComponents from "./uiComponents.js";
import { getInputContainerManager, destroyInputContainerManager } from "./inputContainerManager.js";
import { VisualContainerManager } from "./visualContainer.js";

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
      
      // Recursion protection for layout updates
      this._isUpdatingLayout = false;

      // Load stylesheet
      this._loadStylesheet();

      this._initUI();

      // Connect settings and monitor change events
      this._settingsChangedId = this._settings.connect("changed", () => {
        LayoutManager.invalidateCache(); // Invalidate the layout cache when settings change
        this._updateLayout(true);  // Force full update to ensure instant width changes
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

      // Create containers
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

      // Create output area
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

      // Initialize components
      this._initializeComponents();

      // Set up panel overlay scroll behavior
      this._panelOverlay.connect("scroll-event", (_, event) => {
        if (this._outputScrollView) {
          this._outputScrollView.emit("scroll-event", event);
          return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
      });

      // Set up global click handler to close popups when clicking elsewhere
      this._globalClickHandlerId = global.stage.connect(
        "button-press-event",
        () => {
          // Get the popup manager
          const popupManager = getPopupManager();
          
          // If any popup is open and the click is not inside it, close all popups
          if (popupManager.isAnyPopupOpen()) {
            // We already have popup-specific click handlers to manage this
            // Let those handlers take care of it
            return Clutter.EVENT_PROPAGATE;
          }
          
          return Clutter.EVENT_PROPAGATE;
        }
      );

      // Finalize UI setup
      this._finalizeUISetup();
      this._updateLayout();
    }

    _initializeComponents() {
      // Create components with necessary references
      const safeUpdateLayout = () => {
        this._updateLayout();
      };

      // Initialize Visual Container Manager (replaces InputContainerManager)
      this._visualContainerManager = new VisualContainerManager({
        outputScrollView: this._outputScrollView,
        onLayoutUpdate: safeUpdateLayout
      });

      // Create the visual container and get transparent input container
      const visualContainer = this._visualContainerManager.createVisualContainer();
      const transparentInputContainer = this._visualContainerManager.getInputElementsContainer();
      
      // Replace the styled inputButtonsContainer with the transparent one
      this._originalInputButtonsContainer = this._inputButtonsContainer;
      this._inputButtonsContainer = transparentInputContainer;

      // Initialize dialog system
      this._dialogSystem = new DialogSystem({ panelOverlay: this._panelOverlay });

      // Initialize file handler with visual container manager
      this._fileHandler = new FileHandler({
        extensionPath: this._extensionPath,
        outputContainer: this._outputContainer,
        panelOverlay: this._panelOverlay,
        visualContainerManager: this._visualContainerManager,
        updateLayoutCallback: safeUpdateLayout,
        dialogSystem: this._dialogSystem
      });

      // Initialize paste handler to intercept paste operations
      this._pasteHandler = new PasteHandler({
        inputField: this._inputField,
        fileHandler: this._fileHandler,
        outputContainer: this._outputContainer,
        updateLayoutCallback: safeUpdateLayout,
      });

      // Initialize settings manager
      this._settingsManager = new SettingsManager(
        this._settings,
        this._inputButtonsContainer,
        this._visualContainerManager
      );

      // Provide the conversation history getter to the settings manager
      this._settingsManager.setConversationHistoryGetter(() => getConversationHistory());

      // Connect the paste handler to input field key press events
      this._inputField.clutter_text.connect("key-press-event", (actor, event) => {
        return this._pasteHandler.handleKeyPress(actor, event);
      });
      
      // Connect file handler content removal to paste handler
      this._fileHandler.onContentRemoved = (content) => {
        if (this._pasteHandler) {
          this._pasteHandler.resetTrackedText(content || null);
        }
      };

      // Initialize message sender
      this._messageSender = new MessageSender({
        extensionPath: this._extensionPath,
        inputField: this._inputField,
        sendButton: this._sendButton,
        outputContainer: this._outputContainer,
        outputScrollView: this._outputScrollView,
        fileHandler: this._fileHandler,
        pasteHandler: this._pasteHandler,
        visualContainerManager: this._visualContainerManager,
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
        this._inputButtonsContainer,
        this._visualContainerManager
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

      this._setupButtons();

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
      this._buttonsContainer.add_child(this._settingsButton);
      this._buttonsContainer.add_child(this._sendButton);

      // Get separate containers from visual container manager
      const inputFieldContainer = this._visualContainerManager.getInputFieldContainer();
      const fixedButtonsContainer = this._visualContainerManager.getFixedButtonsContainer();

      // Add input field to its own container
      inputFieldContainer.add_child(this._inputFieldBox);

      // Add buttons to the fixed buttons container (stays in place)
      fixedButtonsContainer.add_child(this._buttonsContainer);

      // Update the reference to point to the input field container
      this._inputButtonsContainer = inputFieldContainer;

      // Add elements to panel overlay - use visual container instead of input container
      this._panelOverlay.add_child(this._outputScrollView);
      this._panelOverlay.add_child(this._visualContainerManager._visualContainer);

      // Add to chrome with input region
      Main.layoutManager.addChrome(this._panelOverlay, {
        affectsInputRegion: true,
      });

      // Initially hide overlay
      this._panelOverlay.visible = false;
    }

    _setupButtons() {
      // Get button icon scale once
      const iconScale = this._settings.get_double("button-icon-scale");
      
      // Create clear button
      const { clearButton, clearIcon } = PanelElements.createClearButton(
        this._extensionPath,
        iconScale
      );
      this._clearButton = clearButton;
      this._clearIcon = clearIcon;
      this._clearButton.connect("clicked", this._clearHistory.bind(this));

      // Create settings button
      const { settingsButton, settingsIcon } = PanelElements.createSettingsButton(
        this._extensionPath,
        iconScale
      );
      this._settingsButton = settingsButton;
      this._settingsIcon = settingsIcon;

      // Connect the settings button to the settings manager
      if (this._settingsManager) {
        this._settingsManager.setupSettingsButton(this._settingsButton, this._settingsIcon);
      }
    }

    /**
     * Manage panel state - initialize or cleanup
     * @param {boolean} isInitializing - Whether to initialize or cleanup
     * @private
     */
    _managePanelState(isInitializing) {
      // Set UI element opacity based on state
      this._inputField.opacity = isInitializing ? 255 : 0;
      this._buttonsContainer.opacity = isInitializing ? 255 : 0;

      if (isInitializing) {
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

        // Give focus to input field
        global.stage.set_key_focus(this._inputField.clutter_text);

        // Refresh models in background
        if (this._modelManager) {
          this._modelManager.refreshModels();
        }
      } else {
        // Close model menu
        if (this._modelManager) {
          this._modelManager.closeMenu();
        }

        // Close settings menu
        if (this._settingsManager) {
          this._settingsManager.closeMenu();
        }

        // Clean up file UI only (preserve file data)
        if (this._fileHandler) {
          this._fileHandler.cleanupFileUI();
        }
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

      // If any popup is open, close all popups first
      const popupManager = getPopupManager();
      if (popupManager.isAnyPopupOpen()) {
        popupManager.closeAllExcept(null);
      }

      // Toggle visibility flag
      const isOpening = !this._panelOverlay.visible;
      this._panelOverlay.visible = isOpening;

      if (isOpening) {
        // Reset paste handler state when opening panel
        if (this._pasteHandler) {
          this._pasteHandler.resetState();
        }

        // Only remove temporary messages
        MessageProcessor.removeTemporaryMessages(this._outputContainer);

        // Ensure scrolling to bottom
        PanelElements.scrollToBottom(this._outputScrollView);
      }

      // Apply appropriate state changes
      this._managePanelState(isOpening);
      
      // Update layout
      this._updateLayout();

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

    _clearHistory() {
      // Remove temporary messages and clear output
      MessageProcessor.removeTemporaryMessages(this._outputContainer);
      MessageProcessor.clearOutput(this._outputContainer);
      
      // Clear conversation history
      clearConversationHistory();
      this._context = null;
      
      // Reset paste handler state
      if (this._pasteHandler) {
        this._pasteHandler.resetState();
      }
    }

    _updateLayout(forceFullUpdate = false) {
      // Prevent recursion
      if (this._isUpdatingLayout) {
        return;
      }
      
      // Ensure all components exist before updating
      if (!this._panelOverlay || !this._inputButtonsContainer || 
          !this._buttonsContainer || !this._outputScrollView || 
          !this._outputContainer || !this._inputFieldBox || 
          !this._inputField || !this._sendButton) {
        return;
      }

      this._isUpdatingLayout = true;

      try {
        // Only do full layout updates when forced or when panel visibility changes
        if (forceFullUpdate || this._panelOverlay.visible !== this._lastPanelVisibility) {
          this._lastPanelVisibility = this._panelOverlay.visible;
          
          // Update each component's layout in a specific order
          LayoutManager.updatePanelOverlay(this._panelOverlay);
          LayoutManager.updateOutputArea(this._outputScrollView, this._outputContainer);
          
          // Use Visual Container Manager for input container layout
          if (this._visualContainerManager) {
            this._visualContainerManager.updateLayout();
          } else {
            // Fallback to old method if manager not available
            LayoutManager.updateInputButtonsContainer(this._inputButtonsContainer);
          }
          
          LayoutManager.updateButtonsContainer(
            this._buttonsContainer,
            this._modelButton,
            this._clearButton,
            this._fileButton,
            this._settingsButton
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
        } else {
          // For quick updates, just update the input container layout
          if (this._visualContainerManager) {
            this._visualContainerManager.updateLayout();
          }
        }
      } finally {
        this._isUpdatingLayout = false;
      }

      // Always ensure proper scrolling after updates
      imports.gi.GLib.idle_add(imports.gi.GLib.PRIORITY_DEFAULT, () => {
        PanelElements.scrollToBottom(this._outputScrollView);
        return imports.gi.GLib.SOURCE_REMOVE;
      });
    }

    /**
     * Update only the model button and related components
     * @private
     */
    _updateModelButton() {
      if (!this._modelButton || !this._buttonsContainer) {
        return;
      }
        // Update only the buttons container and model button
        LayoutManager.updateButtonsContainer(
          this._buttonsContainer,
          this._modelButton,
          this._clearButton,
          this._fileButton,
          this._settingsButton
        );

        // Ensure the model button is properly positioned
        this._modelButton.queue_relayout();
    }

    /**
     * Updates all message box colors based on current settings
     * @private
     */
    _updateMessageBoxColors() {
      if (!this._outputContainer) return;

      // Synchronize message opacity first
      UIComponents.synchronizeMessageOpacity();

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

      // Destroy Visual Container Manager
      if (this._visualContainerManager) {
        this._visualContainerManager.destroy();
        this._visualContainerManager = null;
      }

      // Destroy components in reverse order
      ['_fileHandler', '_modelManager', '_settingsManager', '_messageSender', '_pasteHandler']
        .forEach(component => {
          if (this[component]) {
            if (this[component].destroy) {
              this[component].destroy();
            } else if (this[component].cleanup) {
              this[component].cleanup();
            }
            this[component] = null;
          }
        });

      // Remove chrome
      if (this._panelOverlay) {
        Main.layoutManager.removeChrome(this._panelOverlay);
        this._panelOverlay = null;
      }

      // Disconnect the global click handler
      if (this._globalClickHandlerId) {
        global.stage.disconnect(this._globalClickHandlerId);
        this._globalClickHandlerId = null;
      }

      super.destroy();
    }
  }
);
