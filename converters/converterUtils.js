/**
 * Utility functions for document converters
 */
import Gio from "gi://Gio";

/**
 * Parses command template into command parts array
 *
 * @param {string} commandTemplate - Command template with converter
 * @param {string} filePath - Path to the file
 * @returns {string[]} - Array of command parts
 */
function parseCommandTemplate(commandTemplate, filePath) {
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
  return commandParts.filter((part) => part.trim() !== "");
}

/**
 * Handles PDF conversion errors
 *
 * @param {number} exitStatus - Process exit status
 * @param {string} stderr - Error output
 * @returns {Error|null} - Error object or null if no error
 */
function handlePdfErrors(exitStatus, stderr) {
  if (exitStatus !== 0) {
    // Check if PDF might be password protected
    if (stderr && stderr.includes("password")) {
      return new Error(
        "PDF appears to be password protected. Unable to convert."
      );
    }

    // Check if file might be corrupted
    if (
      stderr &&
      (stderr.includes("damaged") ||
        stderr.includes("corrupt") ||
        stderr.includes("invalid"))
    ) {
      return new Error(
        "PDF appears to be damaged or corrupted. Unable to convert."
      );
    }

    // Generic PDF error
    return new Error(
      "Failed to convert PDF. This may be due to encryption or an unsupported PDF format."
    );
  }
  return null;
}

/**
 * Handles Word document conversion errors
 *
 * @param {Object} params - Parameters object
 * @param {string} params.converterName - Name of the converter
 * @param {number} params.exitStatus - Process exit status
 * @param {string} params.stdout - Standard output
 * @param {string} params.stderr - Error output
 * @returns {Error|null} - Error object or null if no error
 */
function handleWordErrors({ converterName, exitStatus, stdout, stderr }) {
  if (exitStatus !== 0 || !stdout || !stdout.trim()) {
    if (stderr && stderr.includes("not found")) {
      return new Error(
        `Word converter '${converterName}' not found or not properly installed.`
      );
    }

    if (stderr) {
      return new Error(`Word conversion failed: ${stderr}`);
    }

    return new Error(
      `Word conversion produced no output. The file may be empty, corrupted, or password-protected.`
    );
  }
  return null;
}

/**
 * Retries PDF conversion in raw mode
 *
 * @param {string[]} commandParts - Original command parts
 * @param {function} resolve - Promise resolve function
 */
function retryPdfConversionInRawMode(commandParts, resolve) {
  const rawCommandParts = commandParts.filter((part) => part !== "-layout");

  const retrySubprocess = new Gio.Subprocess({
    argv: rawCommandParts,
    flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
  });

  retrySubprocess.init(null);
  retrySubprocess.communicate_utf8_async(
    null,
    null,
    (retryProc, retryResult) => {
      try {
        const [, retryStdout] = retryProc.communicate_utf8_finish(retryResult);
        if (retryStdout && retryStdout.trim()) {
          resolve(retryStdout);
          return;
        }

        resolve(
          "(The PDF appears to contain no extractable text or may be an image-based document)"
        );
      } catch {
        resolve(
          "(The PDF appears to contain no extractable text or may be an image-based document)"
        );
      }
    }
  );
}

/**
 * Handles empty output cases
 *
 * @param {Object} params - Parameters object
 * @param {string} params.converterName - Name of the converter
 * @param {string[]} params.commandParts - Command parts
 * @param {function} params.resolve - Promise resolve function
 * @param {function} params.reject - Promise reject function
 */
function handleEmptyOutput({ converterName, commandParts, resolve, reject }) {
  // For some converters like PDF, empty output might be valid but unusual
  if (converterName === "pdftotext") {
    // Try again with raw mode if layout mode failed
    if (commandParts.includes("-layout")) {
      retryPdfConversionInRawMode(commandParts, resolve);
      return;
    }

    resolve(
      "(The PDF appears to contain no extractable text or may be an image-based document)"
    );
    return;
  }

  if (converterName === "docx2txt" || converterName === "catdoc") {
    // Empty output from Word converters is unusual
    reject(
      new Error(
        "The Word document appears to be empty or could not be processed"
      )
    );
    return;
  }

  reject(new Error("No output from converter"));
}

/**
 * Processes the subprocess results
 *
 * @param {Object} params - Parameters object
 * @param {Gio.Subprocess} params.subprocess - The subprocess
 * @param {string[]} params.commandParts - Command parts array
 * @param {function} params.resolve - Promise resolve function
 * @param {function} params.reject - Promise reject function
 */
function processSubprocessResults({
  subprocess,
  commandParts,
  resolve,
  reject,
}) {
  subprocess.communicate_utf8_async(null, null, (proc, result) => {
    try {
      const [, stdout, stderr] = proc.communicate_utf8_finish(result);
      const exitStatus = proc.get_exit_status();

      // Log conversion results for debugging
      const converterName = commandParts[0];

      // Handle PDF conversion errors
      if (converterName === "pdftotext") {
        const pdfError = handlePdfErrors(exitStatus, stderr);
        if (pdfError) {
          reject(pdfError);
          return;
        }
      }

      // Handle Word document conversion errors
      if (converterName === "docx2txt" || converterName === "catdoc") {
        const wordError = handleWordErrors({
          converterName,
          exitStatus,
          stdout,
          stderr,
        });
        if (wordError) {
          reject(wordError);
          return;
        }
      }

      if (exitStatus !== 0) {
        reject(new Error(`Conversion failed: ${stderr || "Unknown error"}`));
        return;
      }

      if (stdout && stdout.trim()) {
        resolve(stdout);
      } else {
        handleEmptyOutput({ converterName, commandParts, resolve, reject });
      }
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
export function executeCommand(commandTemplate, filePath) {
  return new Promise((resolve, reject) => {
    try {
      // Parse command into an array for subprocess
      const commandParts = parseCommandTemplate(commandTemplate, filePath);

      const subprocess = new Gio.Subprocess({
        argv: commandParts,
        flags:
          Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
      });

      subprocess.init(null);

      processSubprocessResults({ subprocess, commandParts, resolve, reject });
    } catch (error) {
      reject(error);
    }
  });
}
