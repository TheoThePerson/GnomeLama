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
   * Checks if content represents an image
   */
  _isImageContent(content) {
    return typeof content === 'string' && content.startsWith('[IMAGE:') && content.endsWith(']');
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

    // Check if this is an image file - images are automatically context-only
    let usage;
    if (this._isImageContent(content)) {
      usage = "context";
    } else {
      // Ask user how they want to use this file
      usage = await this._dialogSystem.showDialog({
        title: "File Usage",
        message: `How do you want to use "${fileName}"?`,
        buttons: [
          { label: "Context Only", action: "context" },
          { label: "Modifiable", action: "modifiable" },
          { label: "Cancel", action: "cancel" }
        ]
      });

      if (usage === "cancel") {
        return;
      }
    }

    this._fileBoxRenderer.displayFileContentBox(content, fileName, usage);
    this._loadedFiles.set(fileName, content);
    this._filePaths.set(fileName, filePath);
    
    // Track file usage type
    if (!this._fileUsageTypes) {
      this._fileUsageTypes = new Map();
    }
    this._fileUsageTypes.set(fileName, usage);
  }

  /**
   * Callback when a file is removed
   */
  _onFileRemoved(fileName) {
    const fileContent = this._loadedFiles.get(fileName);
    this._loadedFiles.delete(fileName);
    this._filePaths.delete(fileName);
    if (this._fileUsageTypes) {
      this._fileUsageTypes.delete(fileName);
    }
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
    if (this._fileUsageTypes) {
      this._fileUsageTypes.clear();
    }
    
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

    // Separate files by usage type
    const modifiableFiles = [];
    const contextFiles = [];
    
    for (const [fileName, content] of this._loadedFiles.entries()) {
      const filePath = this._filePaths.get(fileName) || "";
      const usageType = this._fileUsageTypes?.get(fileName) || "modifiable";
      
      const fileData = {
        filename: fileName,
        content,
        path: filePath,
      };
      
      if (usageType === "context") {
        contextFiles.push(fileData);
      } else {
        modifiableFiles.push(fileData);
      }
    }

    // Build the prompt
    let promptParts = [];
    
    // Add context files to the prompt text
    if (contextFiles.length > 0) {
      promptParts.push("Context files for reference:");
      contextFiles.forEach(file => {
        promptParts.push(`\n--- ${file.filename} ---\n${file.content}\n`);
      });
    }
    
    // Handle modifiable files
    if (modifiableFiles.length > 0) {
      const jsonData = {
        instructions:
          "When modifiable files are provided, you MUST modify at least one of them and respond in JSON format. If you cannot or will not modify any files, respond in plain text explaining why. The JSON response must start with a 'summary' key describing the changes. Only include actually modified files under 'files'.",
        prompt: "",
        files: modifiableFiles,
      };
      
      const jsonString = JSON.stringify(jsonData, null, 2);
      
      if (contextFiles.length > 0) {
        // Mix of context and modifiable files
        return promptParts.join("") + "\n\n" + jsonString + " ｢files attached｣";
      } else {
        // Only modifiable files
        return jsonString + " ｢files attached｣";
      }
    } else {
      // Only context files, no JSON needed
      return promptParts.join("") + " ｢files attached｣";
    }
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
  createFileBoxFromText(text, title = "Pasted Text", usageType = "modifiable") {
    if (!text || text.trim() === "") {
      return;
    }

    this._fileBoxRenderer.createFileBoxFromText(text, title, usageType);
    this._loadedFiles.set(title, text);
    
    // Track file usage type
    if (!this._fileUsageTypes) {
      this._fileUsageTypes = new Map();
    }
    this._fileUsageTypes.set(title, usageType);
  }

  /**
   * Get the full path for a filename
   */
  getFilePath(fileName) {
    return this._filePaths.get(fileName) || null;
  }
}
