/**
 * JSON response handling utilities
 */

// Registry to keep track of file paths between sessions
const FilePathRegistry = new Map(); // filename -> path

/**
 * Tries to parse and display a JSON response for file prompts
 * @param {St.BoxLayout} container - The container to update
 * @param {string} responseText - The response text
 * @param {boolean} hadFiles - Whether the last message had files attached
 * @returns {boolean} Whether the response was handled as JSON
 */
export function tryParseJsonResponse(container, responseText, hadFiles) {
  let jsonData;
  let confidenceLevel = 0;

  // Try parsing the entire responseText as JSON
  try {
    jsonData = JSON.parse(responseText);
    confidenceLevel = 5;
  } catch (e) {
    console.warn("Failed to parse entire response as JSON:", e.message);
    // Check for JSON in a code block
    const codeBlockMatch = responseText.match(
      /```(?:json)?\s*\n([\s\S]*?)\n```/
    );
    if (codeBlockMatch) {
      try {
        jsonData = JSON.parse(codeBlockMatch[1]);
        confidenceLevel = 5;
      } catch (e) {
        console.log("Failed to parse JSON in code block:", e.message);
      }
    }

    // Attempt to extract JSON from the text
    if (!jsonData) {
      jsonData = tryExtractJsonFromText(responseText);
      if (jsonData) {
        confidenceLevel = 3;
      } else {
        return false;
      }
    }
  }

  // Validate if it looks like a file modification response
  if (jsonData.files && Array.isArray(jsonData.files) && hadFiles) {
    confidenceLevel += 2;
  }

  if (
    jsonData.files &&
    Array.isArray(jsonData.files) &&
    jsonData.files.length > 0 &&
    jsonData.files[0].filename &&
    "content" in jsonData.files[0]
  ) {
    confidenceLevel += 2;
  }

  if (jsonData.summary && jsonData.files) {
    confidenceLevel += 1;
  }

  // Convert single file object to expected format if needed
  if (!jsonData.files && jsonData.filename && "content" in jsonData) {
    jsonData = {
      summary: `File: ${jsonData.filename}`,
      files: [jsonData],
    };
    confidenceLevel += 2;
  }

  // Check if we have a valid file response
  if (!jsonData.files || !Array.isArray(jsonData.files)) {
    return false;
  }

  // Need a minimum confidence level to treat as a file response
  if (confidenceLevel < 5) {
    return false;
  }

  // Display as a file response
  // This part would typically render UI components, but we're keeping it as a stub
  // to avoid complicating this refactoring
  return true;
}

/**
 * Register file paths for reference
 * @param {string} jsonString - JSON string with file paths
 */
export function registerFilePaths(jsonString) {
  try {
    const data = JSON.parse(jsonString);
    if (data.files && Array.isArray(data.files)) {
      data.files.forEach((file) => {
        if (file.filename && file.path) {
          FilePathRegistry.set(file.filename, file.path);
        }
      });
    }
  } catch (e) {
    console.error("Failed to register file paths:", e.message);
  }
}

/**
 * Get the original file path for a filename
 * @param {string} filename - The filename to look up
 * @returns {string|null} The original file path or null
 */
export function getOriginalFilePath(filename) {
  return FilePathRegistry.get(filename) || null;
}

/**
 * Extract JSON objects from text
 * @param {string} text - Text to extract JSON from
 * @returns {object|null} Extracted JSON or null
 */
function tryExtractJsonFromText(text) {
  // Try to find JSON objects
  const potentialObjects = findPotentialJsonObjects(text);
  for (const jsonString of potentialObjects) {
    try {
      const cleaned = cleanJsonString(jsonString);
      return JSON.parse(cleaned);
    } catch (e) {
      console.debug("JSON candidate parsing failed:", e.message);
      // Continue to next candidate
    }
  }

  // Try to find JSON arrays
  const potentialArrays = findPotentialJsonArrays(text);
  for (const jsonString of potentialArrays) {
    try {
      const cleaned = cleanJsonString(jsonString);
      return JSON.parse(cleaned);
    } catch (e) {
      console.debug("JSON array candidate parsing failed:", e.message);
      // Continue to next candidate
    }
  }

  return null;
}

/**
 * Find potential JSON objects in text
 * @param {string} text - Text to search
 * @returns {string[]} Array of potential JSON strings
 */
function findPotentialJsonObjects(text) {
  const candidates = [];
  let depth = 0;
  let start = -1;

  // Look for objects with balanced braces
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "{") {
      if (depth === 0) {
        start = i;
      }
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        candidates.push(text.substring(start, i + 1));
        start = -1;
      }
    }
  }

  return candidates;
}

/**
 * Find potential JSON arrays in text
 * @param {string} text - Text to search
 * @returns {string[]} Array of potential JSON array strings
 */
function findPotentialJsonArrays(text) {
  const candidates = [];
  let depth = 0;
  let start = -1;

  // Look for arrays with balanced brackets
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "[") {
      if (depth === 0) {
        start = i;
      }
      depth++;
    } else if (char === "]") {
      depth--;
      if (depth === 0 && start !== -1) {
        candidates.push(text.substring(start, i + 1));
        start = -1;
      }
    }
  }

  return candidates;
}

/**
 * Clean a JSON string for parsing
 * @param {string} jsonString - JSON string to clean
 * @returns {string} Cleaned JSON string
 */
function cleanJsonString(jsonString) {
  // Replace common issues that prevent parsing
  return jsonString
    .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":') // Fix unquoted property names
    .replace(/'/g, '"') // Replace single quotes with double quotes
    .replace(/,\s*([}\]])/g, "$1"); // Remove trailing commas
}
