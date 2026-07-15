// diffStateDisposal
// Handles cleanup for diff navigation resources and listeners.

import { diffNavigationStates } from './diffNavigationState';
import {
  ORIGINAL_DIFF_SCHEME,
  clearVirtualOriginalContent,
  decodeVirtualOriginalPath
} from '../virtualOriginalProvider';

export const disposeDiffState = (instancePath: string): void => {
  const existing = diffNavigationStates.get(instancePath);
  if (existing?.usingVirtualOriginal && existing.originalUri.scheme === ORIGINAL_DIFF_SCHEME) {
    const originalPath = decodeVirtualOriginalPath(existing.originalUri);
    clearVirtualOriginalContent(originalPath);
  }
  diffNavigationStates.delete(instancePath);
};