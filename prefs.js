import Gtk from "gi://Gtk";
import Gdk from "gi://Gdk";
import Adw from "gi://Adw";
import {
  ExtensionPreferences,
  gettext as _,
} from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

export default class GnomeLamaPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    // Get settings directly from the extension instance
    const settings = this.getSettings("org.gnome.shell.extensions.gnomelama");

    // Create preference pages
    this._createAppearancePage(window, settings);
    this._createColorsPage(window, settings);
    this._createApiSettingsPage(window, settings);
  }

  /**
   * Create the appearance settings page
   * @param {Adw.PreferencesWindow} window - The preferences window
   * @param {Gio.Settings} settings - The settings object
   */
  _createAppearancePage(window, settings) {
    const appearancePage = new Adw.PreferencesPage({
      title: _("Appearance"),
      icon_name: "preferences-desktop-appearance-symbolic",
    });
    window.add(appearancePage);

    this._addLayoutGroup(appearancePage, settings);
    this._addPaddingGroup(appearancePage, settings);
    this._addIconGroup(appearancePage, settings);
  }

  /**
   * Add layout settings group to the appearance page
   * @param {Adw.PreferencesPage} page - The parent page
   * @param {Gio.Settings} settings - The settings object
   */
  _addLayoutGroup(page, settings) {
    const layoutGroup = new Adw.PreferencesGroup({
      title: _("Layout"),
    });
    page.add(layoutGroup);

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
  }

  /**
   * Add padding settings group to the appearance page
   * @param {Adw.PreferencesPage} page - The parent page
   * @param {Gio.Settings} settings - The settings object
   */
  _addPaddingGroup(page, settings) {
    const paddingGroup = new Adw.PreferencesGroup({
      title: _("Padding"),
    });
    page.add(paddingGroup);

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
  }

  /**
   * Add icon settings group to the appearance page
   * @param {Adw.PreferencesPage} page - The parent page
   * @param {Gio.Settings} settings - The settings object
   */
  _addIconGroup(page, settings) {
    const iconGroup = new Adw.PreferencesGroup({
      title: _("Icons"),
    });
    page.add(iconGroup);

    // Button icon scale
    this._addSpinRow(
      iconGroup,
      settings,
      "button-icon-scale",
      _("Button Icon Scale"),
      _("Scale factor for the clear and file button icons"),
      0.5,
      1.5,
      0.1
    );

    // Send button icon scale
    this._addSpinRow(
      iconGroup,
      settings,
      "send-button-icon-scale",
      _("Send Button Icon Scale"),
      _("Scale factor for the send button icon"),
      0.5,
      1.5,
      0.1
    );
  }

  /**
   * Create the colors settings page
   * @param {Adw.PreferencesWindow} window - The preferences window
   * @param {Gio.Settings} settings - The settings object
   */
  _createColorsPage(window, settings) {
    const colorsPage = new Adw.PreferencesPage({
      title: _("Colors"),
      icon_name: "preferences-color-symbolic",
    });
    window.add(colorsPage);

    this._addMessageColorsGroup(colorsPage, settings);
    this._addUIColorsGroup(colorsPage, settings);
  }

  /**
   * Add message colors group to the colors page
   * @param {Adw.PreferencesPage} page - The parent page
   * @param {Gio.Settings} settings - The settings object
   */
  _addMessageColorsGroup(page, settings) {
    const colorsGroup = new Adw.PreferencesGroup({
      title: _("Message Colors"),
    });
    page.add(colorsGroup);

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

  /**
   * Add UI colors group to the colors page
   * @param {Adw.PreferencesPage} page - The parent page
   * @param {Gio.Settings} settings - The settings object
   */
  _addUIColorsGroup(page, settings) {
    const uiColorsGroup = new Adw.PreferencesGroup({
      title: _("UI Colors"),
    });
    page.add(uiColorsGroup);

    // Background color
    this._addColorRow(
      uiColorsGroup,
      settings,
      "background-color",
      _("Background Color"),
      _("Background color of the panel")
    );

    // Background opacity
    this._addSpinRow(
      uiColorsGroup,
      settings,
      "background-opacity",
      _("Background Opacity"),
      _("Opacity of the panel background (0.0 is transparent, 1.0 is opaque)"),
      0.0,
      1.0,
      0.05
    );

    // Text color
    this._addColorRow(
      uiColorsGroup,
      settings,
      "text-color",
      _("Text Color"),
      _("Default text color for the panel")
    );
  }

  /**
   * Create the API settings page
   * @param {Adw.PreferencesWindow} window - The preferences window
   * @param {Gio.Settings} settings - The settings object
   */
  _createApiSettingsPage(window, settings) {
    const apiPage = new Adw.PreferencesPage({
      title: _("API Settings"),
      icon_name: "preferences-system-symbolic",
    });
    window.add(apiPage);

    this._addApiConfigGroup(apiPage, settings);
  }

  /**
   * Add API configuration group to the API settings page
   * @param {Adw.PreferencesPage} page - The parent page
   * @param {Gio.Settings} settings - The settings object
   */
  _addApiConfigGroup(page, settings) {
    const apiSettingsGroup = new Adw.PreferencesGroup({
      title: _("API Configuration"),
    });
    page.add(apiSettingsGroup);

    // API Endpoint
    this._addEntryRow(
      apiSettingsGroup,
      settings,
      "api-endpoint",
      _("API Endpoint"),
      _("The URL for the Ollama API service")
    );

    // Models API Endpoint
    this._addEntryRow(
      apiSettingsGroup,
      settings,
      "models-api-endpoint",
      _("Models API Endpoint"),
      _("The URL for fetching available models")
    );

    // OpenAI API Key
    this._addEntryRow(
      apiSettingsGroup,
      settings,
      "openai-api-key",
      _("OpenAI API Key"),
      _("Your OpenAI API key for using GPT models")
    );

    // Default model
    this._addEntryRow(
      apiSettingsGroup,
      settings,
      "default-model",
      _("Default Model"),
      _("The default AI model to use")
    );

    // Temperature
    this._addSpinRow(
      apiSettingsGroup,
      settings,
      "temperature",
      _("Temperature"),
      _("Controls randomness of responses (0.0-1.0)"),
      0.0,
      1.0,
      0.1
    );
  }

  // ========================================
  // UI Component Helpers
  // ========================================

  /**
   * Add a spin button row to a preferences group
   * @param {Adw.PreferencesGroup} group - The group to add the row to
   * @param {Gio.Settings} settings - The settings object
   * @param {string} key - The settings key
   * @param {string} title - The row title
   * @param {string} subtitle - The row subtitle
   * @param {number} min - Minimum value
   * @param {number} max - Maximum value
   * @param {number} step - Step increment
   */
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

  /**
   * Add a color button row to a preferences group
   * @param {Adw.PreferencesGroup} group - The group to add the row to
   * @param {Gio.Settings} settings - The settings object
   * @param {string} key - The settings key
   * @param {string} title - The row title
   * @param {string} subtitle - The row subtitle
   */
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

  /**
   * Add a text entry row to a preferences group
   * @param {Adw.PreferencesGroup} group - The group to add the row to
   * @param {Gio.Settings} settings - The settings object
   * @param {string} key - The settings key
   * @param {string} title - The row title
   * @param {string} subtitle - The row subtitle
   */
  _addEntryRow(group, settings, key, title, subtitle) {
    // Create an entry
    const entry = new Gtk.Entry({
      text: settings.get_string(key),
      valign: Gtk.Align.CENTER,
      width_request: 250,
    });

    // Connect to changed signal
    entry.connect("changed", () => {
      settings.set_string(key, entry.get_text());
    });

    // Create a preferences row for the entry
    const row = new Adw.ActionRow({
      title: title,
      subtitle: subtitle,
    });
    row.add_suffix(entry);
    row.activatable_widget = entry;
    group.add(row);
  }

  // ========================================
  // Color Conversion Utilities
  // ========================================

  /**
   * Convert hex color to RGBA
   * @param {string} hex - Hex color string (#RRGGBB)
   * @returns {Gdk.RGBA} RGBA color object
   */
  _hexToRGBA(hex) {
    let r = parseInt(hex.substring(1, 3), 16) / 255;
    let g = parseInt(hex.substring(3, 5), 16) / 255;
    let b = parseInt(hex.substring(5, 7), 16) / 255;
    return new Gdk.RGBA({ red: r, green: g, blue: b, alpha: 1 });
  }

  /**
   * Convert RGBA color to hex
   * @param {Gdk.RGBA} rgba - RGBA color object
   * @returns {string} Hex color string (#RRGGBB)
   */
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
