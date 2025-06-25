/**
 * Visual Container Manager
 * Handles the visual styling and positioning of the input area
 * Separates visual concerns from functional containers
 */

import St from "gi://St";
import Clutter from "gi://Clutter";
import * as LayoutManager from "./layoutManager.js";
import { getSettings } from "../lib/settings.js";

/**
 * Manages the visual container that holds input elements and file boxes
 */
export class VisualContainerManager {
  constructor(options) {
    const { outputScrollView, onLayoutUpdate } = options;
    
    this._outputScrollView = outputScrollView;
    this._onLayoutUpdate = onLayoutUpdate;
    
    // Create the main visual container (grey box with rounded corners)
    this._visualContainer = null;
    
    // Create internal containers
    this._fileBoxesContainer = null;
    this._inputElementsContainer = null;
    
    // Track expandable content
    this._expandableContainers = new Map();
    
    // Recursion protection
    this._isUpdatingLayout = false;
  }

  /**
   * Creates and returns the main visual container
   */
  createVisualContainer() {
    if (this._visualContainer) {
      return this._visualContainer;
    }

    // Create the main visual container with grey styling
    this._visualContainer = new St.Widget({
      style_class: "visual-input-container",
      reactive: true,
      x_expand: true,
      y_expand: false,
      layout_manager: new Clutter.BinLayout(),
    });

    // Create content container for proper layout
    this._contentContainer = new St.BoxLayout({
      vertical: true,
      x_expand: true,
      y_expand: true,
    });

    // Create file boxes area (positioned at top)
    this._fileBoxesArea = new St.Widget({
      style_class: "file-boxes-area",
      x_expand: true,
      y_expand: false,
      layout_manager: new Clutter.BinLayout(),
    });

    // Create input field container (only for input field, not buttons)
    this._inputFieldContainer = new St.BoxLayout({
      style_class: "input-field-container",
      vertical: true,
      x_expand: true,
      y_expand: false,
      style: "background-color: transparent;",
    });

    // Create fixed buttons container (positioned independently at bottom)
    this._fixedButtonsContainer = new St.BoxLayout({
      style_class: "fixed-buttons-container",
      vertical: false,
      x_expand: true,
      y_expand: false,
      style: "background-color: transparent;",
    });

    // Add areas to content container
    this._contentContainer.add_child(this._fileBoxesArea);
    this._contentContainer.add_child(this._inputFieldContainer);

    // Add content container and fixed buttons to visual container
    this._visualContainer.add_child(this._contentContainer);
    this._visualContainer.add_child(this._fixedButtonsContainer);

    // Apply initial styling
    this._applyVisualStyling(false);

    return this._visualContainer;
  }

  /**
   * Returns the input field container for adding only the input field
   */
  getInputFieldContainer() {
    if (!this._visualContainer) {
      this.createVisualContainer();
    }
    return this._inputFieldContainer;
  }

  /**
   * Returns the input elements container for adding input field and buttons
   * @deprecated Use getInputFieldContainer() and getFixedButtonsContainer() instead
   */
  getInputElementsContainer() {
    if (!this._visualContainer) {
      this.createVisualContainer();
    }
    return this._inputFieldContainer;
  }

  /**
   * Returns the fixed buttons container for adding buttons
   */
  getFixedButtonsContainer() {
    if (!this._visualContainer) {
      this.createVisualContainer();
    }
    return this._fixedButtonsContainer;
  }

  /**
   * Returns the file boxes area for adding file containers
   */
  getFileBoxesArea() {
    if (!this._visualContainer) {
      this.createVisualContainer();
    }
    return this._fileBoxesArea;
  }

  /**
   * Registers a file boxes container
   */
  registerFileBoxesContainer(container, getHeight) {
    this._expandableContainers.set('file-boxes', {
      container,
      getHeight: getHeight || (() => container.get_height()),
    });

    // Add container to file boxes area
    this._fileBoxesArea.add_child(container);
    
    this.updateLayout();
  }

  /**
   * Unregisters the file boxes container
   */
  unregisterFileBoxesContainer() {
    if (this._expandableContainers.has('file-boxes')) {
      const { container } = this._expandableContainers.get('file-boxes');
      if (container && container.get_parent() === this._fileBoxesArea) {
        this._fileBoxesArea.remove_child(container);
      }
      this._expandableContainers.delete('file-boxes');
    }
    
    this.updateLayout();
  }

