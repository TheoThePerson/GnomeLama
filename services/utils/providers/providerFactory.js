/**
 * Factory for creating standardized provider interfaces
 */
import { getSettings } from "../../../lib/settings.js";
import { createCancellableSession } from "../../apiUtils.js";
import { SessionManager, ContextManager } from "../api/sessionUtils.js";
import { 
  createChatPayload, 
  createCompletionPayload 
} from "./payloadUtils.js";
import { 
  createBasicChunkProcessor,
  createSSEProcessor,
  processGenericResult
} from "../api/responseProcessors.js";
import { 
  extractOpenAIContent, 
  extractOllamaContent 
} from "../api/contentExtractors.js";
import { validateMessages } from "../models/formatters.js";
import { prepareBasicMessages } from "../models/formatters.js";

/**
 * Creates a standard provider interface for chat-based models like OpenAI
 * @param {Object} options - Provider options 
 * @returns {Object} Provider interface
 */
export function createChatProvider(options) {
  const {
    modelsEndpoint,
    apiEndpoint,
    getApiKey,
    processModels,
    recordError
  } = options;
  
  let availableModels = [];
  const sessionManager = new SessionManager();
  
  return {
    fetchModelNames: async () => {
      const settings = getSettings();
      const apiKey = getApiKey(settings);
      
      if (!apiKey) {
        if (recordError) recordError("API key not configured");
        return [];
      }
      
      try {
        const tempSession = createCancellableSession();
        const data = await tempSession.get(modelsEndpoint, {
          Authorization: `Bearer ${apiKey}`
        });
        
        availableModels = processModels(data.data);
        return availableModels;
      } catch (error) {
        if (recordError) {
          recordError(`Error fetching models: ${error.message || "Unknown error"}`);
        }
        return [];
      }
    },
    
    isModelSupported: (modelName) => {
      return availableModels.includes(modelName);
    },
    
    sendMessageToAPI: async ({ messageText, modelName, context = [], onData }) => {
      const settings = getSettings();
      const apiKey = getApiKey(settings);
      const temperature = settings.get_double("temperature");
      
      if (!apiKey) {
        if (recordError) recordError("API key not configured");
        throw new Error("API key not configured");
      }
      
      // For debugging purposes
      console.log(`Chat provider sending message with model ${modelName}, context length: ${context.length}`);
      
      // Clean up any existing session
      sessionManager.terminateSession();
      
      // Create session
      const session = createCancellableSession();
      sessionManager.setSession(session);
      
      // Prepare the messages from the context
      const messages = prepareBasicMessages(messageText, context);
      
      // Create the payload
      const payload = createChatPayload({
        modelName,
        messages,
        temperature,
        validateFn: validateMessages,
        recordError
      });
      
      // Create the chunk processor
      const processChunk = createSSEProcessor({
        onData,
        extractContent: extractOpenAIContent
      });
      
      try {
        const requestHandler = await session.sendRequest(
          "POST",
          apiEndpoint,
          {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`
          },
          payload,
          processChunk
        );
        
        return {
          result: requestHandler.result.then((result) => {
            const processed = processGenericResult(result);
            
            // Reset the session when done
            sessionManager.terminateSession();
            
            return processed;
          }),
          cancel: () => sessionManager.terminateSession()
        };
      } catch (error) {
        const accumulatedResponse = sessionManager.getAccumulatedResponse();
        sessionManager.terminateSession();
        
        if (accumulatedResponse) {
          return {
            result: Promise.resolve(accumulatedResponse),
            cancel: () => ""
          };
        }
        
        throw error;
      }
    },
    
    stopMessage: () => {
      return sessionManager.terminateSession();
    }
  };
}

/**
 * Creates a standard provider interface for completion-based models like Ollama
 * @param {Object} options - Provider options 
 * @returns {Object} Provider interface
 */
export function createCompletionProvider(options) {
  const {
    modelsEndpoint,
    apiEndpoint,
    processModels,
    recordError
  } = options;
  
  const contextManager = new ContextManager();
  const sessionManager = new SessionManager();
  
  return {
    resetContext: () => contextManager.resetContext(),
    
    fetchModelNames: async () => {
      try {
        const settings = getSettings();
        const endpoint = modelsEndpoint || settings.get_string("models-api-endpoint");
        
        const tempSession = createCancellableSession();
        const data = await tempSession.get(endpoint);
        
        return processModels(data);
      } catch (error) {
        if (recordError) {
          recordError(`Error fetching models: ${error.message || "Unknown error"}`);
        }
        return [];
      }
    },
    
    sendMessageToAPI: async ({ messageText, modelName, context, onData }) => {
      const settings = getSettings();
      const endpoint = apiEndpoint || settings.get_string("api-endpoint");
      const temperature = settings.get_double("temperature");
      
      // Clean up any existing session
      sessionManager.terminateSession();
      
      // Create session
      const session = createCancellableSession();
      sessionManager.setSession(session);
      
      // Get current context
      const currentContext = context || contextManager.getCurrentContext();
      
      // Create payload
      const payload = createCompletionPayload({
        modelName,
        prompt: messageText,
        temperature,
        context: currentContext
      });
      
      // Create the content extractor with context update callback
      const extractContent = (json) => 
        extractOllamaContent(json, (newContext) => contextManager.setContext(newContext));
      
      // Create chunk processor
      const processChunk = createBasicChunkProcessor({
        onData,
        extractContent
      });
      
      try {
        const requestHandler = await session.sendRequest(
          "POST",
          endpoint,
          { "Content-Type": "application/json" },
          payload,
          processChunk
        );
        
        return {
          result: requestHandler.result.then((result) => {
            const processed = processGenericResult(result, 
              (newContext) => contextManager.setContext(newContext));
            
            // Reset the session when done
            sessionManager.terminateSession();
            
            return processed;
          }),
          cancel: () => sessionManager.terminateSession()
        };
      } catch (error) {
        const accumulatedResponse = sessionManager.getAccumulatedResponse();
        sessionManager.terminateSession();
        
        if (accumulatedResponse) {
          return {
            result: Promise.resolve(accumulatedResponse),
            cancel: () => ""
          };
        }
        
        throw error;
      }
    },
    
    stopMessage: () => {
      return sessionManager.terminateSession(() => contextManager.resetContext());
    }
  };
} 