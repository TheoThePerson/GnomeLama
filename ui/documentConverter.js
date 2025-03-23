/**
 * Document format converter for Linux Copilot
 * Converts various document formats to plain text for display
 */
import Gio from "gi://Gio";
import GLib from "gi://GLib";

// Import specialized converters
import { extractPdfText } from "./converters/pdfConverter.js";
import { extractWordText } from "./converters/wordConverter.js";
import { executeCommand } from "./converters/utils.js";

// Define supported file types and their corresponding converters
export const SUPPORTED_FORMATS = {
  // Text formats
  txt: { type: "text", mimeTypes: ["text/plain"] },
  md: { type: "text", mimeTypes: ["text/markdown"] },
  json: { type: "text", mimeTypes: ["application/json"] },
  xml: { type: "text", mimeTypes: ["application/xml", "text/xml"] },
  html: { type: "text", mimeTypes: ["text/html"] },
  htm: { type: "text", mimeTypes: ["text/html"] },
  css: { type: "text", mimeTypes: ["text/css"] },
  js: {
    type: "text",
    mimeTypes: ["text/javascript", "application/javascript"],
  },
  py: { type: "text", mimeTypes: ["text/x-python"] },
  sh: { type: "text", mimeTypes: ["text/x-shellscript"] },
  c: { type: "text", mimeTypes: ["text/x-c"] },
  cpp: { type: "text", mimeTypes: ["text/x-c++"] },
  h: { type: "text", mimeTypes: ["text/x-c-header"] },
  java: { type: "text", mimeTypes: ["text/x-java"] },
  log: { type: "text", mimeTypes: ["text/plain"] },
  ini: { type: "text", mimeTypes: ["text/plain"] },
  csv: { type: "text", mimeTypes: ["text/csv"] },
  yaml: { type: "text", mimeTypes: ["text/yaml"] },
  yml: { type: "text", mimeTypes: ["text/yaml"] },

  // Document formats (requires conversion)
  odt: {
    type: "document",
    mimeTypes: ["application/vnd.oasis.opendocument.text"],
    converter: "odt2txt",
  },
  docx: {
    type: "document",
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    converter: "docx2txt",
  },
  doc: {
    type: "document",
    mimeTypes: ["application/msword"],
    converter: "catdoc",
  },
  rtf: {
    type: "document",
    mimeTypes: ["application/rtf", "text/rtf"],
    converter: "unrtf --text",
  },
  pdf: {
    type: "document",
    mimeTypes: ["application/pdf"],
    converter: "pdftotext -layout -q",
  },
};

/**
 * Detects file type based on extension and content
 *
 * @param {string} filePath - Path to the file
 * @returns {object|null} - File format info or null if unsupported
 */
export function detectFileType(filePath) {
  try {
    // Extract file extension
    const extension = filePath.split(".").pop().toLowerCase();

    // Check if extension is in supported formats
    if (SUPPORTED_FORMATS[extension]) {
      return {
        extension: extension,
        ...SUPPORTED_FORMATS[extension],
      };
    }

    // If extension not found, try checking MIME type
    const contentType = getFileMimeType(filePath);
    if (contentType) {
      for (const [ext, info] of Object.entries(SUPPORTED_FORMATS)) {
        if (info.mimeTypes && info.mimeTypes.includes(contentType)) {
          return {
            extension: ext,
            ...info,
          };
        }
      }
    }

    return null;
  } catch (error) {
    console.error(`Error detecting file type: ${error.message}`);
    return null;
  }
}

/**
 * Gets MIME type of a file
 *
 * @param {string} filePath - Path to the file
 * @returns {string|null} - MIME type or null if unable to determine
 */
function getFileMimeType(filePath) {
  try {
    const file = Gio.File.new_for_path(filePath);
    const fileInfo = file.query_info("standard::content-type", 0, null);
    return fileInfo.get_content_type();
  } catch (error) {
    console.error(`Error getting file MIME type: ${error.message}`);
    return null;
  }
}

/**
 * Converts document to text format
 *
 * @param {string} filePath - Path to the document
 * @param {object} fileType - File type information
 * @returns {Promise<string>} - Promise resolving to text content
 */
export function convertToText(filePath, fileType) {
  return new Promise((resolve, reject) => {
    try {
      if (!fileType) {
        fileType = detectFileType(filePath);
        if (!fileType) {
          reject(new Error("Unsupported file format"));
          return;
        }
      }

      // Handle direct text files
      if (fileType.type === "text") {
        const file = Gio.File.new_for_path(filePath);
        const [success, content] = file.load_contents(null);

        if (success) {
          try {
            const text = new TextDecoder("utf-8").decode(content);
            resolve(text);
          } catch {
            resolve(content.toString());
          }
        } else {
          reject(new Error("Failed to read file content"));
        }
        return;
      }

      // Special handling for PDF files
      if (fileType.extension === "pdf") {
        extractPdfText(filePath)
          .then((text) => resolve(text))
          .catch((error) => {
            console.error("PDF extraction failed:", error);
            reject(error);
          });
        return;
      }

      // Special handling for Word documents
      if (fileType.extension === "docx" || fileType.extension === "doc") {
        extractWordText(filePath, fileType.extension)
          .then((text) => resolve(text))
          .catch((error) => {
            console.error(`${fileType.extension} extraction failed:`, error);
            reject(error);
          });
        return;
      }

      // Handle document files requiring conversion
      if (fileType.type === "document" && fileType.converter) {
        const command = fileType.converter.replace(
          "FILE",
          GLib.shell_quote(filePath)
        );
        executeCommand(command, filePath)
          .then((result) => {
            resolve(result);
          })
          .catch((error) => {
            reject(error);
          });
        return;
      }

      reject(new Error("Unsupported file format"));
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Checks if required document converter tools are installed
 *
 * @returns {Promise<object>} - Object with status of required tools
 */
export function checkRequiredTools() {
  const tools = {
    docx2txt: false,
    odt2txt: false,
    catdoc: false,
    unrtf: false,
    pdftotext: false,
    // Additional tools that help with alternative extraction methods
    unzip: false,
    antiword: false,
    strings: false,
  };

  const promises = Object.keys(tools).map((tool) => {
    return new Promise((resolve) => {
      const subprocess = new Gio.Subprocess({
        argv: ["which", tool],
        flags:
          Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
      });

      subprocess.init(null);
      subprocess.wait_async(null, (proc) => {
        tools[tool] = proc.get_exit_status() === 0;
        resolve();
      });
    });
  });

  return Promise.all(promises).then(() => tools);
}
