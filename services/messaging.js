/**
 * Services for communicating with the AI backend
 */
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import { getSettings } from "../lib/settings.js";

let conversationHistory = [];
let currentModel = null;
let currentContext = null; // Store the context from previous interactions

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
 * Fetches model names from the API
 * @returns {Promise<string[]>} Array of available model names
 */
export async function fetchModelNames() {
  try {
    const settings = getSettings();
    const jsonData = await _executeCommand([
      "curl",
      "-s",
      settings.get_string("models-api-endpoint"),
    ]);

    // Parse and extract model names
    const data = JSON.parse(jsonData);
    return data.models
      .map((model) => model.name)
      .filter((value, index, self) => self.indexOf(value) === index)
      .sort();
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
  currentContext = null;
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
  // Ensure a model is selected
  if (!currentModel) {
    currentModel = getSettings().get_string("default-model");
  }

  // Add user message to history
  addMessageToHistory(message, "user");

  try {
    // Send message to API with context
    const response = await _sendMessageToAPI(
      message,
      context || currentContext,
      onData
    );
    addMessageToHistory(response, "assistant");
    return response;
  } catch (e) {
    console.error("Error sending message to API:", e);
    const errorMsg =
      "Error communicating with Ollama. Please check if Ollama is installed and running.";
    if (onData) onData(errorMsg);
    return errorMsg;
  }
}

/**
 * Send message to the API and process streaming response
 * @param {string} message - Message to send
 * @param {string} context - Optional context from previous interactions
 * @param {Function} onData - Callback for streaming data
 * @returns {Promise<string>} Complete response
 */
async function _sendMessageToAPI(message, context, onData) {
  const settings = getSettings();

  // Prepare payload
  const payload = JSON.stringify({
    model: currentModel,
    prompt: message,
    stream: true,
    temperature: settings.get_double("temperature"),
    context: context || null,
  });

  // Setup curl command
  const command = [
    "curl",
    "--no-buffer",
    "-s",
    "-X",
    "POST",
    settings.get_string("api-endpoint"),
    "-d",
    payload,
    "-H",
    "Content-Type: application/json",
  ];

  let fullResponse = "";
  // Don't reset context before processing response

  // Execute request and process streaming response
  await _executeCommand(command, (chunk) => {
    try {
      const json = JSON.parse(chunk);

      // Save context if provided
      if (json.context) {
        currentContext = json.context;
      }

      // Process response text
      if (json.response) {
        fullResponse += json.response;
        if (onData) onData(json.response);
      }
    } catch (e) {
      console.error("Error parsing JSON from API:", e);
    }
  });

  // Return error message if no response received
  if (!fullResponse.trim()) {
    fullResponse =
      "Error communicating with Ollama. Please check if Ollama is installed and running.";
    if (onData) onData(fullResponse);
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
  // Create subprocess with pipes
  const process = new Gio.Subprocess({
    argv: command,
    flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
  });
  process.init(null);

  // Setup data stream
  const stream = new Gio.DataInputStream({
    base_stream: process.get_stdout_pipe(),
    close_base_stream: true,
  });

  let output = "";

  try {
    // Process the streaming response
    while (true) {
      const [line] = await stream.read_line_async(GLib.PRIORITY_DEFAULT, null);
      if (!line) break;

      const lineText = new TextDecoder().decode(line);

      if (lineProcessor) {
        // Process line immediately
        await GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
          lineProcessor(lineText);
          return GLib.SOURCE_REMOVE;
        });
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
