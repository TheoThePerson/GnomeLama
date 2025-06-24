/**
 * File box rendering and styling functionality
 */
import Clutter from "gi://Clutter";
import St from "gi://St";
import { getSettings } from "../lib/settings.js";
import * as LayoutManager from "./layoutManager.js";

// UI Constants
const UI = {
  CONTAINER: {
    FILE_BOXES: {
      STYLE_CLASS: "file-boxes-container",
      MAX_HEIGHT: 10000,
      SPACING: 10,
      PADDING: 8,
    },
  },
  FILE_BOX: {
    STYLE_CLASS: "file-content-box",
    get SIZE() {
      return getSettings().get_double("file-box-size");
    },
    MARGIN: 5,
    HEADER: {
      STYLE_CLASS: "file-content-header",
      HEIGHT: 28,
      TITLE: {
        MAX_LENGTH: 18,
        TRUNCATE_LENGTH: 15,
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
        MAX_LENGTH: 16000,
      },
    },
  },
};

/**
 * Handles file box rendering and styling
 */
export class FileBoxRenderer {
  constructor(options) {
    const {
      visualContainerManager,
      updateLayoutCallback,
      onRemoveCallback,
    } = options;

    this._visualContainerManager = visualContainerManager;
    this._updateLayoutCallback = updateLayoutCallback;
    this._onRemoveCallback = onRemoveCallback;

    this._fileBoxesContainer = null;
  }

  /**
   * Sets up the file boxes container
   */
  setupFileBoxesContainer() {
    if (this._fileBoxesContainer) {
      return this._fileBoxesContainer;
    }

    this._createFileBoxesContainer();
    
    // Register with visual container manager instead of input container manager
    if (this._visualContainerManager) {
      this._visualContainerManager.registerFileBoxesContainer(
        this._fileBoxesContainer,
        () => {
          if (!this._fileBoxesContainer || this._fileBoxesContainer.get_n_children() === 0) {
            return 0;
          }
          return this._calculateFileBoxesHeight();
        }
      );
    }

    return this._fileBoxesContainer;
  }

  /**
   * Creates the container for file boxes with flow layout
   */
  _createFileBoxesContainer() {
    const fileBoxSize = getSettings().get_double("file-box-size");
    const { panelWidth, horizontalPadding } = LayoutManager.calculatePanelDimensions();
    
    // Calculate container width using same padding logic as height calculation
    const panelSidePadding = horizontalPadding * 2;
    const visualContainerPadding = 6 * 2;
    const fileBoxesAreaPadding = 12 * 2;
    const totalHorizontalPadding = panelSidePadding + visualContainerPadding + fileBoxesAreaPadding;
    const containerWidth = panelWidth - totalHorizontalPadding;

    const flowLayout = new Clutter.FlowLayout({
      orientation: Clutter.Orientation.HORIZONTAL,
      homogeneous: false,
      column_spacing: UI.CONTAINER.FILE_BOXES.SPACING,
      row_spacing: UI.CONTAINER.FILE_BOXES.SPACING,
      max_column_width: fileBoxSize,
      min_column_width: fileBoxSize
    });

    this._fileBoxesContainer = new St.Widget({
      layout_manager: flowLayout,
      style_class: 'file-boxes-container',
      width: containerWidth,
      x_expand: false,
      y_expand: true,
      clip_to_allocation: false,
    });
  }

  /**
   * Calculates the height needed for the file boxes container (for internal use)
   */
  _calculateFileBoxesHeight() {
    if (!this._fileBoxesContainer) return 0;

    const fileCount = this._fileBoxesContainer.get_n_children();
    if (fileCount === 0) return 0;

    const fileBoxSize = getSettings().get_double("file-box-size");
    const { panelWidth, horizontalPadding } = LayoutManager.calculatePanelDimensions();
    
    // Calculate available width accounting for all padding layers:
    // 1. Panel horizontal padding (both sides)
    // 2. Visual container padding (6px each side) 
    // 3. File boxes area padding (12px each side)
    const panelSidePadding = horizontalPadding * 2;  // Panel padding
    const visualContainerPadding = 6 * 2;             // Visual container padding
    const fileBoxesAreaPadding = 12 * 2;              // File boxes area padding
    
    const totalHorizontalPadding = panelSidePadding + visualContainerPadding + fileBoxesAreaPadding;
    const availableWidth = panelWidth - totalHorizontalPadding;
    
    // Calculate boxes per row and rows needed
    const boxTotalWidth = fileBoxSize + UI.CONTAINER.FILE_BOXES.SPACING;
    const boxesPerRow = Math.max(1, Math.floor(availableWidth / boxTotalWidth));
    const rowsNeeded = Math.ceil(fileCount / boxesPerRow);
    
    // Calculate total height: boxes + spacing between rows + vertical padding
    const spacingBetweenRows = (rowsNeeded - 1) * UI.CONTAINER.FILE_BOXES.SPACING;
    const verticalPadding = 12 * 2; // 12px top + 12px bottom for file boxes area
    const totalHeight = (fileBoxSize * rowsNeeded) + spacingBetweenRows + verticalPadding;

    return totalHeight;
  }

