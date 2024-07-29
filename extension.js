const { St, Clutter, GLib, Gio, Meta } = imports.gi;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Adw = imports.gi.Adw;
const Gtk = imports.gi.Gtk;

const Utils = Me.imports.utils;

class SeparatePanels {
    constructor() {
        this._indicator = null;
        this._backgroundPanel = null;
        this._textPanel = null;
        this._isPanelVisible = false;
        this._chatEntry = null;
        this._sendButton = null;
        this._messageContainer = null;
        this._searchProvider = null;
    }

    enable() {
        // Create the indicator button
        this._indicator = new PanelMenu.Button(0.0, 'SeparatePanels');
        let icon = new St.Icon({ icon_name: 'system-run-symbolic', style_class: 'system-status-icon' });
        this._indicator.add_child(icon);

        // Connect the click event to toggle the panels
        this._indicator.connect('button-press-event', () => {
            this._togglePanels();
            return Clutter.EVENT_STOP; // Stop further event propagation
        });

        Main.panel.addToStatusArea('separate-panels-indicator', this._indicator);

        // Create the background panel
        this._backgroundPanel = new St.BoxLayout({
            vertical: true,
            reactive: false,
            visible: false,
            style_class: 'background-panel'
        });

        // Create and add the chat entry to the text panel
        this._chatEntry = new St.Entry({
            style_class: 'chat-entry',
            hint_text: 'Type your message here...',
            can_focus: true
        });
        this._chatEntry.connect('activate', () => this._handleChatSubmit());

        // Create the send button
        this._sendButton = new St.Button({
            style_class: 'send-button',
            can_focus: true,
            label: 'Send'
        });
        this._sendButton.connect('clicked', () => this._handleChatSubmit());

        this._textPanel = new St.BoxLayout({
            vertical: false,
            reactive: true,
            visible: false,
            style_class: 'text-panel'
        });

        this._textPanel.add_child(this._chatEntry);
        this._textPanel.add_child(this._sendButton);

        // Create the message container
        this._messageContainer = new St.BoxLayout({
            vertical: true,
            reactive: true,
            style_class: 'message-container'
        });

        // Update panel dimensions and positions
        this._updatePanelDimensions();

        // Add the panels to the layout
        Main.layoutManager.addChrome(this._backgroundPanel);
        Main.layoutManager.addChrome(this._textPanel);
        Main.layoutManager.addChrome(this._messageContainer);

        this._applyStyles();

        // Initialize and register the search provider
        this._searchProvider = new (ExtensionUtils.getCurrentExtension().imports.searchProvider)();
        Main.overview.addSearchProvider(this._searchProvider);
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

        if (this._messageContainer) {
            this._messageContainer.destroy();
            this._messageContainer = null;
        }

        if (this._searchProvider) {
            Main.overview.removeSearchProvider(this._searchProvider);
            this._searchProvider = null;
        }
    }

    _togglePanels() {
        this._isPanelVisible = !this._isPanelVisible;
        this._backgroundPanel.visible = this._isPanelVisible;
        this._textPanel.visible = this._isPanelVisible;
        this._messageContainer.visible = this._isPanelVisible;
    }

    _handleChatSubmit() {
        let message = this._chatEntry.get_text();
        if (message.trim() !== '') {
            this._addMessageToContainer(message, 'user-message');
            this._chatEntry.set_text('');

            // Simulate a bot response for offline mode
            let botResponse = "This is a static bot response.";
            this._addMessageToContainer(botResponse, 'bot-message');
        }
    }

    _addMessageToContainer(message, styleClass) {
        let messageLabel = new St.Label({ text: message, style_class: 'message ' + styleClass });
        this._messageContainer.add_child(messageLabel);
    }

    _updatePanelDimensions() {
        let monitor = Main.layoutManager.primaryMonitor;
        let screenWidth = monitor.width;
        let screenHeight = monitor.height;
        let topBarHeight = Main.panel.actor.get_height();

        // Update dimensions for the background panel
        this._backgroundPanel.width = screenWidth * 0.3; // Cover one-third of the screen horizontally
        this._backgroundPanel.height = screenHeight - topBarHeight; // Cover from the top bar to the bottom
        this._backgroundPanel.set_position(screenWidth * 0.7, topBarHeight); // Position at the right edge

        // Update dimensions and position for the text panel
        this._textPanel.width = screenWidth * 0.3; // Match the width of the background panel
        this._textPanel.height = 60; // Fixed height for text panel
        this._textPanel.set_position(screenWidth * 0.7, screenHeight - 135); // Position at the bottom of the screen

        // Update dimensions for the message container
        this._messageContainer.width = screenWidth * 0.3; // Match the width of the background panel
        this._messageContainer.height = screenHeight - topBarHeight - this._textPanel.height; // Fill the space above the text panel
        this._messageContainer.set_position(screenWidth * 0.7, topBarHeight); // Position at the right edge
    }

    _applyStyles() {
        // Apply styles from stylesheet
        let themeContext = St.ThemeContext.get_for_stage(global.stage);
        let cssProvider = new St.CssProvider();
        cssProvider.load_from_file(Me.dir.get_child('stylesheet.css'));
        themeContext.add_provider_for_screen(global.screen, cssProvider, St.StyleProviderPriority.APPLICATION);
    }
}

function init() {
    return new SeparatePanels();
}
