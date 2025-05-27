/**
 * Utilities for filtering and processing Gemini model lists
 */
import { 
  filterModels, 
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
    const modelId = (model.name || model).replace(/^models\//u, '');
    return modelId.includes("gemini") && 
           !modelId.includes("vision") &&
           !modelId.includes("embedding");
  });

  // Extract just the ids for grouping if models are objects
  const modelIds = filteredModels.map(model => {
    if (typeof model === 'string') return model;
    return model.name.replace(/^models\//u, '');
  });

  // Skip grouping and directly prefer clean versions
  const cleanedModels = [];
  const modelNameMap = new Map();
  
  // First pass: identify different variants of the same base model
  modelIds.forEach(modelId => {
    // Determine if it has any special suffixes
    const hasNumericSuffix = /-\d+(-|$)/u.test(modelId); // Match numeric suffix anywhere
    const hasExp = modelId.includes('-exp');
    const hasPreview = modelId.includes('-preview');
    const hasLatest = modelId.includes('-latest');
    const hasTuning = modelId.includes('-tuning');
    const hasDatePattern = /-\d{2}-\d{2}/u.test(modelId);
    
    // Consider a model "clean" if it has none of these suffixes
    const isClean = !hasNumericSuffix && !hasExp && !hasPreview && !hasLatest && !hasTuning && !hasDatePattern;
    
    // Get base name by removing all suffixes to group properly
    const baseModelName = modelId
      .replace(/-\d+(-|$)/u, "-") // Remove numeric suffix like -001 (even when followed by other suffixes)
      .replace(/-$/u, "")  // Remove trailing dash if it exists
      .replace(/-exp.*/u, "") // Remove -exp and anything after
      .replace(/-preview.*/u, "") // Remove -preview and anything after
      .replace(/-latest.*/u, "") // Remove -latest and anything after
      .replace(/-tuning.*/u, "") // Remove -tuning and anything after
      .replace(/-\d{2}-\d{2}.*/u, ""); // Remove date patterns
    
    if (!modelNameMap.has(baseModelName)) {
      modelNameMap.set(baseModelName, { 
        clean: null, 
        withSuffix: [] 
      });
    }
    
    const entry = modelNameMap.get(baseModelName);
    if (isClean) {
      entry.clean = modelId;
    } else {
      entry.withSuffix.push(modelId);
    }
  });
  
  // Second pass: select the preferred version for each base name
  for (const [, versions] of modelNameMap.entries()) {
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