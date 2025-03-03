import Gio from "gi://Gio";
import Gtk from "gi://Gtk";
import GObject from "gi://GObject";
import Gdk from "gi://Gdk";
import Adw from "gi://Adw";
import {
  ExtensionPreferences,
  gettext as _,
} from "resource:///org/gnome/shell/extensions/prefs.js";

const Me = ExtensionPreferences.lookupByURL(import.meta.url);

export default class GnomeLamaPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    // Get settings
    const settings = this.getSettings("org.gnomelama");

    // Create a preferences page for appearance settings
    const appearancePage = new Adw.PreferencesPage({
      title: _("Appearance"),
      icon_name: "preferences-desktop-appearance-symbolic",
    });
    window.add(appearancePage);

    // Layout group
    const layoutGroup = new Adw.PreferencesGroup({
      title: _("Layout"),
    });
    appearancePage.add(layoutGroup);

    // Panel width
    this._addSpinRow(
      layoutGroup,
      settings,
      "panel-width-fraction",
      _("Panel Width"),
      _("Fraction of screen width occupied by the panel"),
      0.05,
      0.5,
      0.01
    );

    // Input field height
    this._addSpinRow(
      layoutGroup,
      settings,
      "input-field-height-fraction",
      _("Input Field Height"),
      _("Height of the input field as a fraction of screen height"),
      0.01,
      0.1,
      0.005
    );

    // Padding group
    const paddingGroup = new Adw.PreferencesGroup({
      title: _("Padding"),
    });
    appearancePage.add(paddingGroup);

    // Horizontal padding
    this._addSpinRow(
      paddingGroup,
      settings,
      "padding-fraction-x",
      _("Horizontal Padding"),
      _("Horizontal padding as a fraction of screen width"),
      0.005,
      0.05,
      0.005
    );

    // Vertical padding
    this._addSpinRow(
      paddingGroup,
      settings,
      "padding-fraction-y",
      _("Vertical Padding"),
      _("Vertical padding as a fraction of screen height"),
      0.005,
      0.05,
      0.005
    );

    // Top bar height
    this._addSpinRow(
      paddingGroup,
      settings,
      "top-bar-height-fraction",
      _("Top Bar Height"),
      _("Height of the top bar as a fraction of screen height"),
      0.01,
      0.1,
      0.005
    );

    // Create a preferences page for colors
    const colorsPage = new Adw.PreferencesPage({
      title: _("Colors"),
      icon_name: "preferences-color-symbolic",
    });
    window.add(colorsPage);

    // Message colors group
    const colorsGroup = new Adw.PreferencesGroup({
      title: _("Message Colors"),
    });
    colorsPage.add(colorsGroup);

    // User message color
    this._addColorRow(
      colorsGroup,
      settings,
      "user-message-color",
      _("User Message Color"),
      _("Color of user messages")
    );

    // AI message color
    this._addColorRow(
      colorsGroup,
      settings,
      "ai-message-color",
      _("AI Message Color"),
      _("Color of AI assistant messages")
    );
  }

  // Helper function to add a spin button row
  _addSpinRow(group, settings, key, title, subtitle, min, max, step) {
    // Create a spin button
    const spinButton = new Gtk.SpinButton({
      adjustment: new Gtk.Adjustment({
        lower: min,
        upper: max,
        step_increment: step,
      }),
      digits: 3,
      valign: Gtk.Align.CENTER,
    });

    // Set the current value
    spinButton.set_value(settings.get_double(key));

    // Connect to value-changed signal
    spinButton.connect("value-changed", () => {
      settings.set_double(key, spinButton.get_value());
    });

    // Create a preferences row for the spin button
    const row = new Adw.ActionRow({
      title: title,
      subtitle: subtitle,
    });
    row.add_suffix(spinButton);
    row.activatable_widget = spinButton;
    group.add(row);
  }

  // Helper function to add a color button row
  _addColorRow(group, settings, key, title, subtitle) {
    // Create a color button
    const colorButton = new Gtk.ColorButton({
      valign: Gtk.Align.CENTER,
      rgba: this._hexToRGBA(settings.get_string(key)),
    });

    // Connect to color-set signal
    colorButton.connect("color-set", () => {
      const rgba = colorButton.get_rgba();
      settings.set_string(key, this._RGBAtoHex(rgba));
    });

    // Create a preferences row for the color button
    const row = new Adw.ActionRow({
      title: title,
      subtitle: subtitle,
    });
    row.add_suffix(colorButton);
    row.activatable_widget = colorButton;
    group.add(row);
  }

  // Color conversion helpers
  _hexToRGBA(hex) {
    let r = parseInt(hex.substring(1, 3), 16) / 255;
    let g = parseInt(hex.substring(3, 5), 16) / 255;
    let b = parseInt(hex.substring(5, 7), 16) / 255;
    return new Gdk.RGBA({ red: r, green: g, blue: b, alpha: 1 });
  }

  _RGBAtoHex(rgba) {
    let r = Math.round(rgba.red * 255)
      .toString(16)
      .padStart(2, "0");
    let g = Math.round(rgba.green * 255)
      .toString(16)
      .padStart(2, "0");
    let b = Math.round(rgba.blue * 255)
      .toString(16)
      .padStart(2, "0");
    return `#${r}${g}${b}`;
  }
}
