// update/repeatUtils
// Utilities for working with InstanceBeginRepeat blocks and color normalization.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function findRepeatBlockAtCursor(document: vscode.TextDocument, position: vscode.Position): { repeatName: string; firstEntry: string; entryStart: number; entryEnd: number } | null {
  const text = document.getText();
  const cursorOffset = document.offsetAt(position);
  const repeatBlockRegex = /<!--\s*InstanceBeginRepeat\s+name="([^"]+)"\s*-->([\s\S]*?)<!--\s*InstanceEndRepeat\s*-->/g;
  let repeatMatch: RegExpExecArray | null;

  while ((repeatMatch = repeatBlockRegex.exec(text)) !== null) {
    const repeatName = repeatMatch[1];
    const repeatContent = repeatMatch[2];
    const repeatStart = repeatMatch.index;
    const repeatEnd = repeatStart + repeatMatch[0].length;

    if (cursorOffset >= repeatStart && cursorOffset <= repeatEnd) {
      const entryRegex = /<!--\s*InstanceBeginRepeatEntry\s*-->([\s\S]*?)<!--\s*InstanceEndRepeatEntry\s*-->/g;
      let entryMatch: RegExpExecArray | null;
      let firstEntryContent = '';

      while ((entryMatch = entryRegex.exec(repeatContent)) !== null) {
        const entryStart = repeatStart + repeatMatch[0].indexOf(repeatContent) + entryMatch.index;
        const entryEnd = entryStart + entryMatch[0].length;
        if (cursorOffset >= entryStart && cursorOffset <= entryEnd) {
          if (!firstEntryContent) {
            firstEntryContent = entryMatch[0];
          }
          return { repeatName, firstEntry: firstEntryContent, entryStart, entryEnd };
        }
      }
    }
  }
  return null;
}

export async function normalizeRepeatColorsIfNeeded(document: vscode.TextDocument, repeatName: string): Promise<void> {
  try {
    const full = document.getText();
    const instBegin = /<!--\s*InstanceBegin\s+template="([^"]+)"[^>]*-->/i.exec(full);
    if (!instBegin) return;
    const templateRel = instBegin[1];
    const ws = vscode.workspace.workspaceFolders?.[0];
    if (!ws) return;
    const templateFsPath = path.join(ws.uri.fsPath, templateRel.replace(/^\//, ''));
    if (!fs.existsSync(templateFsPath)) return;
    const templateText = fs.readFileSync(templateFsPath, 'utf8');
    const repeatBlockRe = new RegExp(`<!--\\s*TemplateBeginRepeat\\s+name=\"${repeatName.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}\"\\s*-->[\\s\\S]*?<!--\\s*TemplateEndRepeat\\s*-->`,'i');
    const tmplRepeat = repeatBlockRe.exec(templateText);
    if (!tmplRepeat) return;
    const ternaryRe = /<tr[^>]*\sbgcolor="@@\(_index\s*&\s*1\s*\?\s*'([^']+)'\s*:\s*'([^']+)'\)@@"[^>]*>/i;
    const ternaryMatch = ternaryRe.exec(tmplRepeat[0]);
    if (!ternaryMatch) return;
    const colorA = ternaryMatch[1];
    const colorB = ternaryMatch[2];
    const instRepeatRe = new RegExp(`(<!--\\s*InstanceBeginRepeat\\s+name=\"${repeatName.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}\"\\s*-->)([\\s\\S]*?)(<!--\\s*InstanceEndRepeat\\s*-->)`,'i');
    const instMatch = instRepeatRe.exec(full);
    if (!instMatch) return;
    const before = full.slice(0, instMatch.index);
    const middle = instMatch[2];
    const after = full.slice(instMatch.index + instMatch[0].length);
    const entryRe = /(<!--\s*InstanceBeginRepeatEntry\s*-->)([\s\S]*?)(<!--\s*InstanceEndRepeatEntry\s*-->)/g;
    let em: RegExpExecArray | null;
    let rebuiltEntries = '';
    let idx = 0;
    while ((em = entryRe.exec(middle)) !== null) {
      const entryFull = em[0];
      const desired = (idx & 1) ? colorA : colorB;
      const swapped = entryFull.replace(/(<tr[^>]*\sbgcolor=")(#?[A-Fa-f0-9]{3,6})("[^>]*>)/, (_full, p1, _old, p3) => {
        return `${p1}${desired}${p3}`;
      });
      rebuiltEntries += swapped;
      idx++;
    }
    if (!rebuiltEntries) return;
    const newBlock = instMatch[1] + rebuiltEntries + instMatch[3];
    const updated = before + newBlock + after;
    if (updated !== full) {
      const edit = new vscode.WorkspaceEdit();
      edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(full.length)), updated);
      await vscode.workspace.applyEdit(edit);
    }
  } catch {
    // Non-fatal
  }
}
