/**
 * Utilities for filtering and processing OpenAI model lists
 */
import { 
  filterModels, 
  groupModels, 
  sortModels 
} from "./modelUtils.js";

/**
 * Filters and processes model data from the OpenAI API response
 * @param {Array} modelData - Raw model data from the API
 * @returns {Array} Filtered and processed model names
 */
export function processOpenAIModels(modelData) {
  // Initial filtering
  const filteredModels = filterModels(modelData, (model) => {
    const id = model.id.toLowerCase();
    return id.includes("gpt") && 
           !id.includes("instruct") &&
           !id.includes("audio") &&
           !id.includes("search") &&
           !id.includes("realtime") &&
           !/-\d{4}/u.test(id) &&
           !/-\d{3,4}$/u.test(id);
  });

  // Group models by base name - extract just the ids for grouping
  const modelGroups = groupModels(
    filteredModels.map(model => model.id), 
    (id) => id.replace(/-preview(-\d{4}-\d{2}-\d{2})?$/u, "")
  );

  return selectFinalModels(modelGroups);
}

/**
 * Selects the best model variant from each group
 * @param {Map} modelGroups - Grouped model variants
 * @returns {Array} Selected model names
 */
function selectFinalModels(modelGroups) {
  const selectedModels = [];

  for (const [, variants] of modelGroups) {
    const previewVariants = variants.filter((v) => v.includes("-preview"));
    const nonPreviewVariants = variants.filter((v) => !v.includes("-preview"));

    if (nonPreviewVariants.length > 0) {
      selectedModels.push(nonPreviewVariants[0]);
    } else if (previewVariants.length > 0) {
      const simplePreview = previewVariants.find(
        (v) => !v.match(/-preview-\d{4}-\d{2}-\d{2}$/u)
      );
      selectedModels.push(simplePreview || previewVariants[0]);
    }
  }

  return sortModels(selectedModels);
} 