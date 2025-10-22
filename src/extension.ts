// extension
// Extension entry point for html-dwt-template.

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { isDreamweaverTemplate, isDreamweaverTemplateFile } from './utils/templateDetection';
import { saveDocumentSnapshot as saveDocSnapshot, restoreFromSnapshot as restoreDocFromSnapshot, isRestoringContentFlag } from './features/protect/snapshots';
import { shouldProtectFromEditing, getProtectedRanges, isProtectedRegionChange } from './features/protect/protection';
import { updateDecorations, getDecorationDisposables, initializeDecorations } from './features/protect/decorations';
import { registerToggleProtection, registerTurnOffProtection, registerTurnOnProtection, registerShowEditableRegions } from './features/protect/commands';
import { showEditableRegionsList as showEditableRegionsListUi } from './features/protect/regionsUi';

import { registerFindInstances } from './features/update/findInstances';
import { registerCreatePageFromTemplateCommand } from './features/file-creation-webview';
import { findRepeatBlockAtCursor, normalizeRepeatColorsIfNeeded } from './features/update/repeatUtils';
import { setupTemplateWatcher as createTemplateWatcher } from './features/update/templateWatcher';
import { parseTemplateParameters, parseInstanceParameters, TemplateParam, InstanceParameters } from './features/update/params';
import { getInstanceParameters as getInstanceParametersStore, setInstanceParameters as setInstanceParametersStore } from './features/update/paramState';
import { ensureWorkspaceContext } from './utils/workspaceContext';
import { findChildTemplates, findAllChildTemplatesRecursive } from './features/update/templateHierarchy';
import { createHtmlBackups, restoreHtmlFromBackup, getLastBackupInfo } from './utils/backups';
import { initializeLogger, logProcessCompletion as logProcessCompletionShared } from './utils/logger';
import { updateHtmlLikeDreamweaver as engineUpdateHtmlLikeDreamweaver, updateHtmlBasedOnTemplate as engineUpdateHtmlBasedOnTemplate, MergeResult, UpdateHtmlMergeOptions, UpdateHtmlBasedOnTemplateOptions } from './features/update/updateEngine';
import { createDiffCommands } from './features/commands';
import { initializeDiffFeature } from './features/diff/diffFeatureBootstrap';

// Decorations now managed by features/protect/decorations
let outputChannel: vscode.OutputChannel = initializeLogger();
const logProcessCompletion = (context: string, errorCode: number = 0) => logProcessCompletionShared(context, errorCode);
let applyToAllForRun = false;
let cancelRunForRun = false;
let isProtectionEnabled = true; // legacy local flag, kept for other flows if any
let isProcessingUndo = false;
let isTemplateSyncEnabled = true;
let templateWatcher: vscode.FileSystemWatcher | undefined;

// Error/exit codes
// 0 success
// 1 error/exception
// Thin wrapper delegating to the update engine implementation
async function updateHtmlLikeDreamweaver(
    instanceUri: vscode.Uri,
    templatePath: string,
    options: UpdateHtmlMergeOptions = {}
): Promise<MergeResult> {
    return engineUpdateHtmlLikeDreamweaver(instanceUri, templatePath, options, {
        outputChannel,
        logProcessCompletion,
        getApplyToAll: () => applyToAllForRun,
        setApplyToAll: (v: boolean) => { applyToAllForRun = v; },
        getCancelRun: () => cancelRunForRun,
        setCancelRun: (v: boolean) => { cancelRunForRun = v; },
    });
}

// Child template merge: treat the child template as the instance and parent template as the template
async function updateChildTemplateLikeDreamweaver(
    childTemplateUri: vscode.Uri,
    parentTemplatePath: string,
    mergeOptions: UpdateHtmlMergeOptions = {}
): Promise<MergeResult> {
    return engineUpdateHtmlLikeDreamweaver(childTemplateUri, parentTemplatePath, {
        removeTemplateInfoFromInstance: false,
        ...mergeOptions
    }, {
        outputChannel,
        logProcessCompletion,
        getApplyToAll: () => applyToAllForRun,
        setApplyToAll: (v: boolean) => { applyToAllForRun = v; },
        getCancelRun: () => cancelRunForRun,
        setCancelRun: (v: boolean) => { cancelRunForRun = v; },
    });
}

