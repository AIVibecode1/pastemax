/**
 * localStorage keys used across App.tsx and its hooks (moved here by plan 029
 * so hooks can import them without circular imports).
 */
import { STORAGE_KEY_TASK_TYPE } from '../types/TaskTypes';

export const STORAGE_KEYS = {
  SELECTED_FOLDER: 'pastemax-selected-folder',
  SELECTED_FILES: 'pastemax-selected-files',
  SORT_ORDER: 'pastemax-sort-order',
  SEARCH_TERM: 'pastemax-search-term',
  EXPANDED_NODES: 'pastemax-expanded-nodes',
  IGNORE_MODE: 'pastemax-ignore-mode',
  IGNORE_SETTINGS_MODIFIED: 'pastemax-ignore-settings-modified',
  INCLUDE_BINARY_PATHS: 'pastemax-include-binary-paths',
  TASK_TYPE: STORAGE_KEY_TASK_TYPE,
  WORKSPACES: 'pastemax-workspaces',
  CURRENT_WORKSPACE: 'pastemax-current-workspace',
  COPY_HISTORY: 'pastemax-copy-history',
};
