// features/update/vscodeHost
// EngineHost over VS Code: open documents, modal prompts with the diff view and sticky panel, progress, protection.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { structuredPatch } from 'diff';
import { ApplyAnswer, ApplyRequest, EngineHost, SafetyAnswer, SafetyRequest, UpdateOptions } from '@isocialpractice/html-dwt-cmd-template';
import { setVirtualOriginalContent } from '../virtualOriginalProvider';
import { diffControl } from '../diff/diffControlPanel';
import { diffNavigationStates } from '../diff/diffNavigationState';
import { DiffNavigationEntry, DiffNavigationState } from '../diff/diffNavigationTypes';
import { disposeDiffState } from '../diff/diffStateDisposal';
import { getGlobalProtection, setGlobalProtection, shouldProtectFromEditing } from '../protect/protection';
import { saveDocumentSnapshot } from '../protect/snapshots';
import { updateDecorations } from '../protect/decorations';
import { getBooleanSetting, SETTINGS_SECTION } from '../../utils/settings';

/** Folder names the extension has always used, so existing backups keep restoring. */
export const BACKUP_DIR_NAME = '.html-dwt-template-backups';
export const TEMP_DIR_NAME = '.html-dwt-template-temp';

const PROGRESS_LOCATION = vscode.ProgressLocation.Notification;

let activeRuns = 0;
let protectionBeforeRuns = true;

/**
 * Engine options with the extension's backup and temp folder names, and backups on or off
 * per the Enable Backup setting.
 */
export function engineOptions(options: UpdateOptions = {}): UpdateOptions {
  return {
    backupDirName: BACKUP_DIR_NAME,
    tempDirName: TEMP_DIR_NAME,
    skipBackup: !getBooleanSetting('enableBackup', true),
    ...options
  };
}

/**
 * Whether the extension itself is writing files right now (an update run or a template
 * sync), so its own saves are not mistaken for the user's.
 */
export function isRunActive(): boolean {
  return activeRuns > 0;
}

/**
 * The site root of a template: the folder that holds its Templates folder.
 */
export function siteRootOfTemplate(templatePath: string): string {
  return path.dirname(path.dirname(templatePath));
}

/**
 * The open document for a file, if any.
 */
export function findOpenDocument(filePath: string): vscode.TextDocument | undefined {
  const target = normalizeForCompare(filePath);
  return vscode.workspace.textDocuments.find(doc => doc.uri.scheme === 'file' && normalizeForCompare(doc.uri.fsPath) === target);
}

/**
 * Replaces the whole text of an open document, saving it only when it had no unsaved
 * changes before. Returns false when the edit was not applied.
 */
export async function replaceDocumentText(document: vscode.TextDocument, text: string): Promise<boolean> {
  const wasDirty = document.isDirty;
  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), text);
  const applied = await vscode.workspace.applyEdit(edit);
  if (applied && !wasDirty) {
    await document.save();
  }
  return applied;
}

/**
 * Suspends edit protection while the engine writes, and restores it afterwards with fresh
 * snapshots. Nested runs share one suspension.
 */
export function beginProtectedRun(): void {
  if (activeRuns === 0) {
    protectionBeforeRuns = getGlobalProtection();
    setGlobalProtection(false);
  }
  activeRuns++;
}

export function endProtectedRun(): void {
  activeRuns = Math.max(0, activeRuns - 1);
  if (activeRuns > 0) {
    return;
  }
  setGlobalProtection(protectionBeforeRuns);
  for (const document of vscode.workspace.textDocuments) {
    if (shouldProtectFromEditing(document)) {
      saveDocumentSnapshot(document, true);
    }
  }
  updateDecorations(vscode.window.activeTextEditor);
}

/**
 * Creates the EngineHost for one site.
 */
