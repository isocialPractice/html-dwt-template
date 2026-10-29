// features/update/templateSync
// Template sync: saving a template updates the files based on it that are open in an editor.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  getTemplateRef,
  isPathInsideRoot,
  isTemplateFilePath,
  mergeInstance,
  resolveTemplateRef
} from '@isocialpractice/html-dwt-cmd-template';
import { getBooleanSetting } from '../../utils/settings';
import {
  beginProtectedRun,
  endProtectedRun,
  isRunActive,
  replaceDocumentText,
  siteRootOfTemplate,
  TEMP_DIR_NAME
} from './vscodeHost';

const INSTANCE_BEGIN_REGEX = /<!--\s*InstanceBegin\s+template="([^"]+)"[^>]*-->/i;
const TEMPLATE_INFO_LOCK_REGEX = /<!--\s*TemplateInfo\s+codeOutsideHTMLIsLocked="(true|false)"\s*-->/i;
const SYNC_OFF_NOTICE = 'Template saved. Run Update Files Based on Template to update the files based on it.';
const STATUS_MESSAGE_TIMEOUT = 5000;

interface SyncTemplate {
  templatePath: string;
  templateText: string;
}

/**
 * Listens for template saves. With Enable Template Sync on, the open files based on the
 * saved template are updated; with it off, one notice says how to update them.
 */
export function registerTemplateSync(outputChannel: vscode.OutputChannel): vscode.Disposable {
  return vscode.workspace.onDidSaveTextDocument(document => {
    void onDocumentSaved(document, outputChannel);
  });
}

async function onDocumentSaved(document: vscode.TextDocument, outputChannel: vscode.OutputChannel): Promise<void> {
  // The extension's own writes and saves are not template edits by the user
  if (document.uri.scheme !== 'file' || isRunActive() || !isTemplateFilePath(document.uri.fsPath)) {
    return;
  }
  if (!getBooleanSetting('enableTemplateSync', true)) {
    vscode.window.showInformationMessage(SYNC_OFF_NOTICE);
    return;
  }
  try {
    const updated = await syncOpenFiles({ templatePath: document.uri.fsPath, templateText: document.getText() }, outputChannel);
    if (updated > 0) {
      vscode.window.setStatusBarMessage(`Template sync updated ${updated} open file(s).`, STATUS_MESSAGE_TIMEOUT);
    }
  } catch (error) {
    outputChannel.appendLine(`[SYNC] Template sync failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Updates every open document based on the template, then the open documents based on any
 * open child template it updated. Writes go through open documents only: a document with
 * no unsaved changes is saved, one with unsaved changes stays unsaved. No prompts, no backups.
 */
async function syncOpenFiles(saved: SyncTemplate, outputChannel: vscode.OutputChannel): Promise<number> {
  const siteRoot = siteRootOfTemplate(saved.templatePath);
  const visited = new Set<string>([normalize(saved.templatePath)]);
  const queue: SyncTemplate[] = [saved];
  let updated = 0;

  beginProtectedRun();
  try {
    while (queue.length > 0) {
      const { templatePath, templateText } = queue.shift()!;
      const parentTemplateText = readParentTemplate(siteRoot, templateText);
      const masterLock = INSTANCE_BEGIN_REGEX.test(templateText) ? undefined : TEMPLATE_INFO_LOCK_REGEX.exec(templateText)?.[1].toLowerCase();

      for (const document of openDocumentsBasedOn(siteRoot, templatePath)) {
        const filePath = document.uri.fsPath;
        const childTemplate = isTemplateFilePath(filePath, siteRoot);
        const merge = mergeInstance(templateText, document.getText(), {
          templateRef: getTemplateRef(siteRoot, templatePath),
          childTemplate,
          templateCodeOutsideHTMLIsLocked: childTemplate ? undefined : masterLock,
          parentTemplateText
        });
        if (merge.status === 'unchanged') continue;
        if (merge.safetyIssues.length > 0) {
          outputChannel.appendLine(`[SYNC] Skipped ${filePath}: ${merge.safetyIssues.join('; ')}`);
          offerSafetyDiff(siteRoot, document, merge.rebuilt);
          continue;
        }
        if (!await replaceDocumentText(document, merge.rebuilt)) continue;
        updated++;
        outputChannel.appendLine(`[SYNC] Updated open file ${filePath}`);
        if (childTemplate && !visited.has(normalize(filePath))) {
          visited.add(normalize(filePath));
          queue.push({ templatePath: filePath, templateText: document.getText() });
        }
      }
    }
  } finally {
    endProtectedRun();
  }
  return updated;
}

// Open documents inside the site whose InstanceBegin names the template
function openDocumentsBasedOn(siteRoot: string, templatePath: string): vscode.TextDocument[] {
  return vscode.workspace.textDocuments.filter(document => {
    if (document.uri.scheme !== 'file' || document.isClosed) return false;
    const filePath = document.uri.fsPath;
    if (!isPathInsideRoot(filePath, siteRoot) || normalize(filePath) === normalize(templatePath)) return false;
    const ref = INSTANCE_BEGIN_REGEX.exec(document.getText())?.[1];
    if (!ref) return false;
    return normalize(resolveTemplateRef(siteRoot, ref)) === normalize(templatePath)
      || path.basename(ref) === path.basename(templatePath);
  });
}

function readParentTemplate(siteRoot: string, templateText: string): string | undefined {
  const parentRef = INSTANCE_BEGIN_REGEX.exec(templateText)?.[1];
  if (!parentRef) return undefined;
  const parentPath = resolveTemplateRef(siteRoot, parentRef);
  const open = vscode.workspace.textDocuments.find(doc => normalize(doc.uri.fsPath) === normalize(parentPath));
  if (open) return open.getText();
  return fs.existsSync(parentPath) ? fs.readFileSync(parentPath, 'utf8') : undefined;
}

// A file that fails the safety checks is skipped; the warning offers its diff
function offerSafetyDiff(siteRoot: string, document: vscode.TextDocument, updatedText: string): void {
  const fileName = path.basename(document.uri.fsPath);
  const SHOW_DIFF = 'Show Diff';
  void vscode.window.showWarningMessage(`Template sync skipped ${fileName}: safety checks failed.`, SHOW_DIFF).then(async choice => {
    if (choice !== SHOW_DIFF) return;
    const tempDir = path.join(siteRoot, TEMP_DIR_NAME);
    fs.mkdirSync(tempDir, { recursive: true });
    const tempPath = path.join(tempDir, fileName);
    fs.writeFileSync(tempPath, updatedText, 'utf8');
    await vscode.commands.executeCommand('vscode.diff', document.uri, vscode.Uri.file(tempPath), `Template sync: ${fileName}`);
  });
}

function normalize(filePath: string): string {
  const resolved = path.resolve(filePath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}
