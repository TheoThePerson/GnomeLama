import Adw from "gi://Adw";
import Gdk from "gi://Gdk";
import Gtk from "gi://Gtk";
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
    this._addSpinRow(layoutGroup, settings, {
      key: "panel-width-fraction",
      title: _("Panel Width"),
      subtitle: _("Fraction of screen width occupied by the panel"),
      min: 0.05,
      max: 0.5,
      step: 0.01,
    });

    // Input field height
    this._addSpinRow(layoutGroup, settings, {
      key: "input-field-height-fraction",
      title: _("Input Field Height"),
      subtitle: _("Height of the input field as a fraction of screen height"),
      min: 0.01,
      max: 0.1,
      step: 0.005,
    });

    // File box size
    this._addSpinRow(layoutGroup, settings, {
      key: "file-box-size",
      title: _("File Box Size"),
      subtitle: _("Size of the file boxes in pixels"),
      min: 100,
      max: 140,
      step: 10,
    });
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
    this._addSpinRow(paddingGroup, settings, {
      key: "padding-fraction-x",
      title: _("Horizontal Padding"),
      subtitle: _("Horizontal padding as a fraction of screen width"),
      min: 0.005,
      max: 0.05,
      step: 0.005,
    });

    // Vertical padding
    this._addSpinRow(paddingGroup, settings, {
      key: "padding-fraction-y",
      title: _("Vertical Padding"),
      subtitle: _("Vertical padding as a fraction of screen height"),
      min: 0.005,
      max: 0.05,
      step: 0.005,
    });
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
    this._addSpinRow(iconGroup, settings, {
      key: "button-icon-scale",
      title: _("Button Icon Scale"),
      subtitle: _("Scale factor for the clear and file button icons"),
      min: 0.5,
      max: 1.5,
      step: 0.1,
    });

    // Send button icon scale
    this._addSpinRow(iconGroup, settings, {
      key: "send-button-icon-scale",
      title: _("Send Button Icon Scale"),
      subtitle: _("Scale factor for the send button icon"),
      min: 0.5,
      max: 1.5,
      step: 0.1,
    });
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
    this._addColorRow(colorsGroup, settings, {
      key: "user-message-color",
      title: _("User Message Color"),
      subtitle: _("Color of user messages"),
    });

    // AI message color
    this._addColorRow(colorsGroup, settings, {
      key: "ai-message-color",
      title: _("AI Message Color"),
      subtitle: _("Color of AI assistant messages"),
    });
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
    this._addColorRow(uiColorsGroup, settings, {
      key: "background-color",
      title: _("Background Color"),
      subtitle: _("Background color of the panel"),
    });

    // Text color
    this._addColorRow(uiColorsGroup, settings, {
      key: "text-color",
      title: _("Text Color"),
      subtitle: _("Default text color for the panel"),
    });
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
    this._addEntryRow(apiSettingsGroup, settings, {
      key: "api-endpoint",
      title: _("API Endpoint"),
      subtitle: _("The URL for the Ollama API service"),
    });

    // Models API Endpoint
    this._addEntryRow(apiSettingsGroup, settings, {
      key: "models-api-endpoint",
      title: _("Models API Endpoint"),
      subtitle: _("The URL for fetching available models"),
    });

    // OpenAI API Key
    this._addEntryRow(apiSettingsGroup, settings, {
      key: "openai-api-key",
      title: _("OpenAI API Key"),
      subtitle: _("Your OpenAI API key for using GPT models"),
    });

    // Default model
    this._addEntryRow(apiSettingsGroup, settings, {
      key: "default-model",
      title: _("Default Model"),
      subtitle: _("The default AI model to use"),
    });

    // Temperature
    this._addSpinRow(apiSettingsGroup, settings, {
      key: "temperature",
      title: _("Temperature"),
      subtitle: _("Controls randomness of responses (0.0-1.0)"),
      min: 0.0,
      max: 1.0,
      step: 0.1,
    });
  }

  // ========================================
  // UI Component Helpers
  // ========================================

  /**
   * Add a spin button row to a preferences group
   * @param {Adw.PreferencesGroup} group - The group to add the row to
   * @param {Gio.Settings} settings - The settings object
   * @param {Object} config - Configuration object
   * @param {string} config.key - The settings key
   * @param {string} config.title - The row title
   * @param {string} config.subtitle - The row subtitle
   * @param {number} config.min - Minimum value
   * @param {number} config.max - Maximum value
   * @param {number} config.step - Step increment
   */
  _addSpinRow(group, settings, config) {
    const { key, title, subtitle, min, max, step } = config;

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
      title,
      subtitle,
    });
    row.add_suffix(spinButton);
    row.activatable_widget = spinButton;
    group.add(row);

    return this;
  }

  /**
   * Add a color button row to a preferences group
   * @param {Adw.PreferencesGroup} group - The group to add the row to
   * @param {Gio.Settings} settings - The settings object
   * @param {Object} config - Configuration object
   * @param {string} config.key - The settings key
   * @param {string} config.title - The row title
   * @param {string} config.subtitle - The row subtitle
   */
  _addColorRow(group, settings, config) {
    const { key, title, subtitle } = config;

    // Create a color button
    const colorButton = new Gtk.ColorButton({
      valign: Gtk.Align.CENTER,
      rgba: GnomeLamaPreferences.hexToRGBA(settings.get_string(key)),
    });

    // Connect to color-set signal
    colorButton.connect("color-set", () => {
      const rgba = colorButton.get_rgba();
      settings.set_string(key, GnomeLamaPreferences.RGBAtoHex(rgba));
    });

    // Create a preferences row for the color button
    const row = new Adw.ActionRow({
      title,
      subtitle,
    });
    row.add_suffix(colorButton);
    row.activatable_widget = colorButton;
    group.add(row);

    return this;
  }

  /**
   * Add a text entry row to a preferences group
   * @param {Adw.PreferencesGroup} group - The group to add the row to
   * @param {Gio.Settings} settings - The settings object
   * @param {Object} config - Configuration object
   * @param {string} config.key - The settings key
   * @param {string} config.title - The row title
   * @param {string} config.subtitle - The row subtitle
   */
  _addEntryRow(group, settings, config) {
    const { key, title, subtitle } = config;

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
      title,
      subtitle,
    });
    row.add_suffix(entry);
    row.activatable_widget = entry;
    group.add(row);

    return this;
  }

  // ========================================
  // Color Conversion Utilities (Static)
  // ========================================

  /**
   * Convert hex color to RGBA
   * @param {string} hex - Hex color string (#RRGGBB)
   * @returns {Gdk.RGBA} RGBA color object
   */
  static hexToRGBA(hex) {
    const r = parseInt(hex.substring(1, 3), 16) / 255;
    const g = parseInt(hex.substring(3, 5), 16) / 255;
    const b = parseInt(hex.substring(5, 7), 16) / 255;
    const rgba = new Gdk.RGBA({ red: r, green: g, blue: b, alpha: 1 });

    return rgba;
  }

  /**
   * Convert RGBA color to hex
   * @param {Gdk.RGBA} rgba - RGBA color object
   * @returns {string} Hex color string (#RRGGBB)
   */
  static RGBAtoHex(rgba) {
    const r = Math.round(rgba.red * 255)
      .toString(16)
      .padStart(2, "0");
    const g = Math.round(rgba.green * 255)
      .toString(16)
      .padStart(2, "0");
    const b = Math.round(rgba.blue * 255)
      .toString(16)
      .padStart(2, "0");
    const hexColor = `#${r}${g}${b}`;

    return hexColor;
  }
}
