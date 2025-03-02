/**
 * Utility for parsing message content to separate text and code blocks
 */

/**
 * Parses a message string to separate text and code blocks.
 * @param {string} text - The text message to parse.
 * @returns {Array} An array of objects with type ('text' or 'code'), content, and language (for code blocks).
 */
export function parseMessageContent(text) {
  // Enhanced regex to capture language identifier
  const codeBlockRegex = /```([a-zA-Z0-9_+-]*)?\n([\s\S]*?)```/g;

  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    // Add text before the code block
    if (match.index > lastIndex) {
      parts.push({
        type: "text",
        content: text.substring(lastIndex, match.index),
      });
    }

    // Add the code block with language info
    parts.push({
      type: "code",
      content: match[2],
      language: match[1] || "code", // Default to "code" if no language specified
    });

    lastIndex = match.index + match[0].length;
  }

  // Add any remaining text
  if (lastIndex < text.length) {
    parts.push({
      type: "text",
      content: text.substring(lastIndex),
    });
  }

  return parts;
}
