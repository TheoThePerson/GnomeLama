const { St, Clutter, GLib, Gio, Gtk, PopupMenu, Shell } = imports.gi;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const Util = imports.misc.util;
const Search = imports.ui.search;

class OllamaExtension {
    constructor() {
        this._indicator = null;
        this._backgroundPanel = null;
        this._textPanel = null;
        this._isPanelVisible = false;
        this._chatEntry = null;
        this._sendButton = null;
        this._clearButton = null;
        this._messageContainer = null;
        this._dropDownMenu = null;
        this._searchProvider = null;
    }

    enable() {
        // Create the indicator button
        this._indicator = new PanelMenu.Button(0.0, 'OllamaExtension');
        let icon = new St.Icon({ icon_name: 'system-run-symbolic', style_class: 'system-status-icon' });
        this._indicator.add_child(icon);

        // Adjust the icon size and position
        icon.set_style('icon-size: 16px; margin-top: -12px;'); // Smaller icon size and move it up

        // Connect the click event to toggle the panels
        this._indicator.connect('button-press-event', () => {
            this._togglePanels();
        });

        Main.panel.addToStatusArea('ollama-extension-indicator', this._indicator);

        // Create the background panel
        this._backgroundPanel = new St.BoxLayout({
            vertical: true,
            reactive: false,
            visible: false,
            style_class: 'background-panel'
        });

        // Create the chat entry and send button container
        let chatContainer = new St.BoxLayout({
            vertical: false,
            reactive: true,
            style_class: 'chat-container'
        });

        // Create and add the chat entry to the container
        this._chatEntry = new St.Entry({
            style_class: 'chat-entry',
            hint_text: 'Type your message here...',
            can_focus: true
        });

        chatContainer.add_child(this._chatEntry);

        // Create and add the send button to the container
        this._sendButton = new St.Button({
            style_class: 'send-button',
            child: new St.Icon({ icon_name: 'go-up-symbolic', style_class: 'send-icon' })
        });

        // Connect the send button to handle chat submission
        this._sendButton.connect('clicked', () => this._handleChatSubmit());

        chatContainer.add_child(this._sendButton);

        // Create and add the clear chat button to the container
        this._clearButton = new St.Button({
            style_class: 'clear-button',
            child: new St.Icon({ icon_name: 'edit-clear-symbolic', style_class: 'clear-icon' })
        });

        // Connect the clear button to handle clearing the chat
        this._clearButton.connect('clicked', () => this._clearChat());

        chatContainer.add_child(this._clearButton);

        // Create the text panel
        this._textPanel = new St.BoxLayout({
            vertical: true,
            reactive: true,
            visible: false,
            style_class: 'text-panel',
            y_expand: true,
            x_align: St.Align.START
        });

        // Create a container for messages
        this._messageContainer = new St.BoxLayout({
            vertical: true,
            reactive: true,
            style_class: 'message-container',
            y_expand: true,
            y_align: St.Align.END,
            height: -1, // Allow it to expand to fit messages
            width: -1
        });

        // Add the message container to the text panel
        this._textPanel.add_child(this._messageContainer);
        this._textPanel.add_child(chatContainer);

        // Update panel dimensions and positions
        this._updatePanelDimensions();

        // Add the panels to the layout
        Main.layoutManager.addChrome(this._backgroundPanel);
        Main.layoutManager.addChrome(this._textPanel);

        // Create and add the drop-down menu
        this._createDropDownMenu();

        this._applyStyles();

        // Install Ollama if not installed
        this._checkAndInstallOllama();

        // Create and register the search provider
        this._searchProvider = new OllamaSearchProvider(this);
        Main.overview.viewSelector._searchResults._registerProvider(this._searchProvider);
    }

