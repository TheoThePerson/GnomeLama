/**
 * Input Container Expansion Manager
 * Handles upward expansion of the input container when content is added
 */

import * as LayoutManager from "./layoutManager.js";
import { getSettings } from "../lib/settings.js";

/**
 * Manages input container expansion and positioning
 */
export class InputContainerManager {
  /**
   * Creates a new InputContainerManager instance
   * 
   * @param {Object} options - Configuration options
   * @param {St.BoxLayout} options.inputButtonsContainer - The input buttons container
   * @param {St.ScrollView} options.outputScrollView - The output scroll view
   * @param {Function} [options.onLayoutUpdate] - Optional callback for layout updates
   */
  constructor(options) {
    const { inputButtonsContainer, outputScrollView, onLayoutUpdate } = options;
    
    this._inputButtonsContainer = inputButtonsContainer;
    this._outputScrollView = outputScrollView;
    this._onLayoutUpdate = onLayoutUpdate;
    
    // Track registered expandable containers
    this._expandableContainers = new Map();
    
    // Recursion protection
    this._isUpdatingLayout = false;
    
    // Store reference to outputScrollView in userData for layoutManager
    if (this._inputButtonsContainer) {
      this._inputButtonsContainer.userData = {
        outputScrollView: this._outputScrollView
      };
      
      // Apply initial styling with full border-radius
      this._applyInputContainerStyling(false);
    }
  }

  /**
   * Registers a container that can contribute to input container expansion
   * 
   * @param {string} id - Unique identifier for the container
   * @param {St.Widget} container - The container widget
   * @param {Object} [options] - Additional options
   * @param {Function} [options.getHeight] - Custom function to get container height
   * @param {boolean} [options.alwaysVisible] - Whether container should always be visible
   */
  registerExpandableContainer(id, container, options = {}) {
    const { getHeight, alwaysVisible = false } = options;
    
    this._expandableContainers.set(id, {
      container,
      getHeight: getHeight || (() => container.get_height()),
      alwaysVisible
    });
    
    // Schedule layout update instead of calling it immediately
    // This prevents recursion during initialization
    imports.gi.GLib.idle_add(imports.gi.GLib.PRIORITY_DEFAULT, () => {
      this.updateContainerLayout();
      return imports.gi.GLib.SOURCE_REMOVE;
    });
  }

  /**
   * Unregisters an expandable container
   * 
   * @param {string} id - Unique identifier for the container
   */
  unregisterExpandableContainer(id) {
    if (this._expandableContainers.has(id)) {
      this._expandableContainers.delete(id);
      this.updateContainerLayout();
    }
  }

  /**
   * Updates the input container layout based on all registered expandable containers
   */
  updateContainerLayout() {
    // Prevent recursion
    if (this._isUpdatingLayout || !this._inputButtonsContainer) {
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

      // Calculate base container height
      const baseContainerHeight = inputFieldHeight + buttonsHeight + paddingY;
      let totalExpandableHeight = 0;
      let hasVisibleContainers = false;

      // Calculate total height from all expandable containers
      for (const [id, { container, getHeight, alwaysVisible }] of this._expandableContainers) {
        if (container && (alwaysVisible || this._isContainerVisible(container))) {
          const containerHeight = getHeight();
          if (containerHeight > 0) {
            totalExpandableHeight += containerHeight;
            hasVisibleContainers = true;
            
            // Ensure visible containers are shown and positioned
            container.set_position(0, totalExpandableHeight - containerHeight);
            container.show();
          }
        }
      }

      // Hide containers with no content
      if (!hasVisibleContainers) {
        for (const [id, { container, alwaysVisible }] of this._expandableContainers) {
          if (!alwaysVisible && container) {
            container.hide();
          }
        }
      }

      // Calculate total container height
      const containerHeight = baseContainerHeight + totalExpandableHeight;

      // Update output area height
      const remainingHeight = panelHeight - containerHeight - paddingY * 2;
      if (this._outputScrollView && remainingHeight > 0) {
        this._outputScrollView.set_height(remainingHeight);
      }

      // Update input container position and size
      this._inputButtonsContainer.set_height(containerHeight);
      this._inputButtonsContainer.set_position(
        (panelWidth - (panelWidth - horizontalPadding * 2)) / 2,
        panelHeight - containerHeight
      );
      this._inputButtonsContainer.set_size(
        panelWidth - horizontalPadding * 2,
        containerHeight
      );

      // Apply correct styling with proper border-radius
      this._applyInputContainerStyling(hasVisibleContainers);

      // Force layout recalculation
      LayoutManager.invalidateCache();
      this._inputButtonsContainer.queue_relayout();

    } finally {
      this._isUpdatingLayout = false;
    }

    // Don't trigger callback from here to prevent recursion
    // The caller should handle any additional layout updates needed
  }