export function createVscodeHost(siteRoot: string, outputChannel: vscode.OutputChannel | undefined): EngineHost {
  const tempDir = path.join(siteRoot, TEMP_DIR_NAME);

  return {
    siteRoot,

    async readText(filePath: string): Promise<string> {
      const document = findOpenDocument(filePath);
      return document ? document.getText() : fs.promises.readFile(filePath, 'utf8');
    },

    async writeText(filePath: string, text: string): Promise<void> {
      disposeDiffState(filePath);
      const document = findOpenDocument(filePath);
      if (document && await replaceDocumentText(document, text)) {
        return;
      }
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(filePath, text, 'utf8');
    },

    log(line: string): void {
      console.log(line);
      outputChannel?.appendLine(line);
    },

    notify(level: 'info' | 'warning' | 'error', message: string): void {
      if (level === 'error') {
        vscode.window.showErrorMessage(message);
      } else if (level === 'warning') {
        vscode.window.showWarningMessage(message);
      } else {
        vscode.window.showInformationMessage(message);
      }
    },

    confirmApply: request => confirmApplyWithDiff(request, tempDir),

    confirmSafety: request => confirmSafetyWithDiff(request, tempDir),

    async withProgress<T>(title: string, task: (isCancelled: () => boolean) => Promise<T>): Promise<T> {
      return vscode.window.withProgress({ location: PROGRESS_LOCATION, title, cancellable: true }, (_progress, token) =>
        task(() => token.isCancellationRequested)
      );
    },

    onRunStart(): void {
      beginProtectedRun();
    },

    onRunEnd(): void {
      endProtectedRun();
      cleanupTempDirectory(tempDir);
      diffControl.dispose();
    }
  };
}

async function confirmSafetyWithDiff(request: SafetyRequest, tempDir: string): Promise<SafetyAnswer> {
  const fileName = path.basename(request.filePath);
  const NEXT = 'Next File';
  const SHOW = 'Show Error';
  const decision = await vscode.window.showWarningMessage(`Safety checks flagged ${fileName}.`, { modal: true }, NEXT, SHOW);
  if (decision === undefined) {
    return 'cancel';
  }
  if (decision !== SHOW) {
    return 'next';
  }
  try {
    fs.mkdirSync(tempDir, { recursive: true });
    const tempPath = path.join(tempDir, fileName);
    fs.writeFileSync(tempPath, request.updated, 'utf8');
    await vscode.commands.executeCommand('vscode.diff', vscode.Uri.file(request.filePath), vscode.Uri.file(tempPath), `Safety: ${fileName}`);
  } catch {
    vscode.window.showErrorMessage('Failed to show safety diff.');
  }
  await vscode.window.showWarningMessage(`Review safety diff for ${fileName}.`, { modal: true }, NEXT);
  return 'showDiff';
}

