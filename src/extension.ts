// extension
// Extension entry point for html-dwt-template. Template updates run in the engine package.

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {
  findDescendantTemplates,
  findLastBackup,
  findTemplateInstances as engineFindTemplateInstances,
  InstanceParameters,
  parseInstanceParameters,
  parseTemplateParameters,
  resolveTemplateRef,
  restoreLastBackup,
  RunSummary,
  setInstanceParameters,
  TemplateParam,
  updateFilesBasedOnTemplate,
  updateInstance
} from '@isocialpractice/html-dwt-cmd-template';
import { usesTemplateMarkers, isTemplateFileDocument } from './utils/templateDetection';
import { saveDocumentSnapshot as saveDocSnapshot, restoreFromSnapshot as restoreDocFromSnapshot, isRestoringContentFlag } from './features/protect/snapshots';
import { shouldProtectFromEditing, getProtectedRanges, isProtectedRegionChange } from './features/protect/protection';
import { updateDecorations, getDecorationDisposables, initializeDecorations } from './features/protect/decorations';
import { registerToggleProtection, registerTurnOffProtection, registerTurnOnProtection, registerShowEditableRegions } from './features/protect/commands';
import { showEditableRegionsList as showEditableRegionsListUi } from './features/protect/regionsUi';

import { registerFindInstances } from './features/update/findInstances';
import { registerCreatePageFromTemplateCommand } from './features/file-creation-webview';
import { registerInsertRepeatEntryCommands } from './features/repeating-elements';
import { registerTemplateSync } from './features/update/templateSync';
import {
  BACKUP_DIR_NAME,
  TEMP_DIR_NAME,
  beginProtectedRun,
  createVscodeHost,
  endProtectedRun,
  engineOptions,
  siteRootOfTemplate
} from './features/update/vscodeHost';
import { ensureWorkspaceContext } from './utils/workspaceContext';
import { getBooleanSetting, toggleBooleanSetting } from './utils/settings';
import { initializeLogger, logProcessCompletion as logProcessCompletionShared } from './utils/logger';
import { createDiffCommands } from './features/commands';
import { initializeDiffFeature } from './features/diff/diffFeatureBootstrap';

// Decorations now managed by features/protect/decorations
let outputChannel: vscode.OutputChannel = initializeLogger();
const logProcessCompletion = (context: string, errorCode: number = 0) => logProcessCompletionShared(context, errorCode);
let isProtectionEnabled = true; // legacy local flag, kept for other flows if any
let isProcessingUndo = false;

interface TemplateRunOptions {
  autoApply?: boolean;
  suppressCompletionNotice?: boolean;
}

// Error/exit codes
// 0 success
// 1 error/exception
// 2 cancelled
function summaryCode(summary: RunSummary): number {
  if (summary.failed.length > 0) return 1;
  return summary.cancelled ? 2 : 0;
}

// Find only direct page files of the provided template (templates are not instances)
async function findTemplateInstances(templatePath: string): Promise<vscode.Uri[]> {
  const files = await engineFindTemplateInstances(siteRootOfTemplate(templatePath), templatePath, {
    excludeDirNames: [BACKUP_DIR_NAME, TEMP_DIR_NAME]
  });
  return files.map(file => vscode.Uri.file(file));
}

// Update Files Based on Template, run by the engine with the VS Code host
async function updateHtmlBasedOnTemplate(templateUri: vscode.Uri, options: TemplateRunOptions = {}): Promise<RunSummary> {
  const templatePath = templateUri.fsPath;
  const host = createVscodeHost(siteRootOfTemplate(templatePath), outputChannel);
  const summary = await updateFilesBasedOnTemplate(host, templatePath, engineOptions(options));
  logProcessCompletion('updateHtmlBasedOnTemplate', summaryCode(summary));
  return summary;
}

