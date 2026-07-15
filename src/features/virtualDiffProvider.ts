// virtualDiffProvider
// Generates virtual diff documents that reflect Dreamweaver template updates.

import * as vscode from 'vscode';
import * as fs from 'fs';
import { getNormalizedPath } from '../utils/templatePaths';

export interface DiffNavigationEntry {
  originalRange: vscode.Range;
  modifiedRange: vscode.Range;
  preferredSide: 'original' | 'modified';
}

export interface DiffNavigationState {
  tempPath: string;
  ranges: DiffNavigationEntry[];
  currentIndex: number; // -1 indicates no position selected yet
  originalUri: vscode.Uri;
  usingVirtualOriginal: boolean;
}

export const diffNavigationStates = new Map<string, DiffNavigationState>();

export const ORIGINAL_DIFF_SCHEME = 'dwt-instance-original';
const virtualOriginalContents = new Map<string, string>();
const virtualOriginalEmitter = new vscode.EventEmitter<vscode.Uri>();

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

export const registerDiffProvider = (context: vscode.ExtensionContext): void => {
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(ORIGINAL_DIFF_SCHEME, originalDiffProvider),
    virtualOriginalEmitter
  );
};

export const createVirtualOriginalUri = (filePath: string): vscode.Uri => {
  const normalized = getNormalizedPath(filePath);
  return vscode.Uri.from({
    scheme: ORIGINAL_DIFF_SCHEME,
    path: '/' + encodeURIComponent(normalized),
    fragment: pathBasename(normalized)
  });
};

const pathBasename = (filePath: string): string => filePath.split(/[\\/]/).pop() ?? filePath;

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