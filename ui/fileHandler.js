/**
 * File handling functionality for the panel UI
 */
import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import St from "gi://St";

// Import from reorganized modules
import { getSettings } from "../lib/settings.js";
import * as DocumentConverter from "../converters/documentConverter.js";
import * as LayoutManager from "./layoutManager.js";
import * as MessageProcessor from "./messageProcessor.js";

// UI Constants
const UI = {
  CONTAINER: {
    FILE_BOXES: {
      STYLE_CLASS: "file-boxes-container",
      MAX_HEIGHT: 10000, // Max height for container to avoid it going off screen if way too many files
      SPACING: 10, // Spacing between file boxes (reduced for tighter layout)
      PADDING: 8, // Container padding (reduced)
    },
  },
  FILE_BOX: {
    STYLE_CLASS: "file-content-box",
    get SIZE() {
      // Get the file box size from settings
      return getSettings().get_double("file-box-size");
    },
    MARGIN: 5,
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
   * @param {Object} options - Configuration options
   * @param {string} options.extensionPath - Path to the extension directory
   * @param {St.Widget} options.outputContainer - Container for output messages
   * @param {St.Widget} options.panelOverlay - Panel overlay container
   * @param {St.Widget} options.inputButtonsContainer - Container for input buttons
   * @param {Function} options.updateLayoutCallback - Callback to update layout
   */
  constructor(options) {
    const {
      extensionPath,
      outputContainer,
      panelOverlay,
      inputButtonsContainer,
      updateLayoutCallback,
    } = options;

    this._extensionPath = extensionPath;
    this._outputContainer = outputContainer;
    this._panelOverlay = panelOverlay;
    this._inputButtonsContainer = inputButtonsContainer;
    this._updateLayoutCallback = updateLayoutCallback;

    // Container that will hold files
    this._fileBoxesContainer = null;

    // Track loaded file content
    this._loadedFiles = new Map(); // Map to store filename -> content
    this._filePaths = new Map(); // Map to store filename -> full path

    // Check for document conversion tools
    this._checkDocumentTools();

    // Set up system signal listeners for formatting integrity
    this._setupSystemListeners();
  }

  /**
   * Sets up system listeners to maintain formatting integrity
   *
   * @private
   */
  _setupSystemListeners() {
    // Listen for settings changes that might affect display
    const settings = getSettings();
    this._settingsChangedId = settings.connect("changed", () => {
      // Refresh file box formatting on any settings change
      this.refreshFileBoxFormatting();
    });

    // Set up additional safeguards using timeouts
    this._setupFormattingGuard();
  }

  /**
   * Sets up a guard that periodically ensures formatting integrity
   *
   * @private
   */
  _setupFormattingGuard() {
    // Check and fix formatting every 2 seconds if files are present
    this._formattingGuardId = imports.gi.GLib.timeout_add(
      imports.gi.GLib.PRIORITY_DEFAULT,
      2000,
      () => {
        if (this.hasLoadedFiles() && this._fileBoxesContainer) {
          // Force a thorough refresh of all file box formatting
          this.refreshFileBoxFormatting();
        }
        return imports.gi.GLib.SOURCE_REMOVE;
      }
    );

    // Set up a one-time delayed formatting check for when model changes occur
    // This helps capture formatting issues that happen after model switches
    this._modelChangeGuardId = imports.gi.GLib.timeout_add(
      imports.gi.GLib.PRIORITY_DEFAULT,
      500,
      () => {
        if (this.hasLoadedFiles() && this._fileBoxesContainer) {
          this.refreshFileBoxFormatting();
        }
        return imports.gi.GLib.SOURCE_REMOVE;
      }
    );
  }

  /**
   * Check for installed document conversion tools
   *
   * @private
   */
  _checkDocumentTools() {
    DocumentConverter.checkRequiredTools()
      .then((tools) => {
        this._availableTools = tools;
        // Document conversion tools availability stored
      })
      .catch(() => {
        // Error checking document tools
        this._availableTools = {};
      });
  }

  /**
   * Opens a file selector dialog
   */
  openFileSelector() {
    try {
      // Replace with a file dialog that allows all supported file types
      const fileTypes = Object.keys(DocumentConverter.SUPPORTED_FORMATS)
        .map((ext) => `*.${ext}`)
        .join(" ");
      const command = [
        "zenity",
        "--file-selection",
        "--title=Select a file",
        `--file-filter=${fileTypes}`,
      ];
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
        // Command error in stderr
      }
    } catch (error) {
      this._handleError("Error processing command output", error);
    }
  }

  /**
   * Provides installation instructions for missing tools
   *
   * @private
   * @param {string} toolName - Name of the missing tool
   * @returns {string} - Installation instructions
   */
  static _getToolInstallationInstructions(toolName) {
    const toolsInfo = {
      docx2txt: "Convert .docx files",
      odt2txt: "Convert .odt files",
      catdoc: "Convert .doc files",
      unrtf: "Convert .rtf files",
      pdftotext: "Convert .pdf files (part of poppler-utils)",
    };

    const purpose = toolsInfo[toolName] || "Convert documents";

    return (
      `Missing ${toolName} (${purpose}).\n` +
      `Please install it using your package manager:\n` +
      `sudo apt install ${
        toolName === "pdftotext" ? "poppler-utils" : toolName
      }\n` +
      `or refer to the README for installation instructions.`
    );
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

      // Detect file type
      const fileType = DocumentConverter.detectFileType(filePath);

      if (!fileType) {
        MessageProcessor.addTemporaryMessage(
          this._outputContainer,
          `Unsupported file format: ${fileName}`
        );
        return;
      }

      // Check if document converter is available for this file type
      if (fileType.type === "document" && fileType.converter) {
        const toolName = fileType.converter.split(" ")[0];
        if (this._availableTools && !this._availableTools[toolName]) {
          MessageProcessor.addTemporaryMessage(
            this._outputContainer,
            FileHandler._getToolInstallationInstructions(toolName)
          );
          return;
        }
      }

      // Convert and load the file
      this._convertAndLoadFile(filePath, fileName, fileType);
    } catch (error) {
      this._handleError(`Error processing file: ${filePath}`, error);
    }
  }

  /**
   * Converts and loads a file
   *
   * @private
   * @param {string} filePath - Path to the file
   * @param {string} fileName - Name of the file
   * @param {object} fileType - Information about the file type
   */
  _convertAndLoadFile(filePath, fileName, fileType) {
    DocumentConverter.convertToText(filePath, fileType)
      .then((content) => {
        const truncatedContent = FileHandler._truncateContent(content);
        this._displayFileContentBox(truncatedContent, fileName);

        // Store the full path
        this._filePaths.set(fileName, filePath);
      })
      .catch((error) => {
        MessageProcessor.addTemporaryMessage(
          this._outputContainer,
          `Failed to convert ${fileName}`
        );
        this._handleError(`Failed to convert ${fileName}`, error);
      });
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
      MessageProcessor.addTemporaryMessage(
        this._outputContainer,
        `File does not exist: ${filePath}`
      );
      return false;
    }
    return true;
  }

  /**
   * Truncates content if it exceeds max length
   *
   * @private
   * @param {string} content - Content to truncate
   * @returns {string} - Truncated content
   */
  static _truncateContent(content) {
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
   * @returns {St.Widget} The file boxes container
   */
  _setupFileBoxesContainer() {
    if (this._fileBoxesContainer) return this._fileBoxesContainer;

    this._createFileBoxesContainer();
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
    // Get the current size directly from settings
    const fileBoxSize = getSettings().get_double("file-box-size");

    const flowLayout = new Clutter.FlowLayout({
      orientation: Clutter.Orientation.HORIZONTAL,
      homogeneous: true,
      column_spacing: UI.CONTAINER.FILE_BOXES.SPACING,
      row_spacing: UI.CONTAINER.FILE_BOXES.SPACING,
      max_column_width: fileBoxSize + UI.FILE_BOX.MARGIN * 2,
    });

    this._fileBoxesContainer = new St.Widget({
      style_class: "file-boxes-container",
      layout_manager: flowLayout,
      x_expand: true,
      y_expand: false,
      clip_to_allocation: true,
    });

    const initialHeight =
      fileBoxSize +
      UI.FILE_BOX.MARGIN * 2 +
      (UI.CONTAINER.FILE_BOXES.PADDING || 0);

    this._fileBoxesContainer.set_height(initialHeight);
  }

  /**
   * Adjusts the height of the input container to accommodate file boxes
   *
   * @private
   */
  _adjustInputContainerHeight() {
    if (!this._fileBoxesContainer) return;

    const fileCount = this._fileBoxesContainer.get_n_children();

    if (fileCount === 0) {
      this._fileBoxesContainer.hide();
      this._updateLayoutCallback();
      return;
    }

    // Get the actual size from settings
    const fileBoxSize = getSettings().get_double("file-box-size");

    const { panelWidth, horizontalPadding } =
      LayoutManager.calculatePanelDimensions();
    const containerPadding = UI.CONTAINER.FILE_BOXES.PADDING || 0;
    const availableWidth =
      panelWidth - horizontalPadding * 2 - containerPadding * 2;
    const boxTotalSize =
      fileBoxSize + UI.FILE_BOX.MARGIN * 2 + UI.CONTAINER.FILE_BOXES.SPACING;
    const boxesPerRow = Math.max(1, Math.floor(availableWidth / boxTotalSize));
    const rowsNeeded = Math.max(1, Math.ceil(fileCount / boxesPerRow));
    const boxHeight = fileBoxSize + UI.FILE_BOX.MARGIN * 2;
    const rowSpacing = (rowsNeeded - 1) * UI.CONTAINER.FILE_BOXES.SPACING;
    const containerHeight =
      boxHeight * rowsNeeded + rowSpacing + containerPadding * 2;

    this._fileBoxesContainer.set_height(containerHeight);
    this._fileBoxesContainer.show();
    this._updateLayoutCallback();
  }

  /**
   * Displays file content in a box
   *
   * @private
   * @param {string} content - File content
   * @param {string} fileName - Name of the file
   * @param {boolean} [storeInMap=true] - Whether to store in _loadedFiles map
   */
  _displayFileContentBox(content, fileName, storeInMap = true) {
    const container = this._setupFileBoxesContainer();
    const existingFileBox = this._findExistingFileBox(fileName);

    if (existingFileBox) {
      FileHandler._updateFileBoxContent(existingFileBox, content);
    } else {
      const fileBox = this._createFileBox(fileName, content);
      container.add_child(fileBox);
    }

    if (storeInMap) {
      this._loadedFiles.set(fileName, content);
    }

    // Apply direct layout updates
    this._updateLayout();
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
      const headerBox = child.get_children()[0];
      if (headerBox) {
        const titleLabel = headerBox.get_children()[0];
        if (titleLabel && titleLabel.userData === fileName) {
          return child;
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
  static _updateFileBoxContent(fileBox, content) {
    const children = fileBox.get_children();
    if (children.length >= 2) {
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
    // Get current size directly from settings
    const fileBoxSize = getSettings().get_double("file-box-size");

    const fileBox = new St.BoxLayout({
      style_class: "file-content-box",
      vertical: true,
      x_expand: false,
      y_expand: false,
    });

    // Apply size explicitly
    fileBox.width = fileBoxSize;
    fileBox.height = fileBoxSize;
    fileBox.set_width(fileBoxSize);
    fileBox.set_height(fileBoxSize);
    fileBox.set_size(fileBoxSize, fileBoxSize);

    const headerBox = this._createHeaderBox(fileName, fileBox);
    const contentView = FileHandler._createContentView(content);

    headerBox.set_height(UI.FILE_BOX.HEADER.HEIGHT);

    const contentHeight = fileBoxSize - UI.FILE_BOX.HEADER.HEIGHT - 4;
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
      style_class: "file-content-header",
      vertical: false,
      x_expand: true,
    });

    const titleLabel = FileHandler._createTitleLabel(fileName);
    const closeButton = this._createCloseButton(fileBox);

    headerBox.add_child(titleLabel);
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
  static _createTitleLabel(fileName) {
    let displayName = fileName;
    const maxLength = UI.FILE_BOX.HEADER.TITLE.MAX_LENGTH;
    const truncateLength = UI.FILE_BOX.HEADER.TITLE.TRUNCATE_LENGTH;

    if (displayName.length > maxLength) {
      displayName = displayName.substring(0, truncateLength) + "...";
    }

    const label = new St.Label({
      style_class: "file-content-title",
      text: displayName,
      x_expand: true,
    });

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
      style_class: "file-content-close-button",
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
   * @returns {St.BoxLayout} - The content view (non-scrollable as requested)
   */
  static _createContentView(content) {
    // Create a simple box layout instead of a scroll view
    const contentBox = new St.BoxLayout({
      vertical: true,
      x_expand: true,
      y_expand: true,
    });

    const contentLabel = new St.Label({
      style_class: "file-content-text",
      text: content,
      x_expand: true,
      y_expand: true,
    });

    contentLabel.clutter_text.set_line_wrap(true);
    contentLabel.clutter_text.set_selectable(true);

    contentBox.add_child(contentLabel);

    return contentBox;
  }

  /**
   * Removes a file box
   *
   * @private
   * @param {St.BoxLayout} fileBox - The file box to remove
   */
  _removeFileBox(fileBox) {
    if (!this._fileBoxesContainer) return;

    const headerBox = fileBox.get_children()[0];
    if (headerBox) {
      const titleLabel = headerBox.get_children()[0];
      if (titleLabel) {
        const fileName = titleLabel.userData;
        if (fileName) {
          this._loadedFiles.delete(fileName);
        }
      }
    }

    this._fileBoxesContainer.remove_child(fileBox);
    fileBox.destroy();
    
    // Apply direct layout updates
    this._updateLayout();
  }

  /**
   * Updates the layout immediately
   * 
   * @private
   */
  _updateLayout() {
    // Update height based on current content
    this._adjustInputContainerHeight();
    
    // Tell layout manager to recalculate
    LayoutManager.invalidateCache();
    
    // Apply critical positioning to prevent layout issues
    if (this._fileBoxesContainer) {
      // Position container at top of input area
      this._fileBoxesContainer.set_position(0, 0);
      
      // Get current dimensions for correct button positioning
      const {
        panelWidth,
        panelHeight,
        horizontalPadding,
        inputFieldHeight,
        buttonsHeight,
        paddingY,
      } = LayoutManager.calculatePanelDimensions();
      
      // Calculate correct container height including file box height
      const fileBoxHeight = this._fileBoxesContainer.get_height();
      const baseContainerHeight = inputFieldHeight + buttonsHeight + paddingY;
      const containerHeight = baseContainerHeight + fileBoxHeight;
      
      // Explicitly set the height of the input buttons container to include file boxes
      if (this._inputButtonsContainer) {
        this._inputButtonsContainer.set_height(containerHeight);
        
        // Ensure input buttons container is at correct position
        this._inputButtonsContainer.set_position(
          (panelWidth - (panelWidth - horizontalPadding * 2)) / 2,
          panelHeight - containerHeight
        );
        
        // Force relayout of both containers
        this._fileBoxesContainer.queue_relayout();
        this._inputButtonsContainer.queue_relayout();
      }
    }
    
    // Tell panel to update layout
    if (this._updateLayoutCallback) {
      this._updateLayoutCallback(true);
    }
    
    // Refresh file box formatting without using set_style
    this.refreshFileBoxFormatting();
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
    if (this._updateLayoutCallback) {
      this._updateLayoutCallback();
    }
  }

  /**
   * Restores file UI from loaded file data
   */
  restoreFileUI() {
    if (this._loadedFiles.size === 0) {
      return;
    }

    if (
      this._fileBoxesContainer &&
      this._fileBoxesContainer.get_n_children() > 0
    ) {
      return;
    }

    const container = this._setupFileBoxesContainer();

    for (const [fileName, content] of this._loadedFiles.entries()) {
      const fileBox = this._createFileBox(fileName, content);
      container.add_child(fileBox);
    }

    this._adjustInputContainerHeight();

    // Ensure proper formatting is applied after restoring the UI
    this.refreshFileBoxFormatting();
  }

  /**
   * Cleans up the file content box including UI and data
   */
  cleanupFileContentBox() {
    this._cleanupFileBoxes();
    this._loadedFiles.clear();
    this._filePaths.clear(); // Clear the paths as well

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
    // Disconnect any signal handlers to prevent memory leaks
    if (this._settingsChangedId) {
      const settings = getSettings();
      settings.disconnect(this._settingsChangedId);
      this._settingsChangedId = null;
    }

    // Remove any active timeouts
    if (this._formattingGuardId) {
      imports.gi.GLib.source_remove(this._formattingGuardId);
      this._formattingGuardId = null;
    }

    if (this._modelChangeGuardId) {
      imports.gi.GLib.source_remove(this._modelChangeGuardId);
      this._modelChangeGuardId = null;
    }

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

    // Create files array for JSON structure
    const files = [];
    for (const [fileName, content] of this._loadedFiles.entries()) {
      const filePath = this._filePaths.get(fileName) || ""; // Get the full path
      files.push({
        filename: fileName,
        content,
        path: filePath, // Include the path in the JSON
      });
    }

    // Return JSON formatted structure
    return JSON.stringify(
      {
        instructions:
          "When modifying files, respond in JSON format. If no files are modified, do NOT respond in JSON. The response must if a file is modified start with a 'summary' key if modifying the fille; describing the changes. Only include modified files under 'files'.",
        prompt: "", // This will be filled in by messageSender.js
        files,
      },
      null,
      2
    ); // Pretty print with 2 spaces
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
   */
  refreshFileBoxFormatting() {
    if (
      !this._fileBoxesContainer ||
      this._fileBoxesContainer.get_n_children() === 0
    ) {
      return;
    }

    // Get the current size directly from settings to ensure consistency
    const fileBoxSize = getSettings().get_double("file-box-size");
    
    // Update container styles directly
    this._updateContainerStyles(fileBoxSize);
    
    // Update all file boxes
    this._updateFileBoxesStyles(fileBoxSize);
    
    // Force immediate layout adjustments
    this._fileBoxesContainer.queue_relayout();
    this._adjustInputContainerHeight();
    
    // Invalidate layout cache
    LayoutManager.invalidateCache();
    
    // Apply all sizing immediately - no timeouts
    const fileBoxChildren = this._fileBoxesContainer.get_children();
    for (const fileBox of fileBoxChildren) {
      fileBox.style_class = "file-content-box";
      fileBox.set_width(fileBoxSize);
      fileBox.set_height(fileBoxSize);
    }
    
    // Force relayout on input buttons container
    if (this._inputButtonsContainer) {
      this._inputButtonsContainer.queue_relayout();
    }
  }

  /**
   * Updates container styles and layout manager
   *
   * @private
   * @param {number} fileBoxSize - The size of file boxes
   */
  _updateContainerStyles(fileBoxSize) {
    // First, ensure the container has the right style class
    this._fileBoxesContainer.set_style_class_name("file-boxes-container");

    // Update the layout manager to ensure proper positioning
    const flowLayout = new Clutter.FlowLayout({
      orientation: Clutter.Orientation.HORIZONTAL,
      homogeneous: true,
      column_spacing: UI.CONTAINER.FILE_BOXES.SPACING,
      row_spacing: UI.CONTAINER.FILE_BOXES.SPACING,
      max_column_width: fileBoxSize + UI.FILE_BOX.MARGIN * 2,
    });

    this._fileBoxesContainer.set_layout_manager(flowLayout);

    // Force immediate layout update to apply new box size
    this._fileBoxesContainer.queue_relayout();
  }

  /**
   * Updates styles for all file boxes
   *
   * @private
   * @param {number} fileBoxSize - The size of file boxes
   */
  _updateFileBoxesStyles(fileBoxSize) {
    const children = this._fileBoxesContainer.get_children();
    for (const fileBox of children) {
      this._updateSingleFileBox(fileBox, fileBoxSize);
    }
  }

  /**
   * Updates the style and layout of a single file box
   *
   * @private
   * @param {St.BoxLayout} fileBox - The file box to update
   * @param {number} fileBoxSize - The size of file boxes
   */
  _updateSingleFileBox(fileBox, fileBoxSize) {
    // Ensure style class is set
    fileBox.style_class = "file-content-box";

    // Ensure size is set
    fileBox.width = fileBoxSize;
    fileBox.height = fileBoxSize;
    fileBox.set_width(fileBoxSize);
    fileBox.set_height(fileBoxSize);
    fileBox.set_size(fileBoxSize, fileBoxSize);

    if (fileBox.get_n_children() < 2) return;

    const headerBox = fileBox.get_children()[0];
    const contentView = fileBox.get_children()[1];

    // Use static methods with FileHandler class reference
    FileHandler._updateHeaderBox(headerBox);
    FileHandler._updateContentView(contentView, fileBox, fileBoxSize);
  }

  /**
   * Updates header box styles
   *
   * @private
   * @param {St.BoxLayout} headerBox - The header box to update
   */
  static _updateHeaderBox(headerBox) {
    if (!headerBox) return;

    headerBox.style_class = "file-content-header";
    headerBox.set_height(UI.FILE_BOX.HEADER.HEIGHT);

    if (headerBox.get_n_children() < 2) return;

    const titleLabel = headerBox.get_children()[0];
    const closeButton = headerBox.get_children()[1];

    if (titleLabel) {
      titleLabel.style_class = "file-content-title";
    }

    if (closeButton) {
      closeButton.style_class = "file-content-close-button";
    }
  }

  /**
   * Updates content view styles and layout
   *
   * @private
   * @param {St.Widget} contentView - The content view to update
   * @param {St.BoxLayout} fileBox - The parent file box
   * @param {number} fileBoxSize - The size of file boxes
   */
  static _updateContentView(contentView, fileBox, fileBoxSize) {
    if (!contentView) return;

    const contentHeight = fileBoxSize - UI.FILE_BOX.HEADER.HEIGHT - 4;
    contentView.set_height(contentHeight);

    // It's a BoxLayout (new style)
    if (contentView.get_n_children() > 0) {
      const contentBox = contentView.get_children()[0];
      if (contentBox) {
        const contentLabel = contentBox.get_children()[0];
        if (contentLabel) {
          if (contentLabel.add_style_class_name) {
            contentLabel.add_style_class_name("file-content-text");
          } else if (contentLabel.style_class) {
            contentLabel.style_class = "file-content-text";
          }
        }
      }
    }
  }

  /**
   * Creates a file box from pasted text
   *
   * @param {string} text - The pasted text to display in a file box
   * @param {string} [title="Pasted Text"] - Title for the file box
   */
  createFileBoxFromText(text, title = "Pasted Text") {
    if (!text || text.trim() === "") {
      return;
    }

    // Check if title contains a number (like "Pasted 1")
    const hasNumber = /\d+$/u.test(title.trim());

    // Create a unique title
    let uniqueTitle = title;
    let counter = 1;

    // If we already have this title, create a unique one
    // For titles with numbers (like "Pasted 1"), increment the number
    // For titles without numbers, add a counter in parentheses
    while (this._findExistingFileBox(uniqueTitle)) {
      if (hasNumber) {
        // Extract base and number part - e.g., "Pasted 1" -> "Pasted " and "1"
        const match = title.match(/^(.*?)(\d+)$/u);
        if (match) {
          const basePart = match[1];
          const numberPart = parseInt(match[2], 10);
          // Increment the number
          uniqueTitle = `${basePart}${numberPart + counter}`;
        } else {
          uniqueTitle = `${title} (${counter})`;
        }
      } else {
        uniqueTitle = `${title} (${counter})`;
      }
      counter++;
    }

    // Display the content in a file box
    this._displayFileContentBox(text, uniqueTitle);
  }

  /**
   * Get the full path for a filename
   * @param {string} fileName - The filename to look up
   * @returns {string|null} - The full path or null if not found
   */
  getFilePath(fileName) {
    return this._filePaths.get(fileName) || null;
  }
}