  /**
   * Applies correct styling to the input container
   * 
   * @private
   * @param {boolean} hasExpandableContent - Whether there's expandable content
   */
  _applyInputContainerStyling(hasExpandableContent) {
    const settings = getSettings();
    const inputBgColor = settings.get_string("input-container-background-color");
    const inputOpacity = settings.get_double("input-container-opacity");
    
    // Parse color components
    const r = parseInt(inputBgColor.substring(1, 3), 16);
    const g = parseInt(inputBgColor.substring(3, 5), 16);
    const b = parseInt(inputBgColor.substring(5, 7), 16);

    // Always use top-only rounded corners - bottom should never be rounded
    const borderRadius = "16px 16px 0 0";

    this._inputButtonsContainer.set_style(`
      background-color: rgba(${r}, ${g}, ${b}, ${inputOpacity});
      border-radius: ${borderRadius};
      padding: 6px;
      z-index: 100;
    `);
  }

  /**
   * Forces an immediate layout update
   */
  forceLayoutUpdate() {
    LayoutManager.invalidateCache();
    this.updateContainerLayout();
  }

  /**
   * Checks if a container is visible and has content
   * 
   * @private
   * @param {St.Widget} container - The container to check
   * @returns {boolean} - Whether the container is visible
   */
  _isContainerVisible(container) {
    return container && 
           container.visible && 
           container.get_n_children && 
           container.get_n_children() > 0;
  }

  /**
   * Gets the current total height of all expandable containers
   * 
   * @returns {number} - Total height in pixels
   */
  getTotalExpandableHeight() {
    let totalHeight = 0;
    
    for (const [id, { container, getHeight, alwaysVisible }] of this._expandableContainers) {
      if (container && (alwaysVisible || this._isContainerVisible(container))) {
        totalHeight += getHeight();
      }
    }
    
    return totalHeight;
  }

  /**
   * Gets information about all registered containers
   * 
   * @returns {Array} - Array of container information objects
   */
  getContainerInfo() {
    const info = [];
    
    for (const [id, { container, getHeight, alwaysVisible }] of this._expandableContainers) {
      info.push({
        id,
        height: getHeight(),
        visible: alwaysVisible || this._isContainerVisible(container),
        alwaysVisible
      });
    }
    
    return info;
  }

  /**
   * Resets the input container to its base state (no expandable content)
   */
  resetToBaseState() {
    if (!this._inputButtonsContainer) return;

    const {
      panelWidth,
      panelHeight,
      horizontalPadding,
      inputFieldHeight,
      buttonsHeight,
      paddingY,
    } = LayoutManager.calculatePanelDimensions();
    
    // Calculate base height without expandable containers
    const containerHeight = inputFieldHeight + buttonsHeight + paddingY;
    
    // Hide all expandable containers
    for (const [id, { container, alwaysVisible }] of this._expandableContainers) {
      if (!alwaysVisible && container) {
        container.hide();
      }
    }
    
    // Reset input container position and size
    this._inputButtonsContainer.set_height(containerHeight);
    this._inputButtonsContainer.set_position(
      (panelWidth - (panelWidth - horizontalPadding * 2)) / 2,
      panelHeight - containerHeight
    );
    
    // Apply correct styling for base state (no expandable content)
    this._applyInputContainerStyling(false);
    
    // Update output area to fill remaining space
    const remainingHeight = panelHeight - containerHeight - paddingY * 2;
    if (this._outputScrollView) {
      this._outputScrollView.set_height(remainingHeight);
    }
    
    // Force relayout
    this._inputButtonsContainer.queue_relayout();
    
    if (this._onLayoutUpdate) {
      this._onLayoutUpdate();
    }
  }

  /**
   * Destroys the manager and cleans up
   */
  destroy() {
    this._expandableContainers.clear();
    this._inputButtonsContainer = null;
    this._outputScrollView = null;
    this._onLayoutUpdate = null;
  }
}

// Singleton instance for easy access
let _instance = null;

/**
 * Gets or creates the singleton InputContainerManager instance
 * 
 * @param {Object} [options] - Configuration options (only used on first call)
 * @returns {InputContainerManager} - The manager instance
 */
export function getInputContainerManager(options) {
  if (!_instance && options) {
    _instance = new InputContainerManager(options);
  }
  return _instance;
}

/**
 * Destroys the singleton instance
 */
export function destroyInputContainerManager() {
  if (_instance) {
    _instance.destroy();
    _instance = null;
  }
} 