// Find only direct instance files of the provided template (exclude other templates)
async function findTemplateInstances(templatePath: string): Promise<vscode.Uri[]> {
    const templateName = path.basename(templatePath);
    const files = await vscode.workspace.findFiles('**/*.{html,htm,php}', '**/Templates/**');
    const matches: vscode.Uri[] = [];
    for (const uri of files) {
        try {
            // skip .dwt files themselves (templates are not instances)
            if (/\.dwt$/i.test(uri.fsPath)) continue;
            const text = fs.readFileSync(uri.fsPath, 'utf8');
            const m = /<!--\s*InstanceBegin\s+template="([^"]+)"[^>]*-->/i.exec(text);
            const ref = m?.[1];
            if (ref && path.basename(ref) === templateName) {
                matches.push(uri);
            }
        } catch {}
    }
    return matches;
}

    async function updateHtmlBasedOnTemplate(templateUri: vscode.Uri, options: UpdateHtmlBasedOnTemplateOptions = {}): Promise<void> {
        if (!isTemplateSyncEnabled) return;
        return engineUpdateHtmlBasedOnTemplate(templateUri, options, {
            findTemplateInstances,
            updateChildTemplateLikeDreamweaver,
            updateHtmlLikeDreamweaver: (instanceUri, templatePath, opts) => updateHtmlLikeDreamweaver(instanceUri, templatePath, opts),
            getOutputChannel: () => outputChannel,
            logProcessCompletion,
            isProtectionEnabledGetter: () => isProtectionEnabled,
            setProtectionEnabled: (enabled: boolean) => { isProtectionEnabled = enabled; },
            getApplyToAll: () => applyToAllForRun,
            setApplyToAll: (v: boolean) => { applyToAllForRun = v; },
            getCancelRun: () => cancelRunForRun,
            setCancelRun: (v: boolean) => { cancelRunForRun = v; },
        });
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
    if (editor && event.document === editor.document && shouldProtectFromEditing(editor.document)) {
            // Allow full editing of .dwt template files
            if (isDreamweaverTemplateFile(editor.document)) {
                return;
            }

            // Only protect instance files from editing protected regions
            if (!shouldProtectFromEditing(editor.document)) {
                return;
            }

            const protectedRanges = getProtectedRanges(editor.document);

            for (const change of event.contentChanges) {
                if (
                    isProtectedRegionChange(change, protectedRanges, editor.document)
                ) {
                    console.log('Protected region change detected, restoring from snapshot');
                    await restoreDocFromSnapshot(editor);
                    vscode.window.showWarningMessage('You cannot edit protected regions in Dreamweaver templates.');
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

    const syncTemplateCommand = vscode.commands.registerCommand('dreamweaverTemplate.syncTemplate', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor. Open a .dwt template file.');
            logProcessCompletion('syncTemplate:no-editor', 3);
            return;
        }
        if (!ensureWorkspaceContext(editor.document.uri)) return;
        if (isDreamweaverTemplateFile(editor.document)) {
                // Defensive reset so a prior run (like Update All) can't leave sticky state
                applyToAllForRun = false;
                cancelRunForRun = false;
                const templateName = path.basename(editor.document.fileName);
                const choice = await vscode.window.showWarningMessage(
                    `Are you sure you want to update HTML based on template "${templateName}"?\n\nThis will update the template structure while preserving all editable content.`,
                    { modal: true },
                    'Yes',
                    'No'
                );
                if (choice === 'Yes') {
                    await updateHtmlBasedOnTemplate(editor.document.uri);
                    if (cancelRunForRun) logProcessCompletion('syncTemplate:cancelled', 2); else logProcessCompletion('syncTemplate');
                }
            } else {
                vscode.window.showErrorMessage('This command only works on Dreamweaver template (.dwt) files.');
                logProcessCompletion('syncTemplate:not-template', 3);
            }
    });

    const updateAllFilesUsingTemplateCommand = vscode.commands.registerCommand('dreamweaverTemplate.updateAllFilesUsingTemplate', async (resource?: vscode.Uri) => {
        try {
            const activeEditor = vscode.window.activeTextEditor;
            let targetTemplateUri: vscode.Uri | undefined;

            if (resource) {
                if (resource.fsPath.toLowerCase().endsWith('.dwt')) {
                    targetTemplateUri = resource;
                } else {
                    vscode.window.showErrorMessage('The selected file is not a Dreamweaver template (.dwt).');
                    logProcessCompletion('updateAllFilesUsingTemplate:not-template', 3);
                    return;
                }
            }

            if (!targetTemplateUri && activeEditor && activeEditor.document.fileName.toLowerCase().endsWith('.dwt')) {
                targetTemplateUri = activeEditor.document.uri;
            }

            if (!targetTemplateUri) {
                vscode.window.showWarningMessage('No Dreamweaver template selected. Open or select a .dwt file first.');
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

            const nestedTemplates = await findAllChildTemplatesRecursive(targetTemplateUri.fsPath);
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

                try {
                    // Defensive reset before each per-template run to avoid sticky state across iterations
                    applyToAllForRun = false;
                    cancelRunForRun = false;
                    if (index > 0 && outputChannel) {
                        outputChannel.appendLine(`[DW-ALL] Skipping editable-attributes pre-pass for nested template ${currentName}.`);
                    }
                    await updateHtmlBasedOnTemplate(currentTemplate, {
                        autoApplyAll: true,
                        suppressCompletionPrompt: true,
                        // For nested child templates processed after the initial clicked template,
                        // skip the editable-attributes pre-pass to avoid redundant self-updates.
                        skipEditableAttributesPhase: index > 0
                    });
                    processedCount++;
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    console.error(`Failed to update template ${currentTemplate.fsPath}:`, error);
                    vscode.window.showErrorMessage(`Failed to update template ${currentName}: ${message}`);
                    logProcessCompletion('updateAllFilesUsingTemplate:item-error', 1);
                    continue;
                }

                if (cancelRunForRun) {
                    cancelRunForRun = false;
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

    const restoreBackupCommand = vscode.commands.registerCommand('dreamweaverTemplate.restoreBackup', async () => {
        // Check if backup info exists first
        if (!getLastBackupInfo()) {
            vscode.window.showErrorMessage('No backup information found. Cannot restore files.');
            logProcessCompletion('restoreBackup:no-backup', 1);
            return;
        }
        if (!ensureWorkspaceContext()) return;
        
        // Show confirmation dialog with template name
        const info = getLastBackupInfo()!;
        const templateName = info.templateName;
        const fileCount = info.instances.length;
        const choice = await vscode.window.showWarningMessage(
            `Are you sure you want to restore the last backup for template "${templateName}"?\n\nThis will restore ${fileCount} HTML file(s) from the most recent backup and overwrite current content.`,
            { modal: true },
            'Yes',
            'No'
        );
        
        if (choice === 'Yes') {
            await restoreHtmlFromBackup();
            logProcessCompletion('restoreBackup');
        }
    });

    const toggleTemplateSyncCommand = vscode.commands.registerCommand('dreamweaverTemplate.toggleTemplateSync', () => {
        isTemplateSyncEnabled = !isTemplateSyncEnabled;
        vscode.window.showInformationMessage(
            `Template synchronization ${isTemplateSyncEnabled ? 'enabled' : 'disabled'}.`
        );
    });

    const findInstancesCommand = registerFindInstances(context, ensureWorkspaceContext, findTemplateInstances, logProcessCompletion);
    
    // Insert repeat entry after selection
    const insertRepeatEntryAfterCommand = vscode.commands.registerCommand('dreamweaverTemplate.insertRepeatEntryAfter', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor.');
            return;
        }
        
        const position = editor.selection.active;
        const repeatBlock = findRepeatBlockAtCursor(editor.document, position);
        
        if (!repeatBlock) {
            vscode.window.showWarningMessage('Cursor must be within a repeat entry block (between InstanceBeginRepeatEntry and InstanceEndRepeatEntry).');
            return;
        }
        
        const insertPosition = editor.document.positionAt(repeatBlock.entryEnd);
        const edit = new vscode.WorkspaceEdit();
        edit.insert(editor.document.uri, insertPosition, '\n' + repeatBlock.firstEntry);
        
        await vscode.workspace.applyEdit(edit);

        // Normalize alternating colors if template defines a ternary for this repeat
        await normalizeRepeatColorsIfNeeded(editor.document, repeatBlock.repeatName);
        vscode.window.showInformationMessage(`Inserted repeat entry after selection in "${repeatBlock.repeatName}"`);
        
        outputChannel.appendLine(`[REPEAT-INSERT] Added entry after selection in repeat "${repeatBlock.repeatName}"`);
        logProcessCompletion('insertRepeatEntryAfter');
    });

    // Insert repeat entry before selection  
    const insertRepeatEntryBeforeCommand = vscode.commands.registerCommand('dreamweaverTemplate.insertRepeatEntryBefore', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor.');
            return;
        }
        
        const position = editor.selection.active;
        const repeatBlock = findRepeatBlockAtCursor(editor.document, position);
        
        if (!repeatBlock) {
            vscode.window.showWarningMessage('Cursor must be within a repeat entry block (between InstanceBeginRepeatEntry and InstanceEndRepeatEntry).');
            return;
        }
        
        const insertPosition = editor.document.positionAt(repeatBlock.entryStart);
        const edit = new vscode.WorkspaceEdit();
        edit.insert(editor.document.uri, insertPosition, repeatBlock.firstEntry + '\n');
        
        await vscode.workspace.applyEdit(edit);

        // Normalize alternating colors if template defines a ternary for this repeat
        await normalizeRepeatColorsIfNeeded(editor.document, repeatBlock.repeatName);
        vscode.window.showInformationMessage(`Inserted repeat entry before selection in "${repeatBlock.repeatName}"`);
        
        outputChannel.appendLine(`[REPEAT-INSERT] Added entry before selection in repeat "${repeatBlock.repeatName}"`);
        logProcessCompletion('insertRepeatEntryBefore');
    });

    // Initialize template watcher
    if (templateWatcher) templateWatcher.dispose();
    templateWatcher = createTemplateWatcher();

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
    const setTemplateParametersCommand = vscode.commands.registerCommand('dreamweaverTemplate.setTemplateParameters', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor. Open a template instance file.');
            return;
        }
        
        if (!isDreamweaverTemplate(editor.document) || isDreamweaverTemplateFile(editor.document)) {
            vscode.window.showInformationMessage('This command only works on Dreamweaver template instance files (.html/.php with template comments).');
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

        const templatePath = path.join(workspaceFolder.uri.fsPath, templateRelPath.replace(/^\//, ''));
        
        try {
            const templateContent = fs.readFileSync(templatePath, 'utf8');
            const templateParameters = parseTemplateParameters(templateContent);
            if (templateParameters.length === 0) {
                vscode.window.showInformationMessage('This template does not define any parameters.');
                return;
            }

            // Get current instance parameters
            const currentParams = getInstanceParametersStore(editor.document, parseInstanceParameters);
            
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
                    setInstanceParametersStore(editor.document, msg.parameters);
                    
                    // Update the template to refresh optional regions
                    if (isDreamweaverTemplate(editor.document)) {
                        const templateUri = vscode.Uri.file(templatePath);
                        await updateHtmlBasedOnTemplate(templateUri);
                    }
                    
                    vscode.window.showInformationMessage('Template parameters updated successfully.');
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
    const showTemplateParametersCommand = vscode.commands.registerCommand('dreamweaverTemplate.showTemplateParameters', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor.');
            return;
        }

        if (isDreamweaverTemplateFile(editor.document)) {
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
            
        } else if (isDreamweaverTemplate(editor.document)) {
            // Show instance parameters for instance file
            const instanceParams = getInstanceParametersStore(editor.document, parseInstanceParameters);
            
            if (Object.keys(instanceParams).length === 0) {
                vscode.window.showInformationMessage('No parameters set for this instance.');
                return;
            }

            const paramList = Object.entries(instanceParams).map(([name, value]) => 
                `${name}: "${value}"`
            ).join('\n');
            
            vscode.window.showInformationMessage(`Instance Parameters:\n${paramList}`, { modal: false });
        } else {
            vscode.window.showInformationMessage('This command only works on Dreamweaver template files.');
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
        syncTemplateCommand, restoreBackupCommand, toggleTemplateSyncCommand, findInstancesCommand,
        insertRepeatEntryAfterCommand, insertRepeatEntryBeforeCommand, createPageFromTemplateCommand,
        turnOffProtectionCommand, turnOnProtectionCommand,
        setTemplateParametersCommand, showTemplateParametersCommand,
        updateAllFilesUsingTemplateCommand,
        ...getDecorationDisposables()
    );

    if (templateWatcher) {
        context.subscriptions.push(templateWatcher);
    }

}

export function deactivate() {
    console.log('Dreamweaver Template Protection deactivated');
}
