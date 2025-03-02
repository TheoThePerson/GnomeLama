/**
 * Utility for parsing message content to separate text and code blocks
 */

/**
 * Parses a message string to separate text and code blocks.
 * @param {string} text - The text message to parse.
 * @returns {Array} An array of objects with type ('text' or 'code') and content.
 */
export function parseMessageContent(text) {
  const codeBlockRegex = /```bash\n([\s\S]*?)```/g;
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

    // Add the code block
    parts.push({
      type: "code",
      content: match[1],
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
