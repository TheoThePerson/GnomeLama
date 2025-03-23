/**
 * PDF document converter for Linux Copilot
 * Handles PDF-specific extraction logic
 */
import Gio from "gi://Gio";

/**
 * Extract text from PDF file using various methods
 *
 * @param {string} filePath - Path to the PDF file
 * @returns {Promise<string>} - Promise resolving to extracted text
 */
export function extractPdfText(filePath) {
  return new Promise((resolve, reject) => {
    try {
      // Try different pdftotext approaches
      const options = [
        ["-layout", "-q"], // Layout preserving mode
        ["-raw", "-q"], // Raw mode
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
              // Check for specific errors
              if (stderr) {
                // Password protected PDF
                if (stderr.includes("password")) {
                  reject(
                    new Error(
                      "PDF appears to be password protected. Unable to convert."
                    )
                  );
                  return;
                }

                // Damaged/corrupted PDF
                if (
                  stderr.includes("damaged") ||
                  stderr.includes("corrupt") ||
                  stderr.includes("invalid")
                ) {
                  reject(
                    new Error(
                      "PDF appears to be damaged or corrupted. Unable to convert."
                    )
                  );
                  return;
                }
              }

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
