const { GLib, Gio } = imports.gi;
const Soup = imports.gi.Soup;

function makeSoupSession() {
    return new Soup.SessionAsync();
}

function sendChatMessage(session, url, message, callback) {
    let request = Soup.Message.new('POST', url);
    request.request_body.set_form_data({
        'message': message
    });
    session.queue_message(request, (session, message) => {
        if (message.status_code === 200) {
            callback(JSON.parse(request.response_body.data));
        } else {
            callback(null, new Error(`Request failed with status ${message.status_code}`));
        }
    });
}

function checkOllamaInstallation() {
    // Implement a check for Ollama installation, e.g., by checking if a certain command or file exists
    // If not installed, return instructions to install Ollama
    return GLib.find_program_in_path('ollama') ? true : 'Please install Ollama from ollama.com';
}
