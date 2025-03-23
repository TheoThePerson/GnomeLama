/**
 * Utility functions for document converters
 */
import Gio from "gi://Gio";

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
                      const [, retryStdout] =
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
