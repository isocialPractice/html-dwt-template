// update/templateWatcher
// Encapsulates the file watcher for .dwt changes/creates.

import * as vscode from 'vscode';
import * as path from 'path';

export function setupTemplateWatcher(): vscode.FileSystemWatcher {
  // Watch for changes to .dwt files
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.dwt');

  watcher.onDidChange(async (uri) => {
    // Remove auto-sync - only sync when explicitly requested via right-click command
    vscode.window.showInformationMessage(
      `Template updated: ${path.basename(uri.fsPath)}. Right-click and select "Update HTML Based on Template" to update instances.`
    );
  });

  watcher.onDidCreate(async (uri) => {
    vscode.window.showInformationMessage(
      `New Dreamweaver template created: ${path.basename(uri.fsPath)}`
    );
  });

  return watcher;
}
