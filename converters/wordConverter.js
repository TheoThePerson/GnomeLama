/**
 * Word document converter for Linux Copilot
 * Handles Word document (DOC, DOCX) specific extraction logic
 */
import Gio from "gi://Gio";

/**
 * Cleans up extracted Word document text
 *
 * @param {string} text - Raw extracted text
 * @returns {string} - Cleaned text
 */
function cleanupWordText(text) {
  if (!text) return "";

  // Remove XML artifacts
  let result = text.replace(/<\/?[^>]+(>|$)/gu, " ");

  // Remove repeated spaces
  result = result.replace(/\s+/gu, " ");

  // Remove control characters often found in Word docs (ESLint-safe version)
  // Using character-by-character approach to avoid regex with control characters
  result = result
    .split("")
    .filter((char) => {
      const code = char.charCodeAt(0);
      return !(
        (code >= 0 && code <= 8) ||
        code === 11 ||
        code === 12 ||
        (code >= 14 && code <= 31) ||
        (code >= 127 && code <= 159)
      );
    })
    .join("");

  // Fix paragraph breaks
  result = result.replace(/(\w)(\n+)(\w)/gu, "$1\n\n$3");

  // Remove empty lines
  result = result.replace(/^\s*[\r\n]/gmu, "");

  // Final trim
  return result.trim();
}

/**
 * Get approaches to try for extracting text from DOCX files
 *
 * @param {string} filePath - Path to the document
 * @returns {Array} - Array of approach objects
 */
function getDocxApproaches(filePath) {
  return [
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
}

/**
 * Get approaches to try for extracting text from DOC files
 *
 * @param {string} filePath - Path to the document
 * @returns {Array} - Array of approach objects
 */
function getDocApproaches(filePath) {
  return [
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
}

/**
 * Handle the extraction process output
 *
 * @param {Object} params - Processing parameters
 * @param {number} params.approachIndex - Current approach index
 * @param {Object} params.currentApproach - Current approach details
 * @param {string} params.stdout - Process stdout
 * @param {number} params.exitStatus - Process exit status
 * @param {Function} params.resolve - Promise resolve function
 * @param {Function} params.tryNextApproach - Function to try next approach
 */
function handleExtractionOutput({
  approachIndex,
  currentApproach,
  stdout,
  exitStatus,
  resolve,
  tryNextApproach,
}) {
  if (exitStatus === 0 && stdout && stdout.trim()) {
    // Clean up the output text
    const cleanedText = cleanupWordText(stdout);

    // Only resolve if we have meaningful text (more than just a few characters)
    if (cleanedText.length > 20) {
      // For certain approaches, add a note that this is partial extraction
      if (
        currentApproach.command === "sh" &&
        (currentApproach.args[1].includes("strings") || approachIndex > 1)
      ) {
        resolve(
          cleanedText +
            "\n\n[Note: This is partial text extraction using a fallback method. For better results, install docx2txt/catdoc.]"
        );
      } else {
        resolve(cleanedText);
      }
    } else {
      tryNextApproach();
    }
  } else {
    tryNextApproach();
  }
}

/**
 * Execute a subprocess for text extraction
 *
 * @param {Object} params - Parameters object
 * @param {Object} params.currentApproach - Current approach details
 * @param {number} params.approachIndex - Current approach index
 * @param {Function} params.resolve - Promise resolve function
 * @param {Function} params.tryNextApproach - Function to try next approach
 */
function executeExtractionProcess({
  currentApproach,
  approachIndex,
  resolve,
  tryNextApproach,
}) {
  const subprocess = new Gio.Subprocess({
    argv: [currentApproach.command, ...currentApproach.args],
    flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
  });

  try {
    subprocess.init(null);

    subprocess.communicate_utf8_async(null, null, (proc, result) => {
      try {
        const [, stdout] = proc.communicate_utf8_finish(result);
        const exitStatus = proc.get_exit_status();

        handleExtractionOutput({
          approachIndex,
          currentApproach,
          stdout,
          exitStatus,
          resolve,
          tryNextApproach,
        });
      } catch {
        tryNextApproach();
      }
    });
  } catch {
    tryNextApproach();
  }
}

/**
 * Extract text from Word documents using multiple approaches
 *
 * @param {string} filePath - Path to the Word document
 * @param {string} extension - Document extension (doc or docx)
 * @returns {Promise<string>} - Promise resolving to extracted text
 */
export function extractWordText(filePath, extension) {
  return new Promise((resolve, reject) => {
    try {
      // Define different approaches based on document type
      let approaches = [];

      if (extension === "docx") {
        approaches = getDocxApproaches(filePath);
      } else if (extension === "doc") {
        approaches = getDocApproaches(filePath);
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

        executeExtractionProcess({
          currentApproach,
          approachIndex,
          resolve,
          tryNextApproach: () => {
            approachIndex++;
            tryNextApproach();
          },
        });
      };

      tryNextApproach();
    } catch (error) {
      reject(error);
    }
  });
}
