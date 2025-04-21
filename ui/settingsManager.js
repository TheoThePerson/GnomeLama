/**
 * Settings manager functionality for the panel UI
 */
import Clutter from "gi://Clutter";
import St from "gi://St";
import GLib from "gi://GLib";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";

export class SettingsManager {
  constructor(settings, inputButtonsContainer) {
    this._settings = settings;
    this._inputButtonsContainer = inputButtonsContainer;
    this._settingsMenu = null;
    this._settingsButton = null;
    this._settingsIcon = null;
    this._stageEventId = null;
  }

  setupSettingsButton(button, icon) {
    this._settingsButton = button;
    this._settingsIcon = icon;

    this._setupSettingsMenu();
    this._settingsButton.connect("button-press-event", () => {
      this._settingsMenu.toggle();
      return Clutter.EVENT_STOP;
    });
  }

  async _setupSettingsMenu() {
    this._settingsMenu = new PopupMenu.PopupMenu(
      new St.Button(),
      0.0,
      St.Side.BOTTOM
    );
    Main.uiGroup.add_child(this._settingsMenu.actor);
    this._settingsMenu.actor.hide();

    // Apply CSS class to the menu actor
    this._settingsMenu.actor.add_style_class_name("settings-menu-popup");

    // Add CSS class to the menu box
    if (this._settingsMenu.box) {
      this._settingsMenu.box.add_style_class_name("settings-menu-box");
    }

    this._settingsMenu.connect("open-state-changed", (menu, isOpen) => {
      if (isOpen) {
        this._positionSettingsMenu();
      }
    });

    // Connect to global stage for detecting outside clicks
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
            this._settingsMenu.close();
          }
        }
        return Clutter.EVENT_PROPAGATE;
      }
    );

    this._populateSettingsMenu();
  }

  _positionSettingsMenu() {
    // Get menu actor
    const menuActor = this._settingsMenu.actor || this._settingsMenu;

    // Get menu height and width
    const [menuWidth, menuHeight] = menuActor.get_size();

    // Position it above the input field container
    const [inputX, inputY] = this._inputButtonsContainer.get_transformed_position();
    const inputWidth = this._inputButtonsContainer.get_width();

    // Get the model button position (which should be on the left)
    const panelWidth = this._inputButtonsContainer.get_parent().get_width();
    
    // Position the menu on the left side of the panel
    menuActor.set_position(
      inputX,
      inputY - menuHeight - 8
    );
  }

  _populateSettingsMenu() {
    this._settingsMenu.removeAll();

    // Add a header
    const headerItem = new PopupMenu.PopupMenuItem("Settings", {
      reactive: false
    });
    this._settingsMenu.addMenuItem(headerItem);

    // Add separator
    this._settingsMenu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    // Temperature item (just a display for now)
    const tempValue = this._settings.get_double("temperature") || 0.7;
    const temperatureItem = new PopupMenu.PopupMenuItem(`Temperature: ${tempValue.toFixed(1)}`);
    temperatureItem.connect('activate', () => {
      this._openTemperatureDialog();
    });
    this._settingsMenu.addMenuItem(temperatureItem);
    
    // Store reference to update later
    this._temperatureMenuItem = temperatureItem;

    // Model prompt item
    const currentPrompt = this._settings.get_string("model-prompt") || "";
    const promptItem = new PopupMenu.PopupMenuItem(`Model Prompt: ${currentPrompt}`);
    promptItem.connect('activate', () => {
      this._openPromptDialog();
    });
    this._settingsMenu.addMenuItem(promptItem);
    
    // Store reference to update later
    this._promptMenuItem = promptItem;
    
    // Add separator
    this._settingsMenu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    // Export chat item
    const exportMenuItem = new PopupMenu.PopupMenuItem("Export Chat");
    this._settingsMenu.addMenuItem(exportMenuItem);
    
    // About item
    const aboutMenuItem = new PopupMenu.PopupMenuItem("About");
    this._settingsMenu.addMenuItem(aboutMenuItem);
    
    // Connect handlers for action items
    exportMenuItem.connect("activate", () => {
      this._handleSettingAction("Export Chat");
    });
    
    aboutMenuItem.connect("activate", () => {
      this._handleSettingAction("About");
    });
  }

  _openPromptDialog() {
    // Close the settings menu
    this._settingsMenu.close();
    
    // Create a dialog to edit the prompt
    const dialog = new St.Entry({
      text: this._settings.get_string("model-prompt") || "",
      hint_text: "Enter model prompt",
      can_focus: true,
      x_expand: true,
      y_expand: true
    });
    
    // Create a simple modal overlay
    const overlay = new St.Widget({
      reactive: true,
      style_class: "modal-overlay",
      style: "background-color: rgba(0,0,0,0.5); z-index: 999;"
    });
    
    // Add dialog to overlay
    const content = new St.BoxLayout({
      vertical: true,
      style: "background-color: #2a2a2a; padding: 20px; border-radius: 8px; min-width: 300px;"
    });
    
    const title = new St.Label({
      text: "Edit Model Prompt",
      style: "font-weight: bold; font-size: 14px; margin-bottom: 10px;"
    });
    
    const buttonBox = new St.BoxLayout({
      style: "margin-top: 20px; spacing: 8px;",
      x_expand: true
    });
    
    const cancelButton = new St.Button({
      label: "Cancel",
      style_class: "button",
      style: "padding: 8px 16px;"
    });
    
    const saveButton = new St.Button({
      label: "Save",
      style_class: "button",
      style: "padding: 8px 16px;"
    });
    
    buttonBox.add_child(new St.Widget({ x_expand: true }));
    buttonBox.add_child(cancelButton);
    buttonBox.add_child(saveButton);
    
    content.add_child(title);
    content.add_child(dialog);
    content.add_child(buttonBox);
    
    // Position the dialog
    overlay.set_size(global.screen_width, global.screen_height);
    overlay.add_child(content);
    
    content.set_position(
      Math.floor((global.screen_width - 300) / 2),
      Math.floor((global.screen_height - 150) / 2)
    );
    
    // Add to the UI
    Main.uiGroup.add_child(overlay);
    global.stage.set_key_focus(dialog);
    
    // Handle button clicks
    cancelButton.connect('clicked', () => {
      Main.uiGroup.remove_child(overlay);
      overlay.destroy();
    });
    
    saveButton.connect('clicked', () => {
      const promptText = dialog.get_text();
      this._settings.set_string("model-prompt", promptText);
      this._promptMenuItem.label.text = `Model Prompt: ${promptText}`;
      Main.uiGroup.remove_child(overlay);
      overlay.destroy();
    });
  }

  _openTemperatureDialog() {
    // Close the settings menu
    this._settingsMenu.close();
    
    // Create a dialog to edit the temperature
    const tempValue = this._settings.get_double("temperature") || 0.7;
    const dialog = new St.Entry({
      text: tempValue.toString(),
      hint_text: "Enter temperature (0.0-1.0)",
      can_focus: true,
      x_expand: true,
      y_expand: true
    });
    
    // Create a simple modal overlay
    const overlay = new St.Widget({
      reactive: true,
      style_class: "modal-overlay",
      style: "background-color: rgba(0,0,0,0.5); z-index: 999;"
    });
    
    // Add dialog to overlay
    const content = new St.BoxLayout({
      vertical: true,
      style: "background-color: #2a2a2a; padding: 20px; border-radius: 8px; min-width: 300px;"
    });
    
    const title = new St.Label({
      text: "Set Temperature",
      style: "font-weight: bold; font-size: 14px; margin-bottom: 10px;"
    });
    
    const instruction = new St.Label({
      text: "Value between 0.0 and 1.0",
      style: "font-size: 12px; margin-bottom: 15px; color: #aaa;"
    });
    
    const buttonBox = new St.BoxLayout({
      style: "margin-top: 20px; spacing: 8px;",
      x_expand: true
    });
    
    const cancelButton = new St.Button({
      label: "Cancel",
      style_class: "button",
      style: "padding: 8px 16px;"
    });
    
    const saveButton = new St.Button({
      label: "Save",
      style_class: "button",
      style: "padding: 8px 16px;"
    });
    
    buttonBox.add_child(new St.Widget({ x_expand: true }));
    buttonBox.add_child(cancelButton);
    buttonBox.add_child(saveButton);
    
    content.add_child(title);
    content.add_child(instruction);
    content.add_child(dialog);
    content.add_child(buttonBox);
    
    // Position the dialog
    overlay.set_size(global.screen_width, global.screen_height);
    overlay.add_child(content);
    
    content.set_position(
      Math.floor((global.screen_width - 300) / 2),
      Math.floor((global.screen_height - 150) / 2)
    );
    
    // Add to the UI
    Main.uiGroup.add_child(overlay);
    global.stage.set_key_focus(dialog);
    
    // Handle button clicks
    cancelButton.connect('clicked', () => {
      Main.uiGroup.remove_child(overlay);
      overlay.destroy();
    });
    
    saveButton.connect('clicked', () => {
      try {
        const tempText = dialog.get_text();
        const newTemp = parseFloat(tempText);
        
        // Validate the input
        if (!isNaN(newTemp) && newTemp >= 0 && newTemp <= 1) {
          this._settings.set_double("temperature", newTemp);
          this._temperatureMenuItem.label.text = `Temperature: ${newTemp.toFixed(1)}`;
          Main.uiGroup.remove_child(overlay);
          overlay.destroy();
        } else {
          // Highlight the input in red to indicate error
          dialog.style = "background-color: rgba(255,0,0,0.2);";
        }
      } catch (e) {
        // Handle any errors
        dialog.style = "background-color: rgba(255,0,0,0.2);";
      }
    });
  }

  _handleSettingAction(action) {
    // Placeholder function for handling settings actions
    // This would be implemented to handle different setting actions
    this._settingsMenu.close();
  }

  closeMenu() {
    if (this._settingsMenu && this._settingsMenu.isOpen) {
      this._settingsMenu.close();
    }
  }

  isMenuOpen() {
    return this._settingsMenu && this._settingsMenu.isOpen;
  }

  destroy() {
    if (this._stageEventId) {
      global.stage.disconnect(this._stageEventId);
      this._stageEventId = null;
    }

    if (this._settingsMenu) {
      this._settingsMenu.destroy();
      this._settingsMenu = null;
    }
  }
}