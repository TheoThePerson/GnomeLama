import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Soup from "gi://Soup";
import { getSettings } from "../../lib/settings.js";

let currentContext = null; // Store the context from previous interactions

export function getCurrentContext() {
  return currentContext;
}

export function resetContext() {
  currentContext = null;
}

export async function fetchModelNames() {
  try {
    const settings = getSettings();
    const endpoint = "https://api.openai.com/v1/models";
    const apiKey = settings.get_string("api-key");

    const session = new Soup.Session();
    const message = Soup.Message.new("GET", endpoint);
    message.request_headers.append("Authorization", `Bearer ${apiKey}`);

    return new Promise((resolve, reject) => {
      session.send_and_read_async(
        message,
        GLib.PRIORITY_DEFAULT,
        null,
        (session, result) => {
          try {
            if (message.get_status() !== Soup.Status.OK) {
              throw new Error(`HTTP error: ${message.get_status()}`);
            }

            const bytes = session.send_and_read_finish(result);
            if (!bytes) throw new Error("No response data received");

            const response = new TextDecoder().decode(bytes.get_data());
            const data = JSON.parse(response);
            resolve(data.data.map((model) => model.id).sort());
          } catch (e) {
            console.error("Error fetching model names:", e);
            resolve([]);
          }
        }
      );
    });
  } catch (e) {
    console.error("Error fetching model names:", e);
    return [];
  }
}

export async function sendMessageToAPI(
  messageText,
  modelName,
  context,
  onData
) {
  const settings = getSettings();
  const endpoint = "https://api.openai.com/v1/chat/completions";
  const apiKey = settings.get_string("api-key");
  const temperature = settings.get_double("temperature");

  const payload = JSON.stringify({
    model: modelName,
    messages: [
      { role: "system", content: context || "" },
      { role: "user", content: messageText },
    ],
    stream: true,
    temperature,
  });

  let fullResponse = "";

  try {
    const session = new Soup.Session();
    const message = Soup.Message.new("POST", endpoint);
    message.set_request_body_from_bytes(
      "application/json",
      new GLib.Bytes(new TextEncoder().encode(payload))
    );
    message.request_headers.append("Authorization", `Bearer ${apiKey}`);
    message.request_headers.append("Content-Type", "application/json");

    const inputStream = await new Promise((resolve, reject) => {
      session.send_async(
        message,
        GLib.PRIORITY_DEFAULT,
        null,
        (session, result) => {
          try {
            if (message.get_status() !== Soup.Status.OK) {
              throw new Error(`HTTP error: ${message.get_status()}`);
            }
            const inputStream = session.send_finish(result);
            if (!inputStream) throw new Error("No response stream available");
            resolve(inputStream);
          } catch (e) {
            console.error("Error sending message:", e);
            reject(e);
          }
        }
      );
    });

    const dataInputStream = new Gio.DataInputStream({
      base_stream: inputStream,
      close_base_stream: true,
    });

    while (true) {
      const [line] = await dataInputStream.read_line_async(
        GLib.PRIORITY_DEFAULT,
        null
      );
      if (!line) break;

      const lineText = new TextDecoder().decode(line);
      try {
        const json = JSON.parse(lineText);
        if (json.choices) {
          const chunk = json.choices[0].delta?.content || "";
          fullResponse += chunk;
          if (onData) {
            await GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
              onData(chunk);
              return GLib.SOURCE_REMOVE;
            });
          }
        }
      } catch (parseError) {
        console.error("Error parsing JSON chunk:", parseError);
      }
    }

    dataInputStream.close(null);
    return { response: fullResponse, context: currentContext };
  } catch (error) {
    console.error("API request error:", error);
    throw error;
  }
}
