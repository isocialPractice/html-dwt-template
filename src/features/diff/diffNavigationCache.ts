// diffNavigationCache
// Stores per-document diff navigation state for quick access.

import { DiffNavigationCacheEntry } from './diffNavigationTypes';

export const diffNavigationCache = new Map<string, DiffNavigationCacheEntry>();