  /**
   * Registers an input field for expansion tracking
   */
  registerInputFieldExpansion(inputField, getHeight) {
    this._expandableContainers.set('input-field', {
      container: inputField,
      getHeight: getHeight || (() => this._calculateInputFieldExpansion(inputField)),
    });
    
    this.updateLayout();
  }

  /**
   * Unregisters input field expansion
   */
  unregisterInputFieldExpansion() {
    if (this._expandableContainers.has('input-field')) {
      this._expandableContainers.delete('input-field');
    }
    
    this.updateLayout();
  }

  /**
   * Calculates the additional height needed for input field expansion
   */
  _calculateInputFieldExpansion(inputField) {
    console.log("_calculateInputFieldExpansion called");
    
    if (!inputField || !inputField.clutter_text) {
      console.log("No input field or clutter_text");
      return 0;
    }

    const text = inputField.get_text();
    console.log("Input text:", text);
    
    if (!text || !text.includes('\n')) {
      console.log("No text or no newlines");
      return 0; // No newlines, no expansion needed
    }

    // Get the current actual height of the input field
    const currentHeight = inputField.get_height();
    console.log("Current height:", currentHeight);
    
    // Get the actual preferred height for the current content
    const [minHeight, naturalHeight] = inputField.get_preferred_height(-1);
    console.log("Natural height:", naturalHeight, "Min height:", minHeight);
    
    // Calculate how much additional height is needed beyond current height
    // Apply a slight reduction factor to account for over-expansion
    const rawAdditionalHeight = Math.max(0, naturalHeight - currentHeight);
    const additionalHeight = Math.floor(rawAdditionalHeight * 1); // Test with 50% to see if it works
    
    console.log("Raw additional height:", rawAdditionalHeight, "Final additional height:", additionalHeight);
    
    return additionalHeight;
  }

  /**
   * Updates the visual container layout
   */
  updateLayout() {
    if (this._isUpdatingLayout || !this._visualContainer) {
      return;
    }

    this._isUpdatingLayout = true;

    try {
      const {
        panelWidth,
        panelHeight,
        inputFieldHeight,
        horizontalPadding,
        buttonsHeight,
        paddingY,
      } = LayoutManager.calculatePanelDimensions();

      // Calculate base height for input elements
      const baseInputHeight = inputFieldHeight + buttonsHeight + paddingY;
      
      // Calculate file boxes height
      let fileBoxesHeight = 0;
      let hasVisibleFileBoxes = false;

      if (this._expandableContainers.has('file-boxes')) {
        const { container, getHeight } = this._expandableContainers.get('file-boxes');
        if (container && this._isContainerVisible(container)) {
          fileBoxesHeight = getHeight();
          hasVisibleFileBoxes = fileBoxesHeight > 0;
        }
      }

      // Calculate input field expansion height
      let inputFieldExpansionHeight = 0;
      if (this._expandableContainers.has('input-field')) {
        const { container, getHeight } = this._expandableContainers.get('input-field');
        if (container) {
          inputFieldExpansionHeight = getHeight();
          console.log("Input field expansion height:", inputFieldExpansionHeight);
          
          // The input field height is already set by MessageSender
          // Just apply the positioning for upward expansion
          if (inputFieldExpansionHeight > 0) {
            console.log("Moving input field up by:", inputFieldExpansionHeight);
            // Move the input field upward within its parent by the expansion amount
            container.set_y(-inputFieldExpansionHeight);
          } else {
            // Reset position when no expansion
            container.set_y(0);
            console.log("Reset input field position");
          }
        }
      }

      // Calculate total visual container height including input field expansion
      const totalHeight = baseInputHeight + fileBoxesHeight + inputFieldExpansionHeight;

      // Update visual container size and position - container expands upward
      this._visualContainer.set_size(
        panelWidth - horizontalPadding * 2,
        totalHeight
      );
      this._visualContainer.set_position(
        horizontalPadding,
        panelHeight - totalHeight
      );

      // Update file boxes area height with padding
      if (hasVisibleFileBoxes) {
        this._fileBoxesArea.set_height(fileBoxesHeight);
        this._fileBoxesArea.show();
        // Add padding around file boxes
        this._fileBoxesArea.set_style(`
          padding: 12px;
        `);
      } else {
        this._fileBoxesArea.set_height(0);
        this._fileBoxesArea.hide();
      }

      // Keep input elements container at its base height to prevent buttons from moving
      // The input field will expand upward beyond the container boundaries
      this._inputFieldContainer.set_height(baseInputHeight);
      
      // Position the input field container accounting for buttons space
      const buttonsSpace = buttonsHeight + paddingY;
      this._inputFieldContainer.set_y(totalHeight - baseInputHeight - buttonsSpace);

      // Position the fixed buttons container at the very bottom of the visual container
      this._fixedButtonsContainer.set_height(buttonsSpace);
      this._fixedButtonsContainer.set_y(totalHeight - buttonsSpace);

      // Update output scroll view height to account for the expanded container
      const remainingHeight = panelHeight - totalHeight - paddingY;
      if (this._outputScrollView && remainingHeight > 0) {
        this._outputScrollView.set_height(remainingHeight);
      }

      // Apply styling based on whether we have expandable content
      this._applyVisualStyling(hasVisibleFileBoxes || inputFieldExpansionHeight > 0);

      // Force layout recalculation
      LayoutManager.invalidateCache();
      this._visualContainer.queue_relayout();

    } finally {
      this._isUpdatingLayout = false;
    }
  }

