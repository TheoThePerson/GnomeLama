/**
 * File handling functionality for the panel UI
 */
import St from "gi://St";
import Gio from "gi://Gio";

// Import from reorganized modules
import * as MessageProcessor from "./messageProcessor.js";
import * as LayoutManager from "./layoutManager.js";

// UI Constants
const UI = {
  CONTAINER: {
    EXPANDED: {
      STYLE_CLASS: "expanded-container",
      STYLE:
        "background-color: rgba(60, 60, 60, 0.3); border-radius: 16px 16px 0 0; padding: 0;",
    },
    FILE_BOXES: {
      STYLE_CLASS: "file-boxes-container",
      STYLE: "spacing: 10px; margin: 8px;",
    },
  },
  FILE_BOX: {
    STYLE_CLASS: "file-content-box",
    STYLE:
      "background-color: #FFFFFF; " +
      "border: 1px solid #000000; " +
      "border-radius: 8px; " +
      "padding: 6px; " +
      "margin: 3px; " +
      "width: 100px; " +
      "height: 100px; " +
      "box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);",
    HEADER: {
      STYLE_CLASS: "file-content-header",
      STYLE: "width: 100%; margin-bottom: 3px;",
      TITLE: {
        STYLE: "font-weight: bold; color: #000000; font-size: 10px;",
        MAX_LENGTH: 10,
        TRUNCATE_LENGTH: 8,
      },
      CLOSE_BUTTON: {
        STYLE_CLASS: "file-content-close-button",
        STYLE:
          "font-weight: bold; " +
          "color: #000000; " +
          "font-size: 12px; " +
          "background: none; " +
          "border: none; " +
          "width: 14px; " +
          "height: 14px;",
        LABEL: "✕",
      },
    },
    CONTENT: {
      SCROLL: {
        STYLE_CLASS: "file-content-scroll",
        STYLE: "min-height: 60px;",
      },
      TEXT: {
        STYLE_CLASS: "file-content-text",
        STYLE: "font-family: monospace; font-size: 9px; color: #000000;",
        MAX_LENGTH: 2000,
      },
    },
  },
};

/**
 * Handles file operations for the panel UI
 */
export class FileHandler {
  /**
   * Creates a new FileHandler instance
   *
   * @param {string} extensionPath - Path to the extension directory
   * @param {St.Widget} outputContainer - Container for output messages
   * @param {St.Widget} panelOverlay - Panel overlay container
   * @param {St.Widget} inputButtonsContainer - Container for input buttons
   * @param {Function} updateLayoutCallback - Callback to update layout
   */
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

