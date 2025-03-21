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
 * Cleans up extracted Word document text
 *
 * @param {string} text - Raw extracted text
 * @returns {string} - Cleaned text
 */
function cleanupWordText(text) {
  if (!text) return "";

  return (
    text
      // Remove XML artifacts
      .replace(/<\/.*?>/g, " ")
      .replace(/<.*?>/g, " ")
      // Remove repeated spaces
      .replace(/\s+/g, " ")
      // Remove strange characters often found in Word docs
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "")
      // Fix paragraph breaks
      .replace(/(\w) (\w)/g, "$1 $2")
      .replace(/(\w)(\n+)(\w)/g, "$1\n\n$3")
      // Remove empty lines
      .replace(/^\s*[\r\n]/gm, "")
      .trim()
  );
}

/**
 * Alternative method for converting Word documents
 * Tries multiple approaches in sequence
 *
 * @param {string} filePath - Path to the Word document
 * @param {string} extension - Document extension (doc or docx)
 * @returns {Promise<string>} - Promise resolving to extracted text
 */
function extractWordTextAlternative(filePath, extension) {
  return new Promise((resolve, reject) => {
    try {
      // Define different approaches based on document type
      let approaches = [];

      if (extension === "docx") {
        approaches = [
          // Primary approach: docx2txt
          {
            command: "docx2txt",
            args: [filePath],
          },
          // Better XML content extraction - focus on extracting just paragraphs
          {
            command: "sh",
            args: [
              "-c",
              `unzip -p "${filePath}" word/document.xml | grep -o '<w:p>.*</w:p>' | sed 's/<[^>]*>//g' | sed '/^[[:space:]]*$/d'`,
            ],
          },
          // Alternative XML content extraction - simpler but more reliable
          {
            command: "sh",
            args: [
              "-c",
              `unzip -p "${filePath}" word/document.xml | grep -o '<w:t>[^<]*</w:t>' | sed 's/<[^>]*>//g' | grep -v '^[[:space:]]*$'`,
            ],
          },
          // Extract just document.xml and don't try to parse it
          {
            command: "sh",
            args: [
              "-c",
              `unzip -p "${filePath}" word/document.xml | sed 's/<[^>]*>//g' | grep -v '^[[:space:]]*$'`,
            ],
          },
          // Last resort: direct strings extraction (avoid directory listing)
          {
            command: "sh",
            args: [
              "-c",
              `strings "${filePath}" | grep -v "^[[:space:]]*$" | grep -v "<?xml" | grep -v "</" | grep -v "^\\[" | head -100`,
            ],
          },
        ];
      } else if (extension === "doc") {
        approaches = [
          // Primary approach: catdoc
          {
            command: "catdoc",
            args: [filePath],
          },
          // Alternative approach: try antiword if available
          {
            command: "antiword",
            args: [filePath],
          },
          // Last resort: strings command to extract text
          {
            command: "sh",
            args: [
              "-c",
              `strings "${filePath}" | grep -v "^[[:space:]]*$" | grep -v "<?xml" | grep -v "</" | grep -v "^\\[" | head -100`,
            ],
          },
        ];
      } else {
        reject(new Error(`Unsupported Word document type: ${extension}`));
        return;
      }

      // Try approaches in sequence
      let approachIndex = 0;

      const tryNextApproach = () => {
        if (approachIndex >= approaches.length) {
          reject(
            new Error(
              `Failed to extract text from ${extension.toUpperCase()} document after trying all methods`
            )
          );
          return;
        }

        const currentApproach = approaches[approachIndex];
        console.log(
          `Trying ${extension} extraction approach ${approachIndex + 1}/${
            approaches.length
          }: ${currentApproach.command}`
        );

        const subprocess = new Gio.Subprocess({
          argv: [currentApproach.command, ...currentApproach.args],
          flags:
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
        });

        try {
          subprocess.init(null);

          subprocess.communicate_utf8_async(null, null, (proc, result) => {
            try {
              const [, stdout, stderr] = proc.communicate_utf8_finish(result);
              const exitStatus = proc.get_exit_status();

              console.log(
                `${extension} extraction approach ${
                  approachIndex + 1
                } exit status: ${exitStatus}`
              );

              if (exitStatus === 0 && stdout && stdout.trim()) {
                console.log(
                  `${extension} extraction successful with approach ${
                    approachIndex + 1
                  }`
                );

                // Clean up the output text
                const cleanedText = cleanupWordText(stdout);

                // Only resolve if we have meaningful text (more than just a few characters)
                if (cleanedText.length > 20) {
                  // For certain approaches, add a note that this is partial extraction
                  if (
                    currentApproach.command === "sh" &&
                    (currentApproach.args[1].includes("strings") ||
                      approachIndex > 1) // If we're using anything beyond the first two approaches
                  ) {
                    resolve(
                      cleanedText +
                        "\n\n[Note: This is partial text extraction using a fallback method. For better results, install docx2txt/catdoc.]"
                    );
                  } else {
                    resolve(cleanedText);
                  }
                } else {
                  console.log(
                    `Output too short (${cleanedText.length} chars), trying next approach`
                  );
                  approachIndex++;
                  tryNextApproach();
                }
              } else {
                // Special handling for common errors
                let errorMsg = stderr || "No output";

                if (
                  currentApproach.command === "docx2txt" &&
                  errorMsg.includes("command not found")
                ) {
                  console.log(
                    "docx2txt not installed, trying alternative approaches"
                  );
                } else if (
                  currentApproach.command === "unzip" &&
                  errorMsg.includes("cannot find")
                ) {
                  console.log(
                    "unzip not installed or document structure unexpected"
                  );
                } else if (errorMsg.includes("No such file")) {
                  console.log(
                    "Document may be corrupted or in an unexpected format"
                  );
                }

                console.log(
                  `${extension} extraction approach ${
                    approachIndex + 1
                  } failed: ${errorMsg}`
                );
                approachIndex++;
                tryNextApproach();
              }
            } catch (error) {
              console.error(`Error with approach ${approachIndex + 1}:`, error);
              approachIndex++;
              tryNextApproach();
            }
          });
        } catch (error) {
          console.error(
            `Failed to initiate approach ${approachIndex + 1}:`,
            error
          );
          approachIndex++;
          tryNextApproach();
        }
      };

      tryNextApproach();
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

      // Special handling for Word documents
      if (fileType.extension === "docx" || fileType.extension === "doc") {
        extractWordTextAlternative(filePath, fileType.extension)
          .then((text) => resolve(text))
          .catch((error) => {
            console.error(
              `Alternative ${fileType.extension} extraction failed:`,
              error
            );

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

      // Log conversion attempts for all document types for debugging
      console.log(`Conversion attempt for: ${filePath}`);
      console.log(`Command: ${commandParts.join(" ")}`);

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

          // Log conversion results for debugging
          const converterName = commandParts[0];
          console.log(`${converterName} conversion exit status: ${exitStatus}`);
          console.log(`${converterName} stderr: ${stderr || "none"}`);
          console.log(
            `${converterName} stdout length: ${
              stdout ? stdout.length : 0
            } chars`
          );

          // Special handling for PDF conversion
          if (converterName === "pdftotext" && exitStatus !== 0) {
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

          // Special handling for Word document conversion errors
          if (
            (converterName === "docx2txt" || converterName === "catdoc") &&
            (exitStatus !== 0 || !stdout || !stdout.trim())
          ) {
            if (stderr && stderr.includes("not found")) {
              reject(
                new Error(
                  `Word converter '${converterName}' not found or not properly installed.`
                )
              );
            } else if (stderr) {
              reject(new Error(`Word conversion failed: ${stderr}`));
            } else {
              reject(
                new Error(
                  `Word conversion produced no output. The file may be empty, corrupted, or password-protected.`
                )
              );
            }
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
            if (converterName === "pdftotext") {
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
            } else if (
              converterName === "docx2txt" ||
              converterName === "catdoc"
            ) {
              // Empty output from Word converters is unusual
              reject(
                new Error(
                  `The Word document appears to be empty or could not be processed`
                )
              );
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
