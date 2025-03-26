/**
 * PDF document converter for Linux Copilot
 * Handles PDF-specific extraction logic
 */
import Gio from "gi://Gio";

/**
 * Get PDF extraction options in priority order
 * @returns {Array<Array<string>>} Array of options arrays
 */
function getPdfExtractionOptions() {
  return [
    ["-layout", "-q"], // Layout preserving mode
    ["-raw", "-q"], // Raw mode
    ["-q"], // Default mode
    ["-f", "1", "-l", "5", "-q"], // Just first 5 pages to try
  ];
}

/**
 * Process extraction result and handle errors
 *
 * @param {Object} params - Processing parameters
 * @param {number} params.optionIndex - Current option index
 * @param {number} params.exitStatus - Process exit status
 * @param {string} params.stdout - Standard output
 * @param {string} params.stderr - Standard error
 * @param {Function} params.resolve - Promise resolve function
 * @param {Function} params.reject - Promise reject function
 * @param {Function} params.tryNext - Function to try next option
 * @returns {void}
 */
function processExtractionResult(params) {
  const { exitStatus, stdout, stderr, resolve, reject, tryNext } = params;

  if (exitStatus === 0 && stdout && stdout.trim()) {
    resolve(stdout);
    return;
  }

  // Check for specific errors
  if (handlePdfErrors({ stderr, reject })) {
    return;
  }

  tryNext();
}

/**
 * Handle specific PDF error conditions
 *
 * @param {Object} params - Error handling parameters
 * @param {string} params.stderr - Error output from process
 * @param {Function} params.reject - Promise reject function
 * @returns {boolean} True if error was handled and should stop processing
 */
function handlePdfErrors({ stderr, reject }) {
  if (!stderr) {
    return false;
  }

  // Password protected PDF
  if (stderr.includes("password")) {
    reject(
      new Error("PDF appears to be password protected. Unable to convert.")
    );
    return true;
  }

  // Damaged/corrupted PDF
  if (
    stderr.includes("damaged") ||
    stderr.includes("corrupt") ||
    stderr.includes("invalid")
  ) {
    reject(
      new Error("PDF appears to be damaged or corrupted. Unable to convert.")
    );
    return true;
  }

  return false;
}

/**
 * Run PDF extraction with given options
 *
 * @param {Object} params - Extraction parameters
 * @param {Array<string>} params.options - Command options
 * @param {string} params.filePath - Path to PDF file
 * @param {number} params.optionIndex - Current option index
 * @param {number} params.totalOptions - Total number of options
 * @param {Function} params.resolve - Promise resolve function
 * @param {Function} params.reject - Promise reject function
 * @param {Function} params.tryNext - Function to try next option
 */
function runPdfExtraction(params) {
  const { options, filePath, resolve, reject, tryNext } = params;

  const args = ["pdftotext", ...options, filePath, "-"];

  const subprocess = new Gio.Subprocess({
    argv: args,
    flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
  });

  subprocess.init(null);
  subprocess.communicate_utf8_async(null, null, (proc, result) => {
    try {
      const [, stdout, stderr] = proc.communicate_utf8_finish(result);
      const exitStatus = proc.get_exit_status();

      processExtractionResult({
        exitStatus,
        stdout,
        stderr,
        resolve,
        reject,
        tryNext,
      });
    } catch {
      tryNext();
    }
  });
}

/**
 * Extract text from PDF file using various methods
 *
 * @param {string} filePath - Path to the PDF file
 * @returns {Promise<string>} - Promise resolving to extracted text
 */
export function extractPdfText(filePath) {
  return new Promise((resolve, reject) => {
    try {
      const options = getPdfExtractionOptions();
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

        runPdfExtraction({
          options: currentOptions,
          filePath,
          optionIndex,
          totalOptions: options.length,
          resolve,
          reject,
          tryNext: () => {
            optionIndex++;
            tryNextOption();
          },
        });
      };

      tryNextOption();
    } catch (error) {
      reject(error);
    }
  });
}
