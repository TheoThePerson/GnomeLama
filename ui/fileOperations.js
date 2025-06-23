/**
 * File operations and document conversion functionality
 */
import Gio from "gi://Gio";
import * as DocumentConverter from "../converters/documentConverter.js";
import * as MessageProcessor from "./messageProcessor.js";

/**
 * Handles file I/O operations and document conversion
 */
export class FileOperations {
  constructor(options) {
    const {
      extensionPath,
      outputContainer,
      onFileProcessedCallback,
    } = options;

    this._extensionPath = extensionPath;
    this._outputContainer = outputContainer;
    this._onFileProcessedCallback = onFileProcessedCallback;

    this._availableTools = {};
    this._checkDocumentTools();
  }

  /**
   * Check for installed document conversion tools
   */
  _checkDocumentTools() {
    DocumentConverter.checkRequiredTools()
      .then((tools) => {
        this._availableTools = tools;
      })
      .catch(() => {
        this._availableTools = {};
      });
  }

  /**
   * Opens a file selector dialog
   */
  openFileSelector() {
    try {
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
   */
  _handleCommandOutput(source, res) {
    try {
      const [, stdout, stderr] = source.communicate_utf8_finish(res);

      if (stdout && stdout.trim()) {
        const selectedFilePath = stdout.trim();
        this.readAndProcessFile(selectedFilePath);
      } else if (stderr && stderr.trim()) {
        // Command error in stderr
      }
    } catch (error) {
      this._handleError("Error processing command output", error);
    }
  }

  /**
   * Reads and processes the contents of a file
   */
  readAndProcessFile(filePath) {
    try {
      const file = Gio.File.new_for_path(filePath);

      if (!this._validateFile(file, filePath)) {
        return;
      }

      const fileName = file.get_basename();
      const fileType = DocumentConverter.detectFileType(filePath);

      if (!fileType) {
        MessageProcessor.addTemporaryMessage(
          this._outputContainer,
          `Unsupported file format: ${fileName}`
        );
        return;
      }

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

      this._convertAndLoadFile(filePath, fileName, fileType);
    } catch (error) {
      this._handleError(`Error processing file: ${filePath}`, error);
    }
  }

  /**
   * Converts and loads a file
   */
  _convertAndLoadFile(filePath, fileName, fileType) {
    DocumentConverter.convertToText(filePath, fileType)
      .then((content) => {
        if (this._onFileProcessedCallback) {
          this._onFileProcessedCallback(content, fileName, filePath);
        }
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
   * Provides installation instructions for missing tools
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
   * Handles errors
   */
  _handleError(context, error) {
    const errorMessage = error.message || String(error);
    MessageProcessor.addTemporaryMessage(
      this._outputContainer,
      `Error: ${context} - ${errorMessage}`
    );
  }

  /**
   * Get available document conversion tools
   */
  getAvailableTools() {
    return this._availableTools;
  }
} 