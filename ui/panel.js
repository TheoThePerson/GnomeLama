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

      this._settingsChangedId = this._settings.connect("changed", () =>
        this._updateLayout()
      );
      Main.layoutManager.connect("monitors-changed", () =>
        this._updateLayout()
      );
      this.connect("button-press-event", this._togglePanelOverlay.bind(this));
    }

    _loadStylesheet() {
      // Load the stylesheet for the extension
      const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
      theme.load_stylesheet(
        Gio.File.new_for_path(`${this._extensionPath}/styles/style.css`)
      );
      this._theme = theme;
    }

    // UI INITIALIZATION

    _initUI() {
      this.add_child(
        new St.Label({
          text: "AI",
          y_align: Clutter.ActorAlign.CENTER,
          style: "font-weight: bold; padding: 0 4px;",
        })
      );

      const dimensions = LayoutManager.calculatePanelDimensions();
      this._panelOverlay = PanelElements.createPanelOverlay(dimensions);

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

      const { outputScrollView, outputContainer } =
        PanelElements.createOutputArea(dimensions);
      this._outputScrollView = outputScrollView;
      this._outputContainer = outputContainer;

      // Store output scrollview reference in inputButtonsContainer for dynamic layout adjustments
      this._inputButtonsContainer.userData = {
        outputScrollView: this._outputScrollView,
      };

      const history = getConversationHistory();
      const isNewChat =
        history.length === 0 ||
        (history.length > 0 && history[history.length - 1].type === "user");

      const { inputFieldBox, inputField, sendButton } =
        PanelElements.createInputArea(this._extensionPath, isNewChat);
      this._inputFieldBox = inputFieldBox;
      this._inputField = inputField;
      this._sendButton = sendButton;

      // Create a safe update layout callback that prevents recursion
      let isUpdatingLayout = false;
      const safeUpdateLayout = () => {
        if (!isUpdatingLayout) {
          isUpdatingLayout = true;
          this._updateLayout();
          isUpdatingLayout = false;
        }
      };

      // Initialize file handler first (moved up)
      this._fileHandler = new FileHandler(
        this._extensionPath,
        this._outputContainer,
        this._panelOverlay,
        this._inputButtonsContainer,
        safeUpdateLayout
      );

      // Initialize message sender with file handler
      this._messageSender = new MessageSender(
        this._extensionPath,
        this._inputField,
        this._sendButton,
        this._outputContainer,
        this._outputScrollView,
        this._fileHandler // Pass file handler reference
      );

      this._inputField.connect("button-press-event", () => {
        if (this._modelManager && this._modelManager.isMenuOpen()) {
          this._modelManager.closeMenu();
        }
        return Clutter.EVENT_PROPAGATE;
      });

      // Initialize model manager
      this._modelManager = new ModelManager(
        this._settings,
        this._outputContainer,
        () => {
          if (this._messageSender.isProcessingMessage()) {
            this._messageSender.stopMessage();
          }

          // Clear conversation history
          clearConversationHistory();
          this._context = null;

          // Clear output
          MessageProcessor.clearOutput(this._outputContainer);

          // Update input field hint
          PanelElements.updateInputFieldHint(this._inputField, true);

          // Refresh file box formatting if files are loaded
          if (this._fileHandler && this._fileHandler.hasLoadedFiles()) {
            this._fileHandler.refreshFileBoxFormatting();
          }
        },
        this._inputButtonsContainer
      );
      const { modelButton } = this._modelManager.createModelButton();
      this._modelButton = modelButton;

      // Create file button using panelElements
      const { fileButton, fileIcon } = PanelElements.createFileButton(
        this._extensionPath,
        this._settings.get_double("button-icon-scale")
      );
      this._fileButton = fileButton;
      this._fileIcon = fileIcon;

      // Connect the button to the file handler
      this._fileButton.connect("clicked", () => {
        this._fileHandler.openFileSelector();
      });

      this._setupClearButton();

      // Configure the buttons container
      this._buttonsContainer.add_child(this._modelButton);
      this._buttonsContainer.add_child(new St.Widget({ x_expand: true }));
      this._buttonsContainer.add_child(this._fileButton);
      this._buttonsContainer.add_child(this._clearButton);
      this._buttonsContainer.add_child(this._sendButton);

      this._inputButtonsContainer.add_child(this._inputFieldBox);
      this._inputButtonsContainer.add_child(this._buttonsContainer);

      this._panelOverlay.add_child(this._outputScrollView);
      this._panelOverlay.add_child(this._inputButtonsContainer);

      Main.layoutManager.addChrome(this._panelOverlay, {
        affectsInputRegion: true,
      });

      this._panelOverlay.visible = false;

      this._panelOverlay.connect("scroll-event", (_, event) => {
        if (this._outputScrollView) {
          this._outputScrollView.emit("scroll-event", event);
          return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
      });

      this._updateLayout();
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

      // If closing, reset the input field and close model menu
      if (!this._panelOverlay.visible) {
        this._inputField.set_text("");

        // Close model menu when panel is closed
        if (this._modelManager) {
          this._modelManager.closeMenu();
        }

        // Clean up file UI only (preserve file data) when closing
        if (this._fileHandler) {
          this._fileHandler.cleanupFileUI();
        }
      } else {
        // If opening panel, restore UI immediately

        // First restore file UI if files were previously loaded - do this first for better UX
        if (this._fileHandler && this._fileHandler.hasLoadedFiles()) {
          this._fileHandler.restoreFileUI();
          // Force an immediate layout update for file UI
          this._updateLayout();
        }

        // Restore conversation history
        this._updateHistory();

        // Give focus to input field right away
        global.stage.set_key_focus(this._inputField.clutter_text);

        // Then refresh models (async operation) - don't block UI on this
        if (this._modelManager) {
          this._modelManager
            .refreshModels()
            .catch((e) => console.error("Error refreshing models:", e));
        }
      }

      // Final layout update
      this._updateLayout();
    }

    // HISTORY MANAGEMENT

    _updateHistory() {
      // Save any existing temporary messages
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

      tempMessages.forEach((msg) => {
        this._outputContainer.add_child(msg);
      });

      // Refresh file box formatting if files are loaded
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

      // Update input field hint
      PanelElements.updateInputFieldHint(this._inputField, true);

      // Refresh file box formatting if files are loaded
      if (this._fileHandler && this._fileHandler.hasLoadedFiles()) {
        this._fileHandler.refreshFileBoxFormatting();
      }
    }

    _updateLayout() {
      const dimensions = LayoutManager.calculatePanelDimensions();

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

      // The fileHandler._adjustInputContainerHeight method will be called through
      // the FileHandler's callbacks, but our safeUpdateLayout wrapper prevents infinite recursion
      // by ensuring _updateLayout is not called again if it's already running.

      PanelElements.scrollToBottom(this._outputScrollView);
    }

    // CLEANUP

    destroy() {
      if (this._settingsChangedId) {
        this._settings.disconnect(this._settingsChangedId);
      }

      // Unload stylesheet when extension is disabled
      if (this._theme) {
        this._theme.unload_stylesheet(
          Gio.File.new_for_path(`${this._extensionPath}/styles/style.css`)
        );
      }

      if (this._fileHandler) {
        this._fileHandler.destroy();
      }

      if (this._modelManager) {
        this._modelManager.destroy();
      }

      if (this._messageSender) {
        this._messageSender.destroy();
      }

      if (this._panelOverlay) {
        Main.layoutManager.removeChrome(this._panelOverlay);
      }

      super.destroy();
    }
  }
);
