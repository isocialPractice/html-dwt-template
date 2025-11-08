// diffNavigationTypes
// Defines shared types for diff navigation structures and events.

import * as vscode from 'vscode';

export interface DiffNavigationEntry {
  originalRange: vscode.Range;
  modifiedRange: vscode.Range;
  preferredSide: 'original' | 'modified';
  previewLines?: string[];
  preview?: string;
}

export interface DiffNavigationState {
  tempPath: string;
  ranges: DiffNavigationEntry[];
  currentIndex: number;
  originalUri: vscode.Uri;
  usingVirtualOriginal: boolean;
}

export interface DiffNavigationCacheEntry {
  range: vscode.Range;
  line: number;
  preview: string;
}