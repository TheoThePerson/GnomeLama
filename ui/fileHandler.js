/**
 * File handling functionality for the panel UI
 */
import St from "gi://St";
import Gio from "gi://Gio";
import Clutter from "gi://Clutter";

// Import from reorganized modules
import * as MessageProcessor from "./messageProcessor.js";
import * as LayoutManager from "./layoutManager.js";

// UI Constants
const UI = {
  CONTAINER: {
    FILE_BOXES: {
      STYLE_CLASS: "file-boxes-container",
      MAX_HEIGHT: 400, // Increased maximum height for container
      SPACING: 10, // Spacing between file boxes (reduced for tighter layout)
      PADDING: 8, // Container padding (reduced)
    },
  },
  FILE_BOX: {
    STYLE_CLASS: "file-content-box",
    SIZE: 80, // Square
    MARGIN: 5, // Margin around boxes (reduced)
    HEADER: {
      STYLE_CLASS: "file-content-header",
      HEIGHT: 28, // Fixed header height
      TITLE: {
        MAX_LENGTH: 18, // Keep existing value
        TRUNCATE_LENGTH: 15, // Keep existing value
      },
      CLOSE_BUTTON: {
        STYLE_CLASS: "file-content-close-button",
        LABEL: "✕",
      },
    },
    CONTENT: {
      SCROLL: {
        STYLE_CLASS: "file-content-scroll",
      },
      TEXT: {
        STYLE_CLASS: "file-content-text",
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
    this._fileBoxesContainer = null;

    // Track loaded file content
    this._loadedFiles = new Map(); // Map to store filename -> content
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
        this._readAndDisplayFile(selectedFilePath);
      } else if (stderr && stderr.trim()) {
        console.error(`Command error: ${stderr}`);
      }
    } catch (error) {
      this._handleError("Error processing command output", error);
    }
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
   * Sets up the file boxes container
   *
   * @private
   * @returns {St.BoxLayout} The file boxes container
   */
  _setupFileBoxesContainer() {
    // If already set up, return it
    if (this._fileBoxesContainer) return this._fileBoxesContainer;

    this._createFileBoxesContainer();

    // Add file boxes container to the input buttons container at the top
    this._inputButtonsContainer.insert_child_at_index(
      this._fileBoxesContainer,
      0
    );

    return this._fileBoxesContainer;
  }

  /**
   * Creates the container for file boxes with flow layout
   *
   * @private
   */
  _createFileBoxesContainer() {
    // Create a flow layout for better wrapping of boxes
    const flowLayout = new Clutter.FlowLayout({
      orientation: Clutter.Orientation.HORIZONTAL,
      homogeneous: true, // Make all columns the same size
      column_spacing: UI.CONTAINER.FILE_BOXES.SPACING,
      row_spacing: UI.CONTAINER.FILE_BOXES.SPACING,
      max_column_width: UI.FILE_BOX.SIZE + UI.FILE_BOX.MARGIN * 2,
    });

    // Create the container with flow layout
    this._fileBoxesContainer = new St.Widget({
      style_class: UI.CONTAINER.FILE_BOXES.STYLE_CLASS,
      layout_manager: flowLayout,
      x_expand: true,
      y_expand: false, // Don't allow auto-expansion to avoid pushing other elements
      clip_to_allocation: true,
    });

    // Calculate initial container height for a single row
    const initialHeight =
      UI.FILE_BOX.SIZE +
      UI.FILE_BOX.MARGIN * 2 +
      (UI.CONTAINER.FILE_BOXES.PADDING || 0);

    this._fileBoxesContainer.set_height(initialHeight);
  }

  /**
   * Adjusts the height of the input container to accommodate file boxes
   * Recalculates based on number of rows in the flow layout
   *
   * @private
   */
  _adjustInputContainerHeight() {
    if (!this._fileBoxesContainer) return;

    // Calculate container dimensions based on flow layout
    const fileCount = this._fileBoxesContainer.get_n_children();

    if (fileCount === 0) {
      this._fileBoxesContainer.hide();
      this._updateLayoutCallback();
      return;
    }

    // Get the dimensions from the layout manager
    const { panelWidth, horizontalPadding } =
      LayoutManager.calculatePanelDimensions();

    // Calculate available width for file boxes
    // Subtract padding from both sides and container internal padding
    const containerPadding = UI.CONTAINER.FILE_BOXES.PADDING || 0;
    const availableWidth =
      panelWidth - horizontalPadding * 2 - containerPadding * 2;

    // Calculate how many full-sized boxes can fit in a row
    const boxTotalSize =
      UI.FILE_BOX.SIZE +
      UI.FILE_BOX.MARGIN * 2 +
      UI.CONTAINER.FILE_BOXES.SPACING;
    const boxesPerRow = Math.max(1, Math.floor(availableWidth / boxTotalSize));

    // Calculate number of rows needed (at least 1)
    const rowsNeeded = Math.max(1, Math.ceil(fileCount / boxesPerRow));

    // Calculate new container height based on number of rows
    const boxHeight = UI.FILE_BOX.SIZE + UI.FILE_BOX.MARGIN * 2;
    const rowSpacing = (rowsNeeded - 1) * UI.CONTAINER.FILE_BOXES.SPACING;

    // Calculate total height needed for all rows, keep it minimal
    let containerHeight =
      boxHeight * rowsNeeded + rowSpacing + containerPadding * 2;

    // Update container height
    this._fileBoxesContainer.set_height(containerHeight);
    this._fileBoxesContainer.show();

    // Notify the layout manager to update the overall layout
    this._updateLayoutCallback();
  }

  /**
   * Displays file content in a box
   *
   * @private
   * @param {string} content - File content
   * @param {string} fileName - Name of the file
   * @param {boolean} [storeInMap=true] - Whether to store in _loadedFiles map (default: true)
   */
  _displayFileContentBox(content, fileName, storeInMap = true) {
    // Set up the file boxes container if needed
    const container = this._setupFileBoxesContainer();

    // Check if we already have this file to prevent duplicates
    const existingFileBox = this._findExistingFileBox(fileName);
    if (existingFileBox) {
      // Just update the content if we already have this file
      this._updateFileBoxContent(existingFileBox, content);
    } else {
      // Create and add a new file box
      const fileBox = this._createFileBox(fileName, content);
      container.add_child(fileBox);
    }

    // Only store file content if requested
    if (storeInMap) {
      this._loadedFiles.set(fileName, content);
    }

    // Update layout
    this._adjustInputContainerHeight();
  }

  /**
   * Finds an existing file box by filename
   *
   * @private
   * @param {string} fileName - Name of the file to find
   * @returns {St.BoxLayout|null} The file box if found, null otherwise
   */
  _findExistingFileBox(fileName) {
    if (!this._fileBoxesContainer) return null;

    const children = this._fileBoxesContainer.get_children();
    for (const child of children) {
      // Try to find the header box
      const headerBox = child.get_children()[0];
      if (headerBox) {
        const titleLabel = headerBox.get_children()[0];
        if (titleLabel && titleLabel.text) {
          // Check if this is our file
          if (titleLabel.userData && titleLabel.userData === fileName) {
            return child;
          }
        }
      }
    }
    return null;
  }

  /**
   * Updates content in an existing file box
   *
   * @private
   * @param {St.BoxLayout} fileBox - The file box to update
   * @param {string} content - New content
   */
  _updateFileBoxContent(fileBox, content) {
    const children = fileBox.get_children();
    if (children.length >= 2) {
      // Should have header and content
      const contentView = children[1];
      const contentBox = contentView.get_child();

      if (contentBox) {
        const contentLabel = contentBox.get_children()[0];
        if (contentLabel) {
          contentLabel.set_text(content);
        }
      }
    }
  }

  /**
   * Creates a file box with header and content
   *
   * @private
   * @param {string} fileName - Name of the file
   * @param {string} content - Content of the file
   * @returns {St.BoxLayout} - The created file box
   */
  _createFileBox(fileName, content) {
    // Create a square box with the same width and height
    const fileBox = new St.BoxLayout({
      style_class: UI.FILE_BOX.STYLE_CLASS,
      vertical: true,
      width: UI.FILE_BOX.SIZE,
      height: UI.FILE_BOX.SIZE,
      x_expand: false,
      y_expand: false,
    });

    // Add header and content
    const headerBox = this._createHeaderBox(fileName, fileBox);
    const contentView = this._createContentView(content);

    // Set a fixed height for the header to maximize content space
    headerBox.set_height(UI.FILE_BOX.HEADER.HEIGHT);

    // Content view should fill the remaining height
    const contentHeight = UI.FILE_BOX.SIZE - UI.FILE_BOX.HEADER.HEIGHT - 16; // Subtract padding
    contentView.set_height(contentHeight);

    fileBox.add_child(headerBox);
    fileBox.add_child(contentView);

    return fileBox;
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
      vertical: false,
      x_expand: true,
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

    const label = new St.Label({
      text: displayName,
      x_expand: true,
      style_class: "file-content-title",
    });

    // Store the full filename as user data to help with identification
    label.userData = fileName;

    return label;
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
      label: UI.FILE_BOX.HEADER.CLOSE_BUTTON.LABEL,
      x_expand: false,
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
      x_expand: true,
      y_expand: true,
    });

    // Create container for content
    const contentBox = new St.BoxLayout({
      vertical: true,
      x_expand: true,
      y_expand: true,
    });

    // Create label for content
    const contentLabel = new St.Label({
      style_class: UI.FILE_BOX.CONTENT.TEXT.STYLE_CLASS,
      text: content,
      x_expand: true,
      y_expand: true,
    });

    // Enable text wrapping and selection
    contentLabel.clutter_text.set_line_wrap(true);
    contentLabel.clutter_text.set_selectable(true);

    // Add label to content box
    contentBox.add_child(contentLabel);

    // Add content box to scroll view
    scrollView.add_child(contentBox);

    // Set scroll policies
    scrollView.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);

    return scrollView;
  }

  /**
   * Removes a file box
   *
   * @private
   * @param {St.BoxLayout} fileBox - The file box to remove
   */
  _removeFileBox(fileBox) {
    if (!this._fileBoxesContainer) return;

    // Get the file name from the header to remove from our map
    const headerBox = fileBox.get_children()[0];
    if (headerBox) {
      const titleLabel = headerBox.get_children()[0];
      if (titleLabel) {
        // Use the stored userData to get the full filename
        const fileName = titleLabel.userData;
        if (fileName) {
          this._loadedFiles.delete(fileName);
        }
      }
    }

    // Remove file box from container
    this._fileBoxesContainer.remove_child(fileBox);
    fileBox.destroy();

    // Update layout for remaining boxes
    this._adjustInputContainerHeight();
  }

  /**
   * Handles errors
   *
   * @private
   * @param {string} context - Context of the error
   * @param {Error} error - The error
   */
  _handleError(context, error) {
    const errorMessage = error.message || String(error);
    console.error(`${context}:`, errorMessage);
    MessageProcessor.addTemporaryMessage(
      this._outputContainer,
      `Error: ${context} - ${errorMessage}`
    );
  }

  /**
   * Cleans up only the UI elements, preserving loaded file data
   */
  cleanupFileUI() {
    this._cleanupFileBoxes();

    // Force layout update immediately
    if (this._updateLayoutCallback) {
      this._updateLayoutCallback();
    }
  }

  /**
   * Restores file UI from loaded file data
   */
  restoreFileUI() {
    // Only restore if we have files
    if (this._loadedFiles.size === 0) {
      return;
    }

    // Check if file boxes container already exists and has children
    if (
      this._fileBoxesContainer &&
      this._fileBoxesContainer.get_n_children() > 0
    ) {
      // Files are already displayed, no need to recreate them
      return;
    }

    // Create container first to avoid multiple container creations
    const container = this._setupFileBoxesContainer();

    // Batch create all file boxes
    const files = Array.from(this._loadedFiles.entries());
    for (const [fileName, content] of files) {
      const fileBox = this._createFileBox(fileName, content);
      container.add_child(fileBox);
    }

    // Perform a single layout update at the end
    this._adjustInputContainerHeight();
  }

  /**
   * Cleans up the file content box including UI and data
   */
  cleanupFileContentBox() {
    this._cleanupFileBoxes();

    // Clear loaded files map
    this._loadedFiles.clear();

    // Force layout update immediately
    if (this._updateLayoutCallback) {
      this._updateLayoutCallback();
    }
  }

  /**
   * Cleans up file boxes
   *
   * @private
   */
  _cleanupFileBoxes() {
    if (this._fileBoxesContainer) {
      if (this._inputButtonsContainer.contains(this._fileBoxesContainer)) {
        this._inputButtonsContainer.remove_child(this._fileBoxesContainer);
      }
      this._fileBoxesContainer.destroy();
      this._fileBoxesContainer = null;
    }
  }

  /**
   * Destroys the file handler
   */
  destroy() {
    this.cleanupFileContentBox();
  }

  /**
   * Get all loaded file content formatted for AI prompt
   * @returns {string} Formatted file content string
   */
  getFormattedFileContent() {
    if (this._loadedFiles.size === 0) {
      return "";
    }

    let result = "";
    for (const [fileName, content] of this._loadedFiles.entries()) {
      result += `Name: ${fileName}\nContent:\n"${content}"\n\n`;
    }

    // Trim trailing newlines but keep other spacing
    return result.replace(/\n+$/, "");
  }

  /**
   * Check if any files are loaded
   * @returns {boolean} True if files are loaded
   */
  hasLoadedFiles() {
    return this._loadedFiles.size > 0;
  }

  /**
   * Refreshes the formatting of all file boxes without recreating them
   * Should be called after operations that might affect layout
   */
  refreshFileBoxFormatting() {
    if (
      !this._fileBoxesContainer ||
      this._fileBoxesContainer.get_n_children() === 0
    ) {
      return;
    }

    // Apply proper styling to file boxes container
    this._fileBoxesContainer.set_style_class_name(
      UI.CONTAINER.FILE_BOXES.STYLE_CLASS
    );

    // Refresh each file box
    const children = this._fileBoxesContainer.get_children();
    for (const fileBox of children) {
      // Ensure the box has the right size and style
      fileBox.set_style_class_name(UI.FILE_BOX.STYLE_CLASS);
      fileBox.set_size(UI.FILE_BOX.SIZE, UI.FILE_BOX.SIZE);

      // Get header and content parts
      if (fileBox.get_n_children() >= 2) {
        const headerBox = fileBox.get_children()[0];
        const contentView = fileBox.get_children()[1];

        // Refresh header formatting
        if (headerBox) {
          headerBox.set_style_class_name(UI.FILE_BOX.HEADER.STYLE_CLASS);
          headerBox.set_height(UI.FILE_BOX.HEADER.HEIGHT);

          // Refresh header components if they exist
          if (headerBox.get_n_children() >= 2) {
            const titleLabel = headerBox.get_children()[0];
            const closeButton = headerBox.get_children()[1];

            if (titleLabel) {
              titleLabel.set_style_class_name("file-content-title");
            }

            if (closeButton) {
              closeButton.set_style_class_name(
                UI.FILE_BOX.HEADER.CLOSE_BUTTON.STYLE_CLASS
              );
            }
          }
        }

        // Refresh content view formatting
        if (contentView) {
          contentView.set_style_class_name(
            UI.FILE_BOX.CONTENT.SCROLL.STYLE_CLASS
          );
          // Calculate content height properly
          const contentHeight =
            UI.FILE_BOX.SIZE - UI.FILE_BOX.HEADER.HEIGHT - 16;
          contentView.set_height(contentHeight);

          // Refresh content label if it exists
          const contentBox = contentView.get_child();
          if (contentBox && contentBox.get_n_children() > 0) {
            const contentLabel = contentBox.get_children()[0];
            if (contentLabel) {
              contentLabel.set_style_class_name(
                UI.FILE_BOX.CONTENT.TEXT.STYLE_CLASS
              );
            }
          }
        }
      }
    }

    // Adjust container height to ensure proper layout
    this._adjustInputContainerHeight();
  }
}
