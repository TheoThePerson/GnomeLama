#!/usr/bin/env gjs

const Soup = imports.gi.Soup;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio; // Import Gio

// Replace with your OpenAI API key
const OPENAI_API_KEY = "";

function sendMessage(userMessage) {
  return new Promise((resolve, reject) => {
    let session = new Soup.Session();
    let url = "https://api.openai.com/v1/chat/completions";

    let message_data = JSON.stringify({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: userMessage }],
      stream: true, // Enable streaming
    });

    let request = Soup.Message.new("POST", url);
    request.set_request_body_from_bytes(
      "application/json",
      new GLib.Bytes(message_data)
    );
    request.request_headers.append("Authorization", `Bearer ${OPENAI_API_KEY}`);

    session.send_async(
      request,
      GLib.PRIORITY_DEFAULT,
      null,
      (session, result) => {
        try {
          let stream = session.send_finish(result);
          let dataStream = new Gio.DataInputStream({ base_stream: stream });

          function readChunk() {
            dataStream.read_line_async(
              GLib.PRIORITY_DEFAULT,
              null,
              (stream, res) => {
                try {
                  let [line, length] = stream.read_line_finish_utf8(res);
                  if (line !== null) {
                    line = line.trim();

                    // Ignore empty lines and [DONE] signal
                    if (line.startsWith("data:") && !line.includes("[DONE]")) {
                      let jsonString = line.replace("data: ", ""); // Remove "data: " prefix
                      let jsonData = JSON.parse(jsonString);

                      // Extract the text content
                      let delta = jsonData.choices[0].delta;
                      if (delta && delta.content) {
                        print(delta.content); // Print only the actual content
                      }
                    }

                    readChunk(); // Continue reading next chunk
                  } else {
                    resolve(); // End of stream
                  }
                } catch (e) {
                  reject(`Streaming error: ${e}`);
                }
              }
            );
          }

          readChunk(); // Start reading chunks
        } catch (e) {
          reject(`Streaming error: ${e}`);
        }
      }
    );
  });
}

// Main function
function main() {
  let loop = GLib.MainLoop.new(null, false);

  sendMessage("Tell me 10 facts about spoons")
    .then(() => {
      print("\nStreaming complete.");
      loop.quit();
    })
    .catch((error) => {
      print(`Error: ${error}`);
      loop.quit();
    });

  loop.run();
}
