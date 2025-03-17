/**
 * File handling functionality for the panel UI
 */
import GObject from "gi://GObject";
import St from "gi://St";
import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import GLib from "gi://GLib";

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

    // Create a container that will hold files and the input buttons container
    this._expandedContainer = null;

    // Store the original input buttons container parent
    this._originalParent = null;

    // Store the original position and style of the input buttons container
    this._originalInputPos = null;
    this._originalInputStyle = null;
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

  _setupExpandedContainer() {
    // If already set up, return
    if (this._expandedContainer) return;

    // Save original parent and position
    this._originalParent = this._inputButtonsContainer.get_parent();
    this._originalInputPos = this._inputButtonsContainer.get_position();
    this._originalInputStyle = this._inputButtonsContainer.get_style();

    // Get the dimensions
    const dimensions = LayoutManager.calculatePanelDimensions();

    // Get the height of the input buttons container for exact positioning later
    const [, inputHeight] =
      this._inputButtonsContainer.get_preferred_height(-1);

    // Create a new expanded container that will hold both file boxes and input container
    // Minimal padding and styling to make it look seamless
    this._expandedContainer = new St.BoxLayout({
      style_class: "expanded-container",
      style:
        "background-color: rgba(80, 80, 80, 0.2); border-radius: 16px 16px 0 0; padding: 0;",
      vertical: true,
      x_expand: true,
      y_expand: false,
    });

    // Create a horizontal container for file boxes - position it right above the input
    this._fileBoxesContainer = new St.BoxLayout({
      style_class: "file-boxes-container",
      style: "spacing: 10px; margin: 8px 8px 0 8px;", // Add margin only on sides and top
      vertical: false,
      x_expand: false,
      y_expand: false,
    });

    // Remove input buttons container from its parent
    if (this._inputButtonsContainer.get_parent()) {
      this._inputButtonsContainer
        .get_parent()
        .remove_child(this._inputButtonsContainer);
    }

    // Add file boxes container to expanded container first
    this._expandedContainer.add_child(this._fileBoxesContainer);

    // Add input buttons container to expanded container
    this._expandedContainer.add_child(this._inputButtonsContainer);

    // Make sure input container keeps its original style
    this._inputButtonsContainer.set_style(this._originalInputStyle);

    // Add expanded container to panel overlay
    this._panelOverlay.add_child(this._expandedContainer);

    // Position the expanded container
    this._positionExpandedContainer();
  }

  _positionExpandedContainer() {
    if (!this._expandedContainer) return;

    const dimensions = LayoutManager.calculatePanelDimensions();

    // Calculate position - keep it exactly where the input container would be
    const x = dimensions.horizontalPadding;

    const y = dimensions.panelHeight - this._expandedContainer.get_height();

    // Set position of expanded container
    this._expandedContainer.set_position(x, y);

    // Set width to match panel width minus padding
    this._expandedContainer.set_width(
      dimensions.panelWidth - dimensions.horizontalPadding * 2
    );
  }

  _displayFileContentBox(content, fileName) {
    // Set up the expanded container if needed
    this._setupExpandedContainer();

    // Create a new box for file content - square and small
    const fileBox = new St.BoxLayout({
      style_class: "file-content-box",
      style:
        "background-color: #FFFFFF; " +
        "border: 1px solid #000000; " + // Thinner border
        "border-radius: 8px; " +
        "padding: 6px; " + // Less padding
        "margin: 3px; " + // Less margin
        "width: 100px; " + // Slightly smaller width
        "height: 100px; " + // Same as width to make it square
        "box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);", // Lighter shadow
      vertical: true,
      x_expand: false, // Don't expand to fill width
      y_expand: false,
    });

    // Create header box for filename and close button
    const headerBox = new St.BoxLayout({
      style_class: "file-content-header",
      style: "width: 100%; margin-bottom: 3px;", // Less margin
      vertical: false,
    });

    // Add filename as the title - truncate if too long
    let displayName = fileName;
    if (displayName.length > 10) {
      displayName = displayName.substring(0, 8) + "...";
    }

    const titleLabel = new St.Label({
      text: displayName,
      style: "font-weight: bold; color: #000000; font-size: 10px;", // Smaller font
      x_expand: true,
    });
    headerBox.add_child(titleLabel);

    // Add close button (X) to the header
    const closeButton = new St.Button({
      style_class: "file-content-close-button",
      style:
        "font-weight: bold; " +
        "color: #000000; " +
        "font-size: 12px; " + // Smaller font
        "background: none; " +
        "border: none; " +
        "width: 14px; " + // Smaller button
        "height: 14px;", // Smaller button
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
      style: "min-height: 60px;", // Less height
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
      style: "font-family: monospace; font-size: 9px; color: #000000;", // Smaller font
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

    // Reposition the expanded container after adding the file
    this._positionExpandedContainer();

    // Update the overall layout
    this._updateLayoutCallback();
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
      // Just reposition the container
      this._positionExpandedContainer();
      // Update the layout
      this._updateLayoutCallback();
    }
  }

  // Clean up when removing the file content box
  cleanupFileContentBox() {
    if (this._expandedContainer) {
      // First, take the input buttons container out of expanded container
      if (
        this._inputButtonsContainer.get_parent() === this._expandedContainer
      ) {
        this._expandedContainer.remove_child(this._inputButtonsContainer);
      }

      // Add input buttons container back to its original parent
      if (this._originalParent) {
        this._originalParent.add_child(this._inputButtonsContainer);

        // Restore original position if we saved it
        if (this._originalInputPos) {
          const [x, y] = this._originalInputPos;
          this._inputButtonsContainer.set_position(x, y);
        }

        // Restore original style if we saved it
        if (this._originalInputStyle) {
          this._inputButtonsContainer.set_style(this._originalInputStyle);
        }
      }

      // Remove file boxes and container
      if (this._fileBoxesContainer) {
        this._fileBoxesContainer.get_children().forEach((child) => {
          this._fileBoxesContainer.remove_child(child);
          child.destroy();
        });
      }

      // Remove and destroy the expanded container
      if (this._expandedContainer.get_parent()) {
        this._expandedContainer
          .get_parent()
          .remove_child(this._expandedContainer);
      }

      this._expandedContainer.destroy();
      this._expandedContainer = null;
      this._fileBoxesContainer = null;
    }

    // Update the layout to ensure everything is positioned correctly
    this._updateLayoutCallback();
  }

  destroy() {
    this.cleanupFileContentBox();
  }
}