  /**
   * Applies visual styling to the container
   */
  _applyVisualStyling(hasExpandableContent) {
    const settings = getSettings();
    const inputBgColor = settings.get_string("input-container-background-color");
    const inputOpacity = settings.get_double("input-container-opacity");
    
    let shadowColor, shadowOpacity, shadowBlur, shadowOffsetX, shadowOffsetY;
    
    try {
      shadowColor = settings.get_string("shadow-color");
      shadowOpacity = settings.get_double("shadow-opacity");
      shadowBlur = settings.get_double("shadow-blur");
      shadowOffsetX = settings.get_double("shadow-offset-x");
      shadowOffsetY = settings.get_double("shadow-offset-y");
    } catch (e) {
      // Fallback to defaults if settings aren't available yet
      shadowColor = "#000000";
      shadowOpacity = 0.3;
      shadowBlur = 20.0;
      shadowOffsetX = 0.0;
      shadowOffsetY = 4.0;
    }
    
    // Parse color components for background
    const r = parseInt(inputBgColor.substring(1, 3), 16);
    const g = parseInt(inputBgColor.substring(3, 5), 16);
    const b = parseInt(inputBgColor.substring(5, 7), 16);

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

    // Always use top-only rounded corners
    const borderRadius = "16px 16px 0 0";

    this._visualContainer.set_style(`
      background-color: rgba(${r}, ${g}, ${b}, ${inputOpacity});
      border-radius: ${borderRadius};
      padding: 6px;
      box-shadow: ${shadowOffsetX}px ${shadowOffsetY}px ${shadowBlur}px rgba(${shadowR}, ${shadowG}, ${shadowB}, ${shadowOpacity});
      z-index: 100;
    `);
  }

  /**
   * Checks if a container is visible and has content
   */
  _isContainerVisible(container) {
    return container && 
           container.visible && 
           container.get_n_children && 
           container.get_n_children() > 0;
  }

  /**
   * Resets to base state
   */
  resetToBaseState() {
    // Hide file boxes area
    if (this._fileBoxesArea) {
      this._fileBoxesArea.hide();
    }

    // Reset input field height if registered
    if (this._expandableContainers.has('input-field')) {
      const { container } = this._expandableContainers.get('input-field');
      if (container) {
        const { inputFieldHeight } = LayoutManager.calculatePanelDimensions();
        container.set_height(inputFieldHeight);
      }
    }

    // Update layout
    this.updateLayout();

    if (this._onLayoutUpdate) {
      this._onLayoutUpdate();
    }
  }

  /**
   * Destroys the visual container
   */
  destroy() {
    this._expandableContainers.clear();
    
    if (this._visualContainer) {
      this._visualContainer.destroy();
      this._visualContainer = null;
    }
    
    this._fileBoxesArea = null;
    this._inputFieldContainer = null;
    this._fixedButtonsContainer = null;
    this._contentContainer = null;
    this._outputScrollView = null;
    this._onLayoutUpdate = null;
  }
} 