// virtualOriginalProvider
// Supplies read-only original documents for diff comparisons.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import { getNormalizedPath } from '../utils/templatePaths';
import { virtualOriginalEmitter } from './virtualOriginalEmitter';
import { virtualOriginalContents } from './virtualOriginalStore';

export const ORIGINAL_DIFF_SCHEME = 'dw-original';

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

export const registerVirtualOriginalProvider = (context: vscode.ExtensionContext): void => {
  const providerRegistration = vscode.workspace.registerTextDocumentContentProvider(ORIGINAL_DIFF_SCHEME, originalDiffProvider);
  context.subscriptions.push(providerRegistration);
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