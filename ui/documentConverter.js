/**
 * Document format converter for Linux Copilot
 * Converts various document formats to plain text for display
 */
import Gio from "gi://Gio";
import GLib from "gi://GLib";

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
 * Alternative PDF text extraction method using pdftotext directly
 * Used as a fallback
 *
 * @param {string} filePath - Path to the PDF file
 * @returns {Promise<string>} - Promise resolving to extracted text
 */
function extractPdfTextAlternative(filePath) {
  return new Promise((resolve, reject) => {
    try {
      // Try different pdftotext approaches
      const options = [
        ["-raw", "-q"], // Raw mode
        ["-layout", "-q"], // Layout preserving mode
        ["-q"], // Default mode
        ["-f", "1", "-l", "5", "-q"], // Just first 5 pages to try
      ];

      let optionIndex = 0;

      const tryNextOption = () => {
        if (optionIndex >= options.length) {
          reject(
            new Error(
              "Failed to extract text from PDF using all available methods"
            )
          );
          return;
        }

        const currentOptions = options[optionIndex];
        const args = ["pdftotext", ...currentOptions, filePath, "-"];

        console.log(
          `Trying PDF extraction option ${optionIndex + 1}/${
            options.length
          }: ${args.join(" ")}`
        );

        const subprocess = new Gio.Subprocess({
          argv: args,
          flags:
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
        });

        subprocess.init(null);
        subprocess.communicate_utf8_async(null, null, (proc, result) => {
          try {
            const [, stdout, stderr] = proc.communicate_utf8_finish(result);
            const exitStatus = proc.get_exit_status();

            console.log(
              `PDF extraction option ${
                optionIndex + 1
              } exit status: ${exitStatus}`
            );

            if (exitStatus === 0 && stdout && stdout.trim()) {
              console.log(
                `PDF extraction successful with option ${optionIndex + 1}`
              );
              resolve(stdout);
            } else {
              console.log(
                `PDF extraction option ${optionIndex + 1} failed: ${
                  stderr || "No output"
                }`
              );
              optionIndex++;
              tryNextOption();
            }
          } catch (error) {
            console.error(`Error with option ${optionIndex + 1}:`, error);
            optionIndex++;
            tryNextOption();
          }
        });
      };

      tryNextOption();
    } catch (error) {
      reject(error);
    }
  });
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
          } catch (error) {
            resolve(content.toString());
          }
        } else {
          reject(new Error("Failed to read file content"));
        }
        return;
      }

      // Special handling for PDF files
      if (fileType.extension === "pdf") {
        extractPdfTextAlternative(filePath)
          .then((text) => resolve(text))
          .catch((error) => {
            console.error("Alternative PDF extraction failed:", error);

            // Fall back to standard method
            const command = fileType.converter.replace(
              "FILE",
              GLib.shell_quote(filePath)
            );
            executeCommand(command, filePath)
              .then((result) => resolve(result))
              .catch((err) => reject(err));
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
 * Executes a command to convert a document
 *
 * @param {string} commandTemplate - Command template with converter
 * @param {string} filePath - Path to the file
 * @returns {Promise<string>} - Promise resolving to converted text
 */
function executeCommand(commandTemplate, filePath) {
  return new Promise((resolve, reject) => {
    try {
      // Parse command into an array for subprocess
      let commandParts;

      if (commandTemplate.includes("FILE")) {
        // Replace FILE with the actual file path
        commandParts = commandTemplate.replace("FILE", filePath).split(" ");
      } else if (commandTemplate.startsWith("pdftotext")) {
        // Special handling for pdftotext to ensure output goes to stdout
        commandParts = [...commandTemplate.split(" "), filePath, "-"];
      } else {
        // Add file path as an argument
        commandParts = [...commandTemplate.split(" "), filePath];
      }

      // Filter out empty strings
      commandParts = commandParts.filter((part) => part.trim() !== "");

      const subprocess = new Gio.Subprocess({
        argv: commandParts,
        flags:
          Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
      });

      subprocess.init(null);

      subprocess.communicate_utf8_async(null, null, (proc, result) => {
        try {
          const [, stdout, stderr] = proc.communicate_utf8_finish(result);
          const exitStatus = proc.get_exit_status();

          // Log PDF conversion attempts for debugging
          if (commandParts[0] === "pdftotext") {
            console.log(`PDF conversion attempt for: ${filePath}`);
            console.log(`Command: ${commandParts.join(" ")}`);
            console.log(`Exit status: ${exitStatus}`);
            console.log(`Stderr: ${stderr || "none"}`);
            console.log(`Stdout length: ${stdout ? stdout.length : 0} chars`);
          }

          // Special handling for PDF conversion
          if (commandParts[0] === "pdftotext" && exitStatus !== 0) {
            // Check if PDF might be password protected
            if (stderr && stderr.includes("password")) {
              reject(
                new Error(
                  "PDF appears to be password protected. Unable to convert."
                )
              );
              return;
            }

            // Check if file might be corrupted
            if (
              stderr &&
              (stderr.includes("damaged") ||
                stderr.includes("corrupt") ||
                stderr.includes("invalid"))
            ) {
              reject(
                new Error(
                  "PDF appears to be damaged or corrupted. Unable to convert."
                )
              );
              return;
            }

            // Generic PDF error
            reject(
              new Error(
                "Failed to convert PDF. This may be due to encryption or an unsupported PDF format."
              )
            );
            return;
          }

          if (exitStatus !== 0) {
            console.error(`Command failed: ${stderr}`);
            reject(
              new Error(`Conversion failed: ${stderr || "Unknown error"}`)
            );
            return;
          }

          if (stdout && stdout.trim()) {
            resolve(stdout);
          } else {
            // For some converters like PDF, empty output might be valid but unusual
            if (commandParts[0] === "pdftotext") {
              // Try again with raw mode if layout mode failed
              if (commandParts.includes("-layout")) {
                console.log("Retrying PDF conversion with raw mode...");
                const rawCommandParts = commandParts.filter(
                  (part) => part !== "-layout"
                );

                const subprocess = new Gio.Subprocess({
                  argv: rawCommandParts,
                  flags:
                    Gio.SubprocessFlags.STDOUT_PIPE |
                    Gio.SubprocessFlags.STDERR_PIPE,
                });

                subprocess.init(null);
                subprocess.communicate_utf8_async(
                  null,
                  null,
                  (proc, retryResult) => {
                    try {
                      const [, retryStdout, retryStderr] =
                        proc.communicate_utf8_finish(retryResult);
                      if (retryStdout && retryStdout.trim()) {
                        console.log("Raw mode extraction successful");
                        resolve(retryStdout);
                      } else {
                        console.log("Raw mode extraction also failed");
                        resolve(
                          "(The PDF appears to contain no extractable text or may be an image-based document)"
                        );
                      }
                    } catch (error) {
                      console.error("PDF raw mode retry error:", error);
                      resolve(
                        "(The PDF appears to contain no extractable text or may be an image-based document)"
                      );
                    }
                  }
                );
              } else {
                resolve(
                  "(The PDF appears to contain no extractable text or may be an image-based document)"
                );
              }
            } else {
              reject(new Error("No output from converter"));
            }
          }
        } catch (error) {
          reject(error);
        }
      });
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
