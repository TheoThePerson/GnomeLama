/**
 * Utility for parsing message content to separate text and code blocks,
 * as well as handling markdown formatting
 */

/**
 * Parses a message string to separate text, formatted text, and code blocks.
 * @param {string} text - The text message to parse.
 * @returns {Array} An array of objects with type ('text', 'formatted', or 'code'), content, and formatting info.
 */
export function parseMessageContent(text) {
  // First, handle code blocks
  const codeBlockRegex = /```([a-zA-Z0-9_+-]*)?\n([\s\S]*?)```/g;

  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    // Add text before the code block
    if (match.index > lastIndex) {
      // Process any text that might contain formatting
      const textBeforeCode = text.substring(lastIndex, match.index);
      const formattedParts = parseFormattedText(textBeforeCode);
      parts.push(...formattedParts);
    }

    // Add the code block with language info
    parts.push({
      type: "code",
      content: match[2],
      language: match[1] || "code", // Default to "code" if no language specified
    });

    lastIndex = match.index + match[0].length;
  }

  // Add any remaining text and check for formatting
  if (lastIndex < text.length) {
    const remainingText = text.substring(lastIndex);
    const formattedParts = parseFormattedText(remainingText);
    parts.push(...formattedParts);
  }

  return parts;
}

/**
 * Parse text for markdown formatting (bold and italics)
 * @param {string} text - The text to parse for formatting
 * @returns {Array} Array of formatted and unformatted text parts
 */
function parseFormattedText(text) {
  const parts = [];

  // Bold with ** or __ (stronger match first)
  const boldRegex = /(\*\*|__)(.*?)\1/g;

  // Italic with * or _ (single asterisk/underscore)
  const italicRegex = /(\*|_)(.*?)\1/g;

  // We'll use this to keep track of where we are in the text
  let remaining = text;
  let lastIndex = 0;

  // First pass: Find all bold matches
  let matches = [];
  let boldMatch;
  while ((boldMatch = boldRegex.exec(text)) !== null) {
    matches.push({
      index: boldMatch.index,
      endIndex: boldMatch.index + boldMatch[0].length,
      content: boldMatch[2],
      type: "bold",
    });
  }

  // Second pass: Find all italic matches
  let italicMatch;
  while ((italicMatch = italicRegex.exec(text)) !== null) {
    // Check if this italic is inside a bold (we don't want to double-process)
    let isInsideBold = false;
    for (const bold of matches) {
      if (
        italicMatch.index >= bold.index &&
        italicMatch.index + italicMatch[0].length <= bold.endIndex
      ) {
        isInsideBold = true;
        break;
      }
    }

    if (!isInsideBold) {
      matches.push({
        index: italicMatch.index,
        endIndex: italicMatch.index + italicMatch[0].length,
        content: italicMatch[2],
        type: "italic",
      });
    }
  }

  // Sort matches by index to process them in order
  matches.sort((a, b) => a.index - b.index);

  // Process matches and regular text
  lastIndex = 0;
  for (const match of matches) {
    // Add plain text before this formatting
    if (match.index > lastIndex) {
      parts.push({
        type: "text",
        content: text.substring(lastIndex, match.index),
      });
    }

    // Add the formatted text
    parts.push({
      type: "formatted",
      content: match.content,
      format: match.type,
    });

    lastIndex = match.endIndex;
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