  /**
   * Displays file content in a box
   */
  displayFileContentBox(content, fileName) {
    const container = this.setupFileBoxesContainer();
    const existingFileBox = this._findExistingFileBox(fileName);

    if (existingFileBox) {
      this._updateExistingFileBox(existingFileBox, content);
    } else {
      const fileBox = this._createNewFileBox(fileName, content);
      container.add_child(fileBox);
    }

    this._updateLayout();
  }

  /**
   * Creates a completely new file box from scratch
   */
  _createNewFileBox(fileName, content) {
    let fileBoxSize = getSettings().get_double("file-box-size");
    
    // Ensure minimum size for visibility
    if (fileBoxSize < 100) {
      fileBoxSize = 150;
    }

    // Create the main file box container
    const fileBox = new St.BoxLayout({
      vertical: true,
      width: fileBoxSize,
      height: fileBoxSize,
      x_expand: false,
      y_expand: false,
      reactive: true,
      style_class: 'file-content-box',
    });
    // Remove background from fileBox
    fileBox.set_style(`
      background: none;
      width: ${fileBoxSize}px;
      height: ${fileBoxSize}px;
      padding: 0;
    `);

    // Create a white box as the background for both header and content
    const whiteBox = new St.BoxLayout({
      vertical: true,
      width: fileBoxSize,
      height: fileBoxSize,
      x_expand: true,
      y_expand: true,
      reactive: false,
      style_class: 'debug-white-box',
    });
    whiteBox.set_style(`
      background-color: #FFFFFF !important;
      border: 1px solid rgba(0, 0, 0, 0.2);
      border-radius: 10px;
      box-shadow: 0 3px 8px rgba(0, 0, 0, 0.3);
      width: ${fileBoxSize}px;
      height: ${fileBoxSize}px;
    `);

    // Create header container with proper CSS class
    const header = new St.BoxLayout({
      vertical: false,
      x_expand: true,
      style_class: 'file-content-header',
      height: UI.FILE_BOX.HEADER.HEIGHT,
    });

    // Force header background
    header.set_style(`
      background-color: rgba(0, 0, 0, 0.05);
      border-radius: 6px;
      padding: 4px;
      border-bottom: 1px solid rgba(0, 0, 0, 0.1);
      margin-bottom: 8px;
    `);

    // Create title label with proper CSS class
    let displayName = fileName;
    if (displayName.length > 15) {
      displayName = displayName.substring(0, 12) + "...";
    }

    const titleLabel = new St.Label({
      text: displayName,
      x_expand: true,
      style_class: 'file-content-title',
    });

    // Force title styling
    titleLabel.set_style(`
      font-weight: bold;
      color: #000000;
      font-size: 12px;
      padding: 2px 4px;
    `);

    // Create close button with proper CSS class
    const closeButton = new St.Button({
      label: "×",
      x_expand: false,
      style_class: 'file-content-close-button',
    });

    // Force close button styling
    closeButton.set_style(`
      font-weight: bold;
      color: #000000;
      font-size: 12px;
      background: none;
      border: none;
      width: 18px;
      height: 18px;
      border-radius: 50%;
    `);

    closeButton.connect("clicked", () => {
      this._removeFileBox(fileBox);
    });

    // Add title and close button to header
    header.add_child(titleLabel);
    header.add_child(closeButton);

    // Create content label with proper CSS class
    const contentLabel = new St.Label({
      text: content,
      x_expand: true,
      y_expand: true,
      style_class: 'file-content-text',
    });

    // Force content styling
    contentLabel.set_style(`
      font-family: monospace;
      font-size: 11px;
      color: #000000;
      padding: 2px;
      line-height: 1.4;
      margin-top: 4px;
    `);

    contentLabel.clutter_text.set_line_wrap(true);
    contentLabel.clutter_text.set_selectable(true);

    // Add header and content label to the white box
    whiteBox.add_child(header);
    whiteBox.add_child(contentLabel);

    // Add only the white box to the fileBox
    fileBox.add_child(whiteBox);

    fileBox._fileName = fileName;

    return fileBox;
  }

