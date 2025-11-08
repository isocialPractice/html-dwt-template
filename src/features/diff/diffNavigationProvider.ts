// diffNavigationProvider
// Supplies diff navigation entries to VS Code decorations and highlights.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import { getNormalizedPath } from '../../utils/templatePaths';

export const ORIGINAL_DIFF_SCHEME = 'dw-original';

const virtualOriginalContents = new Map<string, string>();
export const virtualOriginalEmitter = new vscode.EventEmitter<vscode.Uri>();

export interface DiffNavigationEntry {
  originalRange: vscode.Range;
  modifiedRange: vscode.Range;
  preferredSide: 'original' | 'modified';
  previewLines: string[];
  preview: string;
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

export const diffNavigationStates = new Map<string, DiffNavigationState>();

export const originalDiffProvider: vscode.TextDocumentContentProvider = {
  onDidChange: virtualOriginalEmitter.event,
  provideTextDocumentContent(uri: vscode.Uri): string {
    const decoded = decodeVirtualOriginalPath(uri);
    const stored = virtualOriginalContents.get(decoded);
    if (stored !== undefined) {
      return stored;
    }
    try {
      return fs.readFileSync(decoded, 'utf8');
    } catch (err) {
      console.warn(`[DW-DIFF] Unable to read original content for ${decoded}:`, err);
      return '';
    }
  }
};

export const registerVirtualOriginalProvider = (context: vscode.ExtensionContext): vscode.Disposable => {
  const registration = vscode.workspace.registerTextDocumentContentProvider(ORIGINAL_DIFF_SCHEME, originalDiffProvider);
  context.subscriptions.push(registration);
  return registration;
};

export const createVirtualOriginalUri = (filePath: string): vscode.Uri => {
  const normalized = getNormalizedPath(filePath);
  return vscode.Uri.from({
    scheme: ORIGINAL_DIFF_SCHEME,
    path: '/' + encodeURIComponent(normalized),
    fragment: path.basename(normalized)
  });
};

export const setVirtualOriginalContent = (filePath: string, content: string): vscode.Uri => {
  const normalized = getNormalizedPath(filePath);
  virtualOriginalContents.set(normalized, content);
  const uri = createVirtualOriginalUri(normalized);
  virtualOriginalEmitter.fire(uri);
  return uri;
};

export const clearVirtualOriginalContent = (filePath: string): void => {
  const normalized = getNormalizedPath(filePath);
  virtualOriginalContents.delete(normalized);
};

export const decodeVirtualOriginalPath = (uri: vscode.Uri): string => {
  if (uri.scheme !== ORIGINAL_DIFF_SCHEME) {
    return uri.fsPath || getNormalizedPath(uri.path);
  }
  const decoded = decodeURIComponent(uri.path.replace(/^\/+/g, ''));
  return getNormalizedPath(decoded);
};

export const disposeDiffState = (instancePath: string): void => {
  const existing = diffNavigationStates.get(instancePath);
  if (existing?.usingVirtualOriginal && existing.originalUri.scheme === ORIGINAL_DIFF_SCHEME) {
    const originalPath = decodeVirtualOriginalPath(existing.originalUri);
    clearVirtualOriginalContent(originalPath);
  }
  diffNavigationStates.delete(instancePath);
};