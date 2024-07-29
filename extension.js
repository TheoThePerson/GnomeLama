const { St, Clutter } = imports.gi;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;

class SeparatePanels {
    constructor() {
        this._indicator = null;
        this._backgroundPanel = null;
        this._textPanel = null;
        this._isPanelVisible = false;
        this._chatEntry = null;
        this._sendButton = null;
    }

    enable() {
        // Create the indicator button
        this._indicator = new PanelMenu.Button(0.0, 'SeparatePanels');
        let icon = new St.Icon({ icon_name: 'system-run-symbolic', style_class: 'system-status-icon' });
        this._indicator.add_child(icon);

        // Connect the click event to toggle the panels
        this._indicator.connect('button-press-event', (actor, event) => {
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

        this._textPanel = new St.BoxLayout({
            vertical: true,
            reactive: true,
            visible: false,
            style_class: 'text-panel'
        });

        this._textPanel.add_child(chatContainer);

        // Update panel dimensions and positions
        this._updatePanelDimensions();

        // Add the panels to the layout
        Main.layoutManager.addChrome(this._backgroundPanel);
        Main.layoutManager.addChrome(this._textPanel);

        this._applyStyles();
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
    }

    _togglePanels() {
        this._isPanelVisible = !this._isPanelVisible;
        this._backgroundPanel.visible = this._isPanelVisible;
        this._textPanel.visible = this._isPanelVisible;
    }

    _handleChatSubmit() {
        let message = this._chatEntry.get_text();
        if (message.trim() !== '') {
            log('Chat message: ' + message);
            this._chatEntry.set_text('');
        }
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
        this._textPanel.width = screenWidth * 0.2; // Match the width of the background panel
        this._textPanel.height = 60; // Fixed height for text panel
        this._textPanel.set_position(screenWidth * 0.8, screenHeight - 60); // Position at the bottom of the screen

        // Ensure the chat entry fits within the text panel with padding
        this._chatEntry.set_width(this._textPanel.width - 70); // Adjust for padding and button width
        this._chatEntry.set_height(40); // Set height for chat entry
    }

    _applyStyles() {
        // Apply styles directly in JavaScript
        this._backgroundPanel.style = `
            background-color: #1e1e1e;
            border-radius: 10px;
            z-index: 20;
            position: absolute;
            top: 0;
            bottom: 0;
            right: 0;
        `;

        this._textPanel.style = `
            background-color: #1e1e1e;
            border-radius: 10px;
            padding: 10px;
            z-index: 60;
            position: absolute;
            bottom: 0;
            width: 100%;
        `;

        this._chatEntry.style = `
            background-color: #4b4b4b;
            border: none;
            color: #d8dee9;
            border-radius: 25px;
            padding-left: 10px;
        `;

        this._sendButton.style = `
            background-color: #4b4b4b;
            border: none;
            color: #d8dee9;
            border-radius: 20px;
            width: 40px;
            height: 40px;
            margin-left: 10px;
        `;
    }
}

function init() {
    return new SeparatePanels();
}