async function confirmApplyWithDiff(request: ApplyRequest, tempDir: string): Promise<ApplyAnswer> {
  const instancePath = request.filePath;
  const fileName = path.basename(instancePath);
  const original = request.original.replace(/\r\n?/g, '\n');
  const updated = request.updated.replace(/\r\n?/g, '\n');
  const APPLY = 'Apply';
  const APPLY_ALL = 'Apply to All';
  const SHOW_DIFF = 'Show Diff';
  const PREVIOUS_DIFF = 'Previous Diff';
  const NEXT_DIFF = 'Next Diff';
  const SKIP = 'Skip';
  const promptMessage = `Update '${fileName}' with template changes?`;
  let diffTempPath: string | null = null;
  let diffShown = false;

  const clearDiffNavigationState = (): void => {
    try { if (diffTempPath && fs.existsSync(diffTempPath)) fs.unlinkSync(diffTempPath); } catch {}
    disposeDiffState(instancePath);
    diffTempPath = null;
    diffShown = false;
  };
  const buildNavigationEntries = (): DiffNavigationEntry[] => {
    try {
      const patch = structuredPatch(instancePath, diffTempPath ?? fileName, original, updated, '', '');
      return patch.hunks.map(hunk => {
        const oldStart = Math.max(0, hunk.oldStart - 1);
        const oldLines = Math.max(hunk.oldLines, 1);
        const newStart = Math.max(0, hunk.newStart - 1);
        const newLines = Math.max(hunk.newLines, 1);
        return {
          originalRange: new vscode.Range(oldStart, 0, oldStart + oldLines - 1, Number.MAX_SAFE_INTEGER),
          modifiedRange: new vscode.Range(newStart, 0, newStart + newLines - 1, Number.MAX_SAFE_INTEGER),
          preferredSide: hunk.newLines === 0 && hunk.oldLines > 0 ? 'original' : 'modified'
        } as DiffNavigationEntry;
      });
    } catch {
      return [];
    }
  };
  const updateDiffNavigationState = (tempPath: string, originalUri: vscode.Uri, usingVirtualOriginal: boolean): DiffNavigationState => {
    const existing = diffNavigationStates.get(instancePath);
    const ranges = buildNavigationEntries();
    let currentIndex = existing?.currentIndex ?? -1;
    if (ranges.length === 0 || currentIndex >= ranges.length || currentIndex < -1) currentIndex = -1;
    const state: DiffNavigationState = { tempPath, ranges, currentIndex, originalUri, usingVirtualOriginal };
    diffNavigationStates.set(instancePath, state);
    return state;
  };
  const ensureDiffShown = async (): Promise<void> => {
    try {
      if (!diffTempPath) {
        fs.mkdirSync(tempDir, { recursive: true });
        diffTempPath = path.join(tempDir, fileName);
      }
      fs.writeFileSync(diffTempPath, request.updated, 'utf8');
      const existingEditor = vscode.window.visibleTextEditors.find(e => e.document.uri.fsPath === instancePath);
      const usingVirtualOriginal = !existingEditor;
      const originalUri = existingEditor ? vscode.Uri.file(instancePath) : setVirtualOriginalContent(instancePath, request.original);
      const state = updateDiffNavigationState(diffTempPath, originalUri, usingVirtualOriginal);
      await vscode.commands.executeCommand('vscode.diff', state.originalUri, vscode.Uri.file(diffTempPath), `Diff: ${fileName}`);
      diffShown = true;
      if (state.ranges.length > 0) {
        if (state.currentIndex === -1) {
          state.currentIndex = 0;
          diffNavigationStates.set(instancePath, state);
        }
        await vscode.commands.executeCommand('htmlDwtTemplate.navigateDiff', 'current');
      } else {
        vscode.window.setStatusBarMessage('No differences detected for navigation.', 2000);
      }
    } catch {
      vscode.window.showErrorMessage('Failed to show diff.');
    }
  };
  const navigateDiff = async (direction: 'next' | 'previous'): Promise<void> => {
    await ensureDiffShown();
    const state = diffNavigationStates.get(instancePath);
    if (!state || state.ranges.length === 0) return;
    if (state.ranges.length === 1) {
      state.currentIndex = 0;
      diffNavigationStates.set(instancePath, state);
      await vscode.commands.executeCommand('htmlDwtTemplate.navigateDiff', 'current');
      vscode.window.setStatusBarMessage('Showing the only difference.', 1500);
      return;
    }
    await vscode.commands.executeCommand('htmlDwtTemplate.navigateDiff', direction);
  };

  let decision: string | undefined;
  const useStickyPanel = vscode.workspace.getConfiguration(SETTINGS_SECTION).get<boolean>('useStickyDiffPanel', false);
  let usedPanel = useStickyPanel && diffControl.isVisible();
  if (usedPanel) {
    diffControl.update({ fileName, diffShown });
  }
  while (true) {
    if (!usedPanel) {
      const options = diffShown ? [APPLY, APPLY_ALL, PREVIOUS_DIFF, NEXT_DIFF, SKIP] : [APPLY, APPLY_ALL, SHOW_DIFF, SKIP];
      decision = await vscode.window.showInformationMessage(promptMessage, { modal: true }, ...options);
      if (decision === SHOW_DIFF) {
        await ensureDiffShown();
        if (useStickyPanel) {
          diffControl.show({ fileName, diffShown: true });
          usedPanel = true;
        }
        continue;
      }
      if (decision === NEXT_DIFF) { await navigateDiff('next'); continue; }
      if (decision === PREVIOUS_DIFF) { await navigateDiff('previous'); continue; }
      break;
    }
    const action = await diffControl.waitForAction();
    if (action === 'apply') { decision = APPLY; break; }
    if (action === 'applyAll') { decision = APPLY_ALL; break; }
    if (action === 'skip') { decision = SKIP; break; }
    if (action === 'cancel') { decision = undefined; break; }
    if (action === 'next') { await navigateDiff('next'); diffControl.update({ diffShown: true }); continue; }
    if (action === 'prev') { await navigateDiff('previous'); diffControl.update({ diffShown: true }); continue; }
  }

  clearDiffNavigationState();
  if (decision === APPLY_ALL) return 'applyAll';
  if (decision === APPLY) return 'apply';
  if (decision === undefined) return 'cancel';
  return 'skip';
}

// Removes the diff temp files unless an editor still shows one of them
function cleanupTempDirectory(tempDir: string): void {
  try {
    const hasOpenTempEditors = vscode.window.visibleTextEditors.some(e => e.document.uri.fsPath.includes(TEMP_DIR_NAME));
    if (hasOpenTempEditors || !fs.existsSync(tempDir)) return;
    for (const entry of fs.readdirSync(tempDir)) {
      try { fs.unlinkSync(path.join(tempDir, entry)); } catch {}
    }
    try { fs.rmdirSync(tempDir); } catch {}
  } catch (error) {
    console.warn('[DW-ENGINE] Cleanup temp directory error:', error);
  }
}

function normalizeForCompare(filePath: string): string {
  const resolved = path.resolve(filePath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}
