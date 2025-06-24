/**
 * Settings manager functionality for the panel UI
 */
import Clutter from "gi://Clutter";
import St from "gi://St";
import GLib from "gi://GLib";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import { spawnCommandLine } from 'resource:///org/gnome/shell/misc/util.js';
import Pango from "gi://Pango";
import { getPopupManager } from "./popupManager.js";

export class SettingsManager {
  constructor(settings, inputButtonsContainer, visualContainerManager = null) {
    this._settings = settings;
    this._inputButtonsContainer = inputButtonsContainer;
    this._visualContainerManager = visualContainerManager;
    this._settingsMenu = null;
    this._settingsButton = null;
    this._settingsIcon = null;
    this._stageEventId = null;
    this._promptEntry = null;
    this._temperatureEntry = null;
    this._currentPrompt = "";
    this._currentTemperature = 0.7;
    this._getConversationHistory = null;
    this._aboutMenu = null;
    this._aboutEventId = null;
    
    // Listen for external changes to settings
    this._settingsChangedId = this._settings.connect("changed", (settings, key) => {
      if (key === "model-prompt") {
        this._currentPrompt = settings.get_string("model-prompt") || "";
        this._updatePromptEntry();
      } else if (key === "temperature") {
        this._currentTemperature = settings.get_double("temperature") || 0.7;
        this._updateTemperatureEntry();
      }
    });
    
    // Initialize current values
    this._currentPrompt = settings.get_string("model-prompt") || "";
    this._currentTemperature = settings.get_double("temperature") || 0.7;
    
    // Get the popup manager
    this._popupManager = getPopupManager();
  }

  // Helper method to update dconf directly using shell command
  _forceUpdateDconf(key, value) {
    try {
      // Build the full dconf path
      const dconfPath = `/org/gnome/shell/extensions/gnomelama/${key}`;
      
      // Format the value based on type
      let formattedValue;
      if (typeof value === 'string') {
        // Strings need to be quoted
        formattedValue = `"${value.replace(/"/gu, '\\"')}"`;
      } else if (typeof value === 'number') {
        formattedValue = value.toString();
      } else {
        return;
      }
      
      // Execute the dconf set command
      const cmd = `dconf write ${dconfPath} ${formattedValue}`;
      spawnCommandLine(cmd);
    } catch (e) {
      console.error(`Error updating dconf: ${e}`);
    }
  }

  _updatePromptEntry() {
    if (this._promptEntry) {
      this._promptEntry.set_text(this._currentPrompt);
    }
  }

  _updateTemperatureEntry() {
    if (this._temperatureEntry) {
      this._temperatureEntry.set_text(this._currentTemperature.toString());
    }
  }