  /**
   * Finds an existing file box by filename
   */
  _findExistingFileBox(fileName) {
    if (!this._fileBoxesContainer) return null;

    const children = this._fileBoxesContainer.get_children();
    for (const child of children) {
      if (child._fileName === fileName) {
        return child;
      }
    }
    return null;
  }

  /**
   * Updates content in an existing file box
   */
  _updateExistingFileBox(fileBox, content) {
    // With the new structure: fileBox contains [header, contentStack]
    const children = fileBox.get_children();
    if (children.length >= 2) {
      const oldContentStack = children[1]; // Second child is content stack
      fileBox.remove_child(oldContentStack);
      
      // Create new content label with proper CSS class
      const newContentLabel = new St.Label({
        text: content,
        x_expand: true,
        y_expand: true,
        style_class: 'file-content-text',
      });

      // Force content styling
      newContentLabel.set_style(`
        font-family: monospace;
        font-size: 11px;
        color: #000000;
        padding: 2px;
        line-height: 1.4;
      `);

      newContentLabel.clutter_text.set_line_wrap(true);
      newContentLabel.clutter_text.set_selectable(true);

      // Create a bin to stack the white box and new content label
      const newContentStack = new St.Widget({
        layout_manager: new Clutter.BinLayout(),
        x_expand: true,
        y_expand: false,
        height: fileBox.get_height() - UI.FILE_BOX.HEADER.HEIGHT - 16,
      });

      // Add the white box as the background
      newContentStack.set_child(newContentLabel);

      fileBox.add_child(newContentStack);
    }
  }

  /**
   * Removes a file box
   */
  _removeFileBox(fileBox) {
    if (!this._fileBoxesContainer) return;

    const fileName = fileBox._fileName;
    
    if (this._onRemoveCallback) {
      this._onRemoveCallback(fileName);
    }

    if (fileBox.get_parent() === this._fileBoxesContainer) {
      this._fileBoxesContainer.remove_child(fileBox);
    }
    
    fileBox.destroy();
    this._updateLayout();
  }

  /**
   * Refreshes the formatting of all file boxes
   */
  refreshFileBoxFormatting() {
    if (!this._fileBoxesContainer || this._fileBoxesContainer.get_n_children() === 0) {
      return;
    }

    const fileBoxSize = getSettings().get_double("file-box-size");
    
    const children = this._fileBoxesContainer.get_children();
    for (const fileBox of children) {
      // Update size and force styling
      fileBox.set_size(fileBoxSize, fileBoxSize);
      
      // Force white background styling
      fileBox.set_style(`
        background-color: #FFFFFF !important;
        border: 1px solid rgba(0, 0, 0, 0.2);
        border-radius: 10px;
        padding: 0;
        box-shadow: 0 3px 8px rgba(0, 0, 0, 0.3);
        width: ${fileBoxSize}px;
        height: ${fileBoxSize}px;
      `);

      // Also refresh child elements
      const fileBoxChildren = fileBox.get_children();
      if (fileBoxChildren.length >= 2) {
        const header = fileBoxChildren[0];
        const contentStack = fileBoxChildren[1];

        // Force header styling
        header.set_style(`
          background-color: rgba(0, 0, 0, 0.05);
          border-radius: 6px;
          padding: 4px;
          border-bottom: 1px solid rgba(0, 0, 0, 0.1);
          margin-bottom: 8px;
        `);

        // Force content styling
        const contentLabel = contentStack.get_child();
        contentLabel.set_style(`
          font-family: monospace;
          font-size: 11px;
          color: #000000;
          padding: 2px;
          line-height: 1.4;
          margin-top: 4px;
        `);

        // Force header children styling
        const headerChildren = header.get_children();
        if (headerChildren.length >= 2) {
          const titleLabel = headerChildren[0];
          const closeButton = headerChildren[1];

          titleLabel.set_style(`
            font-weight: bold;
            color: #000000;
            font-size: 12px;
            padding: 2px 4px;
          `);

          closeButton.set_style(`
            font-weight: bold;
            color: #000000;
            font-size: 12px;
            background: none;
            border: none;
            width: 18px;
            height: 18px;
            border-radius: 50%;
          `);
        }
      }
    }
    
    this._updateContainerStyles(fileBoxSize);
    this._fileBoxesContainer.queue_relayout();
    LayoutManager.invalidateCache();
  }

