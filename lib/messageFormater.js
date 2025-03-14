/**
 * Utility for parsing message content to separate text and code blocks,
 * as well as handling markdown formatting
 */

const REGEX = {
  codeBlock: /```([a-zA-Z0-9_+-]*)?\n([\s\S]*?)```/g,
  bold: /(\*\*|__)(.*?)\1/g,
  italic: /(\*|_)(.*?)\1/g,
};

/**
 * Parses a message string to separate text, formatted text, and code blocks.
 * @param {string} text - The text message to parse.
 * @returns {Array} An array of objects with type ('text', 'formatted', or 'code'), content, and formatting info.
 */
export function parseMessageContent(text) {
  if (!text) return [];

  // Extract code blocks first while preserving order
  const { parts, textSegments } = extractCodeBlocks(text);

  // Create a new array to hold all final parts in correct order
  const finalParts = [...parts];

  // Process text segments for formatting and insert at their original positions
  textSegments.forEach((segment) => {
    const formattedParts = parseFormattedText(segment.text);
    // Replace the placeholder with the actual formatted parts
    finalParts.splice(segment.index, 1, ...formattedParts);
  });

  return finalParts;
}

/**
 * Extract code blocks from text
 * @param {string} text - Text to parse
 * @returns {Object} Object with code blocks and remaining text segments
 */
function extractCodeBlocks(text) {
  const parts = [];
  const textSegments = [];
  let match;

  // Reset regex lastIndex to ensure consistent behavior
  REGEX.codeBlock.lastIndex = 0;

  // Store matches and indices first to preserve order
  const matches = [];
  while ((match = REGEX.codeBlock.exec(text)) !== null) {
    matches.push({
      index: match.index,
      length: match[0].length,
      content: match[2],
      language: match[1],
    });
  }

  // If no code blocks, just return the text
  if (matches.length === 0) {
    parts.push({ type: "placeholder", index: 0 });
    textSegments.push({
      text: text,
      index: 0,
    });
    return { parts, textSegments };
  }

  // Initialize with text before first match if any
  let lastEnd = 0;

  // Process all matches in order
  matches.forEach((currentMatch) => {
    // Add text before this code block (if any)
    if (currentMatch.index > lastEnd) {
      parts.push({ type: "placeholder", index: parts.length });
      textSegments.push({
        text: text.substring(lastEnd, currentMatch.index),
        index: parts.length - 1,
      });
    }

    // Add the code block
    parts.push(createCodePart(currentMatch.content, currentMatch.language));

    // Update lastEnd to after this code block
    lastEnd = currentMatch.index + currentMatch.length;
  });

  // Add any remaining text after the last code block
  if (lastEnd < text.length) {
    parts.push({ type: "placeholder", index: parts.length });
    textSegments.push({
      text: text.substring(lastEnd),
      index: parts.length - 1,
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
