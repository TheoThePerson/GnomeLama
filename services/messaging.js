/**
 * Services for communicating with the AI backend
 */
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import { getSettings } from "../lib/settings.js";

// Conversation history
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
 * Fetches model names from the API and outputs them in a sorted list format.
 * @returns {Promise<string[]>} Array of available model names
 */
export async function fetchModelNames() {
  const curlCommand = ["curl", "-s", "http://localhost:11434/api/tags"];
  try {
    let process = new Gio.Subprocess({
      argv: curlCommand,
      flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
    });
    process.init(null);

    const outputStream = process.get_stdout_pipe();
    const stream = new Gio.DataInputStream({
      base_stream: outputStream,
    });

    // Read the entire response as a single string
    let jsonData = "";
    while (true) {
      const [readLine] = await stream.read_line_async(
        GLib.PRIORITY_DEFAULT,
        null
      );
      if (!readLine) break;
      jsonData += new TextDecoder().decode(readLine) + "\n";
    }
    stream.close(null);

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
 * Send a message to the AI and process the response
 * @param {string} message - The message to send
 * @param {string} context - Optional conversation context
 * @param {Function} onData - Callback function for streaming response
 * @returns {Promise<string>} The complete response
 */
export async function sendMessage(message, context, onData) {
  if (!currentModel) {
    const settings = getSettings();
    currentModel = settings.get_string("default-model");
  }

  // Add user message to history
  addMessageToHistory(message, "user");

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

  try {
    let process = new Gio.Subprocess({
      argv: command,
      flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
    });
    process.init(null);

    let fullResponse = "";
    const outputStream = process.get_stdout_pipe();
    const stream = new Gio.DataInputStream({
      base_stream: outputStream,
    });

    // Process the streaming response
    while (true) {
      const [line] = await stream.read_line_async(GLib.PRIORITY_DEFAULT, null);
      if (!line) break;

      try {
        const lineText = new TextDecoder().decode(line);
        const json = JSON.parse(lineText);
        if (json.response) {
          fullResponse += json.response;
          if (onData) {
            onData(json.response);
          }
        }
      } catch (e) {
        console.error("Error parsing JSON from API:", e);
      }
    }

    // Wait for process to finish
    await process.wait_check_async(null);
    stream.close(null);

    // Add the AI response to history
    addMessageToHistory(fullResponse, "assistant");
    return fullResponse;
  } catch (e) {
    console.error("Error sending message to API:", e);
    return "Error communicating with AI service. Please check if Ollama is running.";
  }
}
