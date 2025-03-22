/**
 * Global constants for the extension
 * Centralizes configuration values used throughout the codebase
 */

/**
 * Extension metadata
 */
export const EXTENSION = {
  NAME: "GnomeLama",
  UUID: "linux-copilot@TheoThePerson",
  SETTINGS_SCHEMA: "org.gnome.shell.extensions.gnomelama",
  VERSION: 2,
};

/**
 * API configuration
 */
export const API = {
  OPENAI: {
    BASE_URL: "https://api.openai.com/v1",
    COMPLETION_ENDPOINT: "/chat/completions",
    MODELS_ENDPOINT: "/models",
    DEFAULT_MODEL: "gpt-3.5-turbo",
  },
  OLLAMA: {
    DEFAULT_HOST: "http://localhost:11434",
    COMPLETION_ENDPOINT: "/api/generate",
    MODELS_ENDPOINT: "/api/tags",
    DEFAULT_MODEL: "llama2",
  },
};

/**
 * UI constants
 */
export const UI = {
  PANEL: {
    WORD_THRESHOLD: 100, // Words above this threshold get converted to a file box
    DEFAULT_WIDTH_FRACTION: 0.3, // Default width as a fraction of screen width
    DEFAULT_HEIGHT_FRACTION: 0.6, // Default height as a fraction of screen height
    ANIMATION_DURATION_MS: 250, // Animation duration in milliseconds
  },
  THEMES: {
    LIGHT: "light",
    DARK: "dark",
    SYSTEM: "system",
  },
  COLORS: {
    DEFAULT_USER_MESSAGE: "rgba(114, 159, 207, 0.8)",
    DEFAULT_AI_MESSAGE: "rgba(115, 210, 22, 0.7)",
    ERROR_MESSAGE: "rgba(204, 0, 0, 0.8)",
    SYSTEM_MESSAGE: "rgba(252, 233, 79, 0.7)",
  },
};

/**
 * Performance settings
 */
export const PERFORMANCE = {
  API_BATCH_SIZE: 5, // Number of chunks to process before yielding
  API_YIELD_MS: 10, // Milliseconds to yield to main thread
  DEBOUNCE_DELAY_MS: 300, // Debounce delay for rapid UI interactions
  ANIMATION_FPS: 60, // Target frames per second for animations
};

/**
 * File handling constants
 */
export const FILES = {
  SUPPORTED_FORMATS: {
    TEXT: [
      ".txt",
      ".md",
      ".json",
      ".xml",
      ".html",
      ".js",
      ".py",
      ".sh",
      ".css",
    ],
    DOCUMENTS: [".doc", ".docx", ".odt", ".rtf", ".pdf"],
    IMAGES: [".jpg", ".jpeg", ".png", ".gif", ".svg"],
  },
  CONVERSION_TOOLS: {
    DOCX: "docx2txt",
    ODT: "odt2txt",
    DOC: "catdoc",
    RTF: "unrtf",
    PDF: "pdftotext",
  },
  MAX_FILE_SIZE_MB: 10, // Maximum file size in MB
  MAX_FILES: 5, // Maximum number of files that can be attached at once
};
