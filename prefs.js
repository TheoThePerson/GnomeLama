import Adw from "gi://Adw";
import Gdk from "gi://Gdk";
import Gtk from "gi://Gtk";
import {
  ExtensionPreferences,
  gettext as _,
} from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

export default class GnomeLamaPreferences extends ExtensionPreferences {
  constructor(metadata) {
    super(metadata);
    
    // Store references to UI controls for updating
    this._uiControls = {};
    
    // Page-specific setting keys
    this._pageSettings = {
      appearance: [
        "panel-width-fraction",
        "input-field-height-fraction", 
        "file-box-size",
        "padding-fraction-x",
        "padding-fraction-y",
        "button-icon-scale",
        "send-button-icon-scale",
        "monitor-index",
        "panel-position"
      ],
      colors: [
        "user-message-color",
        "ai-message-color",
        "background-color",
        "input-container-background-color",
        "text-color",
        "background-opacity",
        "input-container-opacity",
        "message-opacity",
        "shadow-color",
        "shadow-opacity",
        "shadow-blur",
        "shadow-offset-x",
        "shadow-offset-y",
        "message-shadow-color",
        "message-shadow-opacity",
        "message-shadow-blur",
        "message-shadow-offset-x",
        "message-shadow-offset-y"
      ],
      api: [
        "default-model",
        "temperature",
        "model-prompt",
        "api-endpoint", 
        "models-api-endpoint",
        "openai-api-key",
        "gemini-api-key"
      ]
    };
  }

  /**
   * Get the default value for a setting key from the schema
   * @param {Gio.Settings} settings - The settings object
   * @param {string} key - The setting key
   * @returns {*} The default value from the schema
   */
  _getSchemaDefault(settings, key) {
    return settings.get_default_value(key).unpack();
  }

  fillPreferencesWindow(window) {
    // Get settings directly from the extension instance
    const settings = this.getSettings("org.gnome.shell.extensions.gnomelama");

    // Create preference pages
    this._createAppearancePage(window, settings);
    this._createColorsPage(window, settings);
    this._createApiSettingsPage(window, settings);
  }

  /**
   * Restore defaults for a specific page
   * @param {string} pageType - The page type (appearance, colors, api)
   * @param {Gio.Settings} settings - The settings object
   * @param {Gtk.Widget} parentWidget - Parent widget for the confirmation dialog
   */
  _restorePageDefaults(pageType, settings, parentWidget) {
    const pageKeys = this._pageSettings[pageType];
    if (!pageKeys) return;
    
    // Create confirmation dialog
    const confirmDialog = new Adw.MessageDialog({
      heading: _("Restore to Defaults"),
      body: _(`Are you sure you want to restore all ${pageType} settings to their default values? This action cannot be undone.`),
      modal: true,
      transient_for: parentWidget.get_root()
    });
    
    confirmDialog.add_response("cancel", _("Cancel"));
    confirmDialog.add_response("restore", _("Restore"));
    confirmDialog.set_response_appearance("restore", Adw.ResponseAppearance.DESTRUCTIVE);
    confirmDialog.set_default_response("cancel");
    confirmDialog.set_close_response("cancel");
    
    confirmDialog.connect("response", (dialog, response) => {
      if (response === "restore") {
        // Reset all settings for this page
        pageKeys.forEach(key => {
          const defaultValue = this._getSchemaDefault(settings, key);
          if (defaultValue !== null && defaultValue !== void 0) {
            if (typeof defaultValue === 'string') {
              settings.set_string(key, defaultValue);
            } else if (typeof defaultValue === 'number') {
              settings.set_double(key, defaultValue);
            }
          }
        });
        
        // Update UI controls
        this._updateUIControls(pageKeys);
      }
      dialog.destroy();
    });
    
    confirmDialog.present();
  }

  /**
   * Update UI controls after settings change
   * @param {string[]} keys - Array of setting keys to update
   */
  _updateUIControls(keys) {
    keys.forEach(key => {
      const control = this._uiControls[key];
      if (control) {
        const defaultValue = this._getSchemaDefault(this.getSettings("org.gnome.shell.extensions.gnomelama"), key);
        if (defaultValue !== null && defaultValue !== void 0) {
          if (control.set_value && typeof defaultValue === 'number') {
            // Spin button
            control.set_value(defaultValue);
          } else if (control.set_rgba && typeof defaultValue === 'string') {
            // Color button
            control.set_rgba(GnomeLamaPreferences.hexToRGBA(defaultValue));
          } else if (control.set_text && typeof defaultValue === 'string') {
            // Entry
            control.set_text(defaultValue);
          } else if (control.set_selected && typeof defaultValue === 'string') {
            // Combo row - need to find the index of the default value
            if (key === "panel-position") {
              const options = [
                { value: "left", title: _("Left") },
                { value: "right", title: _("Right") }
              ];
              const defaultIndex = options.findIndex(option => option.value === defaultValue);
              if (defaultIndex >= 0) {
                control.set_selected(defaultIndex);
              }
            }
          }
        }
      }
    });
  }

