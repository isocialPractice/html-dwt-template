// features/repeating-elements
// Insert Entry Before/After: copies the repeat entry at the cursor, using the engine's text functions.

import * as vscode from 'vscode';
import * as fs from 'fs';
import {
  applyAlternatingColors,
  extractAlternatingColors,
  insertRepeatEntry,
  readTemplateRef,
  resolveTemplateRef
} from '@isocialpractice/html-dwt-cmd-template';
import { setFileProtectionState, shouldProtectFromEditing } from './protect/protection';
import { updateDecorations } from './protect/decorations';
import { saveDocumentSnapshot } from './protect/snapshots';

export interface RepeatEntryCommandDeps {
  outputChannel: vscode.OutputChannel;
  logProcessCompletion: (context: string, errorCode?: number) => void;
  isProtectionEnabled: () => boolean;
}

/**
 * Registers Insert Entry Before Selection and Insert Entry After Selection.
 */
export function registerInsertRepeatEntryCommands(deps: RepeatEntryCommandDeps): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('htmlDwtTemplate.insertRepeatEntryAfter', () => insertEntry('after', deps)),
    vscode.commands.registerCommand('htmlDwtTemplate.insertRepeatEntryBefore', () => insertEntry('before', deps))
  ];
}

async function insertEntry(where: 'before' | 'after', deps: RepeatEntryCommandDeps): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('No active editor.');
    return;
  }

  const document = editor.document;
  const text = document.getText();
  const inserted = insertRepeatEntry(text, document.offsetAt(editor.selection.active), where);
  if (!inserted) {
    vscode.window.showWarningMessage('Cursor must be within a repeat entry block (between InstanceBeginRepeatEntry and InstanceEndRepeatEntry).');
    return;
  }

  const wasProtected = shouldProtectFromEditing(document);
  try {
    if (wasProtected) {
      // Temporarily disable file protection to allow safe programmatic insertion
      setFileProtectionState(document, false);
      updateDecorations(editor);
    }

    // The insertion is the only difference between the two texts
    const prefixLength = commonPrefixLength(text, inserted.text);
    const insertion = inserted.text.slice(prefixLength, prefixLength + inserted.text.length - text.length);
    const edit = new vscode.WorkspaceEdit();
    edit.insert(document.uri, document.positionAt(prefixLength), insertion);
    await vscode.workspace.applyEdit(edit);

    // Renumber alternating row colors when the template defines them for this repeat
    const colors = readTemplateColors(document, inserted.repeatName);
    if (colors.length > 0) {
      const current = document.getText();
      const recolored = applyAlternatingColors(current, colors);
      if (recolored !== current) {
        const colorEdit = new vscode.WorkspaceEdit();
        colorEdit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(current.length)), recolored);
        await vscode.workspace.applyEdit(colorEdit);
      }
    }

    vscode.window.showInformationMessage(`Inserted repeat entry ${where} selection in "${inserted.repeatName}"`);
    deps.outputChannel.appendLine(`[REPEAT-INSERT] Added entry ${where} selection in repeat "${inserted.repeatName}"`);
    deps.logProcessCompletion(where === 'after' ? 'insertRepeatEntryAfter' : 'insertRepeatEntryBefore');
  } finally {
    if (wasProtected) {
      setFileProtectionState(document, true);
      updateDecorations(editor);
      // refresh snapshot with protection on
      saveDocumentSnapshot(document, deps.isProtectionEnabled());
    }
  }
}

function readTemplateColors(document: vscode.TextDocument, repeatName: string) {
  try {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const templateRef = readTemplateRef(document.uri.fsPath);
    if (!workspaceFolder || !templateRef) return [];
    const templatePath = resolveTemplateRef(workspaceFolder.uri.fsPath, templateRef);
    if (!fs.existsSync(templatePath)) return [];
    return extractAlternatingColors(fs.readFileSync(templatePath, 'utf8')).filter(c => c.repeatName === repeatName);
  } catch {
    return [];
  }
}

function commonPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  return i;
}
