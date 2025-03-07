/**
 * Utility for parsing message content to separate text and code blocks,
 * as well as handling markdown formatting
 */

// ========================================
// Regular Expressions
// ========================================
const REGEX = {
  codeBlock: /```([a-zA-Z0-9_+-]*)?\n([\s\S]*?)```/g,
  bold: /(\*\*|__)(.*?)\1/g,
  italic: /(\*|_)(.*?)\1/g,
};

// ========================================
// Public API
// ========================================

/**
 * Parses a message string to separate text, formatted text, and code blocks.
 * @param {string} text - The text message to parse.
 * @returns {Array} An array of objects with type ('text', 'formatted', or 'code'), content, and formatting info.
 */
export function parseMessageContent(text) {
  if (!text) return [];

  // Extract code blocks first
  const { parts, textSegments } = extractCodeBlocks(text);

  // Process text segments for formatting
  textSegments.forEach((segment) => {
    const formattedParts = parseFormattedText(segment.text);
    parts.splice(segment.index, 0, ...formattedParts);
  });

  return parts;
}

// ========================================
// Code Block Processing
// ========================================

/**
 * Extract code blocks from text
 * @param {string} text - Text to parse
 * @returns {Object} Object with code blocks and remaining text segments
 */
function extractCodeBlocks(text) {
  const parts = [];
  const textSegments = [];
  let lastIndex = 0;
  let match;

  // Find all code blocks
  while ((match = REGEX.codeBlock.exec(text)) !== null) {
    // Add text before the code block to process later
    if (match.index > lastIndex) {
      textSegments.push({
        text: text.substring(lastIndex, match.index),
        index: parts.length,
      });
    }

    // Add the code block
    parts.push(createCodePart(match[2], match[1]));
    lastIndex = match.index + match[0].length;
  }

  // Add any remaining text
  if (lastIndex < text.length) {
    textSegments.push({
      text: text.substring(lastIndex),
      index: parts.length,
    });
  }

  return { parts, textSegments };
}

/**
 * Create a code part object
 * @param {string} content - The code content
 * @param {string} language - The programming language
 * @returns {Object} Code part object
 */
function createCodePart(content, language) {
  return {
    type: "code",
    content: content,
    language: language || "code", // Default to "code" if no language specified
  };
}

// ========================================
// Text Formatting Processing
// ========================================

/**
 * Parse text for markdown formatting (bold and italics)
 * @param {string} text - The text to parse for formatting
 * @returns {Array} Array of formatted and unformatted text parts
 */
function parseFormattedText(text) {
  // Find all formatting matches
  const matches = findFormattingMatches(text);

  // Process matches into a series of text and formatted parts
  return processFormattingMatches(text, matches);
}

/**
 * Find all formatting matches (bold and italic) in text
 * @param {string} text - Text to search
 * @returns {Array} Formatting matches with position and type
 */
function findFormattingMatches(text) {
  const matches = [];

  // Find all bold matches
  findBoldMatches(text, matches);

  // Find all italic matches that aren't inside bold text
  findItalicMatches(text, matches);

  // Sort matches by index to process them in order
  matches.sort((a, b) => a.index - b.index);

  return matches;
}

/**
 * Find bold text formatting matches
 * @param {string} text - Text to search
 * @param {Array} matches - Array to add matches to
 */
function findBoldMatches(text, matches) {
  let boldMatch;
  while ((boldMatch = REGEX.bold.exec(text)) !== null) {
    matches.push({
      index: boldMatch.index,
      endIndex: boldMatch.index + boldMatch[0].length,
      content: boldMatch[2],
      type: "bold",
    });
  }
}

/**
 * Find italic text formatting matches
 * @param {string} text - Text to search
 * @param {Array} matches - Array to add matches to
 */
function findItalicMatches(text, matches) {
  let italicMatch;
  while ((italicMatch = REGEX.italic.exec(text)) !== null) {
    // Check if this italic is inside a bold (we don't want to double-process)
    if (!isInsideExistingMatch(italicMatch, matches)) {
      matches.push({
        index: italicMatch.index,
        endIndex: italicMatch.index + italicMatch[0].length,
        content: italicMatch[2],
        type: "italic",
      });
    }
  }
}

/**
 * Check if a match is inside an existing match
 * @param {Object} match - Match to check
 * @param {Array} existingMatches - Existing matches to check against
 * @returns {boolean} True if match is inside existing match
 */
function isInsideExistingMatch(match, existingMatches) {
  const matchStart = match.index;
  const matchEnd = match.index + match[0].length;

  return existingMatches.some(
    (existing) => matchStart >= existing.index && matchEnd <= existing.endIndex
  );
}

/**
 * Process formatting matches into text parts
 * @param {string} text - Original text
 * @param {Array} matches - Formatting matches
 * @returns {Array} Array of text parts
 */
function processFormattingMatches(text, matches) {
  const parts = [];
  let lastIndex = 0;

  // Process each match in order
  for (const match of matches) {
    // Add plain text before this formatting
    if (match.index > lastIndex) {
      parts.push(createTextPart(text.substring(lastIndex, match.index)));
    }

    // Add the formatted text
    parts.push(createFormattedPart(match.content, match.type));
    lastIndex = match.endIndex;
  }

  // Add any remaining text
  if (lastIndex < text.length) {
    parts.push(createTextPart(text.substring(lastIndex)));
  }

  return parts;
}

/**
 * Create a text part object
 * @param {string} content - Text content
 * @returns {Object} Text part object
 */
function createTextPart(content) {
  return {
    type: "text",
    content: content,
  };
}

/**
 * Create a formatted text part object
 * @param {string} content - Text content
 * @param {string} format - Format type (bold or italic)
 * @returns {Object} Formatted text part object
 */
function createFormattedPart(content, format) {
  return {
    type: "formatted",
    content: content,
    format: format,
  };
}
