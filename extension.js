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

        // Create and add the chat entry to the text panel
        this._chatEntry = new St.Entry({
            style_class: 'chat-entry',
            hint_text: 'Type your message here...',
            can_focus: true
        });

        this._textPanel = new St.BoxLayout({
            vertical: true,
            reactive: true,
            visible: false,
            style_class: 'text-panel'
        });

        this._textPanel.add_child(this._chatEntry);

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
        this._backgroundPanel.width = screenWidth * 0.3; // Cover one-third of the screen horizontally
        this._backgroundPanel.height = screenHeight - topBarHeight; // Cover from the top bar to the bottom
        this._backgroundPanel.set_position(screenWidth * 0.7, topBarHeight); // Position at the right edge

        // Update dimensions and position for the text panel
        this._textPanel.width = screenWidth * 0.3; // Match the width of the background panel
        this._textPanel.height = 60; // Fixed height for text panel
        this._textPanel.set_position(screenWidth * 0.7, screenHeight - 135); // Position at the bottom of the screen

        // Ensure the chat entry fits within the text panel with padding
        this._chatEntry.set_size(this._textPanel.width - 50, 50); // Padding of 10 pixels on each side
    }

    _applyStyles() {
        // Apply styles directly in JavaScript
        this._backgroundPanel.style = `
            background-color: #303030;
            border-left: 1px solid #4c566a;
            z-index: 20;
            position: absolute;
            top: 0;
            bottom: 0;
            right: 0;
        `;

        this._textPanel.style = `
            background-color: #303030;
            border-left: 1px solid #4c566a;
            padding: 50px;
            z-index: 60;
            position: absolute;
            bottom: 0;
            width: 100%;
        `;

        this._chatEntry.style = `
            background-color: #3c3c3c;
            border: 1px solid #4c566a;
            color: #d8dee9;
        `;
    }
}

function init() {
    return new SeparatePanels();
}
