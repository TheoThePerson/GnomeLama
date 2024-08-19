const { St, Clutter, GLib, Gio, Gtk, PopupMenu, Shell } = imports.gi;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const Util = imports.misc.util;
const Search = imports.ui.search;
const SearchProvider = imports.misc.extensionUtils.getCurrentExtension().imports.searchProvider;

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
        this._searchProvider = new SearchProvider.init(this);
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
        let adjustment = this._textPanel.get_vertical_scroll_bar().get_adjustment();
        adjustment.set_value(adjustment.get_upper() - adjustment.get_page_size());
    }

    _clearChat() {
        // Clear the message container
        this._messageContainer.destroy_all_children();
    }

    _updatePanelDimensions() {
        const monitor = Main.layoutManager.primaryMonitor;
        const padding = 20;

        this._backgroundPanel.set_position(padding, Main.panel.height + padding);
        this._backgroundPanel.set_size(monitor.width - 2 * padding, monitor.height - Main.panel.height - 2 * padding);

        this._textPanel.set_position(monitor.width * 0.1, Main.panel.height + padding * 2);
        this._textPanel.set_size(monitor.width * 0.8, monitor.height * 0.6);
    }

    _createDropDownMenu() {
        this._dropDownMenu = new PopupMenu.PopupMenu(this._indicator, 0.0, St.Side.TOP, 0);
        Main.uiGroup.add_actor(this._dropDownMenu.actor);
        this._dropDownMenu.actor.hide();
        this._dropDownMenu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    }

    _applyStyles() {
        // Add custom styles
        let themeContext = St.ThemeContext.get_for_stage(global.stage);
        let theme = themeContext.get_theme();
        let cssProvider = new St.CssProvider();
        cssProvider.load_from_path(GLib.build_filenamev([GLib.get_current_dir(), 'stylesheet.css']));
        themeContext.add_provider(cssProvider, Gtk.STYLE_PROVIDER_PRIORITY_USER);
    }

    _checkAndInstallOllama() {
        // Check if the Ollama server is installed and install it if not
        let [_, output] = GLib.spawn_sync(null, ['which', 'ollama'], null, GLib.SpawnFlags.SEARCH_PATH, null);
        if (!output || output.length === 0) {
            Util.spawn(['bash', '-c', 'curl -sSL https://ollama.com/install.sh | bash']);
        }
    }

    async handleSearch(query) {
        // Handle the search query using the same function used for chat submissions
        return await this._sendMessageToOllama(query);
    }
}

function init() {
    return new OllamaExtension();
}
