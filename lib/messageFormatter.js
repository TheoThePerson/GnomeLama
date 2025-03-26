/**
 * Message content parser for text and code blocks
 */

// Regular expressions for parsing
const REGEX = {
  // Code blocks need to be processed first to avoid conflicts with other patterns
  codeBlock: /```([a-zA-Z0-9_+-]*)?\n([\s\S]*?)```/gu,
  // Block-level elements need careful handling with multiline matching
  blockquote: /^>\s+(.*?)$/gmu,
  orderedList: /^(\d+\.)\s+(.*?)$/gmu,
  unorderedList: /^([-*+])\s+(.*?)$/gmu,
  heading: /^(#{1,6})\s+(.*?)$/gmu,
  // Horizontal rule needs specific pattern to avoid matching partial rules
  horizontalRule: /^(?:[-*_]){3,}$/gmu,
  // Patterns for thinking sections that should be hidden
  thinkingSection: /<think>[\s\S]*?<\/think>/gu,
  thinkingOpenTag: /<think>/gu,
  thinkingCloseTag: /<\/think>/gu,
  thinkingSingleTag: /<thinking>/gu,
  thinkingPrefix: /^thinking:.*$/gmu,
};

// For storing the thinking-free content from the previous update
// This helps prevent flickering during streaming updates
let previousCleanContent = "";

/**
 * Process and remove thinking content from message
 * @param {string} textContent - The message text to clean
 * @returns {string} Cleaned content with thinking sections removed
 */
function removeThinkingContent(textContent) {
  // Layer 1: Remove complete thinking sections
  let cleanedText = textContent.replace(REGEX.thinkingSection, "");

  // Layer 2: Remove everything after a thinking tag
  const removeEverythingAfterPattern = (content, pattern) => {
    const index = content.indexOf(pattern);
    if (index !== -1) {
      return content.substring(0, index);
    }
    return content;
  };

  cleanedText = removeEverythingAfterPattern(cleanedText, "<think>");
  cleanedText = removeEverythingAfterPattern(cleanedText, "<thinking>");

  // Layer 3: Remove lines with thinking prefix
  cleanedText = cleanedText.replace(REGEX.thinkingPrefix, "");

  // Clean up any resulting empty lines or excessive spacing
  return cleanedText.replace(/\n{3,}/gu, "\n\n").trim();
}

/**
 * Process code blocks in message content
 * @param {string} text - Text to process
 * @returns {Object} Result containing processed parts and lastIndex
 */
function processCodeBlocks(text) {
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
      parts.push({
        type: "text",
        content: textBefore,
      });
    }

    // Add the code block
    parts.push({
      type: "code",
      content: match[2],
      language: match[1] || "code",
    });

    lastIndex = match.index + match[0].length;
  }

  return { parts, lastIndex };
}

/**
 * Parses message content into structured format with support for markdown elements
 * @param {string} text - The message text to parse
 * @returns {Array} Array of parsed content blocks
 */
