/**
 * Utilities for managing API sessions
 */
import GLib from "gi://GLib";

/**
 * Context manager for providers that maintain conversation context
 */
export class ContextManager {
  constructor() {
    this.currentContext = null;
  }
  
  /**
   * Get current context
   * @returns {string|null} Current context
   */
  getCurrentContext() {
    return this.currentContext;
  }
  
  /**
   * Set the current context
   * @param {string} context - New context
   */
  setContext(context) {
    this.currentContext = context;
  }
  
  /**
   * Reset the context
   */
  resetContext() {
    this.currentContext = null;
  }
}

/**
 * Session manager for API requests
 */
export class SessionManager {
  constructor() {
    this.activeSession = null;
    this.isTerminated = false;
  }
  
  /**
   * Set the active session
   * @param {Object} session - API session
   */
  setSession(session) {
    this.activeSession = session;
    this.isTerminated = false;
  }
  
  /**
   * Terminate any active session
   * @param {Function} [callback] - Optional callback to execute after termination
   * @returns {string} Any partial response
   */
  terminateSession(callback) {
    if (!this.activeSession || this.isTerminated) {
      return "";
    }
    
    try {
      const partial = this.activeSession.cancelRequest();
      this.isTerminated = true;
      
      // Reset the API session once completed
      GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
        this.activeSession = null;
        if (callback) callback();
        return GLib.SOURCE_REMOVE;
      });
      
      return partial;
    } catch (error) {
      console.error("Error terminating session:", error);
      this.activeSession = null;
      this.isTerminated = true;
      return "";
    }
  }
  
  /**
   * Check if there is an active session
   * @returns {boolean} True if there is an active session
   */
  hasActiveSession() {
    return !!this.activeSession && !this.isTerminated;
  }
  
  /**
   * Get accumulated response from current session
   * @returns {string} Accumulated response
   */
  getAccumulatedResponse() {
    return this.activeSession && !this.isTerminated ? 
      this.activeSession.getAccumulatedResponse() : 
      "";
  }
} 