/**
 * Panel UI implementation
 */
import GObject from "gi://GObject";
import St from "gi://St";
import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import { gettext as _ } from "resource:///org/gnome/shell/extensions/extension.js";

// Import from reorganized modules
import * as PanelElements from "./panelElements.js";
import * as MessageProcessor from "./messageProcessor.js";
import * as LayoutManager from "./layoutManager.js";

// Import messaging
import {
  fetchModelNames,
  setModel,
  stopAiMessage,
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
      this._isProcessingMessage = false;

      this._initUI();

      this._settingsChangedId = this._settings.connect("changed", () =>
        this._updateLayout()
      );
      Main.layoutManager.connect("monitors-changed", () =>
        this._updateLayout()
      );
      this.connect("button-press-event", this._togglePanelOverlay.bind(this));
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

      const history = getConversationHistory();
      const isNewChat =
        history.length === 0 ||
        (history.length > 0 && history[history.length - 1].type === "user");

      const { inputFieldBox, inputField, sendButton, sendIcon } =
        PanelElements.createInputArea(this._extensionPath, isNewChat);
      this._inputFieldBox = inputFieldBox;
      this._inputField = inputField;
      this._sendButton = sendButton;
      this._sendIcon = sendIcon;

      this._inputField.connect("button-press-event", () => {
        if (this._modelMenu && this._modelMenu.isOpen) {
          this._modelMenu.close();
        }
        return Clutter.EVENT_PROPAGATE;
      });

      this._setupModelMenu();
      this._setupFileButton();
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

      // Enter key
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

      this._sendButton.connect("clicked", this._sendMessage.bind(this));

      this._updateLayout();
    }

    async _setupModelMenu() {
      const { modelButton, modelButtonLabel } =
        PanelElements.createModelButton();
      this._modelButton = modelButton;
      this._modelButtonLabel = modelButtonLabel;

      this._modelButtonLabel.set_style("color: #808080;");

      this._updateModelLabel("Loading...");

      this._modelMenu = new PopupMenu.PopupMenu(
        new St.Button(),
        0.0,
        St.Side.BOTTOM
      );
      Main.uiGroup.add_child(this._modelMenu.actor);
      this._modelMenu.actor.hide();

      this._modelMenu.connect("open-state-changed", (menu, isOpen) => {
        if (isOpen) {
          const dimensions = LayoutManager.calculatePanelDimensions();
          const panelLeft = dimensions.monitor.width - dimensions.panelWidth;
          let menuActor = this._modelMenu.actor || this._modelMenu;

          const [containerX, containerY] =
            this._inputButtonsContainer.get_transformed_position();

          menuActor.set_position(
            panelLeft,
            containerY - menuActor.get_height()
          );
        }
      });

      global.stage.connect("button-press-event", (actor, event) => {
        if (this._modelMenu && this._modelMenu.isOpen) {
          let [x, y] = event.get_coords();
          let menuActor = this._modelMenu.actor || this._modelMenu;
          let [menuX, menuY] = menuActor.get_transformed_position();
          let [menuWidth, menuHeight] = menuActor.get_size();
          let [buttonX, buttonY] = this._modelButton.get_transformed_position();
          let [buttonWidth, buttonHeight] = this._modelButton.get_size();

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

      this._modelButton.connect("button-press-event", () => {
        this._modelMenu.toggle();
        return Clutter.EVENT_STOP;
      });

      await this._addModelMenuItems();
    }

    async _addModelMenuItems() {
      this._updateModelLabel("Fetching models");

      const { models, error } = await fetchModelNames();

      if (error) {
        this._updateModelLabel("No models found");
        MessageProcessor.addTemporaryMessage(this._outputContainer, error);
        return;
      }

      if (models.length === 0) {
        this._updateModelLabel("No models found");
        return;
      }

      this._modelMenu.removeAll();

      const defaultModel = this._settings.get_string("default-model");
      const selectedModel = models.includes(defaultModel)
        ? defaultModel
        : models[0];
      this._updateModelLabel(selectedModel);
      setModel(selectedModel);

      models.forEach((name) => {
        let modelItem = new PopupMenu.PopupMenuItem(name);

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
    }

    _setupClearButton() {
      const { clearButton, clearIcon } = PanelElements.createClearButton(
        this._extensionPath,
        this._settings.get_double("button-icon-scale")
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
        this._settings.get_double("button-icon-scale")
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

        subprocess.communicate_utf8_async(null, null, (source, res) => {
          try {
            let [, stdout, stderr] = source.communicate_utf8_finish(res);

            if (stdout.trim()) {
              let selectedFilePath = stdout.trim();

              MessageProcessor.addTemporaryMessage(
                this._outputContainer,
                `Selected file: ${selectedFilePath}`
              );

              console.log(`File selected: ${selectedFilePath}`);

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
        const file = Gio.File.new_for_path(filePath);

        if (!file.query_exists(null)) {
          console.error(`File does not exist: ${filePath}`);
          MessageProcessor.addTemporaryMessage(
            this._outputContainer,
            `File does not exist: ${filePath}`
          );
          return;
        }

        const fileName = file.get_basename();

        try {
          const [success, content] = file.load_contents(null);

          if (success) {
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

            // Display the content in a file box
            this._displayFileContentBox(fileContent, fileName);
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

    _displayFileContentBox(content, fileName) {
      if (!this._fileBoxesContainer) {
        // Create a horizontal container for files
        this._fileBoxesContainer = new St.BoxLayout({
          style_class: "file-boxes-container",
          style: "spacing: 15px;",
          vertical: false,
          x_expand: true,
          y_expand: false,
        });
      }

      // Create a new box for file content - make it square and smaller
      const fileBox = new St.BoxLayout({
        style_class: "file-content-box",
        style:
          "background-color: #FFFFFF; " +
          "border: 2px solid #000000; " +
          "border-radius: 8px; " +
          "padding: 10px; " +
          "margin: 0; " +
          "width: 160px; " + // Fixed width
          "height: 160px; " + // Same as width to make it square
          "box-shadow: 0 4px 8px rgba(0, 0, 0, 0.5);",
        vertical: true,
        x_expand: false, // Don't expand to fill width
        y_expand: false,
      });

      // Create header box for filename and close button
      const headerBox = new St.BoxLayout({
        style_class: "file-content-header",
        style: "width: 100%; margin-bottom: 5px;",
        vertical: false,
      });

      // Add filename as the title - truncate if too long
      let displayName = fileName;
      if (displayName.length > 15) {
        displayName = displayName.substring(0, 12) + "...";
      }

      const titleLabel = new St.Label({
        text: displayName,
        style: "font-weight: bold; color: #000000; font-size: 14px;",
        x_expand: true,
      });
      headerBox.add_child(titleLabel);

      // Add close button (X) to the header
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
        // Remove just this file box
        this._removeFileBox(fileBox);
      });

      // Add close button to header
      headerBox.add_child(closeButton);

      // Add header to the box
      fileBox.add_child(headerBox);

      // Create scrollable container for content
      const scrollView = new St.ScrollView({
        style_class: "file-content-scroll",
        x_expand: true,
        y_expand: true,
        style: "min-height: 120px;",
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
        style: "font-family: monospace; font-size: 12px; color: #000000;",
      });

      contentLabel.clutter_text.set_line_wrap(true);
      contentLabel.clutter_text.set_selectable(true);

      // Add content label to the content box
      contentBox.add_child(contentLabel);

      // Add content box to the scroll view
      scrollView.add_child(contentBox);

      // Add scroll view to the box
      fileBox.add_child(scrollView);

      // Add this file box to the file boxes container
      this._fileBoxesContainer.add_child(fileBox);

      // If this is our first file, set up the expanded container
      if (this._fileBoxesContainer.get_children().length === 1) {
        this._setupExpandedContainer();
      }

      // Make sure the expanded container is properly positioned
      this._positionExpandedContainer();
    }

    _setupExpandedContainer() {
      // Create a container that will hold both the file boxes and the input-buttons container
      this._expandedContainer = new St.BoxLayout({
        style_class: "expanded-container",
        style:
          "background-color: rgba(80, 80, 80, 0.2); " +
          "border-radius: 16px 16px 0 0; " + // Rounded only at the top
          "padding: 12px;",
        vertical: true,
        x_expand: true,
        y_expand: false,
      });

      // Add the file boxes container first
      this._expandedContainer.add_child(this._fileBoxesContainer);

      // Move input-buttons container from panel overlay to expanded container
      if (this._inputButtonsContainer.get_parent()) {
        this._inputButtonsContainer
          .get_parent()
          .remove_child(this._inputButtonsContainer);
      }

      // Reset the style of the input-buttons container since it will now be inside the expanded container
      this._inputButtonsContainer.set_style(
        "background-color: transparent; padding: 0; margin-top: 10px;"
      );

      // Add the input-buttons container to the expanded container
      this._expandedContainer.add_child(this._inputButtonsContainer);

      // Add the expanded container to the panel overlay
      this._panelOverlay.add_child(this._expandedContainer);

      // Position the expanded container initially
      this._positionExpandedContainer();

      // Connect to allocation-changed signal to reposition when panel size changes
      this._allocationChangedId = this._panelOverlay.connect(
        "allocation-changed",
        () => {
          this._positionExpandedContainer();
        }
      );
    }

    _positionExpandedContainer() {
      if (!this._expandedContainer) return;

      const dimensions = LayoutManager.calculatePanelDimensions();

      // Position the expanded container at the bottom of the panel with proper padding
      this._expandedContainer.set_position(
        dimensions.horizontalPadding,
        dimensions.panelHeight -
          this._expandedContainer.get_height() -
          dimensions.paddingY
      );

      // Set the width to span most of the panel with padding on both sides
      this._expandedContainer.set_width(
        dimensions.panelWidth - dimensions.horizontalPadding * 2
      );
    }

    _removeFileBox(fileBox) {
      // Remove the file box from its parent
      if (fileBox && fileBox.get_parent()) {
        fileBox.get_parent().remove_child(fileBox);
        fileBox.destroy();
      }

      // If there are no more file boxes, clean up everything
      if (
        !this._fileBoxesContainer ||
        this._fileBoxesContainer.get_children().length === 0
      ) {
        this._cleanupFileContentBox();
      } else {
        // Otherwise just reposition the container
        this._positionExpandedContainer();
      }
    }

    // Clean up allocation-changed signal when removing the file content box
    _cleanupFileContentBox() {
      if (this._allocationChangedId) {
        this._panelOverlay.disconnect(this._allocationChangedId);
        this._allocationChangedId = null;
      }

      // Clean up file boxes
      if (this._fileBoxesContainer) {
        // Remove and destroy all file boxes
        this._fileBoxesContainer.get_children().forEach((child) => {
          this._fileBoxesContainer.remove_child(child);
          child.destroy();
        });

        // Remove and destroy the file boxes container
        if (this._fileBoxesContainer.get_parent()) {
          this._fileBoxesContainer
            .get_parent()
            .remove_child(this._fileBoxesContainer);
        }
        this._fileBoxesContainer.destroy();
        this._fileBoxesContainer = null;
      }

      // If we have an expanded container, move input-buttons container back to panel overlay
      if (this._expandedContainer) {
        if (this._inputButtonsContainer.get_parent()) {
          this._inputButtonsContainer
            .get_parent()
            .remove_child(this._inputButtonsContainer);
        }

        // Reset style for the input-buttons container
        LayoutManager.updateInputButtonsContainer(this._inputButtonsContainer);

        // Add it back to the panel overlay
        this._panelOverlay.add_child(this._inputButtonsContainer);

        // Remove and destroy the expanded container
        if (this._expandedContainer.get_parent()) {
          this._expandedContainer
            .get_parent()
            .remove_child(this._expandedContainer);
        }
        this._expandedContainer.destroy();
        this._expandedContainer = null;
      }

      // Update the layout
      this._updateLayout();
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

      // Clean up file content boxes if they exist
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

      tempMessages.forEach((msg) => {
        this._outputContainer.add_child(msg);
      });

      // Update input field hint based
      const isNewChat =
        history.length === 0 ||
        (history.length > 0 && history[history.length - 1].type === "user");
      PanelElements.updateInputFieldHint(this._inputField, isNewChat);

      PanelElements.scrollToBottom(this._outputScrollView);
    }

    _clearHistory() {
      clearConversationHistory();
      this._context = null;

      MessageProcessor.clearOutput(this._outputContainer);

      PanelElements.updateInputFieldHint(this._inputField, true);
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
        this._sendButton,
        this._sendIcon
      );

      PanelElements.scrollToBottom(this._outputScrollView);
    }

    // CLEANUP

    destroy() {
      if (this._settingsChangedId) {
        this._settings.disconnect(this._settingsChangedId);
      }

      if (this._sendButtonClickId) {
        this._sendButton.disconnect(this._sendButtonClickId);
      }

      if (this._panelOverlay) {
        Main.layoutManager.removeChrome(this._panelOverlay);
      }

      super.destroy();
    }
  }
);
