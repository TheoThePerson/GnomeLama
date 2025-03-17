/**
 * Linux Copilot - GNOME Shell Extension
 * Panel UI implementation
 */
import GObject from "gi://GObject";
import St from "gi://St";
import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Pango from "gi://Pango";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import { gettext as _ } from "resource:///org/gnome/shell/extensions/extension.js";

// Import from reorganized modules
import * as PanelElements from "./panelElements.js";
import * as MessageProcessor from "./messageProcessor.js";
import * as LayoutManager from "./layoutManager.js";
import * as UIComponents from "./components.js";
import { getSettings } from "../lib/settings.js";

// Import messaging functionality
import {
  fetchModelNames,
  setModel,
  stopAiMessage,
  getConversationHistory,
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
      this._isProcessingMessage = false;

      // Initialize UI components
      this._initUI();

      // Connect event handlers
      this._settingsChangedId = this._settings.connect("changed", () =>
        this._updateLayout()
      );
      Main.layoutManager.connect("monitors-changed", () =>
        this._updateLayout()
      );
      this.connect("button-press-event", this._togglePanelOverlay.bind(this));
    }

    // UI INITIALIZATION METHODS

    _initUI() {
      // Create a properly aligned AI text label for the panel button
      this.add_child(
        new St.Label({
          text: "AI",
          y_align: Clutter.ActorAlign.CENTER,
          style: "font-weight: bold; padding: 0 4px;",
        })
      );

      // Create main panel components
      const dimensions = LayoutManager.calculatePanelDimensions();
      this._panelOverlay = PanelElements.createPanelOverlay(dimensions);

      // Create container for both input field and buttons
      this._inputButtonsContainer = new St.BoxLayout({
        style_class: "input-buttons-container",
        vertical: true,
        reactive: true,
      });

      // Create buttons container
      this._buttonsContainer = new St.BoxLayout({
        style_class: "buttons-container",
        vertical: false,
        reactive: true,
      });

      // Setup scrollable content area
      const { outputScrollView, outputContainer } =
        PanelElements.createOutputArea(dimensions);
      this._outputScrollView = outputScrollView;
      this._outputContainer = outputContainer;

      // Check if there's any conversation history
      const history = getConversationHistory();
      const isNewChat =
        history.length === 0 ||
        (history.length > 0 && history[history.length - 1].type === "user");

      // Setup input components
      const { inputFieldBox, inputField, sendButton, sendIcon } =
        PanelElements.createInputArea(this._extensionPath, isNewChat);
      this._inputFieldBox = inputFieldBox;
      this._inputField = inputField;
      this._sendButton = sendButton;
      this._sendIcon = sendIcon;

      // Add click handler to input field to close model menu
      this._inputField.connect("button-press-event", () => {
        if (this._modelMenu && this._modelMenu.isOpen) {
          this._modelMenu.close();
        }
        return Clutter.EVENT_PROPAGATE;
      });

      // Setup model selector and clear button
      this._setupModelMenu();
      this._setupFileButton();
      this._setupClearButton();

      // Configure the buttons container
      this._buttonsContainer.add_child(this._modelButton);
      this._buttonsContainer.add_child(new St.Widget({ x_expand: true }));
      this._buttonsContainer.add_child(this._fileButton);
      this._buttonsContainer.add_child(this._clearButton);
      this._buttonsContainer.add_child(this._sendButton);

      // Add input field and buttons to the container
      this._inputButtonsContainer.add_child(this._inputFieldBox);
      this._inputButtonsContainer.add_child(this._buttonsContainer);

      // Assemble the UI
      this._panelOverlay.add_child(this._outputScrollView);
      this._panelOverlay.add_child(this._inputButtonsContainer);

      // Ensure the overlay is properly added to Chrome
      Main.layoutManager.addChrome(this._panelOverlay, {
        affectsInputRegion: true,
      });

      // messageFormater Ensure the panel is collapsed by default
      this._panelOverlay.visible = false;

      // Handle scroll events in the overlay
      this._panelOverlay.connect("scroll-event", (_, event) => {
        if (this._outputScrollView) {
          this._outputScrollView.emit("scroll-event", event);
          return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
      });

      // Handle Enter key press in input field
      this._inputField.clutter_text.connect("key-press-event", (_, event) => {
        if (event.get_key_symbol() === Clutter.KEY_Return) {
          if (this._isProcessingMessage) {
            stopAiMessage();
            this._isProcessingMessage = false;
            this._updateSendButtonState(true);
          } else {
            this._sendMessage();
          }
          return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
      });

      // Connect send button click
      this._sendButton.connect("clicked", this._sendMessage.bind(this));

      //  messageFormater Prevents `_updateLayout()` from forcing it open
      this._updateLayout();
    }

    async _setupModelMenu() {
      // Create model button and popup menu
      const { modelButton, modelButtonLabel } =
        PanelElements.createModelButton();
      this._modelButton = modelButton;
      this._modelButtonLabel = modelButtonLabel;

      this._modelButtonLabel.set_style("color: #808080;");

      // Set default label while initializing
      this._updateModelLabel("Loading...");

      // Create model selection popup menu
      this._modelMenu = new PopupMenu.PopupMenu(
        new St.Button(),
        0.0,
        St.Side.BOTTOM
      );
      Main.uiGroup.add_child(this._modelMenu.actor);
      this._modelMenu.actor.hide();

      // Configure menu position when opened
      this._modelMenu.connect("open-state-changed", (menu, isOpen) => {
        if (isOpen) {
          const dimensions = LayoutManager.calculatePanelDimensions();
          const panelLeft = dimensions.monitor.width - dimensions.panelWidth;
          let menuActor = this._modelMenu.actor || this._modelMenu;

          // Position menu above the input-buttons container
          const [containerX, containerY] =
            this._inputButtonsContainer.get_transformed_position();

          menuActor.set_position(
            panelLeft,
            containerY - menuActor.get_height()
          );
        }
      });

      // Add click outside handler to close menu
      global.stage.connect("button-press-event", (actor, event) => {
        if (this._modelMenu && this._modelMenu.isOpen) {
          let [x, y] = event.get_coords();
          let menuActor = this._modelMenu.actor || this._modelMenu;
          let [menuX, menuY] = menuActor.get_transformed_position();
          let [menuWidth, menuHeight] = menuActor.get_size();
          let [buttonX, buttonY] = this._modelButton.get_transformed_position();
          let [buttonWidth, buttonHeight] = this._modelButton.get_size();

          // Check if click is outside both menu and button
          if (
            !(
              x >= menuX &&
              x <= menuX + menuWidth &&
              y >= menuY &&
              y <= menuY + menuHeight
            ) &&
            !(
              x >= buttonX &&
              x <= buttonX + buttonWidth &&
              y >= buttonY &&
              y <= buttonY + buttonHeight
            )
          ) {
            this._modelMenu.close();
          }
        }
        return Clutter.EVENT_PROPAGATE;
      });

      // Toggle menu on button press
      this._modelButton.connect("button-press-event", () => {
        this._modelMenu.toggle();
        return Clutter.EVENT_STOP;
      });

      // Populate model menu items
      await this._addModelMenuItems();
    }

    async _addModelMenuItems() {
      // Update label to show fetching status
      this._updateModelLabel("Fetching models");

      const { models, error } = await fetchModelNames();

      // Show error message if no models found
      if (error) {
        this._updateModelLabel("No models found");
        MessageProcessor.addTemporaryMessage(this._outputContainer, error);
        return;
      }

      if (models.length === 0) {
        this._updateModelLabel("No models found");
        return;
      }

      // Clear existing menu items first
      this._modelMenu.removeAll();

      // Get default model or use first available
      const defaultModel = this._settings.get_string("default-model");
      const selectedModel = models.includes(defaultModel)
        ? defaultModel
        : models[0];
      this._updateModelLabel(selectedModel);
      setModel(selectedModel);

      // Create menu items
      models.forEach((name) => {
        let modelItem = new PopupMenu.PopupMenuItem(name);

        // Mark current model as active
        if (name === selectedModel) {
          modelItem.setOrnament(PopupMenu.Ornament.DOT);
        }

        modelItem.connect("activate", () => {
          this._selectModel(name, modelItem);
        });

        this._modelMenu.addMenuItem(modelItem);
      });
    }

    _updateModelLabel(name) {
      this._modelButtonLabel.set_text(name);
      this._modelButtonLabel.set_x_align(Clutter.ActorAlign.START);
    }

    _selectModel(name, modelItem) {
      // Update menu item ornaments
      this._modelMenu.box.get_children().forEach((child) => {
        if (child.setOrnament) {
          child.setOrnament(PopupMenu.Ornament.NONE);
        }
      });

      modelItem.setOrnament(PopupMenu.Ornament.DOT);

      this._updateModelLabel(name);
      setModel(name);

      this._modelMenu.close();

      if (this._isProcessingMessage) {
        stopAiMessage();
        this._isProcessingMessage = false;
        this._updateSendButtonState(true);
      }

      this._clearHistory();
      // Update input field hint for new chat is handled in _clearHistory
    }

    _setupClearButton() {
      const { clearButton, clearIcon } = PanelElements.createClearButton(
        this._extensionPath,
        this._settings.get_double("button-icon-scale") // Using button-icon-scale
      );

      this._clearButton = clearButton;
      this._clearIcon = clearIcon;

      if (this._isProcessingMessage) {
        stopAiMessage();
        this._isProcessingMessage = false;
        this._updateSendButtonState(true);
      }

      this._clearButton.connect("clicked", this._clearHistory.bind(this));
    }

    _setupFileButton() {
      const { fileButton, fileIcon } = PanelElements.createFileButton(
        this._extensionPath,
        this._settings.get_double("button-icon-scale") // Using button-icon-scale
      );

      this._fileButton = fileButton;
      this._fileIcon = fileIcon;

      this._fileButton.connect("clicked", this._openFileSelector.bind(this));
    }

    _openFileSelector() {
      try {
        const command = ["zenity", "--file-selection", "--title=Select a file"];

        let subprocess = new Gio.Subprocess({
          argv: command,
          flags:
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
        });

        subprocess.init(null);

        // Read output asynchronously
        subprocess.communicate_utf8_async(null, null, (source, res) => {
          try {
            let [, stdout, stderr] = source.communicate_utf8_finish(res);

            if (stdout.trim()) {
              let selectedFilePath = stdout.trim();

              // Display file selection message
              MessageProcessor.addTemporaryMessage(
                this._outputContainer,
                `Selected file: ${selectedFilePath}`
              );

              console.log(`File selected: ${selectedFilePath}`);

              // Always try to read and display file content
              this._readAndDisplayFile(selectedFilePath);
            } else if (stderr.trim()) {
              console.error(`Error selecting file: ${stderr}`);
            }
          } catch (e) {
            console.error(`Error processing file selection: ${e}`);
          }
        });
      } catch (error) {
        console.error(`Error opening file selector: ${error}`);
        MessageProcessor.addTemporaryMessage(
          this._outputContainer,
          "Error opening file selector. Please try again."
        );
      }
    }

    _readAndDisplayFile(filePath) {
      try {
        // Create file object
        const file = Gio.File.new_for_path(filePath);

        // Check if file exists
        if (!file.query_exists(null)) {
          console.error(`File does not exist: ${filePath}`);
          MessageProcessor.addTemporaryMessage(
            this._outputContainer,
            `File does not exist: ${filePath}`
          );
          return;
        }

        // Try to read file content
        try {
          const [success, content] = file.load_contents(null);

          if (success) {
            // Try to decode content
            let fileContent;
            try {
              fileContent = new TextDecoder("utf-8").decode(content);
            } catch (e) {
              fileContent = content.toString();
            }

            // Limit content length
            if (fileContent.length > 2000) {
              fileContent =
                fileContent.substring(0, 2000) + "...\n(Content truncated)";
            }

            // Display the content in a white box above input field
            this._displayFileContentBox(fileContent);
          } else {
            MessageProcessor.addTemporaryMessage(
              this._outputContainer,
              "Failed to read file content"
            );
          }
        } catch (e) {
          console.error(`Error reading file: ${e}`);
          MessageProcessor.addTemporaryMessage(
            this._outputContainer,
            `Error reading file: ${e.message || e}`
          );
        }
      } catch (error) {
        console.error(`Error processing file: ${error}`);
        MessageProcessor.addTemporaryMessage(
          this._outputContainer,
          `Error processing file: ${error.message || error}`
        );
      }
    }

    _displayFileContentBox(content) {
      // Remove any existing file content box
      if (this._fileContentBox && this._fileContentBox.get_parent()) {
        this._fileContentBox.get_parent().remove_child(this._fileContentBox);
        this._fileContentBox.destroy();
        this._fileContentBox = null;
      }

      // Create a new box for file content - make it a perfect square
      this._fileContentBox = new St.BoxLayout({
        style_class: "file-content-box",
        style:
          "background-color: #FFFFFF; " +
          "border: 2px solid #000000; " +
          "border-radius: 8px; " +
          "padding: 10px; " +
          "margin: 0; " + // Remove margins to allow precise positioning
          "width: 120px; " +
          "height: 120px; " + // Make it a perfect square
          "box-shadow: 0 4px 8px rgba(0, 0, 0, 0.5);",
        vertical: true,
        x_expand: false, // Don't expand to fill width
        y_expand: false,
        x_align: Clutter.ActorAlign.CENTER,
      });

      // Create header box for title and close button
      const headerBox = new St.BoxLayout({
        style_class: "file-content-header",
        style: "width: 100%; margin-bottom: 5px;",
        vertical: false,
      });

      // Add a title to the header
      const titleLabel = new St.Label({
        text: "File Content:",
        style: "font-weight: bold; color: #000000; font-size: 14px;",
        x_expand: true,
      });
      headerBox.add_child(titleLabel);

      // Add close button (X) to the header - no red background
      const closeButton = new St.Button({
        style_class: "file-content-close-button",
        style:
          "font-weight: bold; " +
          "color: #000000; " +
          "font-size: 16px; " +
          "background: none; " +
          "border: none; " +
          "width: 20px; " +
          "height: 20px;",
        label: "✕",
      });

      closeButton.connect("clicked", () => {
        this._cleanupFileContentBox();
      });

      // Add close button to header
      headerBox.add_child(closeButton);

      // Add header to the box
      this._fileContentBox.add_child(headerBox);

      // Create scrollable container for content
      const scrollView = new St.ScrollView({
        style_class: "file-content-scroll",
        x_expand: true,
        y_expand: true,
        style: "min-height: 80px;",
      });

      // Create a container for the content inside the scroll view
      const contentBox = new St.BoxLayout({
        vertical: true,
        x_expand: true,
      });

      // Create label with file content
      const contentLabel = new St.Label({
        text: content,
        style_class: "file-content-text",
        style: "font-family: monospace; font-size: 14px; color: #000000;",
      });

      contentLabel.clutter_text.set_line_wrap(true);
      contentLabel.clutter_text.set_selectable(true);

      // Add content label to the content box
      contentBox.add_child(contentLabel);

      // Add content box to the scroll view
      scrollView.add_child(contentBox);

      // Add scroll view to the box
      this._fileContentBox.add_child(scrollView);

      // Add the file content box to the panel overlay
      this._panelOverlay.add_child(this._fileContentBox);

      // Position the box so its bottom touches the top of the input container
      this._positionFileContentBox();

      // Connect to allocation-changed signal to reposition when panel size changes
      this._allocationChangedId = this._panelOverlay.connect(
        "allocation-changed",
        () => {
          this._positionFileContentBox();
        }
      );
    }

    _positionFileContentBox() {
      if (!this._fileContentBox || !this._inputButtonsContainer) return;

      // Get the position and size of the input container
      const [inputX, inputY] =
        this._inputButtonsContainer.get_transformed_position();
      const [inputWidth, inputHeight] = this._inputButtonsContainer.get_size();

      // Get the size of the file content box
      const [boxWidth, boxHeight] = this._fileContentBox.get_size();

      // Calculate position: centered horizontally, bottom touching the top of input container
      const x = Math.floor((this._panelOverlay.width - boxWidth) / 2);
      const y = inputY - boxHeight;

      // Set the position
      this._fileContentBox.set_position(x, Math.max(10, y)); // Ensure at least 10px from top
    }

    // Clean up allocation-changed signal when removing the file content box
    _cleanupFileContentBox() {
      if (this._allocationChangedId) {
        this._panelOverlay.disconnect(this._allocationChangedId);
        this._allocationChangedId = null;
      }

      if (this._fileContentBox && this._fileContentBox.get_parent()) {
        this._fileContentBox.get_parent().remove_child(this._fileContentBox);
        this._fileContentBox.destroy();
        this._fileContentBox = null;
      }
    }

    async _togglePanelOverlay() {
      // Toggle visibility
      this._panelOverlay.visible = !this._panelOverlay.visible;

      // If closing, reset the input field and close model menu
      if (!this._panelOverlay.visible) {
        this._inputField.set_text("");

        // Close model menu when panel is closed
        if (this._modelMenu && this._modelMenu.isOpen) {
          this._modelMenu.close();
        }

        // Clean up file content box if it exists
        this._cleanupFileContentBox();
      } else {
        // If opening, repopulate model menu and focus input field
        // Clear existing menu items
        if (this._modelMenu) {
          this._modelMenu.removeAll();
          // Repopulate model menu items
          await this._addModelMenuItems();
        }
        this._updateHistory();
        global.stage.set_key_focus(this._inputField.clutter_text);
      }

      // Update layout
      this._updateLayout();
    }

    // MESSAGING FUNCTIONALITY

    async _sendMessage() {
      const userMessage = this._inputField.get_text().trim();
      if (!userMessage || this._isProcessingMessage) return;

      // Clean up file content box if it exists
      this._cleanupFileContentBox();

      // Clear input field immediately
      this._inputField.set_text("");

      // Update input field hint to "Your response..." immediately after sending
      PanelElements.updateInputFieldHint(this._inputField, false);

      // Set processing state
      this._isProcessingMessage = true;
      this._updateSendButtonState(false);

      try {
        // Process the user message
        await MessageProcessor.processUserMessage({
          userMessage: userMessage,
          context: this._context,
          outputContainer: this._outputContainer,
          scrollView: this._outputScrollView,
          onResponseStart: () => {
            // Update send button to show stop icon
            this._updateSendButtonState(true, true);
          },
          onResponseEnd: () => {
            // Reset processing state
            this._isProcessingMessage = false;
            this._updateSendButtonState(true);
            // No need to update hint here as we already updated it when sending the message
          },
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
        // Update input field hint based on conversation history
        const history = getConversationHistory();
        const isNewChat =
          history.length === 0 ||
          (history.length > 0 && history[history.length - 1].type === "user");
        PanelElements.updateInputFieldHint(this._inputField, isNewChat);
      }

      // Give focus back to input field
      global.stage.set_key_focus(this._inputField.clutter_text);
    }

    /**
     * Update the send button state based on whether message processing is active
     * @param {boolean} enabled - Whether the button should be enabled
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
        enabled
          ? this._sendMessage.bind(this)
          : () => {
              // Call stopAiMessage and reset the button state
              stopAiMessage();
              this._isProcessingMessage = false;
              this._updateSendButtonState(true);
            }
      );
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

      // Restore temporary messages
      tempMessages.forEach((msg) => {
        this._outputContainer.add_child(msg);
      });

      // Update input field hint based on conversation state
      const isNewChat =
        history.length === 0 ||
        (history.length > 0 && history[history.length - 1].type === "user");
      PanelElements.updateInputFieldHint(this._inputField, isNewChat);

      // Scroll to the bottom to show latest messages
      PanelElements.scrollToBottom(this._outputScrollView);
    }

    _clearHistory() {
      // Clear conversation history and context
      clearConversationHistory();
      this._context = null;

      // Clear UI
      MessageProcessor.clearOutput(this._outputContainer);

      // Update input field hint for new chat
      PanelElements.updateInputFieldHint(this._inputField, true);
    }

    // LAYOUT UPDATES

    _updateLayout() {
      // Get the updated panel dimensions
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
        this._sendButton,
        this._sendIcon
      );

      // Scroll to bottom to ensure content is visible after layout change
      PanelElements.scrollToBottom(this._outputScrollView);
    }

    // CLEANUP

    destroy() {
      // Disconnect settings change signal
      if (this._settingsChangedId) {
        this._settings.disconnect(this._settingsChangedId);
      }

      // Disconnect send button click handler
      if (this._sendButtonClickId) {
        this._sendButton.disconnect(this._sendButtonClickId);
      }

      // Remove the panel overlay from Chrome
      if (this._panelOverlay) {
        Main.layoutManager.removeChrome(this._panelOverlay);
      }

      super.destroy();
    }
  }
);
