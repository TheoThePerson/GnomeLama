/**
 * Content extraction utilities for different API providers
 */

/**
 * Extracts content from OpenAI API response chunks
 * @param {Object} json - OpenAI response JSON
 * @returns {string|null} Content text or null
 */
export function extractOpenAIContent(json) {
  // Process an SSE message from OpenAI
  if (json.choices && json.choices.length > 0) {
    const delta = json.choices[0].delta;
    if (delta && delta.content) {
      return delta.content;
    }
  }
  
  // Check for errors in the response
  if (json.error) {
    console.error("OpenAI API error:", json.error);
    return json.error.message || "Error from OpenAI API";
  }
  
  return null;
}

/**
 * Extracts content from Ollama API response chunks
 * @param {Object} json - Ollama response JSON
 * @param {Function} [contextCallback] - Callback for context updates
 * @returns {string|null} Content text or null
 */
export function extractOllamaContent(json, contextCallback = null) {
  if (json.context && contextCallback) {
    contextCallback(json.context);
  }
  
  if (json.response) {
    return json.response;
  }
  
  return null;
} 