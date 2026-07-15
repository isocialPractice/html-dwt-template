// decorations
// Manages editor decorations for editable, non-editable, and optional regions.

import * as vscode from 'vscode';
import { getEditableRanges, getOptionalRegionRanges, getProtectedRanges, getFileProtectionState } from './protection';
import { isDreamweaverTemplate, isDreamweaverTemplateFile } from '../../utils/templateDetection';

let nonEditableDecorationType: vscode.TextEditorDecorationType;
let editableDecorationType: vscode.TextEditorDecorationType;
let optionalRegionDecorationType: vscode.TextEditorDecorationType;

export function initializeDecorations(): void {
  // No decoration for editable regions
  editableDecorationType = vscode.window.createTextEditorDecorationType({});

  // For non-editable regions, reduce the opacity to subtly gray them out.
  nonEditableDecorationType = vscode.window.createTextEditorDecorationType({
    opacity: '0.6'
  });

  // For optional regions, add a subtle border to indicate conditional content
  optionalRegionDecorationType = vscode.window.createTextEditorDecorationType({
    border: '1px dashed rgba(255, 165, 0, 0.5)',
    backgroundColor: 'rgba(255, 165, 0, 0.1)'
  });
}

export function updateDecorations(editor: vscode.TextEditor | undefined): void {
  if (!editor) {
      return;
  }

  const fileProtectionEnabled = getFileProtectionState(editor.document);

  // Clear decorations if protection is disabled or if this is a .dwt file
  if (!fileProtectionEnabled || isDreamweaverTemplateFile(editor.document)) {
    editor.setDecorations(nonEditableDecorationType, []);
    editor.setDecorations(editableDecorationType, []);
    editor.setDecorations(optionalRegionDecorationType, []);
    return;
  }

  // Only apply decorations to instance files (not .dwt files)
  if (!isDreamweaverTemplate(editor.document)) {
    editor.setDecorations(nonEditableDecorationType, []);
    editor.setDecorations(editableDecorationType, []);
    editor.setDecorations(optionalRegionDecorationType, []);
    return;
  }

  const config = vscode.workspace.getConfiguration('dreamweaverTemplate');
  const protectedRanges = getProtectedRanges(editor.document);
  const editableRanges = getEditableRanges(editor.document);
  const optionalRegionRanges = getOptionalRegionRanges(editor.document);

  editor.setDecorations(nonEditableDecorationType, config.get('highlightProtectedRegions', true) ? protectedRanges : []);
  editor.setDecorations(editableDecorationType, config.get('highlightEditableRegions', true) ? editableRanges : []);
  editor.setDecorations(optionalRegionDecorationType, config.get('highlightOptionalRegions', true) ? optionalRegionRanges : []);
}

export function getDecorationDisposables(): vscode.TextEditorDecorationType[] {
  return [nonEditableDecorationType, editableDecorationType, optionalRegionDecorationType];
}