  /**
   * Updates container styles and layout manager
   */
  _updateContainerStyles(fileBoxSize) {
    const { panelWidth, horizontalPadding } = LayoutManager.calculatePanelDimensions();
    
    // Calculate container width using same padding logic as height calculation
    const panelSidePadding = horizontalPadding * 2;
    const visualContainerPadding = 6 * 2;
    const fileBoxesAreaPadding = 12 * 2;
    const totalHorizontalPadding = panelSidePadding + visualContainerPadding + fileBoxesAreaPadding;
    const containerWidth = panelWidth - totalHorizontalPadding;

    const flowLayout = new Clutter.FlowLayout({
      orientation: Clutter.Orientation.HORIZONTAL,
      homogeneous: false,
      column_spacing: UI.CONTAINER.FILE_BOXES.SPACING,
      row_spacing: UI.CONTAINER.FILE_BOXES.SPACING,
      max_column_width: fileBoxSize,
      min_column_width: fileBoxSize
    });

    this._fileBoxesContainer.set_layout_manager(flowLayout);
    this._fileBoxesContainer.set_width(containerWidth);
    this._fileBoxesContainer.queue_relayout();
  }

  /**
   * Creates a file box from pasted text
   */
  createFileBoxFromText(text, title = "Pasted Text") {
    if (!text || text.trim() === "") {
      return;
    }

    const hasNumber = /\d+$/u.test(title.trim());
    let uniqueTitle = title;
    let counter = 1;

    while (this._findExistingFileBox(uniqueTitle)) {
      if (hasNumber) {
        const match = title.match(/^(.*?)(\d+)$/u);
        if (match) {
          const basePart = match[1];
          const numberPart = parseInt(match[2], 10);
          uniqueTitle = `${basePart}${numberPart + counter}`;
        } else {
          uniqueTitle = `${title} (${counter})`;
        }
      } else {
        uniqueTitle = `${title} (${counter})`;
      }
      counter++;
    }

    this.displayFileContentBox(text, uniqueTitle);
  }

  /**
   * Cleans up file boxes
   */
  cleanupFileBoxes() {
    if (this._fileBoxesContainer) {
      const children = this._fileBoxesContainer.get_children();
      for (let i = children.length - 1; i >= 0; i--) {
        const child = children[i];
        this._fileBoxesContainer.remove_child(child);
        child.destroy();
      }
      
      // Unregister from visual container manager
      if (this._visualContainerManager) {
        this._visualContainerManager.unregisterFileBoxesContainer();
      }
      
      this._fileBoxesContainer.destroy();
      this._fileBoxesContainer = null;
    }
  }

  /**
   * Restores file UI from data
   */
  restoreFileUI(loadedFiles) {
    if (loadedFiles.size === 0) {
      return;
    }

    if (
      this._fileBoxesContainer &&
      this._fileBoxesContainer.get_n_children() > 0
    ) {
      return;
    }

    const container = this.setupFileBoxesContainer();

    for (const [fileName, content] of loadedFiles.entries()) {
      const fileBox = this._createNewFileBox(fileName, content);
      container.add_child(fileBox);
    }

    this.refreshFileBoxFormatting();
  }

  /**
   * Updates the layout
   */
  _updateLayout() {
    if (this._visualContainerManager) {
      this._visualContainerManager.updateLayout();
    } else if (this._updateLayoutCallback) {
      this._updateLayoutCallback(true);
    }
  }

  /**
   * Check if container has files
   */
  hasFiles() {
    return this._fileBoxesContainer && this._fileBoxesContainer.get_n_children() > 0;
  }

  /**
   * Destroy the renderer
   */
  destroy() {
    this.cleanupFileBoxes();
  }
} 