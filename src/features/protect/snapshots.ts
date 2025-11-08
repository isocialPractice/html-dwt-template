// snapshots
// Provides snapshot save/restore and state for edit protection.

import * as vscode from 'vscode';

export interface DocumentSnapshot {
  content: string;
  version: number;
  timestamp: number;
}

const documentSnapshots = new Map<string, DocumentSnapshot>();
let restoring = false;

export function isRestoringContentFlag(): boolean {
  return restoring;
}

// Save a snapshot when protection is enabled for this document
export function saveDocumentSnapshot(document: vscode.TextDocument, protectionEnabled: boolean): void {
  if (!protectionEnabled) {
    return;
  }

  documentSnapshots.set(document.uri.toString(), {
    content: document.getText(),
    version: document.version,
    timestamp: Date.now()
  });
}

export async function restoreFromSnapshot(editor: vscode.TextEditor): Promise<void> {
  const snapshot = documentSnapshots.get(editor.document.uri.toString());
  if (!snapshot) return;

  try {
    restoring = true;

    // Get current cursor position to restore after
    const currentSelection = editor.selection;

    // Replace entire document content with snapshot
    const fullRange = new vscode.Range(
      editor.document.positionAt(0),
      editor.document.positionAt(editor.document.getText().length)
    );

    const edit = new vscode.WorkspaceEdit();
    edit.replace(editor.document.uri, fullRange, snapshot.content);

    await vscode.workspace.applyEdit(edit);

    // Restore cursor position if still valid
    try {
      if (currentSelection.start.line < editor.document.lineCount) {
        editor.selection = currentSelection;
        editor.revealRange(new vscode.Range(currentSelection.start, currentSelection.end), vscode.TextEditorRevealType.InCenter);
      } else {
        editor.selection = new vscode.Selection(0, 0, 0, 0);
      }
    } catch {
      // If position is no longer valid, place cursor at start
      editor.selection = new vscode.Selection(0, 0, 0, 0);
    }
  } finally {
      restoring = false;
  }
}