  // Save the current prompt value from the entry
  _savePromptValue() {
    if (!this._promptEntry) return;
    
    const newPrompt = this._promptEntry.get_text();
    if (newPrompt === this._currentPrompt) return; // No change
    
    // Update our cached value
    this._currentPrompt = newPrompt;
    
    // Update the current setting
    this._settings.set_string("model-prompt", newPrompt);
    
    // Force update dconf directly with the shell command
    this._forceUpdateDconf("model-prompt", newPrompt);
    
    // Also set again after a delay
    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
      this._settings.set_string("model-prompt", newPrompt);
      return GLib.SOURCE_REMOVE;
    });
  }

  // Save the current temperature value from the entry
  _saveTemperatureValue() {
    if (!this._temperatureEntry) return;
    
    const newTempText = this._temperatureEntry.get_text();
    const newTemp = parseFloat(newTempText);
    
    // Validate temperature value
    if (isNaN(newTemp) || newTemp < 0 || newTemp > 1) {
      // Reset to current value if invalid
      this._updateTemperatureEntry();
      return;
    }
    
    if (newTemp === this._currentTemperature) return; // No change
    
    // Update our cached value
    this._currentTemperature = newTemp;
    
    // Update the current setting
    this._settings.set_double("temperature", newTemp);
    
    // Force update dconf directly with the shell command
    this._forceUpdateDconf("temperature", newTemp);
    
    // Also set again after a delay
    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
      this._settings.set_double("temperature", newTemp);
      return GLib.SOURCE_REMOVE;
    });
  }

  setupSettingsButton(button, icon) {
    this._settingsButton = button;
    this._settingsIcon = icon;

    this._setupSettingsMenu();
    this._settingsButton.connect("button-press-event", () => {
      // Notify popup manager before opening
      if (this._popupManager.notifyOpen('settings')) {
        this._settingsMenu.toggle();
      }
      return Clutter.EVENT_STOP;
    });
  }

  // Method to set the conversation history getter function
  setConversationHistoryGetter(getHistoryFunc) {
    this._getConversationHistory = getHistoryFunc;
  }

  async _setupSettingsMenu() {
    this._settingsMenu = new PopupMenu.PopupMenu(
      new St.Button(),
      0.0,
      St.Side.BOTTOM
    );
    Main.uiGroup.add_child(this._settingsMenu.actor);
    this._settingsMenu.actor.hide();

    this._settingsMenu.actor.add_style_class_name("settings-menu-popup");

    if (this._settingsMenu.box) {
      this._settingsMenu.box.add_style_class_name("settings-menu-box");
    }

    // Apply the styling (without shadow on the main menu now)
    this._applySettingsMenuStyling();

    this._settingsMenu.connect("open-state-changed", (menu, isOpen) => {
      if (isOpen) {
        // Notify popup manager
        this._popupManager.notifyOpen('settings');
        this._positionSettingsMenu();
        
        // Update the UI values when the menu opens
        this._updatePromptEntry();
        this._updateTemperatureEntry();
        
        // Apply styling after positioning to ensure accurate shadow detection
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
          this._applySettingsMenuStyling();
          return GLib.SOURCE_REMOVE;
        });
      } else {
        // Save values when menu closes
        this._savePromptValue();
        this._saveTemperatureValue();
      }
    });

    this._stageEventId = global.stage.connect(
      "button-press-event",
      (actor, event) => {
        if (this._settingsMenu && this._settingsMenu.isOpen) {
          const [x, y] = event.get_coords();
          const menuActor = this._settingsMenu.actor || this._settingsMenu;
          const [menuX, menuY] = menuActor.get_transformed_position();
          const [menuWidth, menuHeight] = menuActor.get_size();
          const [buttonX, buttonY] =
            this._settingsButton.get_transformed_position();
          const [buttonWidth, buttonHeight] = this._settingsButton.get_size();

          if (
            !(
              x >= menuX &&
              x <= menuX + menuWidth &&
              y >= menuY &&
              y <= menuY + menuHeight
            ) &&
            !(
              x >= buttonX &&
              x <= buttonX + buttonWidth &&
              y >= buttonY &&
              y <= buttonY + buttonHeight
            )
          ) {
            // Save values before closing
            this._savePromptValue();
            this._saveTemperatureValue();
            this._settingsMenu.close();
          }
        }
        return Clutter.EVENT_PROPAGATE;
      }
    );

    // Register with popup manager
    this._popupManager.registerPopup('settings', {
      isOpenFn: () => this._settingsMenu && this._settingsMenu.isOpen,
      closeFn: () => {
        if (this._settingsMenu && this._settingsMenu.isOpen) {
          this._savePromptValue();
          this._saveTemperatureValue();
          this._settingsMenu.close();
        }
      },
      afterCloseFn: () => {
        this._savePromptValue();
        this._saveTemperatureValue();
      }
    });
    
    this._populateSettingsMenu();
  }

  _positionSettingsMenu() {
    const menuActor = this._settingsMenu.actor || this._settingsMenu;
    
    // Use visual container if available, otherwise fall back to input container
    let containerX, containerY, containerWidth;
    
    if (this._visualContainerManager && this._visualContainerManager._visualContainer) {
      const visualContainer = this._visualContainerManager._visualContainer;
      [containerX, containerY] = visualContainer.get_transformed_position();
      containerWidth = visualContainer.get_width();
    } else {
      // Fallback to input container
      [containerX, containerY] = this._inputButtonsContainer.get_transformed_position();
      containerWidth = this._inputButtonsContainer.get_width();
    }
    
    // Set menu width to match the container
    menuActor.set_width(containerWidth);
    
    // Position above the container with a small gap
    const [menuWidth, menuHeight] = menuActor.get_size();
    menuActor.set_position(
      containerX,
      containerY - menuHeight - 8
    );
  }

  _applySettingsMenuStyling() {
    if (!this._settingsMenu) return;
    
    // Get the same color settings as the visual container
    const inputBgColor = this._settings.get_string("input-container-background-color");
    const inputOpacity = this._settings.get_double("input-container-opacity");
    
    // Parse the color and apply opacity
    let r, g, b;
    if (inputBgColor.startsWith("#")) {
      const hex = inputBgColor.slice(1);
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    } else if (inputBgColor.startsWith("rgb(")) {
      const match = inputBgColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (match) {
        r = parseInt(match[1]);
        g = parseInt(match[2]);
        b = parseInt(match[3]);
      }
    } else {
      // Default to dark grey if parsing fails
      r = 30;
      g = 30;
      b = 30;
    }
    
    // Apply the color with opacity to the menu (no shadow)
    const menuActor = this._settingsMenu.actor || this._settingsMenu;
    const menuBox = this._settingsMenu.box;
    
    const backgroundColor = `rgba(${r}, ${g}, ${b}, ${inputOpacity})`;
    
    if (menuBox) {
      menuBox.set_style(`
        background-color: ${backgroundColor};
        border-radius: 16px;
        padding: 12px;
        margin: 0;
        spacing: 2px;
        border: none;
      `);
    }
  }

  _applyAboutMenuStyling() {
    if (!this._aboutMenu) return;
    
    // Get the same color settings as the visual container
    const inputBgColor = this._settings.get_string("input-container-background-color");
    const inputOpacity = this._settings.get_double("input-container-opacity");
    
    // Parse the color and apply opacity
    let r, g, b;
    if (inputBgColor.startsWith("#")) {
      const hex = inputBgColor.slice(1);
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    } else if (inputBgColor.startsWith("rgb(")) {
      const match = inputBgColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (match) {
        r = parseInt(match[1]);
        g = parseInt(match[2]);
        b = parseInt(match[3]);
      }
    } else {
      // Default to dark grey if parsing fails
      r = 30;
      g = 30;
      b = 30;
    }
    
    // Apply the color with opacity to the menu (no shadow)
    const menuActor = this._aboutMenu.actor || this._aboutMenu;
    const menuBox = this._aboutMenu.box;
    
    const backgroundColor = `rgba(${r}, ${g}, ${b}, ${inputOpacity})`;
    
    if (menuBox) {
      menuBox.set_style(`
        background-color: ${backgroundColor};
        border-radius: 16px;
        padding: 12px;
        margin: 0;
        spacing: 2px;
        border: none;
      `);
    }
  }

  _generateShadowCss() {
    let shadowColor, shadowOpacity, shadowBlur, shadowOffsetX, shadowOffsetY;
    
    try {
      shadowColor = this._settings.get_string("shadow-color");
      shadowOpacity = this._settings.get_double("shadow-opacity");
      shadowBlur = this._settings.get_double("shadow-blur");
      shadowOffsetX = this._settings.get_double("shadow-offset-x");
      shadowOffsetY = this._settings.get_double("shadow-offset-y");
    } catch (e) {
      // Fallback to defaults if settings aren't available yet
      shadowColor = "#000000";
      shadowOpacity = 0.3;
      shadowBlur = 20.0;
      shadowOffsetX = 0.0;
      shadowOffsetY = 4.0;
    }
    
    // Parse shadow color components
    let shadowR, shadowG, shadowB;
    if (shadowColor.startsWith("#")) {
      shadowR = parseInt(shadowColor.substring(1, 3), 16);
      shadowG = parseInt(shadowColor.substring(3, 5), 16);
      shadowB = parseInt(shadowColor.substring(5, 7), 16);
    } else {
      // Default to black if parsing fails
      shadowR = 0;
      shadowG = 0;
      shadowB = 0;
    }
    
    return `box-shadow: ${shadowOffsetX}px ${shadowOffsetY}px ${shadowBlur}px rgba(${shadowR}, ${shadowG}, ${shadowB}, ${shadowOpacity});`;
  }

  _populateSettingsMenu() {
    this._settingsMenu.removeAll();

    const headerItem = new PopupMenu.PopupMenuItem("Settings", {
      reactive: false,
      style_class: 'settings-header'
    });
    this._settingsMenu.addMenuItem(headerItem);

    this._settingsMenu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    // Temperature input
    const temperatureItem = new PopupMenu.PopupBaseMenuItem({
      style_class: 'settings-menu-item',
    });
    const temperatureLabel = new St.Label({ 
      text: "Temperature",
      y_expand: true,
      y_align: Clutter.ActorAlign.CENTER
    });
    const temperatureEntry = new St.Entry({
      text: this._currentTemperature.toString(),
      can_focus: true,
      x_expand: true,
      style: "font-size: inherit; background-color: #3a3a3a;"
    });
    this._temperatureEntry = temperatureEntry;

    // Handle text changes
    temperatureEntry.clutter_text.connect('text-changed', () => {
      // Save the value immediately on text change
      this._saveTemperatureValue();
    });
    
    // Handle key press events (for Enter key)
    temperatureEntry.clutter_text.connect('key-press-event', (actor, event) => {
      // Check if Enter was pressed
      if (event.get_key_symbol() === Clutter.KEY_Return || 
          event.get_key_symbol() === Clutter.KEY_KP_Enter) {
        this._saveTemperatureValue();
        return Clutter.EVENT_STOP;
      }
      return Clutter.EVENT_PROPAGATE;
    });
    
    // Also handle focus out
    temperatureEntry.connect("key-focus-out", () => {
      this._saveTemperatureValue();
    });

    temperatureItem.actor.add_child(temperatureLabel);
    temperatureItem.actor.add_child(temperatureEntry);
    this._settingsMenu.addMenuItem(temperatureItem);
    
    // Model Prompt input
    const promptItem = new PopupMenu.PopupBaseMenuItem({
      style_class: 'settings-menu-item',
    });
    const promptLabel = new St.Label({ 
      text: "Model Prompt",
      y_expand: true,
      y_align: Clutter.ActorAlign.CENTER
    });
    const promptEntry = new St.Entry({
      text: this._currentPrompt,
      can_focus: true,
      x_expand: true,
      style: "font-size: inherit; background-color: #3a3a3a;"
    });
    this._promptEntry = promptEntry;
    
    // Handle text changes
    promptEntry.clutter_text.connect('text-changed', () => {
      // Save the value immediately on text change
      this._savePromptValue();
    });
    
    // Handle key press events (for Enter key)
    promptEntry.clutter_text.connect('key-press-event', (actor, event) => {
      // Check if Enter was pressed
      if (event.get_key_symbol() === Clutter.KEY_Return || 
          event.get_key_symbol() === Clutter.KEY_KP_Enter) {
        this._savePromptValue();
        return Clutter.EVENT_STOP;
      }
      return Clutter.EVENT_PROPAGATE;
    });
    
    // Also handle focus out
    promptEntry.connect("key-focus-out", () => {
      this._savePromptValue();
    });
    
    promptItem.actor.add_child(promptLabel);
    promptItem.actor.add_child(promptEntry);
    this._settingsMenu.addMenuItem(promptItem);
    
    this._settingsMenu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    // Export Chat button
    const exportMenuItem = new PopupMenu.PopupBaseMenuItem({
      style_class: 'settings-menu-item',
    });
    const exportLabel = new St.Label({
      text: "Export Chat",
      y_expand: true,
      y_align: Clutter.ActorAlign.CENTER
    });
    exportMenuItem.actor.add_child(exportLabel);
    this._settingsMenu.addMenuItem(exportMenuItem);
    
    // About button
    const aboutMenuItem = new PopupMenu.PopupBaseMenuItem({
      style_class: 'settings-menu-item',
    });
    const aboutLabel = new St.Label({
      text: "About",
      y_expand: true,
      y_align: Clutter.ActorAlign.CENTER
    });
    aboutMenuItem.actor.add_child(aboutLabel);
    this._settingsMenu.addMenuItem(aboutMenuItem);
    
    exportMenuItem.connect("activate", () => {
      this._handleSettingAction("Export Chat");
    });
    
    aboutMenuItem.connect("activate", () => {
      this._handleSettingAction("About");
    });
  }

  _openPromptDialog() {
    this._settingsMenu.close();
    
    // Placeholder method for the Model Prompt dialog
    // This is kept as a placeholder without actual functionality
  }

  _handleSettingAction(action) {
    // Save settings before performing action
    this._savePromptValue();
    this._saveTemperatureValue();
    this._settingsMenu.close();
    
    if (action === "Export Chat") {
      this._exportChatHistory();
    } else if (action === "About") {
      this._showAboutPopup();
    }
  }

  _showAboutPopup() {
    // Notify popup manager before opening
    if (!this._popupManager.notifyOpen('about')) {
      return;
    }
    
    // Create the About popup menu if it doesn't exist
    if (!this._aboutMenu) {
      this._aboutMenu = new PopupMenu.PopupMenu(
        new St.Button(),
        0.0,
        St.Side.BOTTOM
      );
      Main.uiGroup.add_child(this._aboutMenu.actor);
      this._aboutMenu.actor.hide();

      this._aboutMenu.actor.add_style_class_name("settings-menu-popup");

      if (this._aboutMenu.box) {
        this._aboutMenu.box.add_style_class_name("settings-menu-box");
      }

      // Setup close on click outside
      this._aboutEventId = global.stage.connect(
        "button-press-event",
        (actor, event) => {
          if (this._aboutMenu && this._aboutMenu.isOpen) {
            const [x, y] = event.get_coords();
            const menuActor = this._aboutMenu.actor || this._aboutMenu;
            const [menuX, menuY] = menuActor.get_transformed_position();
            const [menuWidth, menuHeight] = menuActor.get_size();

            if (
              !(
                x >= menuX &&
                x <= menuX + menuWidth &&
                y >= menuY &&
                y <= menuY + menuHeight
              )
            ) {
              this._aboutMenu.close();
            }
          }
          return Clutter.EVENT_PROPAGATE;
        }
      );
      
      // Register with popup manager
      this._popupManager.registerPopup('about', {
        isOpenFn: () => this._aboutMenu && this._aboutMenu.isOpen,
        closeFn: () => {
          if (this._aboutMenu && this._aboutMenu.isOpen) {
            this._aboutMenu.close();
          }
        }
      });
    }

    // Apply the same styling as the settings menu
    this._applyAboutMenuStyling();

    // Clear and populate the about menu
    this._aboutMenu.removeAll();

    // Add header
    const headerItem = new PopupMenu.PopupMenuItem("About", {
      reactive: false,
      style_class: 'settings-header'
    });
    this._aboutMenu.addMenuItem(headerItem);
    this._aboutMenu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    // Add about content with text wrapping
    const createWrappingMenuItem = (text) => {
      const item = new PopupMenu.PopupBaseMenuItem({
        reactive: false,
        style_class: 'settings-menu-item',
      });
      
      const label = new St.Label({ 
        text,
        y_expand: true,
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER
      });
      
      // Enable text wrapping
      label.clutter_text.line_wrap = true;
      label.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
      label.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
      
      item.actor.add_child(label);
      return item;
    };

    this._aboutMenu.addMenuItem(createWrappingMenuItem("Name: Linux Copilot"));
    this._aboutMenu.addMenuItem(createWrappingMenuItem("Version: 1.0"));
    this._aboutMenu.addMenuItem(createWrappingMenuItem("Author: TheoThePerson"));
    this._aboutMenu.addMenuItem(createWrappingMenuItem("If you have any questions, feel free to contact me at gnomelama@gmail.com"));
    this._aboutMenu.addMenuItem(createWrappingMenuItem("You can contribute to GnomeLama here by either opening an issue or a pull request: https://github.com/TheoThePerson/GnomeLama"));

    // Position the about menu in the same place as the settings menu
    const menuActor = this._aboutMenu.actor || this._aboutMenu;
    
    // Use visual container if available, otherwise fall back to input container
    let containerX, containerY, containerWidth;
    
    if (this._visualContainerManager && this._visualContainerManager._visualContainer) {
      const visualContainer = this._visualContainerManager._visualContainer;
      [containerX, containerY] = visualContainer.get_transformed_position();
      containerWidth = visualContainer.get_width();
    } else {
      // Fallback to input container
      [containerX, containerY] = this._inputButtonsContainer.get_transformed_position();
      containerWidth = this._inputButtonsContainer.get_width();
    }
    
    // Set menu width to match the container
    menuActor.set_width(containerWidth);
    
    // Open the menu and position it
    this._aboutMenu.open();
    
    // Position after opening to ensure correct sizing
    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
      const [menuWidth, menuHeight] = menuActor.get_size();
      menuActor.set_position(
        containerX,
        containerY - menuHeight - 8
      );
      return GLib.SOURCE_REMOVE;
    });
  }

  _exportChatHistory() {
    if (!this._getConversationHistory) {
      return;
    }
    
    try {
      const history = this._getConversationHistory();
      if (!history || history.length === 0) {
        // No history to export
        Main.notify("No chat history to export");
        return;
      }
      
      // Format the conversation history
      let formattedHistory = "";
      const timestamp = new Date().toISOString().replace(/:/gu, '-').replace(/\..+/u, '');

      history.forEach(msg => {
        let prefix;
        if (msg.type === "user") {
          prefix = "User: ";
        } else if (msg.type === "system") {
          prefix = "System prompt: ";
        } else {
          prefix = "Assistant: ";
        }
        formattedHistory += prefix + msg.text + "\n\n";
      });
      
      // Create a temporary file to hold the formatted history
      const tempDir = GLib.get_tmp_dir();
      const tempFilePath = GLib.build_filenamev([tempDir, `chat_export_${timestamp}.txt`]);
      
      // Write the content to the temporary file
      const ByteArray = imports.byteArray;
      const contentBytes = ByteArray.fromString(formattedHistory);
      
      if (!GLib.file_set_contents(tempFilePath, contentBytes)) {
        console.error(`Failed to create temporary file at ${tempFilePath}`);
        Main.notify("Failed to create temporary file");
        return;
      }
      
      // Use an asynchronous approach to run zenity without freezing GNOME Shell
      // Prepare the default filename
      const defaultFilename = `${GLib.get_home_dir()}/chat_export_${timestamp}.txt`;
      
      // Create a script that handles the zenity dialog and file copying
      const scriptContent = `
#!/bin/bash
RESULT=$(zenity --file-selection --save --filename="${defaultFilename}" --title="Save Chat Export" --file-filter="*.txt")
if [ $? -eq 0 ] && [ -n "$RESULT" ]; then
  # Copy the content to the selected file
  cat "${tempFilePath}" > "$RESULT"
  if [ $? -eq 0 ]; then
    echo "Chat exported to $RESULT"
  else
    echo "Failed to write to $RESULT"
  fi
fi
# Remove the temp file
rm "${tempFilePath}"
`;
      
      // Create a temporary script file
      const scriptPath = GLib.build_filenamev([tempDir, `export_chat_${timestamp}.sh`]);
      if (!GLib.file_set_contents(scriptPath, ByteArray.fromString(scriptContent))) {
        console.error(`Failed to create script file at ${scriptPath}`);
        Main.notify("Failed to create export script");
        return;
      }
      
      // Make the script executable
      GLib.spawn_command_line_sync(`chmod +x "${scriptPath}"`);
      
      // Run the script asynchronously without opening a terminal
      GLib.spawn_command_line_async(`"${scriptPath}"`);
      
    } catch (error) {
      console.error(`Error exporting chat history: ${error.message}`);
      Main.notify(`Error: ${error.message}`);
    }
  }

  /**
   * Closes all popups except the specified one
   * @deprecated Use the global popup manager instead
   * @param {string} except - The popup to keep open ("settings", "about", or null to close all)
   */
  _closeAllPopupsExcept(except) {
    // Use the popup manager instead
    this._popupManager.closeAllExcept(except);
  }

  closeMenu() {
    // Close all popups
    this._popupManager.closeAllExcept(null);
  }

  isMenuOpen() {
    // Check if any of our popups are open
    return this._popupManager.isAnyPopupOpen();
  }

  destroy() {
    if (this._stageEventId) {
      global.stage.disconnect(this._stageEventId);
      this._stageEventId = null;
    }

    if (this._aboutEventId) {
      global.stage.disconnect(this._aboutEventId);
      this._aboutEventId = null;
    }

    if (this._settingsChangedId) {
      this._settings.disconnect(this._settingsChangedId);
      this._settingsChangedId = null;
    }

    // Unregister from popup manager
    this._popupManager.unregisterPopup('settings');
    this._popupManager.unregisterPopup('about');

    if (this._settingsMenu) {
      this._settingsMenu.destroy();
      this._settingsMenu = null;
    }

    if (this._aboutMenu) {
      this._aboutMenu.destroy();
      this._aboutMenu = null;
    }
  }
}