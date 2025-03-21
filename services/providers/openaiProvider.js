import { getSettings } from "../../lib/settings.js";
import { createCancellableSession, invokeCallback } from "../apiUtils.js";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODELS_URL = "https://api.openai.com/v1/models";

let availableModels = [];
let apiSession = null;

export function isOpenAIModel(modelName) {
  return availableModels.includes(modelName);
}

export async function fetchModelNames() {
  const settings = getSettings();
  const apiKey = settings.get_string("openai-api-key");

  if (!apiKey) {
    console.warn("OpenAI API key not configured");
    return [];
  }

  try {
    const tempSession = createCancellableSession();
    const data = await tempSession.get(OPENAI_MODELS_URL, {
      Authorization: `Bearer ${apiKey}`,
    });

    const filteredModels = data.data
      .filter((model) => model.id.includes("gpt"))
      .filter((model) => {
        const id = model.id.toLowerCase();
        if (id.includes("instruct")) return false;
        if (id.includes("audio")) return false;
        if (id.includes("search")) return false;
        if (id.includes("realtime")) return false;
        if (/-\d{4}/.test(id)) return false;
        if (/-\d{3,4}$/.test(id)) return false;
        return true;
      });

    const modelGroups = new Map();
    filteredModels.forEach((model) => {
      const baseName = model.id.replace(/-preview(-\d{4}-\d{2}-\d{2})?$/, "");
      if (!modelGroups.has(baseName)) {
        modelGroups.set(baseName, []);
      }
      modelGroups.get(baseName).push(model.id);
    });

    const selectedModels = [];
    for (const [baseName, variants] of modelGroups) {
      const previewVariants = variants.filter((v) => v.includes("-preview"));
      const nonPreviewVariants = variants.filter(
        (v) => !v.includes("-preview")
      );

      if (nonPreviewVariants.length > 0) {
        selectedModels.push(nonPreviewVariants[0]);
      } else if (previewVariants.length > 0) {
        const simplePreview = previewVariants.find(
          (v) => !v.match(/-preview-\d{4}-\d{2}-\d{2}$/)
        );
        selectedModels.push(simplePreview || previewVariants[0]);
      }
    }

    availableModels = selectedModels.sort();
    return availableModels;
  } catch (e) {
    console.error("Error fetching OpenAI models:", e);
    return [];
  }
}

export async function sendMessageToAPI(
  messageText,
  modelName,
  context = [],
  onData
) {
  const settings = getSettings();
  const apiKey = settings.get_string("openai-api-key");

  if (!apiKey) {
    throw new Error(
      "OpenAI API key not configured. Please add it in settings."
    );
  }

  apiSession = createCancellableSession();

  const messages = context.map((msg) => ({
    role: msg.type === "user" ? "user" : "assistant",
    content: msg.text,
  }));

  messages.push({ role: "user", content: messageText });

  const payload = JSON.stringify({
    model: modelName,
    messages: messages,
    stream: true,
    temperature: settings.get_double("temperature"),
  });

  const processChunk = async (lineText) => {
    if (lineText.startsWith("data: ")) {
      const jsonString = lineText.replace("data: ", "").trim();
      if (jsonString === "[DONE]") return null;

      try {
        const json = JSON.parse(jsonString);
        if (json.choices && json.choices[0].delta.content) {
          const chunk = json.choices[0].delta.content;

          if (onData) {
            await invokeCallback(onData, chunk);
          }

          return chunk;
        }
      } catch (parseError) {
        console.error("Error parsing JSON chunk:", parseError);
      }
    }
    return null;
  };

  try {
    const result = await apiSession.sendRequest(
      "POST",
      OPENAI_API_URL,
      {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      payload,
      processChunk
    );

    const response = result.response;
    apiSession = null;

    return { response };
  } catch (error) {
    console.error("API request error:", error);

    const accumulatedResponse = apiSession
      ? apiSession.getAccumulatedResponse()
      : "";
    apiSession = null;

    if (accumulatedResponse) {
      return { response: accumulatedResponse };
    }

    throw error;
  }
}

export function stopMessage() {
  if (!apiSession) {
    return;
  }

  const partialResponse = apiSession.cancelRequest();
  console.log("OpenAI API request cancelled with partial response saved");

  apiSession = null;

  return partialResponse;
}
