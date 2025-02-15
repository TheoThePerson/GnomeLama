import Gio from "gi://Gio";
import GLib from "gi://GLib";

export async function sendMessage(userMessage, context) {
  const payload = {
    model: "llama3.2:1b",
    prompt: userMessage,
  };

  if (context?.length > 0) {
    payload.context = context;
  }

  const curlCommand = [
    "curl",
    "-X",
    "POST",
    "http://localhost:11434/api/generate",
    "-H",
    "Content-Type: application/json",
    "-d",
    JSON.stringify(payload),
  ];

  try {
    let process = new Gio.Subprocess({
      argv: curlCommand,
      flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
    });

    process.init(null);
    return await processStream(process.get_stdout_pipe());
  } catch (e) {
    return "Error: Unable to execute command.";
  }
}

async function processStream(outputStream) {
  const stream = new Gio.DataInputStream({
    base_stream: outputStream,
  });

  let fullResponse = "";

  try {
    while (true) {
      const [line] = await stream.read_line_async(GLib.PRIORITY_DEFAULT, null);
      if (!line) break;

      let json;
      try {
        json = JSON.parse(line);
      } catch {
        return "Error parsing response.";
      }

      if (json.response) {
        fullResponse += json.response;
      }
    }
  } catch {
    return "Stream processing error.";
  } finally {
    stream.close(null);
  }

  return fullResponse;
}
