/**
 * File handling functionality for the panel UI
 */
import St from "gi://St";
import Gio from "gi://Gio";
import Clutter from "gi://Clutter";

// Import from reorganized modules
import * as MessageProcessor from "./messageProcessor.js";
import * as LayoutManager from "./layoutManager.js";
import * as DocumentConverter from "./documentConverter.js";
import { getSettings } from "../lib/settings.js";

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
    get SIZE() {
      // Get the file box size from settings
      return getSettings().get_double("file-box-size");
    },
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
    this._filePaths = new Map(); // Map to store filename -> full path

    // Check for document conversion tools
    this._checkDocumentTools();
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
        console.log("Document conversion tools availability:", tools);
      })
      .catch((error) => {
        console.error("Error checking document tools:", error);
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
        console.error(`Command error: ${stderr}`);
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
  _getToolInstallationInstructions(toolName) {
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
            this._getToolInstallationInstructions(toolName)
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
    const progressMessage = MessageProcessor.addTemporaryMessage(
      this._outputContainer,
      `Converting ${fileName}...`
    );

    DocumentConverter.convertToText(filePath, fileType)
      .then((content) => {
        // Remove progress message
        if (progressMessage && progressMessage.close) {
          progressMessage.close();
        }

        const truncatedContent = this._truncateContent(content);
        this._displayFileContentBox(truncatedContent, fileName);

        // Store the full path
        this._filePaths.set(fileName, filePath);
      })
      .catch((error) => {
        // Remove progress message
        if (progressMessage && progressMessage.close) {
          progressMessage.close();
        }

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
   * @param {string} filePath - Full path to the file
   */
  _loadFileContents(file, fileName, filePath) {
    try {
      const fileType = DocumentConverter.detectFileType(filePath);

      if (fileType && fileType.type === "text") {
        // For text files, use the existing method
        const [success, content] = file.load_contents(null);

        if (success) {
          const fileContent = this._decodeFileContent(content);
          const truncatedContent = this._truncateContent(fileContent);
          this._displayFileContentBox(truncatedContent, fileName);

          // Store the full path
          this._filePaths.set(fileName, filePath);
        } else {
          MessageProcessor.addTemporaryMessage(
            this._outputContainer,
            "Failed to read file content"
          );
        }
      } else {
        // For other files, use the converter
        this._convertAndLoadFile(filePath, fileName, fileType);
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
      style_class: UI.CONTAINER.FILE_BOXES.STYLE_CLASS,
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
    let containerHeight =
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
      this._updateFileBoxContent(existingFileBox, content);
    } else {
      const fileBox = this._createFileBox(fileName, content);
      container.add_child(fileBox);
    }

    if (storeInMap) {
      this._loadedFiles.set(fileName, content);
    }

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
  _updateFileBoxContent(fileBox, content) {
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
      style_class: UI.FILE_BOX.STYLE_CLASS,
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
    const contentView = this._createContentView(content);

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
      style_class: UI.FILE_BOX.HEADER.STYLE_CLASS,
      vertical: false,
      x_expand: true,
    });

    const titleLabel = this._createTitleLabel(fileName);
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
  _createTitleLabel(fileName) {
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
    const scrollView = new St.ScrollView({
      style_class: UI.FILE_BOX.CONTENT.SCROLL.STYLE_CLASS,
      x_expand: true,
      y_expand: true,
    });

    const contentBox = new St.BoxLayout({
      vertical: true,
      x_expand: true,
      y_expand: true,
    });

    const contentLabel = new St.Label({
      style_class: UI.FILE_BOX.CONTENT.TEXT.STYLE_CLASS,
      text: content,
      x_expand: true,
      y_expand: true,
    });

    contentLabel.clutter_text.set_line_wrap(true);
    contentLabel.clutter_text.set_selectable(true);

    contentBox.add_child(contentLabel);
    scrollView.add_child(contentBox);
    scrollView.set_policy(St.PolicyType.NEVER, St.PolicyType.NEVER);

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
        content: content,
        path: filePath, // Include the path in the JSON
      });
    }

    // Return JSON formatted structure
    return JSON.stringify(
      {
        instructions:
          "When modifying files, respond in JSON format. If no files are modified, do NOT respond in JSON. The response must if a file is modified start with a 'summary' key if modifying the fille; describing the changes. Only include modified files under 'files'.",
        prompt: "", // This will be filled in by messageSender.js
        files: files,
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

    this._fileBoxesContainer.set_style_class_name(
      UI.CONTAINER.FILE_BOXES.STYLE_CLASS
    );

    // Get the current size directly from settings to ensure consistency
    const fileBoxSize = getSettings().get_double("file-box-size");

    const children = this._fileBoxesContainer.get_children();
    for (const fileBox of children) {
      fileBox.set_style_class_name(UI.FILE_BOX.STYLE_CLASS);

      // Ensure size is set by all possible means
      fileBox.width = fileBoxSize;
      fileBox.height = fileBoxSize;
      fileBox.set_width(fileBoxSize);
      fileBox.set_height(fileBoxSize);
      fileBox.set_size(fileBoxSize, fileBoxSize);

      // Apply using inline style as well
      let style = fileBox.get_style() || "";
      if (!style.includes("width:") && !style.includes("height:")) {
        style += `width: ${fileBoxSize}px; height: ${fileBoxSize}px;`;
        fileBox.set_style(style);
      }

      if (fileBox.get_n_children() >= 2) {
        const headerBox = fileBox.get_children()[0];
        const contentView = fileBox.get_children()[1];

        if (headerBox) {
          headerBox.set_style_class_name(UI.FILE_BOX.HEADER.STYLE_CLASS);
          headerBox.set_height(UI.FILE_BOX.HEADER.HEIGHT);

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

        if (contentView) {
          contentView.set_style_class_name(
            UI.FILE_BOX.CONTENT.SCROLL.STYLE_CLASS
          );
          const contentHeight = fileBoxSize - UI.FILE_BOX.HEADER.HEIGHT - 4;
          contentView.set_height(contentHeight);

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

    // Force the container to update its layout
    this._fileBoxesContainer.queue_relayout();

    // Apply changes with multiple scheduling priorities to ensure it happens
    imports.gi.GLib.idle_add(imports.gi.GLib.PRIORITY_HIGH, () => {
      this._adjustInputContainerHeight();
      return imports.gi.GLib.SOURCE_REMOVE;
    });

    // Schedule another refresh at a lower priority
    imports.gi.GLib.timeout_add(imports.gi.GLib.PRIORITY_DEFAULT, 100, () => {
      // Apply sizes again to ensure consistency
      const children = this._fileBoxesContainer.get_children();
      for (const fileBox of children) {
        fileBox.set_width(fileBoxSize);
        fileBox.set_height(fileBoxSize);
      }

      // Force update again
      this._fileBoxesContainer.queue_relayout();
      this._adjustInputContainerHeight();

      return imports.gi.GLib.SOURCE_REMOVE;
    });
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
    const hasNumber = /\d+$/.test(title.trim());

    // Create a unique title
    let uniqueTitle = title;
    let counter = 1;

    // If we already have this title, create a unique one
    // For titles with numbers (like "Pasted 1"), increment the number
    // For titles without numbers, add a counter in parentheses
    while (this._findExistingFileBox(uniqueTitle)) {
      if (hasNumber) {
        // Extract base and number part - e.g., "Pasted 1" -> "Pasted " and "1"
        const match = title.match(/^(.*?)(\d+)$/);
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
