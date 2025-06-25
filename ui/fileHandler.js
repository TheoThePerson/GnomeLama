/**
 * File handling functionality for the panel UI
 */
import { getSettings } from "../lib/settings.js";
import * as LayoutManager from "./layoutManager.js";
import { DialogSystem } from "./alertManager.js";
import { getPopupManager } from "./popupManager.js";
import { getInputContainerManager } from "./inputContainerManager.js";
import { FileBoxRenderer } from "./fileBoxRenderer.js";
import { FileOperations } from "./fileOperations.js";

/**
 * Handles file operations for the panel UI
 */
export class FileHandler {
  /**
   * Creates a new FileHandler instance
   */
  constructor(options) {
    const {
      extensionPath,
      outputContainer,
      panelOverlay,
      visualContainerManager,
      updateLayoutCallback,
    } = options;

    this._extensionPath = extensionPath;
    this._outputContainer = outputContainer;
    this._panelOverlay = panelOverlay;
    this._visualContainerManager = visualContainerManager;
    this._updateLayoutCallback = updateLayoutCallback;

    // Track loaded file content
    this._loadedFiles = new Map();
    this._filePaths = new Map();

    // Initialize dialog system
    this._dialogSystem = new DialogSystem({
      panelOverlay: this._panelOverlay
    });
    
    // Get managers
    this._popupManager = getPopupManager();

    // Initialize file box renderer with visual container manager
    this._fileBoxRenderer = new FileBoxRenderer({
      visualContainerManager: this._visualContainerManager,
      updateLayoutCallback: this._updateLayoutCallback,
      onRemoveCallback: this._onFileRemoved.bind(this),
    });

    // Initialize file operations
    this._fileOperations = new FileOperations({
      extensionPath: this._extensionPath,
      outputContainer: this._outputContainer,
      onFileProcessedCallback: this._onFileProcessed.bind(this),
    });

    // Set up system signal listeners for formatting integrity
    this._setupSystemListeners();
  }

  /**
   * Sets up system listeners to maintain formatting integrity
   */
  _setupSystemListeners() {
    const settings = getSettings();
    this._settingsChangedId = settings.connect("changed", () => {
      this.refreshFileBoxFormatting();
    });

    this._setupFormattingGuard();
  }

  /**
   * Sets up a guard that periodically ensures formatting integrity
   */
  _setupFormattingGuard() {
    this._formattingGuardId = imports.gi.GLib.timeout_add(
      imports.gi.GLib.PRIORITY_DEFAULT,
      2000,
      () => {
        if (this.hasLoadedFiles() && this._fileBoxRenderer.hasFiles()) {
          this.refreshFileBoxFormatting();
        }
        return imports.gi.GLib.SOURCE_REMOVE;
      }
    );

    this._modelChangeGuardId = imports.gi.GLib.timeout_add(
      imports.gi.GLib.PRIORITY_DEFAULT,
      500,
      () => {
        if (this.hasLoadedFiles() && this._fileBoxRenderer.hasFiles()) {
          this.refreshFileBoxFormatting();
        }
        return imports.gi.GLib.SOURCE_REMOVE;
      }
    );
  }

  /**
   * Opens a file selector dialog
   */
  openFileSelector() {
    this._popupManager.closeAllExcept(null);
    this._fileOperations.openFileSelector();
  }

  /**
   * Callback when a file has been processed
   */
  async _onFileProcessed(content, fileName, filePath) {
    const maxLength = 16000; // Use the same constant
    
    if (content.length > maxLength) {
      const action = await this._dialogSystem.showDialog({
        title: "File Too Large",
        message: `The file "${fileName}" exceeds the maximum length of ${maxLength} characters. This may work with some models with a high context window.`,
        buttons: [
          { label: "Cancel", action: "cancel" },
          { label: "Truncate", action: "truncate" },
          { label: "Upload Anyway", action: "upload" }
        ]
      });
      
      switch (action) {
        case "cancel":
          return;
        case "truncate":
          content = content.substring(0, maxLength) + "\n\n...\n(Content truncated due to size limits.)\n";
          break;
        case "upload":
          // Keep full content
          break;
      }
    }

    this._fileBoxRenderer.displayFileContentBox(content, fileName);
    this._loadedFiles.set(fileName, content);
    this._filePaths.set(fileName, filePath);
  }

