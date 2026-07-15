// utils/workspaceContext
// Helpers to validate that commands run within a proper workspace/site context.

import * as vscode from 'vscode';
import { isTemplateFilePath } from './templatePaths';

export function ensureWorkspaceContext(templateUri?: vscode.Uri): boolean {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder open. Open the site root folder to use Dreamweaver template features.');
    return false;
  }
  if (templateUri && !isTemplateFilePath(templateUri.fsPath)) {
    vscode.window.showWarningMessage('Active file is not a supported template. Open a template file within the Templates folder (.dwt, .html, .htm, .php).');
    return false;
  }
  return true;
}
