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
import { validateMessages } from "../modelProcessing/formatters.js";
import { prepareBasicMessages } from "../modelProcessing/formatters.js";

/**
 * Creates a standard provider interface for chat-based models like OpenAI
 * @param {Object} options - Provider options 
 * @returns {Object} Provider interface
 */
export function createChatProvider(options) {
  const {
    modelsEndpoint,
    apiEndpoint,
    processModels,
    recordError,
    extractContent,
    createPayload = createChatPayload,
    createHeaders = () => ({ "Content-Type": "application/json" }),
    getEndpoint = () => apiEndpoint,
    fetchModels
  } = options;
  
  let availableModels = [];
  const sessionManager = new SessionManager();
  
  return {
    fetchModelNames: async () => {
      try {
        if (fetchModels) {
          // Use provider's custom fetch method if provided
          availableModels = await fetchModels();
          return availableModels;
        }

        // Default implementation
        const tempSession = createCancellableSession();
        const data = await tempSession.get(modelsEndpoint);
        
        availableModels = processModels(data);
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
      const temperature = settings.get_double("temperature");
      
      // Create session
      const session = createCancellableSession();
      sessionManager.setSession(session);
      
      // Prepare the messages from the context
      const messages = prepareBasicMessages(messageText, context);
      
      // Create the payload
      const payload = createPayload({
        modelName,
        messages,
        temperature,
        validateFn: validateMessages,
        recordError
      });
      
      // Get endpoint and headers
      const endpoint = getEndpoint({ modelName, settings });
      const headers = createHeaders(settings);
      
      // Create the chunk processor
      const processChunk = createSSEProcessor({
        onData,
        extractContent
      });
      
      try {
        const requestHandler = await session.sendRequest(
          "POST",
          endpoint,
          headers,
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
    recordError,
    extractContent,
    fetchModels
  } = options;
  
  const contextManager = new ContextManager();
  const sessionManager = new SessionManager();
  
  return {
    resetContext: () => contextManager.resetContext(),
    
    fetchModelNames: async () => {
      try {
        if (fetchModels) {
          // Use provider's custom fetch method if provided
          return await fetchModels();
        }

        // Default implementation
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
      
      // Create session
      const session = createCancellableSession();
      sessionManager.setSession(session);
      
      // Get current context
      const currentContext = context || contextManager.getCurrentContext();
      
      // For completion-based models like Ollama, prepare messages with isOllama flag
      const messages = prepareBasicMessages(messageText, context, { isOllama: true });
      
      // Create payload
      const payload = createCompletionPayload({
        modelName,
        prompt: messageText,
        temperature,
        context: currentContext
      });
      
      // Create chunk processor with context update callback
      const contextUpdateCallback = (newContext) => contextManager.setContext(newContext);
      const processChunk = createBasicChunkProcessor({
        onData,
        extractContent: (json) => extractContent(json, contextUpdateCallback)
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
            const processed = processGenericResult(result, contextUpdateCallback);
            
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