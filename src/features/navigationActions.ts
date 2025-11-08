// navigationActions
// Contains reusable navigation helpers used by diff commands.

import * as vscode from 'vscode';
import { DiffNavigationState } from './diff/diffNavigationTypes';

export const clampRangeToDocument = (range: vscode.Range, doc: vscode.TextDocument): vscode.Range => {
  if (doc.lineCount === 0) {
    const origin = new vscode.Position(0, 0);
    return new vscode.Range(origin, origin);
  }

  const maxLine = doc.lineCount - 1;
  const startLine = Math.max(0, Math.min(range.start.line, maxLine));
  const endLine = Math.max(startLine, Math.min(range.end.line, maxLine));

  const start = new vscode.Position(startLine, 0);
  const end = doc.lineAt(endLine).range.end;
  return new vscode.Range(start, end);
};

export const focusDiffEntry = async (state: DiffNavigationState, index: number): Promise<void> => {
  if (index < 0 || index >= state.ranges.length) {
    return;
  }

  const entry = state.ranges[index];
  const editors = vscode.window.visibleTextEditors;
  const targetOriginalUri = state.originalUri.toString();

  const originalEditor = editors.find(editor => editor.document.uri.toString() === targetOriginalUri);
  const modifiedEditor = editors.find(editor => editor.document.uri.fsPath === state.tempPath);

  const prefersModified = entry.preferredSide === 'modified' && !!modifiedEditor;
  const focusCommand = prefersModified
    ? 'workbench.action.compareEditor.focusSecondarySide'
    : 'workbench.action.compareEditor.focusPrimarySide';

  await vscode.commands.executeCommand(focusCommand);

  const targetEditor = (prefersModified ? modifiedEditor : originalEditor) ?? vscode.window.activeTextEditor;
  if (!targetEditor) {
    return;
  }

  const targetRange = prefersModified && modifiedEditor ? entry.modifiedRange : entry.originalRange;
  const boundedRange = clampRangeToDocument(targetRange, targetEditor.document);

  const selection = new vscode.Selection(boundedRange.start, boundedRange.start);
  targetEditor.selections = [selection];
  targetEditor.revealRange(boundedRange, vscode.TextEditorRevealType.InCenter);
};