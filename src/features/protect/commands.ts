// commands
// Commands for toggling protection and listing editable regions

import * as vscode from 'vscode';
import * as path from 'path';
import { usesTemplateMarkers, isTemplateFileDocument, isMasterTemplateDocument } from '../../utils/templateDetection';
import { setFileProtectionState, getGlobalProtection, setGlobalProtection } from './protection';
import { updateDecorations } from './decorations';

export const MASTER_TEMPLATE_MESSAGE = 'Master templates are fully editable. Protection applies to pages and child templates based on a template.';
const NOT_PROTECTABLE_MESSAGE = 'Protection applies only to pages and child templates based on a template.';

// Protection settings apply to pages and child templates, never to master templates
function canProtect(editor: vscode.TextEditor): boolean {
  if (isMasterTemplateDocument(editor.document)) {
    vscode.window.showInformationMessage(MASTER_TEMPLATE_MESSAGE);
    return false;
  }
  if (!usesTemplateMarkers(editor.document)) {
    vscode.window.showInformationMessage(NOT_PROTECTABLE_MESSAGE);
    return false;
  }
  return true;
}

export function registerToggleProtection(context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.commands.registerCommand('htmlDwtTemplate.toggleProtection', () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    if (isMasterTemplateDocument(editor.document)) {
      vscode.window.showInformationMessage(MASTER_TEMPLATE_MESSAGE);
      return;
    }

    // Toggle GLOBAL protection state (matches prior behavior)
    const current = getGlobalProtection();
    setGlobalProtection(!current);
    updateDecorations(editor);
    vscode.window.showInformationMessage(`HTML DWT Template protection ${!current ? 'enabled' : 'disabled'}.`);
  });
}

export function registerTurnOffProtection(context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.commands.registerCommand('htmlDwtTemplate.turnOffProtection', () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active editor to modify protection for.');
      return;
    }
    if (!canProtect(editor)) return;
    setFileProtectionState(editor.document, false);
    updateDecorations(editor);
    vscode.window.showInformationMessage(`Protection turned OFF for ${path.basename(editor.document.fileName)}`);
  });
}

export function registerTurnOnProtection(context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.commands.registerCommand('htmlDwtTemplate.turnOnProtection', () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active editor to modify protection for.');
      return;
    }
    if (!canProtect(editor)) return;
    setFileProtectionState(editor.document, true);
    updateDecorations(editor);
    vscode.window.showInformationMessage(`Protection turned ON for ${path.basename(editor.document.fileName)}`);
  });
}

export function registerShowEditableRegions(context: vscode.ExtensionContext, showEditableRegionsList: (doc: vscode.TextDocument) => void): vscode.Disposable {
  return vscode.commands.registerCommand('htmlDwtTemplate.showEditableRegions', () => {
    const editor = vscode.window.activeTextEditor;
    if (editor && (usesTemplateMarkers(editor.document) || isTemplateFileDocument(editor.document))) {
      showEditableRegionsList(editor.document);
    } else {
      vscode.window.showInformationMessage('This command only works in templates and in pages based on a template.');
    }
  });
}
