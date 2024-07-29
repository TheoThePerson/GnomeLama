const { GLib } = imports.gi;

/**
 * Checks if Ollama is installed on the system.
 * @returns {boolean|string} Returns true if Ollama is installed, otherwise returns an error message.
 */
function checkOllamaInstallation() {
    return GLib.find_program_in_path('ollama') ? true : 'Please install Ollama from ollama.com';
}
