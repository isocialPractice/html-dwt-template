// commands
// Commands for toggling protection and listing editable regions

import * as vscode from 'vscode';
import * as path from 'path';
import { isDreamweaverTemplate, isDreamweaverTemplateFile } from '../../utils/templateDetection';
import { setFileProtectionState, shouldProtectFromEditing, getGlobalProtection, setGlobalProtection } from './protection';
import { updateDecorations } from './decorations';

export function registerToggleProtection(context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.commands.registerCommand('dreamweaverTemplate.toggleProtection', () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    if (isDreamweaverTemplateFile(editor.document)) {
      vscode.window.showInformationMessage('Protection does not apply to .dwt template files.');
      return;
    }

    // Toggle GLOBAL protection state (matches prior behavior)
    const current = getGlobalProtection();
    setGlobalProtection(!current);
    updateDecorations(editor);
    vscode.window.showInformationMessage(`Dreamweaver template protection ${!current ? 'enabled' : 'disabled'}.`);
  });
}

export function registerTurnOffProtection(context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.commands.registerCommand('dreamweaverTemplate.turnOffProtection', () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active editor to modify protection for.');
      return;
    }
    if (!isDreamweaverTemplate(editor.document) || isDreamweaverTemplateFile(editor.document)) {
      vscode.window.showInformationMessage('Protection settings only apply to Dreamweaver template instance files (.html/.php with template comments).');
      return;
    }
    setFileProtectionState(editor.document, false);
    updateDecorations(editor);
    vscode.window.showInformationMessage(`Protection turned OFF for ${path.basename(editor.document.fileName)}`);
  });
}

export function registerTurnOnProtection(context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.commands.registerCommand('dreamweaverTemplate.turnOnProtection', () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active editor to modify protection for.');
      return;
    }
    if (!isDreamweaverTemplate(editor.document) || isDreamweaverTemplateFile(editor.document)) {
      vscode.window.showInformationMessage('Protection settings only apply to Dreamweaver template instance files (.html/.php with template comments).');
      return;
    }
    setFileProtectionState(editor.document, true);
    updateDecorations(editor);
    vscode.window.showInformationMessage(`Protection turned ON for ${path.basename(editor.document.fileName)}`);
  });
}

export function registerShowEditableRegions(context: vscode.ExtensionContext, showEditableRegionsList: (doc: vscode.TextDocument) => void): vscode.Disposable {
  return vscode.commands.registerCommand('dreamweaverTemplate.showEditableRegions', () => {
    const editor = vscode.window.activeTextEditor;
    if (editor && (isDreamweaverTemplate(editor.document) || isDreamweaverTemplateFile(editor.document))) {
      showEditableRegionsList(editor.document);
    } else {
      vscode.window.showInformationMessage('This command only works in Dreamweaver template files.');
    }
  });
}
