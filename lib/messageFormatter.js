/**
 * Message content parser for text and code blocks
 */

// Regular expressions for parsing
const REGEX = {
  codeBlock: /```([a-zA-Z0-9_+-]*)?\n([\s\S]*?)```/g,
  bold: /(\*\*|__)(.*?)\1/g,
  italic: /(\*|_)(.*?)\1/g,
};

export function parseMessageContent(text) {
  if (!text) return [];

  const parts = [];
  let lastIndex = 0;
  let match;

  // Reset regex lastIndex
  REGEX.codeBlock.lastIndex = 0;

  // Find and process code blocks
  while ((match = REGEX.codeBlock.exec(text)) !== null) {
    // Add text before code block if any
    if (match.index > lastIndex) {
      const textBefore = text.substring(lastIndex, match.index);
      parts.push(...parseFormattedText(textBefore));
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
    parts.push(...parseFormattedText(remainingText));
  }

  return parts;
}

function parseFormattedText(text) {
  const matches = findFormattingMatches(text);

  // Process matches into parts
  return processFormattingMatches(text, matches);
}

function findFormattingMatches(text) {
  const matches = [];

  // Find all bold and italic matches
  findMatches(text, REGEX.bold, "bold", matches);
  findMatches(text, REGEX.italic, "italic", matches, matches);

  // Sort matches by position
  return matches.sort((a, b) => a.index - b.index);
}

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

    matches.push({
      index: match.index,
      endIndex: match.index + match[0].length,
      content: match[2],
      type: type,
    });
  }
}

function isInsideExistingMatch(match, existingMatches) {
  const matchStart = match.index;
  const matchEnd = match.index + match[0].length;

  return existingMatches.some(
    (existing) => matchStart >= existing.index && matchEnd <= existing.endIndex
  );
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