  /**
   * Add a restore defaults button to a page
   * @param {Adw.PreferencesPage} page - The page to add the button to
   * @param {string} pageType - The page type (appearance, colors, api)
   * @param {Gio.Settings} settings - The settings object
   */
  _addRestoreDefaultsButton(page, pageType, settings) {
    const restoreGroup = new Adw.PreferencesGroup();
    page.add(restoreGroup);

    const restoreButton = new Gtk.Button({
      label: _("Restore to Defaults"),
      halign: Gtk.Align.CENTER,
      valign: Gtk.Align.CENTER,
      css_classes: ["destructive-action"]
    });

    restoreButton.connect("clicked", () => {
      this._restorePageDefaults(pageType, settings, restoreButton);
    });

    const restoreRow = new Adw.ActionRow({
      title: _("Reset Settings"),
      subtitle: _("Restore all settings on this page to their default values")
    });
    restoreRow.add_suffix(restoreButton);
    restoreRow.activatable_widget = restoreButton;
    restoreGroup.add(restoreRow);
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
    this._addDisplayPositionGroup(appearancePage, settings);
    this._addRestoreDefaultsButton(appearancePage, "appearance", settings);
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
   * Add display position settings group to the appearance page
   * @param {Adw.PreferencesPage} page - The parent page
   * @param {Gio.Settings} settings - The settings object
   */
  _addDisplayPositionGroup(page, settings) {
    const displayGroup = new Adw.PreferencesGroup({
      title: _("Display Position"),
    });
    page.add(displayGroup);

    // Monitor selection
    this._addSpinRow(displayGroup, settings, {
      key: "monitor-index",
      title: _("Monitor"),
      subtitle: _("Monitor index to display the panel on (0 = primary)"),
      min: 0,
      max: 10,
      step: 1,
    });

    // Panel position/side
    this._addComboRow(displayGroup, settings, {
      key: "panel-position",
      title: _("Panel Position"),
      subtitle: _("Which side of the monitor to position the panel"),
      options: [
        { value: "left", title: _("Left") },
        { value: "right", title: _("Right") }
      ]
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
    this._addShadowEffectsGroup(colorsPage, settings);
    this._addMessageShadowGroup(colorsPage, settings);
    this._addRestoreDefaultsButton(colorsPage, "colors", settings);
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

    // Add general message opacity if the setting exists
    if (GnomeLamaPreferences.settingExists(settings, "message-opacity")) {
      this._addSpinRow(colorsGroup, settings, {
        key: "message-opacity",
        title: _("Message Opacity"),
        subtitle: _("Background opacity of all messages (0.0-1.0)"),
        min: 0.1,
        max: 1.0,
        step: 0.1,
      });
    }
  }

  /**
   * Check if a setting exists
   * @param {Gio.Settings} settings - The settings object
   * @param {string} key - The setting key to check
   * @returns {boolean} Whether the setting exists
   */
  static settingExists(settings, key) {
    try {
      settings.get_double(key);
      return true;
    } catch {
      return false;
    }
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

    // Input container background color
    this._addColorRow(uiColorsGroup, settings, {
      key: "input-container-background-color",
      title: _("Input Container Color"),
      subtitle: _("Background color of the input container"),
    });

    // Background opacity
    this._addSpinRow(uiColorsGroup, settings, {
      key: "background-opacity",
      title: _("Background Opacity"),
      subtitle: _("Background opacity of the panel (0.0-1.0)"),
      min: 0.1,
      max: 1.0,
      step: 0.1,
    });

    // Input container opacity
    this._addSpinRow(uiColorsGroup, settings, {
      key: "input-container-opacity",
      title: _("Input Container Opacity"),
      subtitle: _("Background opacity of the input container (0.0-1.0)"),
      min: 0.1,
      max: 1.0,
      step: 0.1,
    });

    // Text color
    this._addColorRow(uiColorsGroup, settings, {
      key: "text-color",
      title: _("Text Color"),
      subtitle: _("Default text color for the panel"),
    });
  }

  /**
   * Add shadow effects group to the colors page
   * @param {Adw.PreferencesPage} page - The parent page
   * @param {Gio.Settings} settings - The settings object
   */
  _addShadowEffectsGroup(page, settings) {
    const shadowGroup = new Adw.PreferencesGroup({
      title: _("UI Shadow Effects"),
    });
    page.add(shadowGroup);

    // Shadow color
    this._addColorRow(shadowGroup, settings, {
      key: "shadow-color",
      title: _("Shadow Color"),
      subtitle: _("Color of shadows for visual container and popup menus"),
    });

    // Shadow opacity
    this._addSpinRow(shadowGroup, settings, {
      key: "shadow-opacity",
      title: _("Shadow Opacity"),
      subtitle: _("Opacity of shadows for visual container and popup menus (0.0-1.0)"),
      min: 0.0,
      max: 1.0,
      step: 0.1,
    });

    // Shadow blur
    this._addSpinRow(shadowGroup, settings, {
      key: "shadow-blur",
      title: _("Shadow Blur"),
      subtitle: _("Blur radius for shadows in pixels"),
      min: 0.0,
      max: 50.0,
      step: 1.0,
    });

    // Shadow offset X
    this._addSpinRow(shadowGroup, settings, {
      key: "shadow-offset-x",
      title: _("Shadow Offset X"),
      subtitle: _("Horizontal offset for shadows in pixels"),
      min: -50.0,
      max: 50.0,
      step: 1.0,
    });

    // Shadow offset Y
    this._addSpinRow(shadowGroup, settings, {
      key: "shadow-offset-y",
      title: _("Shadow Offset Y"),
      subtitle: _("Vertical offset for shadows in pixels"),
      min: -50.0,
      max: 50.0,
      step: 1.0,
    });
  }

  /**
   * Add message shadow effects group to the colors page
   * @param {Adw.PreferencesPage} page - The parent page
   * @param {Gio.Settings} settings - The settings object
   */
  _addMessageShadowGroup(page, settings) {
    const messageShadowGroup = new Adw.PreferencesGroup({
      title: _("Message Shadow Effects"),
    });
    page.add(messageShadowGroup);

    // Message shadow color
    this._addColorRow(messageShadowGroup, settings, {
      key: "message-shadow-color",
      title: _("Message Shadow Color"),
      subtitle: _("Color of shadows for message bubbles"),
    });

    // Message shadow opacity
    this._addSpinRow(messageShadowGroup, settings, {
      key: "message-shadow-opacity",
      title: _("Message Shadow Opacity"),
      subtitle: _("Opacity of shadows for message bubbles (0.0-1.0)"),
      min: 0.0,
      max: 1.0,
      step: 0.1,
    });

    // Message shadow blur
    this._addSpinRow(messageShadowGroup, settings, {
      key: "message-shadow-blur",
      title: _("Message Shadow Blur"),
      subtitle: _("Blur radius for message shadows in pixels"),
      min: 0.0,
      max: 20.0,
      step: 1.0,
    });

    // Message shadow offset X
    this._addSpinRow(messageShadowGroup, settings, {
      key: "message-shadow-offset-x",
      title: _("Message Shadow Offset X"),
      subtitle: _("Horizontal offset for message shadows in pixels"),
      min: -50.0,
      max: 50.0,
      step: 1.0,
    });

    // Message shadow offset Y
    this._addSpinRow(messageShadowGroup, settings, {
      key: "message-shadow-offset-y",
      title: _("Message Shadow Offset Y"),
      subtitle: _("Vertical offset for message shadows in pixels"),
      min: -50.0,
      max: 50.0,
      step: 1.0,
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

    this._addGeneralConfigGroup(apiPage, settings);
    this._addOllamaConfigGroup(apiPage, settings);
    this._addOpenAIConfigGroup(apiPage, settings);
    this._addGeminiConfigGroup(apiPage, settings);
    this._addRestoreDefaultsButton(apiPage, "api", settings);
  }

  /**
   * Add general AI configuration group
   * @param {Adw.PreferencesPage} page - The parent page
   * @param {Gio.Settings} settings - The settings object
   */
  _addGeneralConfigGroup(page, settings) {
    const generalGroup = new Adw.PreferencesGroup({
      title: _("General Settings"),
    });
    page.add(generalGroup);

    // Default model
    this._addEntryRow(generalGroup, settings, {
      key: "default-model",
      title: _("Default Model"),
      subtitle: _("The default AI model to use"),
    });

    // Temperature
    this._addSpinRow(generalGroup, settings, {
      key: "temperature",
      title: _("Temperature"),
      subtitle: _("Controls randomness of responses (0.0-1.0)"),
      min: 0.0,
      max: 1.0,
      step: 0.1,
    });

    // Model Prompt
    this._addEntryRow(generalGroup, settings, {
      key: "model-prompt",
      title: _("Model Prompt"),
      subtitle: _("Custom system prompt for the AI model"),
    });
  }

  /**
   * Add Ollama configuration group
   * @param {Adw.PreferencesPage} page - The parent page
   * @param {Gio.Settings} settings - The settings object
   */
  _addOllamaConfigGroup(page, settings) {
    const ollamaGroup = new Adw.PreferencesGroup({
      title: _("Ollama"),
    });
    page.add(ollamaGroup);

    // API Endpoint
    this._addEntryRow(ollamaGroup, settings, {
      key: "api-endpoint",
      title: _("API Endpoint"),
      subtitle: _("The URL for the Ollama API service"),
    });

    // Models API Endpoint
    this._addEntryRow(ollamaGroup, settings, {
      key: "models-api-endpoint",
      title: _("Models API Endpoint"),
      subtitle: _("The URL for fetching available models"),
    });
  }

  /**
   * Add OpenAI configuration group
   * @param {Adw.PreferencesPage} page - The parent page
   * @param {Gio.Settings} settings - The settings object
   */
  _addOpenAIConfigGroup(page, settings) {
    const openaiGroup = new Adw.PreferencesGroup({
      title: _("OpenAI"),
    });
    page.add(openaiGroup);

    // OpenAI API Key
    this._addEntryRow(openaiGroup, settings, {
      key: "openai-api-key",
      title: _("API Key"),
      subtitle: _("Your OpenAI API key for using GPT models"),
    });
  }

  /**
   * Add Gemini configuration group
   * @param {Adw.PreferencesPage} page - The parent page
   * @param {Gio.Settings} settings - The settings object
   */
  _addGeminiConfigGroup(page, settings) {
    const geminiGroup = new Adw.PreferencesGroup({
      title: _("Google Gemini"),
    });
    page.add(geminiGroup);

    // Gemini API Key
    this._addEntryRow(geminiGroup, settings, {
      key: "gemini-api-key",
      title: _("API Key"),
      subtitle: _("Your Gemini API key for using Google's Gemini models"),
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

    // Store reference to the control
    this._uiControls[key] = spinButton;

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

    // Store reference to the control
    this._uiControls[key] = colorButton;

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
    
    // Listen for external changes to the setting value
    // This allows the settingsManager to override the prefs dialog value
    if (key === "model-prompt") {
      settings.connect("changed::model-prompt", () => {
        entry.set_text(settings.get_string("model-prompt"));
      });
    }

    // Create a preferences row for the entry
    const row = new Adw.ActionRow({
      title,
      subtitle,
    });
    row.add_suffix(entry);
    row.activatable_widget = entry;
    group.add(row);

    // Store reference to the control
    this._uiControls[key] = entry;

    return this;
  }

  /**
   * Add a combo box row to a preferences group
   * @param {Adw.PreferencesGroup} group - The group to add the row to
   * @param {Gio.Settings} settings - The settings object
   * @param {Object} config - Configuration object
   * @param {string} config.key - The settings key
   * @param {string} config.title - The row title
   * @param {string} config.subtitle - The row subtitle
   * @param {Array} config.options - Array of {value, title} objects
   */
  _addComboRow(group, settings, config) {
    const { key, title, subtitle, options } = config;

    // Create string list for the combo row
    const stringList = new Gtk.StringList();
    options.forEach(option => {
      stringList.append(option.title);
    });

    // Create combo row
    const comboRow = new Adw.ComboRow({
      title,
      subtitle,
      model: stringList,
    });

    // Set current selection
    const currentValue = settings.get_string(key);
    const currentIndex = options.findIndex(option => option.value === currentValue);
    if (currentIndex >= 0) {
      comboRow.set_selected(currentIndex);
    }

    // Connect to notify::selected signal
    comboRow.connect("notify::selected", () => {
      const selectedIndex = comboRow.get_selected();
      if (selectedIndex >= 0 && selectedIndex < options.length) {
        settings.set_string(key, options[selectedIndex].value);
      }
    });

    group.add(comboRow);

    // Store reference to the control
    this._uiControls[key] = comboRow;

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
