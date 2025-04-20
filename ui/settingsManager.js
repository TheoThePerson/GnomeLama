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

    // Position above the input container with small padding
    // Align with left side of input container with a small margin
    menuActor.set_position(
      inputX + 10, // Small margin from left edge
      inputY - menuHeight - 8
    );
  }

  _populateSettingsMenu() {
    this._settingsMenu.removeAll();

    // Add a header
    const headerItem = new PopupMenu.PopupMenuItem("Settings", {
      style_class: "settings-header-item",
      reactive: false
    });
    headerItem.actor.add_style_class_name("settings-header");
    this._settingsMenu.addMenuItem(headerItem);

    // Add separator
    this._settingsMenu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    // Add example setting items (placeholder)
    const settingItems = [
      { name: "Appearance", icon: "preferences-desktop-appearance-symbolic" },
      { name: "Models", icon: "system-run-symbolic" },
      { name: "Export chat", icon: "document-save-symbolic" },
      { name: "About", icon: "help-about-symbolic" }
    ];

    settingItems.forEach(item => {
      const menuItem = new PopupMenu.PopupMenuItem(item.name, {
        style_class: "settings-menu-item",
      });

      const icon = new St.Icon({
        icon_name: item.icon,
        style_class: "popup-menu-icon",
      });
      menuItem.actor.insert_child_at_index(icon, 0);

      menuItem.connect("activate", () => {
        this._handleSettingAction(item.name);
      });

      this._settingsMenu.addMenuItem(menuItem);
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