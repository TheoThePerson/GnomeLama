/**
 * Services for communicating with the AI backend
 */
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import { getSettings } from "../lib/settings.js";

let conversationHistory = [];
let currentModel = null;

/**
 * Sets the current AI model
 * @param {string} modelName - Name of the model to use
 */
export function setModel(modelName) {
  currentModel = modelName;
  // Save as the default model in settings
  const settings = getSettings();
  settings.set_string("default-model", modelName);
}

/**
 * Fetches model names from the API and outputs them in a sorted list format.
 * @returns {Promise<string[]>} Array of available model names
 */
export async function fetchModelNames() {
  try {
    const jsonData = await _executeCommand([
      "curl",
      "-s",
      "http://localhost:11434/api/tags",
    ]);

    // Parse JSON and extract model names
    const data = JSON.parse(jsonData);
    const modelNames = data.models
      .map((model) => model.name)
      .filter((value, index, self) => self.indexOf(value) === index)
      .sort();

    console.log("Available Models:", modelNames);
    return modelNames;
  } catch (e) {
    console.error("Error fetching model names:", e);
    return [];
  }
}

/**
 * Gets the current conversation history
 * @returns {Array} The conversation history
 */
export function getConversationHistory() {
  return conversationHistory;
}

/**
 * Clears the conversation history
 */
export function clearConversationHistory() {
  conversationHistory = [];
}

/**
 * Add a message to the conversation history
 * @param {string} text - Message text
 * @param {string} type - Message type (user or assistant)
 */
function addMessageToHistory(text, type) {
  conversationHistory.push({ text, type });
}

/**
 * Send a message to the AI and process the response
 * @param {string} message - The message to send
 * @param {string} context - Optional conversation context
 * @param {Function} onData - Callback function for streaming response
 * @returns {Promise<string>} The complete response
 */
export async function sendMessage(message, context, onData) {
  _ensureModelIsSet();
  addMessageToHistory(message, "user");

  try {
    const response = await _sendMessageToAPI(message, onData);
    addMessageToHistory(response, "assistant");
    return response;
  } catch (e) {
    console.error("Error sending message to API:", e);
    return "Error communicating with AI service. Please check if Ollama is running.";
  }
}

/**
 * Make sure a model is selected
 */
function _ensureModelIsSet() {
  if (!currentModel) {
    const settings = getSettings();
    currentModel = settings.get_string("default-model");
  }
}

/**
 * Send message to the API and process streaming response
 * @param {string} message - Message to send
 * @param {Function} onData - Callback for streaming data
 * @returns {Promise<string>} Complete response
 */
async function _sendMessageToAPI(message, onData) {
  const settings = getSettings();
  const temperature = settings.get_double("temperature");
  const apiEndpoint = settings.get_string("api-endpoint");

  const payload = JSON.stringify({
    model: currentModel,
    prompt: message,
    stream: true,
    temperature: temperature,
  });

  const command = [
    "curl",
    "-s",
    "-X",
    "POST",
    apiEndpoint,
    "-d",
    payload,
    "-H",
    "Content-Type: application/json",
  ];

  let fullResponse = "";

  // Execute the API request and process the streaming response
  await _executeCommand(command, (lineText) => {
    try {
      const json = JSON.parse(lineText);
      if (json.response) {
        fullResponse += json.response;
        if (onData) {
          onData(json.response);
        }
      }
    } catch (e) {
      console.error("Error parsing JSON from API:", e);
      // Only show error message if no valid response has been received yet
      if (!fullResponse.trim()) {
        const errorMsg =
          "Error: failed to process API response. Please try again later.";
        fullResponse = errorMsg;
        if (onData) {
          onData(errorMsg);
        }
      }
    }
  });

  // Check if we received any response from the API
  if (!fullResponse.trim()) {
    fullResponse =
      "Error: failed to reach API. Please check your connection and try again.";
    if (onData) {
      onData(fullResponse);
    }
  }

  return fullResponse;
}

/**
 * Execute a command and process its output
 * @param {string[]} command - Command and arguments to execute
 * @param {Function} lineProcessor - Optional callback to process each line
 * @returns {Promise<string>} Command output as string
 */
async function _executeCommand(command, lineProcessor) {
  const process = new Gio.Subprocess({
    argv: command,
    flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
  });
  process.init(null);

  const outputStream = process.get_stdout_pipe();
  const stream = new Gio.DataInputStream({
    base_stream: outputStream,
  });

  let output = "";

  try {
    // Process the streaming response
    while (true) {
      const [line] = await stream.read_line_async(GLib.PRIORITY_DEFAULT, null);
      if (!line) break;

      const lineText = new TextDecoder().decode(line);

      if (lineProcessor) {
        lineProcessor(lineText);
      } else {
        output += lineText + "\n";
      }
    }

    // Wait for process to finish
    await process.wait_check_async(null);
    return output;
  } finally {
    stream.close(null);
  }
}
