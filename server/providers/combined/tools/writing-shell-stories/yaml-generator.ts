/**
 * YAML Generator
 * 
 * Utilities for generating screens.yaml structure from spatial analysis results.
 */

import YAML from 'yaml';
import type { Screen } from './screen-analyzer.js';

/**
 * YAML data structure for screens
 */
export interface ScreensYamlData {
  order: string;
  screens: Screen[];
  unassociated_notes?: string[];
}

/**
 * Generate screens.yaml content from spatial analysis results
 * 
 * @param screens - Array of screens with associated notes
 * @param unassociatedNotes - Array of note URLs not associated with any screen
 * @param order - Screen flow order description (e.g., "top-to-bottom, left-to-right")
 * @returns YAML string ready to write to file
 */
export function generateScreensYaml(
  screens: Screen[],
  unassociatedNotes: string[],
  order: string = 'top-to-bottom, left-to-right'
): string {
  const yamlData: ScreensYamlData = {
    order,
    screens,
  };
  
  // Only include unassociated_notes if there are any
  if (unassociatedNotes.length > 0) {
    yamlData.unassociated_notes = unassociatedNotes;
  }
  
  return YAML.stringify(yamlData);
}
