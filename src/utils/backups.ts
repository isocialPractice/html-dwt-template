// backups
// Create and restore HTML-like backups (html/htm/php/dwt) preserving folder structure.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface LastBackupInfo {
    backupDir: string;
    templateName: string;
    instances: vscode.Uri[];
    siteRoot: string;
}

let lastBackupInfo: LastBackupInfo | undefined;

export function getLastBackupInfo(): LastBackupInfo | undefined {
    return lastBackupInfo;
}

export async function createHtmlBackups(instances: vscode.Uri[], templatePath: string): Promise<string> {
    // Get template name without extension for folder naming
    const templateName = path.basename(templatePath, '.dwt');

    // Get site root (parent of Templates directory)
    const templateDir = path.dirname(templatePath);
    const siteRoot = path.dirname(templateDir);
    const backupDir = path.join(siteRoot, '.html-dwt-template-backups');
    const templateBackupDir = path.join(backupDir, templateName);

    // Create backup directory structure if it doesn't exist
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }
    if (!fs.existsSync(templateBackupDir)) {
        fs.mkdirSync(templateBackupDir, { recursive: true });
    }

    // Rolling backup (keep 3)
    const backup3Dir = path.join(templateBackupDir, '3');
    const backup2Dir = path.join(templateBackupDir, '2');
    const backup1Dir = path.join(templateBackupDir, '1');

    if (fs.existsSync(backup3Dir)) {
        fs.rmSync(backup3Dir, { recursive: true, force: true });
    }
    if (fs.existsSync(backup2Dir)) {
        fs.renameSync(backup2Dir, backup3Dir);
    }
    if (fs.existsSync(backup1Dir)) {
        fs.renameSync(backup1Dir, backup2Dir);
    }

    fs.mkdirSync(backup1Dir, { recursive: true });

    // Copy files preserving structure
    for (const instanceUri of instances) {
        if (instanceUri.fsPath.includes('.html-dwt-template-backups')) {
            continue; // Never back up backup files
        }
        const relPath = path.relative(siteRoot, instanceUri.fsPath);
        const target = path.join(backup1Dir, relPath);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        const content = fs.readFileSync(instanceUri.fsPath, 'utf8');
        fs.writeFileSync(target, content, 'utf8');
    }

    lastBackupInfo = { backupDir: backup1Dir, templateName, instances, siteRoot };
    return backup1Dir;
}

export async function restoreHtmlFromBackup(): Promise<void> {
    if (!lastBackupInfo) {
        vscode.window.showErrorMessage('No backup information found. Cannot restore files.');
        return;
    }

    const { backupDir, siteRoot } = lastBackupInfo;

    if (!fs.existsSync(backupDir)) {
        vscode.window.showErrorMessage(`Backup directory not found: ${backupDir}`);
        return;
    }

    // Collect files to restore
    const collect = (dir: string): string[] => {
        const out: string[] = [];
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                out.push(...collect(full));
            } else {
                out.push(full);
            }
        }
        return out;
    };

    const files = collect(backupDir);

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Restoring HTML from backup',
        cancellable: false
    }, async () => {
        for (const fullPath of files) {
            const rel = path.relative(backupDir, fullPath);
            const target = path.join(siteRoot, rel);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            const content = fs.readFileSync(fullPath, 'utf8');
            fs.writeFileSync(target, content, 'utf8');
        }
        vscode.window.showInformationMessage('Restore completed from last backup.');
    });
}