    disable() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }

        if (this._backgroundPanel) {
            this._backgroundPanel.destroy();
            this._backgroundPanel = null;
        }

        if (this._textPanel) {
            this._textPanel.destroy();
            this._textPanel = null;
        }

        if (this._dropDownMenu) {
            this._dropDownMenu.destroy();
            this._dropDownMenu = null;
        }

        if (this._searchProvider) {
            Main.overview.viewSelector._searchResults._unregisterProvider(this._searchProvider);
            this._searchProvider = null;
        }
    }

    _togglePanels() {
        this._isPanelVisible = !this._isPanelVisible;
        this._backgroundPanel.visible = this._isPanelVisible;
        this._textPanel.visible = this._isPanelVisible;
    }

    async _handleChatSubmit() {
        let message = this._chatEntry.get_text();
        if (message.trim() !== '') {
            // Create a label for the user message
            let userMessage = new St.Label({ text: 'You: ' + message, style_class: 'chat-message' });
            this._messageContainer.insert_child_at_index(userMessage, 0); // Add the message to the top

            // Clear the chat entry
            this._chatEntry.set_text('');

            // Scroll to the bottom
            this._scrollToBottom();

            // Send the message to the Ollama API and get a response
            let response = await this._sendMessageToOllama(message);

            // Create a label for the bot response
            let responseMessage = new St.Label({ text: 'Bot: ' + response, style_class: 'chat-message' });
            this._messageContainer.insert_child_at_index(responseMessage, 0); // Add the response to the top

            // Scroll to the bottom
            this._scrollToBottom();
        }
    }

    async _sendMessageToOllama(message) {
        // Make an API request to the Ollama server running on localhost
        try {
            let response = await fetch('http://localhost:11343/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message })
            });
            let data = await response.json();
            return data.response;
        } catch (error) {
            log('Error communicating with Ollama API: ' + error);
            return 'Error communicating with Ollama API.';
        }
    }

    _scrollToBottom() {
        // Scroll the text panel to the bottom
        let adjustment = this._textPanel.get_vertical_scroll_adjustment();
        adjustment.value = adjustment.upper;
    }

    _clearChat() {
        // Remove all children from the message container
        this._messageContainer.destroy_all_children();
    }

    _updatePanelDimensions() {
        let monitor = Main.layoutManager.primaryMonitor;
        let screenWidth = monitor.width;
        let screenHeight = monitor.height;
        let topBarHeight = Main.panel.actor.get_height();

        // Update dimensions for the background panel
        this._backgroundPanel.width = screenWidth * 0.2; // Cover one-fifth of the screen horizontally
        this._backgroundPanel.height = screenHeight - topBarHeight; // Cover from the top bar to the bottom
        this._backgroundPanel.set_position(screenWidth * 0.8, topBarHeight); // Position at the right edge

        // Update dimensions and position for the text panel
        this._textPanel.width = screenWidth * 0.19; // Match the width of the background panel
        this._textPanel.height = screenHeight * 0.3; // Adjustable height for the text panel
        this._textPanel.set_position(screenWidth * 0.8 + 25, screenHeight - this._textPanel.height); // Position at the bottom of the screen

        // Ensure the chat entry fits within the text panel with padding
        this._chatEntry.set_width(this._textPanel.width - 100); // Adjust for padding and button width
        this._chatEntry.set_height(40); // Set height for chat entry
    }

    _applyStyles() {
        // Apply styles directly in JavaScript if needed
        // But styles should ideally be managed in the CSS file for better maintainability
    }

    _checkAndInstallOllama() {
        let process = new Gio.Subprocess({
            argv: ['which', 'ollama'],
            flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
        });

        process.communicate_utf8_async(null, null, (proc, res) => {
            try {
                let [, stdout, stderr] = proc.communicate_utf8_finish(res);
                if (stdout.trim() === '') {
                    // Ollama is not installed, prompt to install
                    this._promptToInstallOllama();
                } else {
                    log('Ollama is already installed');
                }
            } catch (e) {
                log('Failed to check Ollama installation: ' + e.message);
            }
        });
    }

    _promptToInstallOllama() {
        let dialog = new Gtk.MessageDialog({
            transient_for: null,
            modal: true,
            buttons: Gtk.ButtonsType.OK_CANCEL,
            text: 'Ollama is not installed. Would you like to install it now?',
        });

        dialog.connect('response', (widget, responseId) => {
            if (responseId === Gtk.ResponseType.OK) {
                this._installOllama();
            }
            dialog.destroy();
        });

        dialog.show();
    }

    _installOllama() {
        let [success, pid] = GLib.spawn_async(
            null,
            ['pkexec', 'sh', '-c', 'curl -fsSL https://ollama.com/install.sh | sh'],
            null,
            GLib.SpawnFlags.DO_NOT_REAP_CHILD,
            null
        );

        if (!success) {
            log('Failed to start Ollama installation');
        } else {
            GLib.child_watch_add(GLib.PRIORITY_DEFAULT, pid, () => {
                log('Ollama installation completed');
            });
        }
    }

    _createDropDownMenu() {
        // Create the drop-down menu
        this._dropDownMenu = new PopupMenu.PopupMenu(this._indicator, 0.0, St.Side.TOP, 0);

        // Add options to the drop-down menu
        this._addDropDownMenuItem('Llama3:8b', 'ollama run llama3:8b');
        this._addDropDownMenuItem('Llama3:70b', 'ollama run llama3:70b');
        this._addDropDownMenuItem('Llama3.1:8b', 'ollama run llama3.1:8b');
        this._addDropDownMenuItem('Llama3.1:70b', 'ollama run llama3.1:70b');
        this._addDropDownMenuItem('Llama3.1:405b', 'ollama run llama3.1:405b');
        this._addDropDownMenuItem('Gemma2:2b', 'ollama run gemma2:2b');
        this._addDropDownMenuItem('Gemma2:9b', 'ollama run gemma2:9b');
        this._addDropDownMenuItem('Gemma2:27b', 'ollama run gemma2:27b');
        this._addDropDownMenuItem('Phi3:3.8b', 'ollama run phi3:3.8b');

        // Add the drop-down menu to the indicator
        this._indicator.menu.addMenuItem(this._dropDownMenu);
    }

    _addDropDownMenuItem(label, command) {
        let menuItem = new PopupMenu.PopupMenuItem(label);
        menuItem.connect('activate', () => {
            Util.spawnCommandLine(command);
        });
        this._dropDownMenu.addMenuItem(menuItem);
    }

    async handleSearch(query) {
        // Handle the search query and return the response
        let response = await this._sendMessageToOllama(query);
        return response;
    }
}

class OllamaSearchProvider extends Search.SearchProvider {
    constructor(extension) {
        super('Ollama');
        this._extension = extension;
    }

    getResultMetas(resultIds) {
        return resultIds.map((resultId) => {
            return {
                id: resultId,
                name: resultId,
                createIcon: () => new St.Icon({ icon_name: 'system-run-symbolic', style_class: 'popup-menu-icon' })
            };
        });
    }

    async getInitialResultSet(terms, callback) {
        let query = terms.join(' ');
        let response = await this._extension.handleSearch(query);
        callback([response]);
    }

    async getSubsearchResultSet(previousResults, terms, callback) {
        let query = terms.join(' ');
        let response = await this._extension.handleSearch(query);
        callback([response]);
    }

    getResultMeta(resultId) {
        return {
            id: resultId,
            name: resultId,
            createIcon: () => new St.Icon({ icon_name: 'system-run-symbolic', style_class: 'popup-menu-icon' })
        };
    }

    activateResult(resultId) {
        this._extension._chatEntry.set_text(resultId);
        this._extension._handleChatSubmit();
    }
}

function init() {
    return new OllamaExtension();
}
