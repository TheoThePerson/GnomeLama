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
      inputButtonsContainer,
      inputContainerManager,
      updateLayoutCallback,
      onRemoveCallback,
    } = options;

    this._inputButtonsContainer = inputButtonsContainer;
    this._inputContainerManager = inputContainerManager;
    this._updateLayoutCallback = updateLayoutCallback;
    this._onRemoveCallback = onRemoveCallback;

    this._fileBoxesContainer = null;
  }

  /**
   * Sets up the file boxes container
   */
  setupFileBoxesContainer() {
    if (this._fileBoxesContainer) return this._fileBoxesContainer;

    this._createFileBoxesContainer();
    this._inputButtonsContainer.insert_child_at_index(
      this._fileBoxesContainer,
      0
    );

    if (this._inputContainerManager) {
      this._inputContainerManager.registerExpandableContainer(
        'file-boxes',
        this._fileBoxesContainer,
        {
          getHeight: () => {
            if (!this._fileBoxesContainer || this._fileBoxesContainer.get_n_children() === 0) {
              return 0;
            }
            return this._calculateFileBoxesHeight();
          }
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
      x_expand: true,
      y_expand: true,
      clip_to_allocation: false,
    });

    this._fileBoxesContainer.set_style(`
      background: transparent;
      padding: 10px;
    `);
  }

  /**
   * Calculates the height needed for the file boxes container
   */
  _calculateFileBoxesHeight() {
    if (!this._fileBoxesContainer) return 0;

    const fileCount = this._fileBoxesContainer.get_n_children();
    if (fileCount === 0) return 0;

    const fileBoxSize = getSettings().get_double("file-box-size");
    const { panelWidth, horizontalPadding } = LayoutManager.calculatePanelDimensions();
    
    const containerPaddingTop = 12;
    const containerPaddingBottom = 6; 
    const containerPaddingHorizontal = 16;
    
    const availableWidth = 
      panelWidth - horizontalPadding * 2 - containerPaddingHorizontal * 2;
    const boxTotalSize = fileBoxSize + UI.CONTAINER.FILE_BOXES.SPACING;
    const boxesPerRow = Math.max(1, Math.floor(availableWidth / boxTotalSize));
    const rowsNeeded = Math.max(1, Math.ceil(fileCount / boxesPerRow));
    
    const rowSpacing = (rowsNeeded - 1) * UI.CONTAINER.FILE_BOXES.SPACING;
    const containerHeight = 
      fileBoxSize * rowsNeeded + 
      rowSpacing + 
      containerPaddingTop + 
      containerPaddingBottom;

    return containerHeight;
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
    const fileBoxSize = getSettings().get_double("file-box-size");

    const fileBox = new St.Bin({
      width: fileBoxSize,
      height: fileBoxSize,
      x_expand: false,
      y_expand: false,
      reactive: true,
    });

    fileBox.set_style(`
      width: ${fileBoxSize}px;
      height: ${fileBoxSize}px;
      background: #FFFFFF;
      border: 2px solid #000000;
      border-radius: 8px;
      padding: 6px;
      margin: 3px;
    `);

    const contentBox = new St.BoxLayout({
      vertical: true,
      x_expand: true,
      y_expand: true,
    });

    const titleBar = this._createTitleBar(fileName, fileBox);
    contentBox.add_child(titleBar);

    const contentArea = this._createContentArea(content);
    contentBox.add_child(contentArea);

    fileBox.set_child(contentBox);
    fileBox._fileName = fileName;

    return fileBox;
  }

  /**
   * Creates a title bar for the file box
   */
  _createTitleBar(fileName, fileBox) {
    const titleBar = new St.BoxLayout({
      vertical: false,
      x_expand: true,
    });

    let displayName = fileName;
    if (displayName.length > 15) {
      displayName = displayName.substring(0, 12) + "...";
    }

    const titleLabel = new St.Label({
      text: displayName,
      x_expand: true,
    });
    titleLabel.set_style(`
      font-weight: bold;
      font-size: 11px;
      color: #000000;
    `);

    const closeButton = new St.Button({
      label: "×",
      x_expand: false,
    });
    closeButton.set_style(`
      font-size: 14px;
      color: #666666;
      background: none;
      border: none;
      padding: 0px 4px;
    `);

    closeButton.connect("clicked", () => {
      this._removeFileBox(fileBox);
    });

    titleBar.add_child(titleLabel);
    titleBar.add_child(closeButton);

    return titleBar;
  }

  /**
   * Creates the content area for the file box
   */
  _createContentArea(content) {
    const contentLabel = new St.Label({
      text: content,
      x_expand: true,
      y_expand: true,
    });

    contentLabel.set_style(`
      font-family: monospace;
      font-size: 8px;
      color: #333333;
      line-height: 1.1;
    `);

    contentLabel.clutter_text.set_line_wrap(true);
    contentLabel.clutter_text.set_selectable(true);

    return contentLabel;
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
    const contentBox = fileBox.get_child();
    if (!contentBox) return;

    const children = contentBox.get_children();
    if (children.length >= 2) {
      const oldContentArea = children[1];
      contentBox.remove_child(oldContentArea);
      
      const newContentArea = this._createContentArea(content);
      contentBox.add_child(newContentArea);
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
      fileBox.set_size(fileBoxSize, fileBoxSize);
      
      fileBox.set_style(`
        width: ${fileBoxSize}px;
        height: ${fileBoxSize}px;
        background: #FFFFFF;
        border: 2px solid #000000;
        border-radius: 8px;
        padding: 6px;
        margin: 3px;
      `);
    }
    
    this._updateContainerStyles(fileBoxSize);
    this._fileBoxesContainer.queue_relayout();
    LayoutManager.invalidateCache();
  }

  /**
   * Updates container styles and layout manager
   */
  _updateContainerStyles(fileBoxSize) {
    const flowLayout = new Clutter.FlowLayout({
      orientation: Clutter.Orientation.HORIZONTAL,
      homogeneous: false,
      column_spacing: UI.CONTAINER.FILE_BOXES.SPACING,
      row_spacing: UI.CONTAINER.FILE_BOXES.SPACING,
      max_column_width: fileBoxSize,
      min_column_width: fileBoxSize
    });

    this._fileBoxesContainer.set_layout_manager(flowLayout);
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
      
      if (this._inputButtonsContainer && 
          this._inputButtonsContainer.contains(this._fileBoxesContainer)) {
        this._inputButtonsContainer.remove_child(this._fileBoxesContainer);
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
    if (this._inputContainerManager) {
      this._inputContainerManager.updateContainerLayout();
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