export function activate(context: vscode.ExtensionContext) {
  // ensure logger channel is ready
  outputChannel = initializeLogger();

  // Initialize editor decorations early so updateDecorations can safely run during activation
  initializeDecorations();

  // Initialize diff feature (virtual original provider + emitter)
  initializeDiffFeature(context);
  // Register diff navigation commands (needed for update diff flow)
  const diffCommands = createDiffCommands();
  diffCommands.registerCommands(context);

  const changeListener = vscode.workspace.onDidChangeTextDocument(async event => {
    if (isProcessingUndo || isRestoringContentFlag()) return;

    const editor = vscode.window.activeTextEditor;
    // Pages and child templates are protected; master templates are fully editable
    if (editor && event.document === editor.document && shouldProtectFromEditing(editor.document)) {
      const protectedRanges = getProtectedRanges(editor.document);

      for (const change of event.contentChanges) {
        if (
          isProtectedRegionChange(change, protectedRanges, editor.document)
        ) {
          console.log('Protected region change detected, restoring from snapshot');
          await restoreDocFromSnapshot(editor);
          vscode.window.showWarningMessage('You cannot edit protected regions in templates.');
          break;
        }
      }

        // Update snapshot after processing changes
        if (shouldProtectFromEditing(editor.document)) {
          saveDocSnapshot(editor.document, isProtectionEnabled);
        }
      }
  });

  const editorChangeListener = vscode.window.onDidChangeActiveTextEditor(editor => {
    updateDecorations(editor);
    if (editor && shouldProtectFromEditing(editor.document)) {
      saveDocSnapshot(editor.document, isProtectionEnabled);
    }
  });

  const documentOpenListener = vscode.workspace.onDidOpenTextDocument(document => {
    if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document === document) {
      updateDecorations(vscode.window.activeTextEditor);
      if (shouldProtectFromEditing(document)) {
        saveDocSnapshot(document, isProtectionEnabled);
      }
    }
  });

  const showEditableRegionsCommand = registerShowEditableRegions(context, showEditableRegionsListUi);

  const toggleProtectionCommand = registerToggleProtection(context);

  const syncTemplateCommand = vscode.commands.registerCommand('htmlDwtTemplate.syncTemplate', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active editor. Open a .dwt template file.');
      logProcessCompletion('syncTemplate:no-editor', 3);
      return;
    }
    if (!ensureWorkspaceContext(editor.document.uri)) return;
    if (isTemplateFileDocument(editor.document)) {
      const templateName = path.basename(editor.document.fileName);
      const choice = await vscode.window.showWarningMessage(
        `Are you sure you want to update HTML based on template "${templateName}"?\n\nThis will update the template structure while preserving all editable content.`,
        { modal: true },
        'Yes',
        'No'
      );
      if (choice === 'Yes') {
        const summary = await updateHtmlBasedOnTemplate(editor.document.uri);
        if (summary?.cancelled) logProcessCompletion('syncTemplate:cancelled', 2); else logProcessCompletion('syncTemplate');
      }
    } else {
      vscode.window.showErrorMessage('This command only works on template (.dwt) files.');
      logProcessCompletion('syncTemplate:not-template', 3);
    }
  });

  const updateAllFilesUsingTemplateCommand = vscode.commands.registerCommand('htmlDwtTemplate.updateAllFilesUsingTemplate', async (resource?: vscode.Uri) => {
    try {
      const activeEditor = vscode.window.activeTextEditor;
      let targetTemplateUri: vscode.Uri | undefined;

      if (resource) {
        if (resource.fsPath.toLowerCase().endsWith('.dwt')) {
          targetTemplateUri = resource;
        } else {
          vscode.window.showErrorMessage('The selected file is not a template (.dwt).');
          logProcessCompletion('updateAllFilesUsingTemplate:not-template', 3);
          return;
        }
      }

      if (!targetTemplateUri && activeEditor && activeEditor.document.fileName.toLowerCase().endsWith('.dwt')) {
        targetTemplateUri = activeEditor.document.uri;
      }

      if (!targetTemplateUri) {
        vscode.window.showWarningMessage('No template selected. Open or select a .dwt file first.');
        logProcessCompletion('updateAllFilesUsingTemplate:no-template', 3);
        return;
      }

      if (!ensureWorkspaceContext(targetTemplateUri)) {
        return;
      }

      const templateName = path.basename(targetTemplateUri.fsPath);
      const confirmationMessage = `Are you sure you want to update ALL PAGES based on template "${templateName}"?\n\nNOTE - this will recurse through all template files also, updating files based on those templates.\n`;
      const confirmation = await vscode.window.showWarningMessage(
        confirmationMessage,
        { modal: true },
        'Yes',
        'No',
      );

      if (confirmation !== 'Yes') {
        logProcessCompletion('updateAllFilesUsingTemplate:user-declined', confirmation === undefined ? 2 : 3);
        return;
      }

      const nestedTemplates = (await findDescendantTemplates(siteRootOfTemplate(targetTemplateUri.fsPath), targetTemplateUri.fsPath))
        .map(file => vscode.Uri.file(file));
      if (outputChannel) {
        const nestedNames = nestedTemplates.map(uri => path.basename(uri.fsPath)).join(', ') || '(none)';
        outputChannel.appendLine(`[DW-ALL] Nested templates for ${templateName}: ${nestedNames}`);
      }

      const templatesToProcess: vscode.Uri[] = [targetTemplateUri, ...nestedTemplates];
      let processedCount = 0;

      for (let index = 0; index < templatesToProcess.length; index++) {
        const currentTemplate = templatesToProcess[index];
        const currentName = path.basename(currentTemplate.fsPath);
        if (outputChannel) {
          outputChannel.appendLine(`[DW-ALL] (${index + 1}/${templatesToProcess.length}) Updating template ${currentName} with Apply-to-All.`);
        }

        let summary: RunSummary | undefined;
        try {
          summary = await updateHtmlBasedOnTemplate(currentTemplate, {
            autoApply: true,
            suppressCompletionNotice: true
          });
          processedCount++;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`Failed to update template ${currentTemplate.fsPath}:`, error);
          vscode.window.showErrorMessage(`Failed to update template ${currentName}: ${message}`);
          logProcessCompletion('updateAllFilesUsingTemplate:item-error', 1);
          continue;
        }

        if (summary?.cancelled) {
          vscode.window.showWarningMessage('Update cancelled. Remaining templates were not processed.');
          logProcessCompletion('updateAllFilesUsingTemplate:cancelled', 2);
          return;
        }
      }

      vscode.window.showInformationMessage(`Updated ${processedCount} template(s) and their instances based on "${templateName}".`);
      logProcessCompletion('updateAllFilesUsingTemplate');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Error updating all files using template:', error);
      vscode.window.showErrorMessage(`Failed to update all pages using template: ${message}`);
      logProcessCompletion('updateAllFilesUsingTemplate:error', 1);
    }
  });

  const restoreBackupCommand = vscode.commands.registerCommand('htmlDwtTemplate.restoreBackup', async () => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder || !ensureWorkspaceContext()) return;
    const siteRoot = workspaceFolder.uri.fsPath;

    // Updates made while backups are off have no backup to restore
    const backupsOffNote = getBooleanSetting('enableBackup', true)
      ? ''
      : '\n\nBackups are turned off. Updates made while they are off have no backup.';

    // The newest backup on disk, so a restore also works after a reload
    const backup = findLastBackup(siteRoot, { backupDirName: BACKUP_DIR_NAME });
    if (!backup) {
      vscode.window.showErrorMessage(`No backup information found. Cannot restore files.${backupsOffNote.replace(/\n\n/, ' ')}`);
      logProcessCompletion('restoreBackup:no-backup', 1);
      return;
    }

    // Show confirmation dialog with template name
    const choice = await vscode.window.showWarningMessage(
      `Are you sure you want to restore the last backup for template "${backup.templateName}"?\n\nThis will restore ${backup.files.length} HTML file(s) from the most recent backup and overwrite current content.${backupsOffNote}`,
      { modal: true },
      'Yes',
      'No'
    );

    if (choice === 'Yes') {
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Restoring HTML from backup',
        cancellable: false
      }, () => restoreLastBackup(createVscodeHost(siteRoot, outputChannel), { backup }));
      vscode.window.showInformationMessage('Restore completed from last backup.');
      logProcessCompletion('restoreBackup');
    }
  });

  // Both toggles switch their setting, so the command and the Settings checkbox agree
  const toggleTemplateSyncCommand = vscode.commands.registerCommand('htmlDwtTemplate.toggleTemplateSync', async () => {
    const enabled = await toggleBooleanSetting('enableTemplateSync', true);
    vscode.window.showInformationMessage(`Template synchronization turned ${enabled ? 'on' : 'off'}.`);
  });

  const toggleBackupCommand = vscode.commands.registerCommand('htmlDwtTemplate.toggleBackup', async () => {
    const enabled = await toggleBooleanSetting('enableBackup', true);
    vscode.window.showInformationMessage(enabled ? 'Backups turned on.' : 'Backups turned off.');
  });

  // Saving a template updates the open files based on it (Enable Template Sync)
  const templateSyncListener = registerTemplateSync(outputChannel);

  const findInstancesCommand = registerFindInstances(context, ensureWorkspaceContext, findTemplateInstances, logProcessCompletion);

  // Insert repeat entry before or after the entry at the cursor
  const insertRepeatEntryCommands = registerInsertRepeatEntryCommands({
    outputChannel,
    logProcessCompletion,
    isProtectionEnabled: () => isProtectionEnabled
  });

  if (vscode.window.activeTextEditor) {
    updateDecorations(vscode.window.activeTextEditor);
    if (shouldProtectFromEditing(vscode.window.activeTextEditor.document)) {
      saveDocSnapshot(vscode.window.activeTextEditor.document, isProtectionEnabled);
    }
  }

  // Protection toggle commands
  const turnOffProtectionCommand = registerTurnOffProtection(context);
  const turnOnProtectionCommand = registerTurnOnProtection(context);

  // Create New Page from Template command
  const createPageFromTemplateCommand = registerCreatePageFromTemplateCommand(context);

  // Set Template Parameters command
  const setTemplateParametersCommand = vscode.commands.registerCommand('htmlDwtTemplate.setTemplateParameters', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active editor. Open a template instance file.');
      return;
    }

    if (!usesTemplateMarkers(editor.document) || isTemplateFileDocument(editor.document)) {
      vscode.window.showInformationMessage('This command only works on template instance files (.html/.php with template comments).');
      return;
    }

    // Find the template file to get available parameters
    const instanceContent = editor.document.getText();
    const instanceBeginMatch = instanceContent.match(/<!--\s*InstanceBegin\s+template="([^"]+)"[^>]*-->/i);

    if (!instanceBeginMatch) {
      vscode.window.showWarningMessage('Could not find template reference in this instance file.');
      return;
    }

    const templateRelPath = instanceBeginMatch[1];
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('No workspace folder open.');
      return;
    }

    const templatePath = resolveTemplateRef(workspaceFolder.uri.fsPath, templateRelPath);

    try {
      const templateContent = fs.readFileSync(templatePath, 'utf8');
      const templateParameters = parseTemplateParameters(templateContent);
      if (templateParameters.length === 0) {
        vscode.window.showInformationMessage('This template does not define any parameters.');
        return;
      }

      // Current values come from the page's own InstanceParam markers
      const currentParams = parseInstanceParameters(instanceContent);

      // Create parameter input panel
      const panel = vscode.window.createWebviewPanel(
        'setTemplateParameters',
        'Set Template Parameters',
        vscode.ViewColumn.Active,
        { enableScripts: true }
      );

      const nonce = Date.now().toString();
      panel.webview.html = getParameterInputHtml(templateParameters, currentParams, nonce);

      panel.webview.onDidReceiveMessage(async msg => {
        if (msg.type === 'save') {
          const document = editor.document;
          const wasDirty = document.isDirty;

          // Write the new values into the page, then update this page from its template
          beginProtectedRun();
          try {
            const updatedText = setInstanceParameters(document.getText(), msg.parameters, templateParameters);
            if (updatedText !== document.getText()) {
              const edit = new vscode.WorkspaceEdit();
              edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), updatedText);
              await vscode.workspace.applyEdit(edit);
            }
          } finally {
            endProtectedRun();
          }
          const host = createVscodeHost(siteRootOfTemplate(templatePath), outputChannel);
          const summary = await updateInstance(host, document.uri.fsPath, engineOptions({ autoApply: true }));
          if (!wasDirty && document.isDirty) {
            await document.save();
          }

          if (summary.failed.length === 0) {
            vscode.window.showInformationMessage('Template parameters updated successfully.');
          }
          panel.dispose();
        } else if (msg.type === 'cancel') {
          panel.dispose();
        }
      });
    } catch (error) {
      vscode.window.showErrorMessage(`Could not read template file: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  // Show Template Parameters command
  const showTemplateParametersCommand = vscode.commands.registerCommand('htmlDwtTemplate.showTemplateParameters', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active editor.');
      return;
    }

    if (isTemplateFileDocument(editor.document)) {
      // Show template parameters defined in .dwt file
      const templateContent = editor.document.getText();
      const templateParameters = parseTemplateParameters(templateContent);

      if (templateParameters.length === 0) {
        vscode.window.showInformationMessage('This template does not define any parameters.');
        return;
      }

      const paramList = templateParameters.map(param =>
        `${param.name} (${param.type}): "${param.value}"`
      ).join('\n');

      vscode.window.showInformationMessage(`Template Parameters:\n${paramList}`, { modal: false });

    } else if (usesTemplateMarkers(editor.document)) {
      // Show instance parameters for instance file
      const instanceParams = parseInstanceParameters(editor.document.getText());

      if (Object.keys(instanceParams).length === 0) {
        vscode.window.showInformationMessage('No parameters set for this instance.');
        return;
      }

      const paramList = Object.entries(instanceParams).map(([name, value]) =>
        `${name}: "${value}"`
      ).join('\n');

      vscode.window.showInformationMessage(`Instance Parameters:\n${paramList}`, { modal: false });
    } else {
      vscode.window.showInformationMessage('This command only works on template files.');
    }
  });

  function getParameterInputHtml(templateParams: TemplateParam[], currentParams: InstanceParameters, nonce: string): string {
    const paramsJson = JSON.stringify(templateParams);
    const currentJson = JSON.stringify(currentParams);

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Set Template Parameters</title>
  <style>
  body { font-family: Consolas, monospace; padding: 16px; }
  .param-group { margin: 16px 0; padding: 12px; border: 1px solid #666; }
  .param-name { font-weight: bold; margin-bottom: 8px; }
  .param-input { width: 100%; padding: 6px; margin-bottom: 8px; }
  .param-type { font-size: 12px; color: #888; margin-bottom: 4px; }
  .buttons { text-align: center; margin-top: 24px; }
  button { width: 120px; padding: 8px; margin: 0 8px; }
  #saveBtn { background: #0a0; color: white; border: 1px solid #050; }
  #cancelBtn { background: #555; color: white; border: 1px solid #333; }
  </style></head><body>
  <h2>Set Template Parameters</h2>
  <div id="paramContainer"></div>
  <div class="buttons">
  <button id="saveBtn">Save</button>
  <button id="cancelBtn">Cancel</button>
  </div>
  <script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const templateParams = ${paramsJson};
  const currentParams = ${currentJson};

  function createParameterInputs() {
  const container = document.getElementById('paramContainer');
  container.innerHTML = '';

  templateParams.forEach(param => {
      const group = document.createElement('div');
      group.className = 'param-group';

      const currentValue = currentParams[param.name] || param.value;

      let inputElement = '';
      if (param.type === 'boolean') {
          const checked = currentValue.toLowerCase() === 'true' ? 'checked' : '';
          inputElement = '<input type="checkbox" class="param-input" data-param="' + param.name + '" ' + checked + '>';
      } else if (param.type === 'color') {
          inputElement = '<input type="color" class="param-input" data-param="' + param.name + '" value="' + currentValue + '">';
      } else if (param.type === 'number') {
          inputElement = '<input type="number" class="param-input" data-param="' + param.name + '" value="' + currentValue + '">';
      } else {
          inputElement = '<input type="text" class="param-input" data-param="' + param.name + '" value="' + currentValue + '">';
      }

      group.innerHTML =
          '<div class="param-name">' + param.name + '</div>' +
          '<div class="param-type">Type: ' + param.type + '</div>' +
          inputElement;

      container.appendChild(group);
  });
  }

  document.getElementById('saveBtn').addEventListener('click', () => {
  const parameters = {};
  document.querySelectorAll('.param-input').forEach(input => {
      const paramName = input.getAttribute('data-param');
      if (input.type === 'checkbox') {
          parameters[paramName] = input.checked ? 'true' : 'false';
      } else {
          parameters[paramName] = input.value;
      }
  });

  vscode.postMessage({ type: 'save', parameters });
  });

  document.getElementById('cancelBtn').addEventListener('click', () => {
  vscode.postMessage({ type: 'cancel' });
  });

  createParameterInputs();
  </script></body></html>`;
  }

  context.subscriptions.push(
    changeListener, editorChangeListener, documentOpenListener,
    showEditableRegionsCommand, toggleProtectionCommand,
    syncTemplateCommand, restoreBackupCommand, toggleTemplateSyncCommand, toggleBackupCommand,
    templateSyncListener, findInstancesCommand,
    ...insertRepeatEntryCommands, createPageFromTemplateCommand,
    turnOffProtectionCommand, turnOnProtectionCommand,
    setTemplateParametersCommand, showTemplateParametersCommand,
    updateAllFilesUsingTemplateCommand,
    ...getDecorationDisposables()
  );
}

export function deactivate() {
  console.log('HTML DWT Template deactivated');
}