  /**
   * Callback when a file is removed
   */
  _onFileRemoved(fileName) {
    const fileContent = this._loadedFiles.get(fileName);
    this._loadedFiles.delete(fileName);
    this._filePaths.delete(fileName);
    this._notifyContentRemoved(fileContent);
  }

  /**
   * Notifies registered handlers that content has been removed
   */
  _notifyContentRemoved(content) {
    if (this.onContentRemoved && typeof this.onContentRemoved === 'function') {
      this.onContentRemoved(content);
    }
  }

  /**
   * Cleans up only the UI elements, preserving loaded file data
   */
  cleanupFileUI() {
    this._fileBoxRenderer.cleanupFileBoxes();
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

    if (this._fileBoxRenderer.hasFiles()) {
      return;
    }

    this._fileBoxRenderer.restoreFileUI(this._loadedFiles);
    this.refreshFileBoxFormatting();
  }

  /**
   * Cleans up the file content box including UI and data
   */
  cleanupFileContentBox() {
    this._loadedFiles.clear();
    this._filePaths.clear();
    
    const hadFiles = this._fileBoxRenderer.hasFiles();
    
    // File box renderer handles its own cleanup with visual container manager
    this._fileBoxRenderer.cleanupFileBoxes();
    this._notifyContentRemoved();
    
    if (this._visualContainerManager) {
      this._visualContainerManager.resetToBaseState();
    } else if (hadFiles) {
      const {
        panelWidth,
        panelHeight,
        horizontalPadding,
        inputFieldHeight,
        buttonsHeight,
        paddingY,
      } = LayoutManager.calculatePanelDimensions();
            
      // Fallback cleanup if visual container manager not available
      LayoutManager.invalidateCache();
      
      if (this._updateLayoutCallback) {
        this._updateLayoutCallback(true);
      }
    }
  }

  /**
   * Destroys the file handler
   */
  destroy() {
    if (this._settingsChangedId) {
      const settings = getSettings();
      settings.disconnect(this._settingsChangedId);
      this._settingsChangedId = null;
    }

    if (this._formattingGuardId) {
      imports.gi.GLib.source_remove(this._formattingGuardId);
      this._formattingGuardId = null;
    }

    if (this._modelChangeGuardId) {
      imports.gi.GLib.source_remove(this._modelChangeGuardId);
      this._modelChangeGuardId = null;
    }

    this._fileBoxRenderer.destroy();
    this.cleanupFileContentBox();
  }

  /**
   * Get all loaded file content formatted for AI prompt
   */
  getFormattedFileContent() {
    if (this._loadedFiles.size === 0) {
      return "";
    }

    const files = [];
    for (const [fileName, content] of this._loadedFiles.entries()) {
      const filePath = this._filePaths.get(fileName) || "";
      files.push({
        filename: fileName,
        content,
        path: filePath,
      });
    }

    return JSON.stringify(
      {
        instructions:
          "When modifying files, respond in JSON format. If no files are modified, do NOT respond in JSON. The response must if a file is modified start with a 'summary' key if modifying the fille; describing the changes. Only include modified files under 'files'.",
        prompt: "",
        files,
      },
      null,
      2
    ) + " ｢files attached｣";
  }

  /**
   * Check if any files are loaded
   */
  hasLoadedFiles() {
    return this._loadedFiles.size > 0;
  }

  /**
   * Refreshes the formatting of all file boxes
   */
  refreshFileBoxFormatting() {
    this._fileBoxRenderer.refreshFileBoxFormatting();
  }

  /**
   * Creates a file box from pasted text
   */
  createFileBoxFromText(text, title = "Pasted Text") {
    if (!text || text.trim() === "") {
      return;
    }

    this._fileBoxRenderer.createFileBoxFromText(text, title);
    this._loadedFiles.set(title, text);
  }

  /**
   * Get the full path for a filename
   */
  getFilePath(fileName) {
    return this._filePaths.get(fileName) || null;
  }
}
