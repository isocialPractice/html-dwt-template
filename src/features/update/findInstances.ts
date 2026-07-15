// update/findInstances
// Registers command to find instances for a given template, delegating to helpers from the host.

import * as vscode from 'vscode';
import * as path from 'path';

export function registerFindInstances(
  context: vscode.ExtensionContext,
  ensureWorkspaceContext: (templateUri?: vscode.Uri) => boolean,
  findTemplateInstances: (templatePath: string) => Promise<vscode.Uri[]>,
  logProcessCompletion: (context: string, errorCode?: number) => void
): vscode.Disposable {
  return vscode.commands.registerCommand('dreamweaverTemplate.findInstances', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active editor. Open a .dwt template file.');
      logProcessCompletion('findInstances:no-editor', 3);
      return;
    }
    if (!ensureWorkspaceContext(editor.document.uri)) return;
    if (editor.document.fileName.toLowerCase().endsWith('.dwt')) {
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Finding template instances',
        cancellable: false
      }, async (progress) => {
        progress.report({ message: 'Scanning workspace...' });
        const instances = await findTemplateInstances(editor.document.uri.fsPath);
        progress.report({ message: `Found ${instances.length} instance(s)`, increment: 100 });
        if (instances.length > 0) {
          const instanceNames = instances.map(uri => path.basename(uri.fsPath));
          vscode.window.showQuickPick(instanceNames, {
            placeHolder: `Found ${instances.length} instance(s). Select one to open:`
          }).then(selectedInstance => {
            if (selectedInstance) {
              const selectedUri = instances.find(uri => path.basename(uri.fsPath) === selectedInstance);
              if (selectedUri) {
                vscode.window.showTextDocument(selectedUri);
              }
            }
            logProcessCompletion('findInstances');
          });
        } else {
          vscode.window.showInformationMessage('No instances found for this template.');
          logProcessCompletion('findInstances:empty', 0);
        }
      });
    } else {
      vscode.window.showErrorMessage('This command only works on Dreamweaver template (.dwt) files.');
      logProcessCompletion('findInstances:not-template', 3);
    }
  });
}
