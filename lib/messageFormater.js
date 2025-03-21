/**
 * DEPRECATED: Use messageFormatter.js (with two 't's) instead.
 *
 * Utility for parsing message content to separate text and code blocks,
 * as well as handling markdown formatting
 */

const REGEX = {
  // Code blocks need to be processed first to avoid conflicts with other patterns
  codeBlock: /```([a-zA-Z0-9_+-]*)?\n([\s\S]*?)```/g,
  // Inline code needs non-greedy matching to avoid spanning multiple code segments
  inlineCode: /`([^`]+?)`/g,
  // Text formatting with simpler patterns
  bold: /(\*\*|__)([\s\S]*?)\1/g,
  italic: /(\*|_)([\s\S]*?)\1/g,
  // Block-level elements need careful handling with multiline matching
  blockquote: /^>\s+(.*?)$/gm,
  orderedList: /^(\d+\.)\s+(.*?)$/gm,
  unorderedList: /^([-*+])\s+(.*?)$/gm,
  heading: /^(#{1,6})\s+(.*?)$/gm,
  // Inline elements with URLs
  link: /\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)/g,
  image: /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)/g,
  // Horizontal rule needs specific pattern to avoid matching partial rules
  horizontalRule: /^(?:[-*_]){3,}$/gm,
};

/**
 * Parses a message string to separate text, formatted text, and code blocks.
 * @param {string} text - The text message to parse.
 * @returns {Array} An array of objects with type ('text', 'formatted', or 'code'), content, and formatting info.
 */
export function parseMessageContent(text) {
  if (!text) return [];

  // Normalize line endings
  text = text.replace(/\r\n/g, "\n");

  const parts = [];
  let lastIndex = 0;
  let match;

  // Reset regex lastIndex
  REGEX.codeBlock.lastIndex = 0;

  // Find and process code blocks first
  while ((match = REGEX.codeBlock.exec(text)) !== null) {
    // Add text before code block if any
    if (match.index > lastIndex) {
      const textBefore = text.substring(lastIndex, match.index);
      parts.push(...parseTextWithMarkdown(textBefore));
    }

    // Add the code block
    parts.push({
      type: "code",
      content: match[2],
      language: match[1] || "code",
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text if any
  if (lastIndex < text.length) {
    const remainingText = text.substring(lastIndex);
    parts.push(...parseTextWithMarkdown(remainingText));
  }

  return parts;
}

/**
 * Parse text with both block and inline markdown elements, preserving order
 */
function parseTextWithMarkdown(text) {
  // Split into lines to process line-by-line for block elements
  const lines = text.split("\n");
  const resultParts = [];

  let i = 0;
  let textBuffer = "";

  while (i < lines.length) {
    const line = lines[i];

    // Check for headings - single line elements
    const headingMatch = line.match(/^(#{1,6})\s+(.*?)$/);
    if (headingMatch) {
      // Process any accumulated text buffer before adding heading
      if (textBuffer) {
        const formattedParts = processInlineFormatting(textBuffer);
        resultParts.push(...formattedParts);
        textBuffer = "";
      }

      resultParts.push({
        type: "heading",
        content: headingMatch[2],
        level: headingMatch[1].length,
      });
      i++;
      continue;
    }

    // Check for horizontal rule - single line elements
    if (/^(?:[-*_]){3,}$/.test(line)) {
      // Process any accumulated text buffer before adding horizontal rule
      if (textBuffer) {
        const formattedParts = processInlineFormatting(textBuffer);
        resultParts.push(...formattedParts);
        textBuffer = "";
      }

      resultParts.push({
        type: "horizontalRule",
      });
      i++;
      continue;
    }

    // Check for blockquotes - can span multiple lines
    if (line.startsWith("> ")) {
      // Process any accumulated text buffer before adding blockquote
      if (textBuffer) {
        const formattedParts = processInlineFormatting(textBuffer);
        resultParts.push(...formattedParts);
        textBuffer = "";
      }

      let quoteContent = line.substring(2);
      let j = i + 1;

      // Collect multi-line blockquotes
      while (j < lines.length && lines[j].startsWith("> ")) {
        quoteContent += "\n" + lines[j].substring(2);
        j++;
      }

      resultParts.push({
        type: "blockquote",
        content: quoteContent,
      });

      i = j;
      continue;
    }

    // Check for ordered lists - can span multiple lines
    const orderedListMatch = line.match(/^(\d+\.)\s+(.*?)$/);
    if (orderedListMatch) {
      // Process any accumulated text buffer before adding list
      if (textBuffer) {
        const formattedParts = processInlineFormatting(textBuffer);
        resultParts.push(...formattedParts);
        textBuffer = "";
      }

      let items = [
        {
          prefix: orderedListMatch[1],
          content: orderedListMatch[2],
        },
      ];

      let j = i + 1;
      while (j < lines.length) {
        const nextMatch = lines[j].match(/^(\d+\.)\s+(.*?)$/);
        if (nextMatch) {
          items.push({
            prefix: nextMatch[1],
            content: nextMatch[2],
          });
          j++;
        } else {
          break;
        }
      }

      resultParts.push({
        type: "orderedList",
        items: items,
      });

      i = j;
      continue;
    }

    // Check for unordered lists - can span multiple lines
    const unorderedListMatch = line.match(/^([-*+])\s+(.*?)$/);
    if (unorderedListMatch) {
      // Process any accumulated text buffer before adding list
      if (textBuffer) {
        const formattedParts = processInlineFormatting(textBuffer);
        resultParts.push(...formattedParts);
        textBuffer = "";
      }

      let items = [
        {
          prefix: unorderedListMatch[1],
          content: unorderedListMatch[2],
        },
      ];

      let j = i + 1;
      while (j < lines.length) {
        const nextMatch = lines[j].match(/^([-*+])\s+(.*?)$/);
        if (nextMatch) {
          items.push({
            prefix: nextMatch[1],
            content: nextMatch[2],
          });
          j++;
        } else {
          break;
        }
      }

      resultParts.push({
        type: "unorderedList",
        items: items,
      });

      i = j;
      continue;
    }

    // If not a block element, accumulate text into buffer
    if (textBuffer) {
      textBuffer += "\n" + line;
    } else {
      textBuffer = line;
    }

    i++;
  }

  // Process any remaining text buffer
  if (textBuffer) {
    const formattedParts = processInlineFormatting(textBuffer);
    resultParts.push(...formattedParts);
  }

  return resultParts;
}

/**
 * Process text for inline formatting only (bold, italic, links, etc.)
 */
function processInlineFormatting(text) {
  // Find all inline formatting matches in the text
  const matches = findInlineFormattingMatches(text);

  // Process the matches to create formatted parts
  return processFormattingMatches(text, matches);
}

/**
 * Find inline formatting matches in text
 * @param {string} text - Text to search
 * @returns {Array} Formatting matches with position and type
 */
function findInlineFormattingMatches(text) {
  const matches = [];

  // Process inline formatting in this specific order for better nesting handling
  findMatches(text, REGEX.bold, "bold", matches, matches);
  findMatches(text, REGEX.italic, "italic", matches, matches);

  // Sort matches by position
  return matches.sort((a, b) => a.index - b.index);
}

/**
 * Find all matches of a given regex in text
 * @param {string} text - Text to search
 * @param {RegExp} regex - Regex to find matches
 * @param {string} type - Type of match
 * @param {Array} matches - Array to add matches to
 * @param {Array} existingMatches - Array of existing matches to skip if found inside
 */
function findMatches(text, regex, type, matches, existingMatches = []) {
  regex.lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Skip if this match is inside an existing match (for italic inside bold)
    if (
      existingMatches.length &&
      isInsideExistingMatch(match, existingMatches)
    ) {
      continue;
    }

    // Handle different types of matches
    if (type === "link") {
      matches.push({
        index: match.index,
        endIndex: match.index + match[0].length,
        content: match[1],
        url: match[2],
        title: match[3],
        type: type,
      });
    } else if (type === "image") {
      matches.push({
        index: match.index,
        endIndex: match.index + match[0].length,
        alt: match[1],
        url: match[2],
        title: match[3],
        type: type,
      });
    } else if (type === "bold" || type === "italic") {
      // For text formatting, we need to extract the content inside the delimiters
      matches.push({
        index: match.index,
        endIndex: match.index + match[0].length,
        content: match[2], // The content is in the second capture group
        type: type,
      });
    } else {
      matches.push({
        index: match.index,
        endIndex: match.index + match[0].length,
        content: match[1] || match[2], // Use the correct capture group based on regex
        type: type,
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

  for (const match of matches) {
    // Add plain text before this formatting
    if (match.index > lastIndex) {
      parts.push({
        type: "text",
        content: text.substring(lastIndex, match.index),
      });
    }

    // Add the formatted text based on type
    if (match.type === "link") {
      parts.push({
        type: "link",
        content: match.content,
        url: match.url,
        title: match.title,
      });
    } else if (match.type === "image") {
      parts.push({
        type: "image",
        alt: match.alt,
        url: match.url,
        title: match.title,
      });
    } else {
      parts.push({
        type: match.type === "inlineCode" ? "inlineCode" : "formatted",
        content: match.content,
        format: match.type !== "inlineCode" ? match.type : undefined,
      });
    }

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
