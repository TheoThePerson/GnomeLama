/**
 * Utilities for filtering and processing Gemini model lists
 */
import { 
  filterModels, 
  groupModels, 
  sortModels 
} from "./modelUtils.js";

/**
 * Filters and processes model data from the Gemini API response
 * @param {Array} modelData - Raw model data from the API
 * @returns {Array} Filtered and processed model names
 */
export function processGeminiModels(modelData) {
  // Initial filtering
  const filteredModels = filterModels(modelData, (model) => {
    // The name comes in form 'models/gemini-pro' - we need to extract the model name
    const modelId = (model.name || model).replace(/^models\//, '');
    return modelId.includes("gemini") && 
           !modelId.includes("vision") &&
           !modelId.includes("embedding");
  });

  // Extract just the ids for grouping if models are objects
  const modelIds = filteredModels.map(model => {
    if (typeof model === 'string') return model;
    return model.name.replace(/^models\//, '');
  });

  // Skip grouping and directly prefer clean versions
  const cleanedModels = [];
  const modelNameMap = new Map();
  
  // First pass: identify different variants of the same base model
  modelIds.forEach(modelId => {
    // Determine if it has any special suffixes
    const hasNumericSuffix = /-\d+(-|$)/.test(modelId); // Match numeric suffix anywhere
    const hasExp = modelId.includes('-exp');
    const hasPreview = modelId.includes('-preview');
    const hasLatest = modelId.includes('-latest');
    const hasTuning = modelId.includes('-tuning');
    const hasDatePattern = /-\d{2}-\d{2}/.test(modelId);
    
    // Consider a model "clean" if it has none of these suffixes
    const isClean = !hasNumericSuffix && !hasExp && !hasPreview && !hasLatest && !hasTuning && !hasDatePattern;
    
    // Get base name by removing all suffixes to group properly
    const baseName = modelId
      .replace(/-\d+(-|$)/, "-") // Remove numeric suffix like -001 (even when followed by other suffixes)
      .replace(/-$/, "")  // Remove trailing dash if it exists
      .replace(/-exp.*/, "") // Remove -exp and anything after
      .replace(/-preview.*/, "") // Remove -preview and anything after
      .replace(/-latest.*/, "") // Remove -latest and anything after
      .replace(/-tuning.*/, "") // Remove -tuning and anything after
      .replace(/-\d{2}-\d{2}.*/, ""); // Remove date patterns
    
    if (!modelNameMap.has(baseName)) {
      modelNameMap.set(baseName, { 
        clean: null, 
        withSuffix: [] 
      });
    }
    
    const entry = modelNameMap.get(baseName);
    if (isClean) {
      entry.clean = modelId;
    } else {
      entry.withSuffix.push(modelId);
    }
  });
  
  // Second pass: select the preferred version for each base name
  for (const [baseName, versions] of modelNameMap.entries()) {
    if (versions.clean) {
      // Prefer clean version if available
      cleanedModels.push(`gemini:${versions.clean}`);
    } else if (versions.withSuffix.length > 0) {
      // Fall back to first suffix version
      cleanedModels.push(`gemini:${versions.withSuffix[0]}`);
    }
  }
  
  return sortModels(cleanedModels);
} 