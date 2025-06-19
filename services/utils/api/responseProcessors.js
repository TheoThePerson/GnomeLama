/**
 * Utilities for processing API responses
 */
import { invokeCallback } from "../../apiUtils.js";

/**
 * Creates a basic chunk processor
 * @param {Object} options - Processor options
 * @param {Function} options.onData - Callback for streaming data
 * @param {Function} options.extractContent - Function to extract content from data
 * @param {Function} [options.parseJson=true] - Whether chunks are JSON
 * @returns {Function} Chunk processor function
 */
export function createBasicChunkProcessor(options) {
  const {
    onData,
    extractContent,
    parseJson = true
  } = options;
  
  return async (chunk) => {
      let content;
      
      if (parseJson) {
        const json = JSON.parse(chunk);
        content = extractContent(json);
      } else {
        content = extractContent(chunk);
      }
      
      if (content && onData) {
        await invokeCallback(onData, content);
      }
      
      return content;
  };
}

/**
 * Creates a processor for Server-Sent Events format (used by OpenAI)
 * @param {Object} options - Processor options
 * @param {Function} options.onData - Callback for streaming data
 * @param {Function} options.extractContent - Function to extract content from JSON
 * @param {string} [options.prefix="data: "] - SSE line prefix
 * @param {string} [options.doneMarker="[DONE]"] - SSE done marker
 * @returns {Function} SSE chunk processor
 */
export function createSSEProcessor(options) {
  const {
    onData,
    extractContent,
    prefix = "data: ",
    doneMarker = "[DONE]"
  } = options;
  
  return async (lineText) => {
    // Skip empty lines
    if (!lineText || lineText.trim() === '') {
      return null;
    }
    
    // Skip lines that don't match the SSE format
    if (!lineText.startsWith(prefix)) {
      return null;
    }
    
    // Remove prefix and trim whitespace
    const jsonString = lineText.replace(prefix, "").trim();
    
    // Check for done marker
    if (jsonString === doneMarker) {
      return null;
    }
    
    try {
      const json = JSON.parse(jsonString);
      
      // Check for error objects in the response
      if (json.error) {
        const errorMessage = json.error.message || "Unknown error";
        console.error("API error:", errorMessage);
        
        if (onData) {
          await invokeCallback(onData, `Error: ${errorMessage}`);
        }
        
        return `Error: ${errorMessage}`;
      }
      
      const content = extractContent(json);
      
      if (content && onData) {
        await invokeCallback(onData, content);
      }
      
      return content;
    } catch (error) {
      console.error("Error parsing chunk:", error, "Line:", lineText);
      // unparseable chunks
      return null;
    }
  };
}

/**
 * Process generic result from API
 * @param {Object|string} result - API result
 * @param {Function} [contextCallback] - Optional callback for context 
 * @returns {string} Processed text
 */
export function processGenericResult(result, contextCallback = null) {
  // Check for error object in result
  if (result && result.error) {
    return `Error: ${result.error.message || "Unknown error"}`;
  }
  
  // Handle string results directly
  if (typeof result === "string") {
    return result;
  }
  
  // Extract from object results
  if (result) {
    // Handle context if present and callback provided
    if (result.context && contextCallback) {
      contextCallback(result.context);
    }
    
    // Extract the text content based on common response formats
    if (result.response) {
      return result.response;
    }
    
    if (result.content) {
      return result.content;
    }
    
    if (result.choices && result.choices[0]?.message?.content) {
      return result.choices[0].message.content;
    }
  }
  
  return result || "";
} 