export function parseMessageContent(text) {
  if (!text) return [];

  // Normalize line endings
  text = text.replace(/\r\n/gu, "\n");

  // FIRST PASS: Quick detection of thinking indicators
  const hasThinkingStartTag =
    text.includes("<think>") || text.includes("<thinking>");
  const hasThinkingPrefix = text.match(/^thinking:/mu) !== null;

  // If we detect thinking at all, we need to be more aggressive with filtering
  if (hasThinkingStartTag || hasThinkingPrefix) {
    // Apply multi-layer filtering to ensure all thinking content is removed
    const cleanedText = removeThinkingContent(text);

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

  // Process code blocks
  const { parts, lastIndex } = processCodeBlocks(text);

  // Add remaining text if any
  if (lastIndex < text.length) {
    const remainingText = text.substring(lastIndex);
    parts.push(...parseTextWithMarkdown(remainingText));
  }

  return parts;
}

/**
 * Process text buffer into a text part and reset the buffer
 * @param {string} buffer - Text buffer to process
 * @param {Array} resultParts - Array to add the processed part to
 * @returns {string} Empty string (reset buffer)
 */
function processTextBuffer(buffer, resultParts) {
  if (buffer) {
    resultParts.push({
      type: "text",
      content: buffer,
    });
  }
  return "";
}

/**
 * Process headings in markdown text
 * @param {string} line - Current line to process
 * @param {string} textBuffer - Accumulated text
 * @param {Array} resultParts - Result array to add parts to
 * @returns {Object} Process result with updated buffer and increment value
 */
function processHeading(line, textBuffer, resultParts) {
  const headingMatch = line.match(/^(#{1,6})\s+(.*?)$/u);
  if (headingMatch) {
    textBuffer = processTextBuffer(textBuffer, resultParts);

    resultParts.push({
      type: "heading",
      content: headingMatch[2],
      level: headingMatch[1].length,
    });
    return { textBuffer, increment: 1 };
  }
  return { textBuffer, increment: 0 };
}

/**
 * Process horizontal rules in markdown text
 * @param {string} line - Current line to process
 * @param {string} textBuffer - Accumulated text
 * @param {Array} resultParts - Result array to add parts to
 * @returns {Object} Process result with updated buffer and increment value
 */
function processHorizontalRule(line, textBuffer, resultParts) {
  if (/^(?:[-*_]){3,}$/u.test(line)) {
    textBuffer = processTextBuffer(textBuffer, resultParts);

    resultParts.push({
      type: "horizontalRule",
    });
    return { textBuffer, increment: 1 };
  }
  return { textBuffer, increment: 0 };
}

/**
 * Process blockquotes in markdown text
 * @param {string} line - Current line to process
 * @param {Object} context - Processing context
 * @returns {Object} Process result with updated buffer and new index
 */
function processBlockquote(line, context) {
  const { textBuffer, resultParts, lines, currentIndex } = context;

  if (line.startsWith("> ")) {
    const cleanBuffer = processTextBuffer(textBuffer, resultParts);

    let quoteContent = line.substring(2);
    let j = currentIndex + 1;

    // Collect multi-line blockquotes
    while (j < lines.length && lines[j].startsWith("> ")) {
      quoteContent += "\n" + lines[j].substring(2);
      j++;
    }

    resultParts.push({
      type: "blockquote",
      content: quoteContent,
    });

    return { textBuffer: cleanBuffer, newIndex: j };
  }
  return { textBuffer, newIndex: currentIndex };
}

/**
 * Process ordered lists in markdown text
 * @param {string} line - Current line to process
 * @param {Object} context - Processing context
 * @returns {Object} Process result with updated buffer and new index
 */
function processOrderedList(line, context) {
  const { textBuffer, resultParts, lines, currentIndex } = context;

  const orderedListMatch = line.match(/^(\d+\.)\s+(.*?)$/u);
  if (orderedListMatch) {
    const cleanBuffer = processTextBuffer(textBuffer, resultParts);

    const items = [
      {
        prefix: orderedListMatch[1],
        content: orderedListMatch[2],
      },
    ];

    let j = currentIndex + 1;
    while (j < lines.length) {
      const nextMatch = lines[j].match(/^(\d+\.)\s+(.*?)$/u);
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
      items,
    });

    return { textBuffer: cleanBuffer, newIndex: j };
  }
  return { textBuffer, newIndex: currentIndex };
}

/**
 * Process unordered lists in markdown text
 * @param {string} line - Current line to process
 * @param {Object} context - Processing context
 * @returns {Object} Process result with updated buffer and new index
 */
function processUnorderedList(line, context) {
  const { textBuffer, resultParts, lines, currentIndex } = context;

  const unorderedListMatch = line.match(/^([-*+])\s+(.*?)$/u);
  if (unorderedListMatch) {
    const cleanBuffer = processTextBuffer(textBuffer, resultParts);

    const items = [
      {
        prefix: unorderedListMatch[1],
        content: unorderedListMatch[2],
      },
    ];

    let j = currentIndex + 1;
    while (j < lines.length) {
      const nextMatch = lines[j].match(/^([-*+])\s+(.*?)$/u);
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
      items,
    });

    return { textBuffer: cleanBuffer, newIndex: j };
  }
  return { textBuffer, newIndex: currentIndex };
}

/**
 * Process the current line for markdown elements
 * @param {string} line - Current line to process
 * @param {Object} context - Processing context containing textBuffer, resultParts, lines, and currentIndex
 * @returns {Object} Processing result with new textBuffer and index
 */
function processCurrentLine(line, context) {
  const { textBuffer, resultParts, currentIndex } = context;

  // Process headings
  const { textBuffer: headingBuffer, increment } = processHeading(
    line,
    textBuffer,
    resultParts
  );
  if (increment) {
    return { textBuffer: headingBuffer, newIndex: currentIndex + increment };
  }

  // Process horizontal rules
  const { textBuffer: ruleBuffer, increment: ruleIncrement } =
    processHorizontalRule(line, textBuffer, resultParts);
  if (ruleIncrement) {
    return { textBuffer: ruleBuffer, newIndex: currentIndex + ruleIncrement };
  }

  // Process blockquotes, ordered lists, and unordered lists need the lines array
  const { textBuffer: quoteBuffer, newIndex: quoteIndex } = processBlockquote(
    line,
    context
  );
  if (quoteIndex > currentIndex) {
    return { textBuffer: quoteBuffer, newIndex: quoteIndex };
  }

  // Process ordered lists
  const { textBuffer: olBuffer, newIndex: olIndex } = processOrderedList(
    line,
    context
  );
  if (olIndex > currentIndex) {
    return { textBuffer: olBuffer, newIndex: olIndex };
  }

  // Process unordered lists
  const { textBuffer: ulBuffer, newIndex: ulIndex } = processUnorderedList(
    line,
    context
  );
  if (ulIndex > currentIndex) {
    return { textBuffer: ulBuffer, newIndex: ulIndex };
  }

  // If not a block element, accumulate text into buffer
  if (textBuffer) {
    return { textBuffer: textBuffer + "\n" + line, newIndex: currentIndex + 1 };
  }

  return { textBuffer: line, newIndex: currentIndex + 1 };
}

/**
 * Parse text with both block and inline markdown elements, preserving order
 * @param {string} text - Text to parse for markdown elements
 * @returns {Array} Array of parsed content blocks
 */
function parseTextWithMarkdown(text) {
  // Split into lines to process line-by-line for block elements
  const lines = text.split("\n");
  const resultParts = [];

  let i = 0;
  let textBuffer = "";

  while (i < lines.length) {
    const line = lines[i];
    const context = { textBuffer, resultParts, lines, currentIndex: i };
    const { textBuffer: newBuffer, newIndex } = processCurrentLine(
      line,
      context
    );
    textBuffer = newBuffer;
    i = newIndex;
  }

  // Process any remaining text buffer
  processTextBuffer(textBuffer, resultParts);

  return resultParts;
}
