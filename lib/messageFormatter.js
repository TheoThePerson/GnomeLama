/**
 * Message content parser for text and code blocks
 */

// Regular expressions for parsing
const REGEX = {
  // Code blocks need to be processed first to avoid conflicts with other patterns
  codeBlock: /```([a-zA-Z0-9_+-]*)?\n([\s\S]*?)```/g,
  // Block-level elements need careful handling with multiline matching
  blockquote: /^>\s+(.*?)$/gm,
  orderedList: /^(\d+\.)\s+(.*?)$/gm,
  unorderedList: /^([-*+])\s+(.*?)$/gm,
  heading: /^(#{1,6})\s+(.*?)$/gm,
  // Horizontal rule needs specific pattern to avoid matching partial rules
  horizontalRule: /^(?:[-*_]){3,}$/gm,
  // Patterns for thinking sections that should be hidden
  thinkingSection: /<think>[\s\S]*?<\/think>/g,
  thinkingOpenTag: /<think>/g,
  thinkingCloseTag: /<\/think>/g,
  thinkingSingleTag: /<thinking>/g,
  thinkingPrefix: /^thinking:.*$/gm,
};

// For storing the thinking-free content from the previous update
// This helps prevent flickering during streaming updates
let previousCleanContent = "";

export function parseMessageContent(text) {
  if (!text) return [];

  // Normalize line endings
  text = text.replace(/\r\n/g, "\n");

  // FIRST PASS: Quick detection of thinking indicators
  const hasThinkingStartTag =
    text.includes("<think>") || text.includes("<thinking>");
  const hasThinkingPrefix = text.match(/^thinking:/m) !== null;

  // If we detect thinking at all, we need to be more aggressive with filtering
  if (hasThinkingStartTag || hasThinkingPrefix) {
    // Apply multi-layer filtering to ensure all thinking content is removed

    // Layer 1: Remove complete thinking sections
    let cleanedText = text.replace(REGEX.thinkingSection, "");

    // Layer 2: Remove everything after a thinking tag
    // This is key to preventing brief flashes of thinking content during streaming
    const removeEverythingAfterPattern = (text, pattern) => {
      const index = text.indexOf(pattern);
      if (index !== -1) {
        return text.substring(0, index);
      }
      return text;
    };

    cleanedText = removeEverythingAfterPattern(cleanedText, "<think>");
    cleanedText = removeEverythingAfterPattern(cleanedText, "<thinking>");

    // Layer 3: Remove lines with thinking prefix
    cleanedText = cleanedText.replace(REGEX.thinkingPrefix, "");

    // Clean up any resulting empty lines or excessive spacing
    cleanedText = cleanedText.replace(/\n{3,}/g, "\n\n").trim();

    // If there's nothing left after removing thinking content
    if (!cleanedText) {
      // Store empty content as the latest clean content
      previousCleanContent = "";

      // Just show thinking indicator
      return [
        {
          type: "text",
          content: "thinking...",
        },
      ];
    }

    // We have real content - store it as the latest clean content
    previousCleanContent = cleanedText;

    // Use this clean content for further processing
    text = cleanedText;
  } else if (previousCleanContent && text.includes(previousCleanContent)) {
    // If current text contains our previously cleaned content,
    // only use the previously cleaned content to avoid flashes of thinking text
    // This handles the case where thinking text appears after real content
    text = previousCleanContent;
  }

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
 */
function findInlineFormattingMatches(text) {
  const matches = [];

  // No more inline formatting to process

  return matches;
}

function findMatches(text, regex, type, matches, existingMatches = []) {
  regex.lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Handle different types of matches
    matches.push({
      index: match.index,
      endIndex: match.index + match[0].length,
      content: match[2], // The content is in the second capture group
      type: type,
    });
  }
}

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
