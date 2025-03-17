/**
 * File handling functionality for the panel UI
 */
import GObject from "gi://GObject";
import St from "gi://St";
import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

// Import from reorganized modules
import * as MessageProcessor from "./messageProcessor.js";
import * as LayoutManager from "./layoutManager.js";

export class FileHandler {
  constructor(
    extensionPath,
    outputContainer,
    panelOverlay,
    inputButtonsContainer,
    updateLayoutCallback
  ) {
    this._extensionPath = extensionPath;
    this._outputContainer = outputContainer;
    this._panelOverlay = panelOverlay;
    this._inputButtonsContainer = inputButtonsContainer;
    this._updateLayoutCallback = updateLayoutCallback;

    this._fileBoxesContainer = null;
    this._expandedContainer = null;
    this._allocationChangedId = null;
  }

  // Method is now public
  openFileSelector() {
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

    // Get the height of the expanded container
    const [, expandedHeight] = this._expandedContainer.get_preferred_height(-1);

    // Position the expanded container at the bottom of the panel with proper padding
    this._expandedContainer.set_position(
      dimensions.horizontalPadding,
      dimensions.panelHeight - expandedHeight - dimensions.paddingY
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
      this.cleanupFileContentBox();
    } else {
      // Otherwise just reposition the container
      this._positionExpandedContainer();
    }
  }

  // Clean up allocation-changed signal when removing the file content box
  cleanupFileContentBox() {
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

    // Update the layout - this will recalculate all UI element positions correctly
    this._updateLayoutCallback();
  }

  _updateLayoutForInputButtonsContainer() {
    // Get dimensions
    const dimensions = LayoutManager.calculatePanelDimensions();

    // Position and style the input-buttons container
    this._inputButtonsContainer.set_style(
      "background-color: rgba(255, 255, 255, 0.95); " +
        "border-radius: 12px; " +
        "padding: 10px; " +
        "box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);"
    );

    // Position the container at the bottom of the panel
    this._inputButtonsContainer.set_position(
      dimensions.horizontalPadding,
      dimensions.panelHeight -
        this._inputButtonsContainer.get_height() -
        dimensions.paddingY
    );

    // Set the width to span most of the panel
    this._inputButtonsContainer.set_width(
      dimensions.panelWidth - dimensions.horizontalPadding * 2
    );
  }

  destroy() {
    this.cleanupFileContentBox();
  }
}
