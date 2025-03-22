/**
 * Global error handling for the extension
 * Provides consistent error logging and user-friendly error messages
 */

/**
 * Error types used in the extension
 * @enum {string}
 */
export const ErrorType = {
  NETWORK: "network",
  API: "api",
  AUTHENTICATION: "auth",
  UNKNOWN: "unknown",
  MODEL: "model",
  FILE: "file",
  UI: "ui",
};

/**
 * Format and log an error message
 * @param {string} context - Where the error occurred
 * @param {string} message - Error message
 * @param {Error|null} error - Original error object (optional)
 * @param {ErrorType} type - Type of error from ErrorType enum
 */
export function logError(
  context,
  message,
  error = null,
  type = ErrorType.UNKNOWN
) {
  const timestamp = new Date().toISOString();
  const errorDetails = error
    ? `\n${error.stack || error.message || "No stack trace available"}`
    : "";

  console.error(
    `[${timestamp}] [${type.toUpperCase()}] [${context}] ${message}${errorDetails}`
  );
}

/**
 * Get a user-friendly error message based on error type
 * @param {ErrorType} type - Type of error
 * @param {string} context - Where the error occurred
 * @returns {string} User-friendly error message
 */
export function getFriendlyErrorMessage(type, context) {
  switch (type) {
    case ErrorType.NETWORK:
      return "Network connection error. Please check your internet connection.";

    case ErrorType.API:
      return `API communication error in ${context}. Please try again later.`;

    case ErrorType.AUTHENTICATION:
      return "Authentication error. Please check your API key in settings.";

    case ErrorType.MODEL:
      return "Model error. The selected AI model may be unavailable.";

    case ErrorType.FILE:
      return "File operation error. The file may be invalid or inaccessible.";

    case ErrorType.UI:
      return "UI error. Please try restarting the extension.";

    default:
      return `An unexpected error occurred in ${context}. Please try again.`;
  }
}

/**
 * Create a user-friendly error message
 * @param {string} context - Where the error occurred
 * @param {string} technicalDetails - Technical details of the error
 * @param {ErrorType} type - Type of error
 * @returns {string} Complete error message for display
 */
export function createErrorMessage(
  context,
  technicalDetails,
  type = ErrorType.UNKNOWN
) {
  const friendlyMessage = getFriendlyErrorMessage(type, context);
  return `${friendlyMessage}\n\nDetails: ${technicalDetails}`;
}

/**
 * Handle an error by logging it and returning a user-friendly message
 * @param {string} context - Where the error occurred
 * @param {string} message - Error message
 * @param {Error|null} error - Original error object
 * @param {ErrorType} type - Type of error
 * @returns {string} User-friendly error message
 */
export function handleError(
  context,
  message,
  error = null,
  type = ErrorType.UNKNOWN
) {
  logError(context, message, error, type);
  return createErrorMessage(context, error?.message || message, type);
}
