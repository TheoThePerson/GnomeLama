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

    this._settingsMenu.actor.add_style_class_name("settings-menu-popup");

    if (this._settingsMenu.box) {
      this._settingsMenu.box.add_style_class_name("settings-menu-box");
    }

    this._settingsMenu.connect("open-state-changed", (menu, isOpen) => {
      if (isOpen) {
        this._positionSettingsMenu();
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
            this._settingsMenu.close();
          }
        }
        return Clutter.EVENT_PROPAGATE;
      }
    );

    this._populateSettingsMenu();
  }

  _positionSettingsMenu() {
    const menuActor = this._settingsMenu.actor || this._settingsMenu;
    const [menuWidth, menuHeight] = menuActor.get_size();
    const [inputX, inputY] = this._inputButtonsContainer.get_transformed_position();
    const inputWidth = this._inputButtonsContainer.get_width();
    
    // Set a fixed width for the menu to match input container
    menuActor.set_width(inputWidth);
    
    menuActor.set_position(
      inputX,
      inputY - menuHeight - 8
    );
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
    const tempValue = this._settings.get_double("temperature") || 0.7;
    const temperatureItem = new PopupMenu.PopupBaseMenuItem({
      style_class: 'settings-menu-item',
    });
    const temperatureLabel = new St.Label({ 
      text: "Temperature",
      y_expand: true,
      y_align: Clutter.ActorAlign.CENTER
    });
    const temperatureEntry = new St.Entry({
      text: tempValue.toString(),
      can_focus: true,
      x_expand: true,
      style: "font-size: inherit; background-color: #3a3a3a;"
    });

    temperatureEntry.connect("key-focus-out", () => {
      const newTemp = parseFloat(temperatureEntry.get_text());
      if (!isNaN(newTemp) && newTemp >= 0 && newTemp <= 1) {
        this._settings.set_double("temperature", newTemp);
      } else {
        temperatureEntry.set_text(tempValue.toString());
      }
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
      text: "",
      can_focus: true,
      x_expand: true,
      style: "font-size: inherit; background-color: #3a3a3a;"
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