    // Container that will hold files
    this._expandedContainer = null;
    this._fileBoxesContainer = null;
  }

  /**
   * Opens a file selector dialog
   */
  openFileSelector() {
    try {
      const command = ["zenity", "--file-selection", "--title=Select a file"];
      this._executeCommand(command);
    } catch (error) {
      this._handleError("Error opening file selector", error);
    }
  }

  /**
   * Executes a command as a subprocess
   *
   * @private
   * @param {string[]} command - Command to execute
   */
  _executeCommand(command) {
    try {
      const subprocess = new Gio.Subprocess({
        argv: command,
        flags:
          Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
      });

      subprocess.init(null);
      subprocess.communicate_utf8_async(
        null,
        null,
        this._handleCommandOutput.bind(this)
      );
    } catch (error) {
      this._handleError("Error executing command", error);
    }
  }

  /**
   * Handles the output from a command
   *
   * @private
   * @param {Gio.Subprocess} source - The subprocess
   * @param {Gio.AsyncResult} res - The async result
   */
  _handleCommandOutput(source, res) {
    try {
      const [, stdout, stderr] = source.communicate_utf8_finish(res);

      if (stdout && stdout.trim()) {
        const selectedFilePath = stdout.trim();
        this._showFileSelectedMessage(selectedFilePath);
        this._readAndDisplayFile(selectedFilePath);
      } else if (stderr && stderr.trim()) {
        console.error(`Command error: ${stderr}`);
      }
    } catch (error) {
      this._handleError("Error processing command output", error);
    }
  }

  /**
   * Shows a message that a file has been selected
   *
   * @private
   * @param {string} filePath - Path to the selected file
   */
  _showFileSelectedMessage(filePath) {
    MessageProcessor.addTemporaryMessage(
      this._outputContainer,
      `Selected file: ${filePath}`
    );
    console.log(`File selected: ${filePath}`);
  }

  /**
   * Reads and displays the contents of a file
   *
   * @private
   * @param {string} filePath - Path to the file
   */
  _readAndDisplayFile(filePath) {
    try {
      const file = Gio.File.new_for_path(filePath);

      if (!this._validateFile(file, filePath)) {
        return;
      }

      const fileName = file.get_basename();
      this._loadFileContents(file, fileName);
    } catch (error) {
      this._handleError(`Error processing file: ${filePath}`, error);
    }
  }

  /**
   * Validates that a file exists
   *
   * @private
   * @param {Gio.File} file - The file to validate
   * @param {string} filePath - Path to the file
   * @returns {boolean} - Whether the file exists
   */
  _validateFile(file, filePath) {
    if (!file.query_exists(null)) {
      console.error(`File does not exist: ${filePath}`);
      MessageProcessor.addTemporaryMessage(
        this._outputContainer,
        `File does not exist: ${filePath}`
      );
      return false;
    }
    return true;
  }

  /**
   * Loads the contents of a file
   *
   * @private
   * @param {Gio.File} file - The file to load
   * @param {string} fileName - Name of the file
   */
  _loadFileContents(file, fileName) {
    try {
      const [success, content] = file.load_contents(null);

      if (success) {
        const fileContent = this._decodeFileContent(content);
        const truncatedContent = this._truncateContent(fileContent);
        this._displayFileContentBox(truncatedContent, fileName);
      } else {
        MessageProcessor.addTemporaryMessage(
          this._outputContainer,
          "Failed to read file content"
        );
      }
    } catch (error) {
      this._handleError("Error reading file", error);
    }
  }

  /**
   * Decodes file content from buffer to string
   *
   * @private
   * @param {Uint8Array} content - File content as a buffer
   * @returns {string} - Decoded file content
   */
  _decodeFileContent(content) {
    try {
      return new TextDecoder("utf-8").decode(content);
    } catch (error) {
      return content.toString();
    }
  }

  /**
   * Truncates content if it exceeds max length
   *
   * @private
   * @param {string} content - Content to truncate
   * @returns {string} - Truncated content
   */
  _truncateContent(content) {
    const maxLength = UI.FILE_BOX.CONTENT.TEXT.MAX_LENGTH;
    if (content.length > maxLength) {
      return content.substring(0, maxLength) + "...\n(Content truncated)";
    }
    return content;
  }

  /**
   * Sets up the expanded container for file boxes
   *
   * @private
   */
  _setupExpandedContainer() {
    // If already set up, return
    if (this._expandedContainer) return;

    this._createExpandedContainer();
    this._createFileBoxesContainer();

    // Add file boxes container to expanded container
    this._expandedContainer.add_child(this._fileBoxesContainer);

    // Add expanded container to panel overlay
    this._panelOverlay.add_child(this._expandedContainer);

    // Position the expanded container
    this._positionExpandedContainer();
  }

  /**
   * Creates the expanded container
   *
   * @private
   */
  _createExpandedContainer() {
    this._expandedContainer = new St.BoxLayout({
      style_class: UI.CONTAINER.EXPANDED.STYLE_CLASS,
      style: UI.CONTAINER.EXPANDED.STYLE,
      vertical: true,
      x_expand: true,
      y_expand: false,
    });
  }

  /**
   * Creates the container for file boxes
   *
   * @private
   */
  _createFileBoxesContainer() {
    this._fileBoxesContainer = new St.BoxLayout({
      style_class: UI.CONTAINER.FILE_BOXES.STYLE_CLASS,
      style: UI.CONTAINER.FILE_BOXES.STYLE,
      vertical: false,
      x_expand: false,
      y_expand: false,
    });
  }

  /**
   * Positions the expanded container
   *
   * @private
   */
  _positionExpandedContainer() {
    if (!this._expandedContainer) return;

    const dimensions = LayoutManager.calculatePanelDimensions();
    const inputPosition = this._inputButtonsContainer.get_position();

    // Calculate position and size
    const x = dimensions.horizontalPadding;
    const y = inputPosition[1] - this._fileBoxesContainer.get_height();
    const width = dimensions.panelWidth - dimensions.horizontalPadding * 2;
    const height = dimensions.panelHeight - y;

    // Apply position and size
    this._expandedContainer.set_position(x, y);
    this._expandedContainer.set_width(width);
    this._expandedContainer.set_height(height);
    this._expandedContainer.set_z_position(-1); // Behind input container
  }

  /**
   * Displays file content in a box
   *
   * @private
   * @param {string} content - File content
   * @param {string} fileName - Name of the file
   */
  _displayFileContentBox(content, fileName) {
    // Set up the expanded container if needed
    this._setupExpandedContainer();

    const fileBox = this._createFileBox();
    const headerBox = this._createHeaderBox(fileName, fileBox);
    const contentView = this._createContentView(content);

    // Add header and content to the file box
    fileBox.add_child(headerBox);
    fileBox.add_child(contentView);

    // Add file box to the container
    this._fileBoxesContainer.add_child(fileBox);

    // Update layout
    this._positionExpandedContainer();
    this._updateLayoutCallback();
  }

  /**
   * Creates a file box
   *
   * @private
   * @returns {St.BoxLayout} - The file box
   */
  _createFileBox() {
    return new St.BoxLayout({
      style_class: UI.FILE_BOX.STYLE_CLASS,
      style: UI.FILE_BOX.STYLE,
      vertical: true,
      x_expand: false,
      y_expand: false,
    });
  }

  /**
   * Creates a header box for a file
   *
   * @private
   * @param {string} fileName - Name of the file
   * @param {St.BoxLayout} fileBox - The file box
   * @returns {St.BoxLayout} - The header box
   */
  _createHeaderBox(fileName, fileBox) {
    const headerBox = new St.BoxLayout({
      style_class: UI.FILE_BOX.HEADER.STYLE_CLASS,
      style: UI.FILE_BOX.HEADER.STYLE,
      vertical: false,
    });

    // Add title
    const titleLabel = this._createTitleLabel(fileName);
    headerBox.add_child(titleLabel);

    // Add close button
    const closeButton = this._createCloseButton(fileBox);
    headerBox.add_child(closeButton);

    return headerBox;
  }

  /**
   * Creates a title label for a file
   *
   * @private
   * @param {string} fileName - Name of the file
   * @returns {St.Label} - The title label
   */
  _createTitleLabel(fileName) {
    // Truncate if too long
    let displayName = fileName;
    const maxLength = UI.FILE_BOX.HEADER.TITLE.MAX_LENGTH;
    const truncateLength = UI.FILE_BOX.HEADER.TITLE.TRUNCATE_LENGTH;

    if (displayName.length > maxLength) {
      displayName = displayName.substring(0, truncateLength) + "...";
    }

    return new St.Label({
      text: displayName,
      style: UI.FILE_BOX.HEADER.TITLE.STYLE,
      x_expand: true,
    });
  }

  /**
   * Creates a close button for a file box
   *
   * @private
   * @param {St.BoxLayout} fileBox - The file box
   * @returns {St.Button} - The close button
   */
  _createCloseButton(fileBox) {
    const closeButton = new St.Button({
      style_class: UI.FILE_BOX.HEADER.CLOSE_BUTTON.STYLE_CLASS,
      style: UI.FILE_BOX.HEADER.CLOSE_BUTTON.STYLE,
      label: UI.FILE_BOX.HEADER.CLOSE_BUTTON.LABEL,
    });

    closeButton.connect("clicked", () => {
      this._removeFileBox(fileBox);
    });

    return closeButton;
  }

  /**
   * Creates a content view for file content
   *
   * @private
   * @param {string} content - File content
   * @returns {St.ScrollView} - The content view
   */
  _createContentView(content) {
    // Create scrollable container
    const scrollView = new St.ScrollView({
      style_class: UI.FILE_BOX.CONTENT.SCROLL.STYLE_CLASS,
      style: UI.FILE_BOX.CONTENT.SCROLL.STYLE,
      x_expand: true,
      y_expand: true,
    });

    // Create container for content
    const contentBox = new St.BoxLayout({
      vertical: true,
      x_expand: true,
    });

    // Create label with file content
    const contentLabel = new St.Label({
      text: content,
      style_class: UI.FILE_BOX.CONTENT.TEXT.STYLE_CLASS,
      style: UI.FILE_BOX.CONTENT.TEXT.STYLE,
    });

    contentLabel.clutter_text.set_line_wrap(true);
    contentLabel.clutter_text.set_selectable(true);

    // Add content to views
    contentBox.add_child(contentLabel);
    scrollView.add_child(contentBox);

    return scrollView;
  }

  /**
   * Removes a file box
   *
   * @private
   * @param {St.BoxLayout} fileBox - The file box to remove
   */
  _removeFileBox(fileBox) {
    // Remove the file box from its parent
    if (fileBox && fileBox.get_parent()) {
      fileBox.get_parent().remove_child(fileBox);
      fileBox.destroy();
    }

    this._updateAfterRemoval();
  }

  /**
   * Updates the UI after a file box is removed
   *
   * @private
   */
  _updateAfterRemoval() {
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

  /**
   * Handles errors and displays error messages
   *
   * @private
   * @param {string} context - Context of the error
   * @param {Error|string} error - The error
   */
  _handleError(context, error) {
    const errorMessage = error.message || error;
    console.error(`${context}: ${errorMessage}`);

    MessageProcessor.addTemporaryMessage(
      this._outputContainer,
      `${context}. ${errorMessage}`
    );
  }

  /**
   * Cleans up the file content box and containers
   */
  cleanupFileContentBox() {
    if (this._expandedContainer) {
      this._cleanupFileBoxes();
      this._cleanupExpandedContainer();
    }

    // Update the layout
    this._updateLayoutCallback();
  }

  /**
   * Cleans up file boxes
   *
   * @private
   */
  _cleanupFileBoxes() {
    if (this._fileBoxesContainer) {
      this._fileBoxesContainer.get_children().forEach((child) => {
        this._fileBoxesContainer.remove_child(child);
        child.destroy();
      });

      this._fileBoxesContainer = null;
    }
  }

  /**
   * Cleans up the expanded container
   *
   * @private
   */
  _cleanupExpandedContainer() {
    if (this._expandedContainer.get_parent()) {
      this._expandedContainer
        .get_parent()
        .remove_child(this._expandedContainer);
    }

    this._expandedContainer.destroy();
    this._expandedContainer = null;
  }

  /**
   * Destroys the file handler and cleans up resources
   */
  destroy() {
    this.cleanupFileContentBox();
  }
}
