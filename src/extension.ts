import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { structuredPatch } from 'diff';

let nonEditableDecorationType: vscode.TextEditorDecorationType;
let editableDecorationType: vscode.TextEditorDecorationType;
let optionalRegionDecorationType: vscode.TextEditorDecorationType;
let outputChannel: vscode.OutputChannel;
let applyToAllForRun = false;
let previewModeForRun = false;
let cancelRunForRun = false;
let isProtectionEnabled = true;
let isProcessingUndo = false;
let isTemplateSyncEnabled = true;
let templateWatcher: vscode.FileSystemWatcher | undefined;
// Tracks whether all files in a sync run passed safety checks (undefined until run finishes or first failure occurs)

// Error/exit codes
// 0 success
// 1 error/exception
// 2 cancelled (user cancelled entire run)
// 3 skipped (user skipped this specific item)
// 4 safety-skip (user skipped due to safety issues)
function logProcessCompletion(context: string, errorCode: number = 0) {
    const line = `[dwt-site-template] Extension process completed (${context}) with error code -> ${errorCode}`;
    console.log(line);
    if (outputChannel) outputChannel.appendLine(line);
}

// Per-file protection state (key: document URI, value: protection enabled)
let fileProtectionState = new Map<string, boolean>();

// Store last backup information for restore functionality
let lastBackupInfo: { backupDir: string; templateName: string; instances: vscode.Uri[]; siteRoot: string } | undefined;

// Character preservation system for delete/backspace protection
interface DocumentSnapshot {
    content: string;
    version: number;
    timestamp: number;
}

let documentSnapshots = new Map<string, DocumentSnapshot>();
let isRestoringContent = false;

interface DiffNavigationEntry {
    originalRange: vscode.Range;
    modifiedRange: vscode.Range;
    preferredSide: 'original' | 'modified';
}

interface DiffNavigationState {
    tempPath: string;
    ranges: DiffNavigationEntry[];
    currentIndex: number; // -1 indicates no position selected yet
    originalUri: vscode.Uri;
    usingVirtualOriginal: boolean;
}

const diffNavigationStates = new Map<string, DiffNavigationState>();

const ORIGINAL_DIFF_SCHEME = 'dwt-instance-original';
const virtualOriginalContents = new Map<string, string>();
const virtualOriginalEmitter = new vscode.EventEmitter<vscode.Uri>();

const originalDiffProvider: vscode.TextDocumentContentProvider = {
    onDidChange: virtualOriginalEmitter.event,
    provideTextDocumentContent(uri: vscode.Uri): string {
        const decoded = decodeURIComponent(uri.path.replace(/^\/+/g, ''));
        const normalized = path.resolve(decoded);
        const stored = virtualOriginalContents.get(normalized);
        if (stored !== undefined) {
            return stored;
        }
        try {
            return fs.readFileSync(normalized, 'utf8');
        } catch (err) {
            console.warn(`[DW-DIFF] Unable to read original content for ${normalized}:`, err);
            return '';
        }
    }
};

const getNormalizedPath = (filePath: string): string => path.resolve(filePath);

const createVirtualOriginalUri = (filePath: string): vscode.Uri => {
    const normalized = getNormalizedPath(filePath);
    return vscode.Uri.from({
        scheme: ORIGINAL_DIFF_SCHEME,
        path: '/' + encodeURIComponent(normalized),
        fragment: path.basename(normalized)
    });
};

const setVirtualOriginalContent = (filePath: string, content: string): vscode.Uri => {
    const normalized = getNormalizedPath(filePath);
    virtualOriginalContents.set(normalized, content);
    const uri = createVirtualOriginalUri(normalized);
    virtualOriginalEmitter.fire(uri);
    return uri;
};

const clearVirtualOriginalContent = (filePath: string): void => {
    const normalized = getNormalizedPath(filePath);
    virtualOriginalContents.delete(normalized);
};

const decodeVirtualOriginalPath = (uri: vscode.Uri): string => {
    if (uri.scheme !== ORIGINAL_DIFF_SCHEME) {
        return uri.fsPath || getNormalizedPath(uri.path);
    }
    const decoded = decodeURIComponent(uri.path.replace(/^\/+/g, ''));
    return getNormalizedPath(decoded);
};

const disposeDiffState = (instancePath: string): void => {
    const existing = diffNavigationStates.get(instancePath);
    if (existing?.usingVirtualOriginal && existing.originalUri.scheme === ORIGINAL_DIFF_SCHEME) {
        const originalPath = decodeVirtualOriginalPath(existing.originalUri);
        clearVirtualOriginalContent(originalPath);
    }
    diffNavigationStates.delete(instancePath);
};

// Optional Regions Support Interfaces
interface TemplateParam {
    name: string;
    type: 'text' | 'URL' | 'color' | 'number' | 'boolean';
    value: string;
}

interface OptionalRegion {
    name: string;
    expression: string;
    content: string;
    isEditable: boolean;
    startOffset: number;
    endOffset: number;
}

interface InstanceParameters {
    [paramName: string]: string;
}

// Store instance parameters per file
let instanceParametersStore = new Map<string, InstanceParameters>();

export function activate(context: vscode.ExtensionContext) {
    console.log('Dreamweaver Template Protection activated');

    // Output channel for detailed diagnostics
    outputChannel = vscode.window.createOutputChannel('Dreamweaver Template Protection');

    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(ORIGINAL_DIFF_SCHEME, originalDiffProvider),
        virtualOriginalEmitter
    );

    initializeDecorations();

    function getPositionAt(text: string, index: number): vscode.Position {
        const lines = text.substring(0, index).split('\n');
        const line = lines.length - 1;
        const character = lines[line].length;
        return new vscode.Position(line, character);
    }

    function isDreamweaverTemplate(document: vscode.TextDocument): boolean {
        const text = document.getText();
        const dreamweaverCommentRegex = /<!--\s*(?:InstanceBeginEditable|TemplateBeginEditable|InstanceEndEditable|TemplateEndEditable|#BeginTemplate)/;
        const cspCommentRegex = /;\s*--------------- (?:CAN BE EDITED|SHOULD NOT BE EDITED) -----------------/;
        return dreamweaverCommentRegex.test(text) || cspCommentRegex.test(text);
    }

    function isDreamweaverTemplateFile(document: vscode.TextDocument): boolean {
        return document.fileName.toLowerCase().endsWith('.dwt');
    }

    function shouldProtectFromEditing(document: vscode.TextDocument): boolean {
        // Allow full editing of .dwt template files
        if (isDreamweaverTemplateFile(document)) {
            return false;
        }
        // Check file-specific protection state
        const fileProtectionEnabled = getFileProtectionState(document);
        // Protect instance files (.html with Dreamweaver comments) only if protection is enabled for this file
        return fileProtectionEnabled && isDreamweaverTemplate(document);
    }

    function saveDocumentSnapshot(document: vscode.TextDocument): void {
        if (!shouldProtectFromEditing(document)) {
            return;
        }

        documentSnapshots.set(document.uri.toString(), {
            content: document.getText(),
            version: document.version,
            timestamp: Date.now()
        });
    }

    function isProtectedRegionChange(change: vscode.TextDocumentContentChangeEvent, protectedRanges: vscode.Range[], document: vscode.TextDocument): boolean {
        const changeStart = change.range.start;
        const changeEnd = change.range.end;
        
        // Check each protected range
        for (const protectedRange of protectedRanges) {
            // 1. Check if change start is within protected region
            if (protectedRange.contains(changeStart)) {
                return true;
            }
            
            // 2. Check if change end is within protected region  
            if (protectedRange.contains(changeEnd)) {
                return true;
            }
            
            // 3. Check if change range intersects with protected region
            const changeRange = new vscode.Range(changeStart, changeEnd);
            const intersect = protectedRange.intersection(changeRange);
            if (intersect && !intersect.isEmpty) {
                return true;
            }
            
            // 4. For insertions (rangeLength = 0), check if inserting at boundary of protected region
            if (change.rangeLength === 0 && change.text.length > 0) {
                if (protectedRange.start.isEqual(changeStart) || protectedRange.end.isEqual(changeStart)) {
                    return true;
                }
            }
            
            // 5. Check if the change would affect content that spans into protected region
            if (change.text.length > 0) {
                const changeEndAfterInsert = new vscode.Position(
                    changeStart.line + (change.text.split('\n').length - 1),
                    change.text.split('\n').length > 1 ? 
                        change.text.split('\n')[change.text.split('\n').length - 1].length : 
                        changeStart.character + change.text.length
                );
                const expandedChangeRange = new vscode.Range(changeStart, changeEndAfterInsert);
                const expandedIntersect = protectedRange.intersection(expandedChangeRange);
                if (expandedIntersect && !expandedIntersect.isEmpty) {
                    return true;
                }
            }
        }
        
        return false;
    }

    async function restoreFromSnapshot(editor: vscode.TextEditor): Promise<void> {
        const snapshot = documentSnapshots.get(editor.document.uri.toString());
        if (!snapshot) return;

        try {
            isRestoringContent = true;
            
            // Get current cursor position to restore after
            const currentSelection = editor.selection;
            
            // Replace entire document content with snapshot
            const fullRange = new vscode.Range(
                editor.document.positionAt(0),
                editor.document.positionAt(editor.document.getText().length)
            );
            
            const edit = new vscode.WorkspaceEdit();
            edit.replace(editor.document.uri, fullRange, snapshot.content);
            
            await vscode.workspace.applyEdit(edit);
            
            // Restore cursor position if still valid
            try {
                if (currentSelection.start.line < editor.document.lineCount) {
                    editor.selection = currentSelection;
                }
            } catch {
                // If position is no longer valid, place cursor at start
                editor.selection = new vscode.Selection(0, 0, 0, 0);
            }
            
        } finally {
            isRestoringContent = false;
        }
    }

    function getEditableRanges(document: vscode.TextDocument): vscode.Range[] {
        const text = document.getText();
        const ranges: vscode.Range[] = [];
        const beginRegex = /<!--\s*(?:InstanceBeginEditable|TemplateBeginEditable)\s*name=\"[^\"]+\"\s*-->/g;
        const endRegex = /<!--\s*(?:InstanceEndEditable|TemplateEndEditable)\s*-->/g;

        const beginMatches = [];
        let beginMatch;
        while ((beginMatch = beginRegex.exec(text)) !== null) {
            beginMatches.push({ index: beginMatch.index, length: beginMatch[0].length });
        }

        const endMatches = [];
        let endMatch;
        while ((endMatch = endRegex.exec(text)) !== null) {
            endMatches.push({ index: endMatch.index });
        }

        let beginIndex = 0;
        let endIndex = 0;
        while (beginIndex < beginMatches.length && endIndex < endMatches.length) {
            const begin = beginMatches[beginIndex];
            const end = endMatches[endIndex];

            if (begin.index < end.index) {
                const startPos = getPositionAt(text, begin.index + begin.length);
                const endPos = getPositionAt(text, end.index);
                ranges.push(new vscode.Range(startPos, endPos));
                beginIndex++;
                endIndex++;
            } else {
                endIndex++;
            }
        }
        return ranges;
    }

    function getOptionalRegionRanges(document: vscode.TextDocument): vscode.Range[] {
        const text = document.getText();
        const ranges: vscode.Range[] = [];
        
        // Find optional regions in instance files (InstanceBeginIf/InstanceEndIf)
        const instanceOptionalRegex = /<!--\s*InstanceBeginIf\s+cond="[^"]+"\s*-->[\s\S]*?<!--\s*InstanceEndIf\s*-->/g;
        let match;
        
        while ((match = instanceOptionalRegex.exec(text)) !== null) {
            const startPos = getPositionAt(text, match.index);
            const endPos = getPositionAt(text, match.index + match[0].length);
            ranges.push(new vscode.Range(startPos, endPos));
        }
        
        // Also find template optional regions (TemplateBeginIf/TemplateEndIf) in .dwt files
        if (isDreamweaverTemplateFile(document)) {
            const templateOptionalRegex = /<!--\s*TemplateBeginIf\s+cond="[^"]+"\s*-->[\s\S]*?<!--\s*TemplateEndIf\s*-->/g;
            while ((match = templateOptionalRegex.exec(text)) !== null) {
                const startPos = getPositionAt(text, match.index);
                const endPos = getPositionAt(text, match.index + match[0].length);
                ranges.push(new vscode.Range(startPos, endPos));
            }
        }
        
        return ranges;
    }

    function getProtectedRanges(document: vscode.TextDocument): vscode.Range[] {
        const text = document.getText();
        const editableRanges = getEditableRanges(document);

        if (!isDreamweaverTemplate(document) || editableRanges.length === 0) {
            return [];
        }

        const protectedRanges: vscode.Range[] = [];
        let lastPosition = new vscode.Position(0, 0);

        // The first protected range starts at the end of the first editable range.
        if (editableRanges.length > 0) {
            lastPosition = editableRanges[0].end;
        }

        // Iterate through the rest of the editable ranges to find the protected areas between them.
        for (let i = 1; i < editableRanges.length; i++) {
            const range = editableRanges[i];
            const protectedRange = new vscode.Range(lastPosition, range.start);
            if (!protectedRange.isEmpty) {
                protectedRanges.push(protectedRange);
            }
            lastPosition = range.end;
        }

        const documentEnd = getPositionAt(text, text.length);
        const finalProtectedRange = new vscode.Range(lastPosition, documentEnd);
        if (!finalProtectedRange.isEmpty) {
            protectedRanges.push(finalProtectedRange);
        }

        return protectedRanges;
    }

    function showEditableRegionsList(document: vscode.TextDocument) {
        const text = document.getText();
        const editableRanges = getEditableRanges(document);
        const regionNames: string[] = [];
        const beginRegex = /<!--\s*(?:InstanceBeginEditable|TemplateBeginEditable)\s*name=\"([^\"]+)\"\s*-->/g;
        let match;
        while ((match = beginRegex.exec(text)) !== null) {
            regionNames.push(match[1]);
        }

        if (regionNames.length > 0) {
            vscode.window.showQuickPick(regionNames, {
                placeHolder: 'Select an editable region to navigate to'
            }).then(selectedRegion => {
                if (selectedRegion) {
                    const selectedIndex = regionNames.indexOf(selectedRegion);
                    if (selectedIndex >= 0 && selectedIndex < editableRanges.length) {
                        const range = editableRanges[selectedIndex];
                        const editor = vscode.window.activeTextEditor;
                        if (editor) {
                            editor.selection = new vscode.Selection(range.start, range.start);
                            editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
                        }
                    }
                }
            });
        } else {
            vscode.window.showInformationMessage('No editable regions found in this template.');
        }
    }

    function initializeDecorations() {
        // No decoration for editable regions
        editableDecorationType = vscode.window.createTextEditorDecorationType({});

        // For non-editable regions, reduce the opacity to subtly gray them out.
        // This works well across different themes.
        nonEditableDecorationType = vscode.window.createTextEditorDecorationType({
            opacity: '0.6'
        });

        // For optional regions, add a subtle border to indicate conditional content
        optionalRegionDecorationType = vscode.window.createTextEditorDecorationType({
            border: '1px dashed rgba(255, 165, 0, 0.5)',
            backgroundColor: 'rgba(255, 165, 0, 0.1)'
        });
    }

    // Parse template parameters from template file
    function parseTemplateParameters(templateContent: string): TemplateParam[] {
        const parameters: TemplateParam[] = [];
        // Match both TemplateParam (in .dwt files) and InstanceParam (in .html files)
        const paramRegex = /<!--\s*(?:Template|Instance)Param\s+name="([^"]+)"\s+type="([^"]+)"\s+value="([^"]*?)"\s*-->/g;
        let match;
        
        while ((match = paramRegex.exec(templateContent)) !== null) {
            parameters.push({
                name: match[1],
                type: match[2] as 'text' | 'URL' | 'color' | 'number' | 'boolean',
                value: match[3]
            });
        }
        
        return parameters;
    }
    
    // Parse instance parameters from HTML file content
    function parseInstanceParameters(instanceContent: string): InstanceParameters {
        const parameters: InstanceParameters = {};
        const paramRegex = /<!--\s*InstanceParam\s+name="([^"]+)"\s+type="([^"]+)"\s+value="([^"]*?)"\s*-->/g;
        let match;
        
        while ((match = paramRegex.exec(instanceContent)) !== null) {
            parameters[match[1]] = match[3];
        }
        
        return parameters;
    }

    function buildInstanceParameterState(instanceUri: vscode.Uri, instanceContent: string, templateParams: TemplateParam[]): InstanceParameters {
        const merged: InstanceParameters = {};

        // Start with template defaults
        for (const param of templateParams) {
            merged[param.name] = param.value;
        }

        // Overlay any stored parameter overrides from prior runs
        const stored = instanceParametersStore.get(instanceUri.toString());
        if (stored) {
            for (const [name, value] of Object.entries(stored)) {
                merged[name] = value;
            }
        }

        // Finally, use the parameters defined in the current instance file content
        const documentParams = parseInstanceParameters(instanceContent);
        for (const [name, value] of Object.entries(documentParams)) {
            merged[name] = value;
        }

        return merged;
    }

    // Parse optional regions from template content
    function parseOptionalRegions(templateContent: string): OptionalRegion[] {
        const regions: OptionalRegion[] = [];
        const optionalRegionRegex = /<!--\s*TemplateBeginIf\s+cond="([^"]+)"\s*-->(([\s\S]*?))<!--\s*TemplateEndIf\s*-->/g;
        let match;
        
        while ((match = optionalRegionRegex.exec(templateContent)) !== null) {
            const expression = match[1];
            const content = match[2];
            const startOffset = match.index;
            const endOffset = match.index + match[0].length;
            
            // Check if this is an editable optional region
            const editableRegionRegex = /<!--\s*TemplateBeginEditable\s+name="([^"]+)"\s*-->/;
            const isEditable = editableRegionRegex.test(content);
            
            regions.push({
                name: `optional_${regions.length + 1}`,
                expression,
                content,
                isEditable,
                startOffset,
                endOffset
            });
        }
        
        return regions;
    }

    // Evaluate template parameter expression
    function evaluateExpression(expression: string, parameters: InstanceParameters): boolean {
        try {
            // Simple expression evaluation for boolean parameters
            // Supports: paramName, !paramName, paramName == "value", paramName != "value"
            
            // Handle negation
            if (expression.startsWith('!')) {
                const paramName = expression.substring(1).trim();
                const value = parameters[paramName] || 'false';
                return value.toLowerCase() !== 'true';
            }
            
            // Handle equality/inequality
            if (expression.includes('==') || expression.includes('!=')) {
                const isEquality = expression.includes('==');
                const parts = expression.split(isEquality ? '==' : '!=').map(p => p.trim());
                if (parts.length === 2) {
                    const paramName = parts[0];
                    const expectedValue = parts[1].replace(/["']/g, '');
                    const actualValue = parameters[paramName] || '';
                    
                    return isEquality ? 
                        actualValue === expectedValue : 
                        actualValue !== expectedValue;
                }
            }
            
            // Simple boolean parameter check
            const value = parameters[expression.trim()] || 'false';
            return value.toLowerCase() === 'true';
            
        } catch (error) {
            console.warn(`Error evaluating expression "${expression}":`, error);
            return false;
        }
    }

    // Get instance parameters for a document
    function getInstanceParameters(document: vscode.TextDocument): InstanceParameters {
        const uri = document.uri.toString();
        
        // First try to get from memory store
        let parameters = instanceParametersStore.get(uri) || {};
        
        // Also parse parameters from document content to get current state
        const documentParams = parseInstanceParameters(document.getText());
        
        // Merge document parameters with stored parameters (document takes precedence)
        return { ...parameters, ...documentParams };
    }

    // Set instance parameters for a document
    function setInstanceParameters(document: vscode.TextDocument, parameters: InstanceParameters): void {
        const uri = document.uri.toString();
        instanceParametersStore.set(uri, parameters);
        
        // Update decorations to reflect parameter changes
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document === document) {
            updateDecorations(editor);
        }
    }

    // Get protection state for specific file (defaults to global setting)
    function getFileProtectionState(document: vscode.TextDocument): boolean {
        const uri = document.uri.toString();
        const fileState = fileProtectionState.get(uri);
        if (fileState !== undefined) {
            return fileState;
        }
        // Default to global setting
        const config = vscode.workspace.getConfiguration('dreamweaverTemplate');
        return config.get('enableProtection', true);
    }

    // Set protection state for specific file
    function setFileProtectionState(document: vscode.TextDocument, enabled: boolean): void {
        const uri = document.uri.toString();
        fileProtectionState.set(uri, enabled);
        outputChannel.appendLine(`[PROTECTION] File protection ${enabled ? 'enabled' : 'disabled'} for: ${document.fileName}`);
    }

    function updateDecorations(editor: vscode.TextEditor | undefined) {
        if (!editor) {
            return;
        }

        const fileProtectionEnabled = getFileProtectionState(editor.document);

        // Clear decorations if protection is disabled or if this is a .dwt file
        if (!fileProtectionEnabled || isDreamweaverTemplateFile(editor.document)) {
            editor.setDecorations(nonEditableDecorationType, []);
            editor.setDecorations(editableDecorationType, []);
            return;
        }

        // Only apply decorations to instance files (not .dwt files)
        if (!isDreamweaverTemplate(editor.document)) {
            editor.setDecorations(nonEditableDecorationType, []);
            editor.setDecorations(editableDecorationType, []);
            return;
        }

        const config = vscode.workspace.getConfiguration('dreamweaverTemplate');
        const protectedRanges = getProtectedRanges(editor.document);
        const editableRanges = getEditableRanges(editor.document);
        const optionalRegionRanges = getOptionalRegionRanges(editor.document);

        editor.setDecorations(nonEditableDecorationType, config.get('highlightProtectedRegions', true) ? protectedRanges : []);
        editor.setDecorations(editableDecorationType, config.get('highlightEditableRegions', true) ? editableRanges : []);
        editor.setDecorations(optionalRegionDecorationType, config.get('highlightOptionalRegions', true) ? optionalRegionRanges : []);
    }

    // Workspace / context validation helper
    function ensureWorkspaceContext(templateUri?: vscode.Uri): boolean {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder open. Open the site root folder to use Dreamweaver template features.');
            return false;
        }
        if (templateUri && !templateUri.fsPath.toLowerCase().endsWith('.dwt')) {
            vscode.window.showWarningMessage('Active file is not a .dwt template. Open a .dwt file for this command.');
            return false;
        }
        return true;
    }

    // Create backup of files (html/php/dwt) before updating, preserving folder structure
    async function createHtmlBackups(instances: vscode.Uri[], templatePath: string): Promise<string> {
        try {
            // Get template name without extension for folder naming
            const templateName = path.basename(templatePath, '.dwt');
            
            // Get site root (parent of Templates directory)
            const templateDir = path.dirname(templatePath);
            const siteRoot = path.dirname(templateDir);
            const backupDir = path.join(siteRoot, '.html-dwt-template-backups');
            const templateBackupDir = path.join(backupDir, templateName);
            
            console.log(`Creating backup directory structure for template: ${templateName}`);
            
            // Create backup directory structure if it doesn't exist
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
            }
            if (!fs.existsSync(templateBackupDir)) {
                fs.mkdirSync(templateBackupDir, { recursive: true });
            }
            
            // Implement rolling backup system (keep 3 backups max)
            // Step 1: Check if backup folders exist and shift them
            const backup3Dir = path.join(templateBackupDir, '3');
            const backup2Dir = path.join(templateBackupDir, '2');
            const backup1Dir = path.join(templateBackupDir, '1');
            
            // If backup 3 exists, remove it (it will be overwritten)
            if (fs.existsSync(backup3Dir)) {
                fs.rmSync(backup3Dir, { recursive: true, force: true });
                console.log(`Removed oldest backup: ${backup3Dir}`);
            }
            
            // Move backup 2 to backup 3
            if (fs.existsSync(backup2Dir)) {
                fs.renameSync(backup2Dir, backup3Dir);
                console.log(`Moved backup 2 to backup 3`);
            }
            
            // Move backup 1 to backup 2
            if (fs.existsSync(backup1Dir)) {
                fs.renameSync(backup1Dir, backup2Dir);
                console.log(`Moved backup 1 to backup 2`);
            }
            
            // Create new backup 1 directory
            fs.mkdirSync(backup1Dir, { recursive: true });
            
            console.log(`Backing up ${instances.length} file(s) (html/php/dwt) to: ${backup1Dir}`);
            
            // Backup each file to the new backup 1 directory, preserving relative path
            for (const instanceUri of instances) {
                try {
                    if (instanceUri.fsPath.includes('.html-dwt-template-backups')) {
                        // Never back up backup files
                        continue;
                    }
                    const relPath = path.relative(siteRoot, instanceUri.fsPath);
                    const backupPath = path.join(backup1Dir, relPath);
                    // ensure directory exists
                    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
                    
                    // Copy file to backup location
                    const content = fs.readFileSync(instanceUri.fsPath, 'utf8');
                    fs.writeFileSync(backupPath, content, 'utf8');
                    
                    console.log(`Backed up: ${relPath}`);
                } catch (error) {
                    console.error(`Error backing up ${instanceUri.fsPath}:`, error);
                }
            }
            
            console.log(`All files backed up to: ${backup1Dir}`);
            
            // Store backup info for restore functionality
            lastBackupInfo = { backupDir: backup1Dir, templateName, instances, siteRoot };
            
            return backup1Dir;
            
        } catch (error) {
            console.error('Error creating HTML backups:', error);
            throw new Error(`Failed to create HTML backups: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    // Restore HTML files from last backup
    async function restoreHtmlFromBackup(): Promise<void> {
        if (!lastBackupInfo) {
            vscode.window.showErrorMessage('No backup information found. Cannot restore files.');
            return;
        }
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Restoring HTML from backup',
            cancellable: false
        }, async (progress) => {
            try {
                const { backupDir, templateName, siteRoot } = lastBackupInfo!;
                if (!fs.existsSync(backupDir)) {
                    vscode.window.showErrorMessage(`Backup directory not found: ${backupDir}`);
                    return;
                }
                progress.report({ message: `Found backup for template ${templateName}`, increment: 5 });

                // Collect all files in backupDir recursively
                const listFilesRecursively = (dir: string): string[] => {
                    const out: string[] = [];
                    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                        const full = path.join(dir, entry.name);
                        if (entry.isDirectory()) {
                            out.push(...listFilesRecursively(full));
                        } else {
                            out.push(full);
                        }
                    }
                    return out;
                };

                const files = listFilesRecursively(backupDir);
                let restoredCount = 0;
                let failedCount = 0;
                const total = files.length || 1;
                for (let i = 0; i < files.length; i++) {
                    const backupFile = files[i];
                    const rel = path.relative(backupDir, backupFile);
                    const target = path.join(siteRoot, rel);
                    if (target.includes('.html-dwt-template-backups')) {
                        // Do not restore into backup folder path
                        continue;
                    }
                    try {
                        const content = fs.readFileSync(backupFile, 'utf8');
                        fs.mkdirSync(path.dirname(target), { recursive: true });
                        fs.writeFileSync(target, content, 'utf8');
                        restoredCount++;
                    } catch (e) {
                        console.error(`Failed restore for ${rel}:`, e);
                        failedCount++;
                    }
                    progress.report({ increment: 80 / total, message: `Restored ${i + 1}/${total}` });
                }

                const message = `Restored ${restoredCount} file(s) from template "${templateName}" backup${failedCount ? ` (${failedCount} failed)` : ''}`;
                progress.report({ increment: 15, message: 'Done' });
                vscode.window.showInformationMessage(message);
            } catch (error) {
                console.error('Error restoring HTML from backup:', error);
                vscode.window.showErrorMessage(`Failed to restore HTML files: ${error instanceof Error ? error.message : String(error)}`);
            }
        });
    }

    // Find all templates that use a given template (template hierarchy)
    async function findChildTemplates(templatePath: string): Promise<vscode.Uri[]> {
        const childTemplates: vscode.Uri[] = [];
        const templateName = path.basename(templatePath);
        
        try {
            // Find all .dwt files in the Templates directory
            const templateFiles = await vscode.workspace.findFiles('**/Templates/*.dwt', '{**/node_modules/**,**/.html-dwt-template-backups/**}');
            
            for (const templateFile of templateFiles) {
                // Skip the current template
                if (templateFile.fsPath === templatePath) {
                    continue;
                }
                
                try {
                    const content = fs.readFileSync(templateFile.fsPath, 'utf8');
                    const headSlice = content.slice(0, 600);
                    // Check if this template references our template (only in top portion)
                    const instanceBeginRegex = /<!--\s*InstanceBegin\s+template="([^"]+)"/i;
                    const match = headSlice.match(instanceBeginRegex);
                    
                    if (match) {
                        const referencedTemplate = match[1];
                        const referencedTemplateName = path.basename(referencedTemplate);
                        if (referencedTemplateName === templateName) {
                            childTemplates.push(templateFile);
                            console.log(`Found child template (exact): ${templateFile.fsPath} references ${templateName}`);
                        } else {
                            console.log(`Ignoring template ${templateFile.fsPath} referencing different template ${referencedTemplateName}`);
                        }
                    }
                } catch (error) {
                    console.error(`Error reading template file ${templateFile.fsPath}:`, error);
                }
            }
        } catch (error) {
            console.error('Error finding child templates:', error);
        }
        
        return childTemplates;
    }

    // Template Synchronization Functions
    async function findTemplateInstances(templatePath: string): Promise<vscode.Uri[]> {
        const templateName = path.basename(templatePath);
        const instances: vscode.Uri[] = [];
        
        console.log(`DEBUG: Starting findTemplateInstances for ${templatePath}`);
        console.log(`DEBUG: Template name: ${templateName}`);
        
        try {
            // Check if the template is in a "Templates" folder
            const templateDir = path.dirname(templatePath);
            const templateDirName = path.basename(templateDir);
            
            console.log(`DEBUG: Template directory: ${templateDir}`);
            console.log(`DEBUG: Template directory name: ${templateDirName}`);
            
            if (templateDirName !== 'Templates') {
                console.log(`DEBUG: Template not in Templates folder, skipping instance search`);
                return instances;
            }
            
            // Get the parent directory of "Templates" (this is the site root)
            const siteRoot = path.dirname(templateDir);
            console.log(`DEBUG: Site root determined as: ${siteRoot}`);
            
            // Convert to workspace-relative path for VS Code's findFiles
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                console.log(`DEBUG: No workspace folder found`);
                return instances;
            }
            
            console.log(`DEBUG: Workspace folder: ${workspaceFolder.uri.fsPath}`);
            
            const siteRootRelative = path.relative(workspaceFolder.uri.fsPath, siteRoot);
            let searchPattern: string;
            
            console.log(`DEBUG: Site root relative to workspace: "${siteRootRelative}"`);
            
            if (siteRootRelative === '') {
                searchPattern = '**/*.{html,php}';
            } else {
                searchPattern = `${siteRootRelative}/**/*.{html,php}`;
            }
            
            console.log(`DEBUG: Searching for HTML/PHP files with pattern: ${searchPattern}`);
            
            // Find all HTML files within the site root and its subdirectories
            // Exclude node_modules and backup directories
            const htmlFiles = await vscode.workspace.findFiles(searchPattern, '{**/node_modules/**,**/.html-dwt-template-backups/**}');
            
            console.log(`DEBUG: Found ${htmlFiles.length} HTML/PHP files to check (excluding backups)`);
            htmlFiles.forEach(file => console.log(`DEBUG: Candidate file: ${file.fsPath}`));
            
            for (const file of htmlFiles) {
                try {
                    // Skip backup files as an additional safety check
                    if (file.fsPath.includes('.html-dwt-template-backups')) {
                        console.log(`DEBUG: Skipping backup file: ${file.fsPath}`);
                        continue;
                    }
                    
                    const content = fs.readFileSync(file.fsPath, 'utf8');
                    // Limit search to first 600 chars (top lines) to avoid false positives deep in body
                    const headSlice = content.slice(0, 600);
                    const instanceBeginRegex = /<!--\s*InstanceBegin\s+template="([^"]+)"/i;
                    const match = headSlice.match(instanceBeginRegex);
                    
                    if (match) {
                        const referencedTemplate = match[1];
                        console.log(`DEBUG: File ${file.fsPath} references template: ${referencedTemplate}`);
                        
                        // Check if it references our template (handle both absolute and relative paths)
                        // IMPORTANT: Only match EXACTLY our template, not partial matches
                        const referencedTemplateName = path.basename(referencedTemplate);
                        if (referencedTemplateName === templateName) {
                            instances.push(file);
                            console.log(`DEBUG: Added instance: ${file.fsPath} (exact template match)`);
                        } else {
                            console.log(`DEBUG: Skipped ${file.fsPath}: references ${referencedTemplateName}, not ${templateName}`);
                        }
                    }
                } catch (error) {
                    console.error(`Error reading file ${file.fsPath}:`, error);
                }
            }
            
            console.log(`DEBUG: Found ${instances.length} template instances for ${templateName}`);
        } catch (error) {
            console.error('Error finding template instances:', error);
        }
        
        return instances;
    }

    // Update template based on another template (for template hierarchy)
    async function updateTemplateBasedOnTemplate(childTemplateUri: vscode.Uri, parentTemplatePath: string): Promise<boolean> {
        try {
            const childTemplateContent = fs.readFileSync(childTemplateUri.fsPath, 'utf8');
            const parentTemplateContent = fs.readFileSync(parentTemplatePath, 'utf8');
            
            console.log(`Updating template: ${childTemplateUri.fsPath} based on parent: ${parentTemplatePath}`);
            
            // Step 1: PRESERVE the original InstanceBegin comment from child template (don't change it!)
            const instanceBeginMatch = childTemplateContent.match(/<!--\s*InstanceBegin\s+template="([^"]+)"[^>]*-->/);
            let preservedInstanceBegin = '';
            if (instanceBeginMatch) {
                preservedInstanceBegin = '\n' + instanceBeginMatch[0];
                console.log(`Preserving original InstanceBegin: ${instanceBeginMatch[0]}`);
            } else {
                // If no InstanceBegin found, create one that references the parent template
                const parentTemplateName = path.basename(parentTemplatePath);
                preservedInstanceBegin = `\n<!-- InstanceBegin template="/Templates/${parentTemplateName}" codeOutsideHTMLIsLocked="true" -->`;
                console.log(`Creating new InstanceBegin referencing parent template: ${parentTemplateName}`);
            }
            
            // Step 2: Extract editable content from child template (both Instance and Template regions)
            const editableContent = new Map<string, string>();
            
            // Extract InstanceBeginEditable regions
            const instanceEditableRegex = /<!--\s*InstanceBeginEditable\s+name="([^"]+)"\s*-->([\s\S]*?)<!--\s*InstanceEndEditable\s*-->/g;
            let match;
            while ((match = instanceEditableRegex.exec(childTemplateContent)) !== null) {
                const regionName = match[1];
                const content = match[2];
                editableContent.set(regionName, content);
                console.log(`Preserved InstanceEditable region "${regionName}"`);
            }
            
            // Extract TemplateBeginEditable regions (in case child template has both)
            const templateEditableRegex = /<!--\s*TemplateBeginEditable\s+name="([^"]+)"\s*-->([\s\S]*?)<!--\s*TemplateEndEditable\s*-->/g;
            while ((match = templateEditableRegex.exec(childTemplateContent)) !== null) {
                const regionName = match[1];
                const content = match[2];
                editableContent.set(regionName, content);
                console.log(`Preserved TemplateEditable region "${regionName}"`);
            }
            
            // Step 3: Start with parent template content
            let updatedContent = parentTemplateContent;
            
            // Step 4: Replace parent TemplateBeginEditable with InstanceBeginEditable + preserved content
            const templateRegionRegex = /<!--\s*TemplateBeginEditable\s+name="([^"]+)"\s*-->([\s\S]*?)<!--\s*TemplateEndEditable\s*-->/g;
            
            updatedContent = updatedContent.replace(templateRegionRegex, (fullMatch, regionName, defaultContent) => {
                const preservedContent = editableContent.get(regionName) || defaultContent;
                console.log(`Replacing parent template region "${regionName}" with preserved content`);
                return `<!-- InstanceBeginEditable name="${regionName}" -->${preservedContent}<!-- InstanceEndEditable -->`;
            });
            
            // Step 5: Add the PRESERVED InstanceBegin comment (keep original parent reference)
            updatedContent = updatedContent.replace(/<!--\s*InstanceBegin\s+template=[^>]*-->\s*/g, '');
            updatedContent = updatedContent.replace(/(<html[^>]*>)/i, `$1${preservedInstanceBegin}`);
            console.log(`Added preserved InstanceBegin comment (keeping original parent template reference)`);
            
            // Step 6: Add InstanceEnd comment before </html>
            updatedContent = updatedContent.replace(/<!--\s*InstanceEnd\s*-->/g, '');
            updatedContent = updatedContent.replace(/(<\/html>)/i, '<!-- InstanceEnd -->$1');

            // Remove redundant TemplateInfo declarations and helper comments inherited from parent templates
            updatedContent = updatedContent.replace(/<!--\s*TemplateInfo\s+codeOutsideHTMLIsLocked="(true|false)"\s*-->/gi, '');
            updatedContent = updatedContent.replace(/<!--\s*Below line\. This should have been removed[^>]*-->/gi, '');
            
            // Step 7: Write updated content to child template file
            fs.writeFileSync(childTemplateUri.fsPath, updatedContent, 'utf8');
            
            console.log(`Successfully updated template: ${childTemplateUri.fsPath}`);
            return true;
        } catch (error) {
            console.error(`Error updating template ${childTemplateUri.fsPath}:`, error);
            return false;
        }
    }

    // New Dreamweaver-style template updating that preserves editable content surgically
    type MergeResultStatus = 'updated' | 'unchanged' | 'skipped' | 'safetyFailed' | 'cancelled' | 'error';
    interface MergeResult { status: MergeResultStatus; }
    interface UpdateHtmlMergeOptions {
        templateCodeOutsideHTMLIsLocked?: string;
        removeTemplateInfoFromInstance?: boolean;
    }

    async function updateHtmlLikeDreamweaver(
        instanceUri: vscode.Uri,
        templatePath: string,
        options: UpdateHtmlMergeOptions = {}
    ): Promise<MergeResult> {
        try {
            const instancePath = instanceUri.fsPath;
            console.log(`[DW-MERGE] Start merge for instance: ${instancePath}`);
            outputChannel.appendLine(`[DW-MERGE] Start merge for instance: ${instancePath}`);

            const rawInstance = fs.readFileSync(instancePath, 'utf8');
            const rawTemplate = fs.readFileSync(templatePath, 'utf8');
            const instanceContent = rawInstance.replace(/\r\n?/g, '\n');
            const templateContent = rawTemplate.replace(/\r\n?/g, '\n');
            const templateLockStatus = options.templateCodeOutsideHTMLIsLocked?.toLowerCase();
            const shouldRemoveTemplateInfo = options.removeTemplateInfoFromInstance !== false; // Default to true

            // Capture repeat blocks from instance and template for preservation
            const instanceRepeatBlocks = new Map<string, string>();
            try {
                const instRepeatRe = /<!--\s*InstanceBeginRepeat\s+name="([^"]+)"\s*-->[\s\S]*?<!--\s*InstanceEndRepeat\s*-->/gi;
                let im: RegExpExecArray | null;
                while ((im = instRepeatRe.exec(instanceContent)) !== null) {
                    instanceRepeatBlocks.set(im[1], im[0]);
                }
            } catch {}
            
            // Parse template parameters and optional regions
            const templateParameters = parseTemplateParameters(templateContent);
            const instanceParameters = buildInstanceParameterState(instanceUri, instanceContent, templateParameters);
            const optionalRegions = parseOptionalRegions(templateContent);

            // Persist merged parameter state for follow-up operations (e.g., command UI)
            instanceParametersStore.set(instanceUri.toString(), instanceParameters);
            
            console.log(`[DW-MERGE] Found ${templateParameters.length} template parameters, ${optionalRegions.length} optional regions`);
            outputChannel.appendLine(`[DW-MERGE] Template parameters: ${templateParameters.map(p => `${p.name}(${p.type})`).join(', ') || '(none)'}`);
            outputChannel.appendLine(`[DW-MERGE] Optional regions: ${optionalRegions.length} found`);
            
            const templateRepeatBlocks = new Map<string, { full: string; name: string }>();
            try {
                const tmplRepeatRe = /<!--\s*TemplateBeginRepeat\s+name="([^"]+)"\s*-->[\s\S]*?<!--\s*TemplateEndRepeat\s*-->/gi;
                let tm: RegExpExecArray | null;
                while ((tm = tmplRepeatRe.exec(templateContent)) !== null) {
                    templateRepeatBlocks.set(tm[1], { full: tm[0], name: tm[1] });
                }
            } catch {}

            // Preserve existing instance editable regions
            const preservedRegions = new Map<string, string>();
            const instanceEditablePattern = /<!--\s*InstanceBeginEditable\s+name="([^"]+)"\s*-->([\s\S]*?)<!--\s*InstanceEndEditable\s*-->/g;
            let m: RegExpExecArray | null;
            while ((m = instanceEditablePattern.exec(instanceContent)) !== null) {
                preservedRegions.set(m[1], m[2]);
            }
            console.log(`[DW-MERGE] Preserved regions (${preservedRegions.size}): ${Array.from(preservedRegions.keys()).join(', ') || '(none)'}`);
            outputChannel.appendLine(`[DW-MERGE] Preserved regions (${preservedRegions.size}): ${Array.from(preservedRegions.keys()).join(', ') || '(none)'}`);

            // Robust region parser for template (handles single-line regions):
            interface ParsedRegion { name: string; begin: number; end: number; defaultContent: string; full: string; }
            const regionPattern = /<!--\s*(TemplateBeginEditable|InstanceBeginEditable)\s+name="([^"]+)"\s*-->([\s\S]*?)<!--\s*(TemplateEndEditable|InstanceEndEditable)\s*-->/g;
            const parsedRegions: ParsedRegion[] = [];
            let rp: RegExpExecArray | null;
            while ((rp = regionPattern.exec(templateContent)) !== null) {
                parsedRegions.push({
                    name: rp[2],
                    begin: rp.index,
                    end: rp.index + rp[0].length,
                    defaultContent: rp[3],
                    full: rp[0]
                });
            }
            console.log(`[DW-MERGE] Template regions parsed: ${parsedRegions.map(r=>r.name).join(', ') || '(none)'}`);
            outputChannel.appendLine(`[DW-MERGE] Template regions parsed: ${parsedRegions.map(r=>r.name).join(', ') || '(none)'}`);
            const templateRegionNames = new Set(parsedRegions.map(r => r.name));
            // Filter to TOP-LEVEL regions only (avoid rebuilding overlapping nested regions twice)
            const topLevelRegions: ParsedRegion[] = (() => {
                const out: ParsedRegion[] = [];
                let currentEnd = -1;
                for (const r of parsedRegions) {
                    if (r.begin >= currentEnd) {
                        out.push(r);
                        currentEnd = r.end;
                    } else {
                        // nested region within previous; skip here, inner will be handled later (nested mode)
                    }
                }
                return out;
            })();
            // Scan template for ALL editable names (in case parser misses ones inside repeats)
            const allTemplateEditableNames = new Set<string>();
            try {
                const scanEditableNames = /<!--\s*TemplateBeginEditable\s+name="([^"]+)"\s*-->/gi;
                let nm: RegExpExecArray | null;
                while ((nm = scanEditableNames.exec(templateContent)) !== null) {
                    allTemplateEditableNames.add(nm[1]);
                }
            } catch {}

            interface TemplateStructureScan {
                beginCount: number;
                endCount: number;
                names: Set<string>;
                namesInsideRepeat: Set<string>;
                nameStats: Map<string, { total: number; insideRepeat: number }>;
            }

            const scanTemplateStructure = (html: string): TemplateStructureScan => {
                const tokenRe = /<!--\s*(TemplateBeginRepeat\s+name="([^"]+)"|TemplateEndRepeat|TemplateBeginEditable\s+name="([^"]+)"|TemplateEndEditable)\s*-->/gi;
                const repeatStack: string[] = [];
                const names = new Set<string>();
                const namesInsideRepeat = new Set<string>();
                const nameStats = new Map<string, { total: number; insideRepeat: number }>();
                let beginCount = 0;
                let endCount = 0;
                let tokenMatch: RegExpExecArray | null;
                while ((tokenMatch = tokenRe.exec(html)) !== null) {
                    const raw = tokenMatch[1] ?? '';
                    if (/^TemplateBeginRepeat/i.test(raw)) {
                        repeatStack.push(tokenMatch[2] ?? '');
                        continue;
                    }
                    if (/^TemplateEndRepeat/i.test(raw)) {
                        if (repeatStack.length) repeatStack.pop();
                        continue;
                    }
                    if (/^TemplateBeginEditable/i.test(raw)) {
                        beginCount++;
                        const name = tokenMatch[3] ?? '';
                        names.add(name);
                        const insideRepeat = repeatStack.length > 0;
                        if (insideRepeat) namesInsideRepeat.add(name);
                        const stats = nameStats.get(name) ?? { total: 0, insideRepeat: 0 };
                        stats.total += 1;
                        if (insideRepeat) stats.insideRepeat += 1;
                        nameStats.set(name, stats);
                        continue;
                    }
                    if (/^TemplateEndEditable/i.test(raw)) {
                        endCount++;
                        continue;
                    }
                }
                return { beginCount, endCount, names, namesInsideRepeat, nameStats };
            };

            const collectInstanceEditableNames = (html: string): Set<string> => {
                const names = new Set<string>();
                const re = /<!--\s*InstanceBeginEditable\s+name="([^"]+)"\s*-->/gi;
                let m: RegExpExecArray | null;
                while ((m = re.exec(html)) !== null) {
                    names.add(m[1]);
                }
                return names;
            };

            const childStructure = scanTemplateStructure(templateContent);
            const namesInsideRepeat = new Set<string>(childStructure.namesInsideRepeat);
            const instanceEditableNames = collectInstanceEditableNames(instanceContent);

            for (const repeatEditableName of namesInsideRepeat) {
                if (preservedRegions.has(repeatEditableName)) {
                    preservedRegions.delete(repeatEditableName);
                }
            }

            const escapeForRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            interface EditableWrapOptions {
                singleLine?: boolean;
            }

            const wrapInstanceEditable = (name: string, rawContent: string | undefined, options?: EditableWrapOptions): string => {
                const singleLine = options?.singleLine ?? false;
                const escName = escapeForRegex(name);
                let body = rawContent ?? '';

                if (/<!--\s*Template(Begin|End)Editable/i.test(body)) {
                    body = body
                        .replace(/<!--\s*TemplateBeginEditable\s+name="([^"]+)"\s*-->/gi, '<!-- InstanceBeginEditable name="$1" -->')
                        .replace(/<!--\s*TemplateEndEditable\s*-->/gi, '<!-- InstanceEndEditable -->');
                }

                const fullInstanceBlockRe = new RegExp(`^\\s*<!--\\s*InstanceBeginEditable\\s+name="${escName}"\\s*-->[\\s\\S]*<!--\\s*InstanceEndEditable\\s*-->\\s*$`, 'i');
                if (fullInstanceBlockRe.test(body)) {
                    return body;
                }

                let working = body;
                let removedLeading = false;
                const leadingRe = new RegExp(`^\\s*<!--\\s*InstanceBeginEditable\\s+name="${escName}"\\s*-->`, 'i');
                if (leadingRe.test(working)) {
                    working = working.replace(leadingRe, '');
                    removedLeading = true;
                }
                if (removedLeading) {
                    const trailingRe = /\s*<!--\s*InstanceEndEditable\s*-->\s*$/i;
                    if (trailingRe.test(working)) {
                        working = working.replace(trailingRe, '');
                    }
                }

                if (!singleLine) {
                    const needsLead = working.length > 0 && !working.startsWith('\n');
                    const needsTail = working.length > 0 && !working.endsWith('\n');
                    if (needsLead) {
                        working = '\n' + working;
                    }
                    if (needsTail) {
                        working = working + '\n';
                    }
                }

                return `<!-- InstanceBeginEditable name="${name}" -->${working}<!-- InstanceEndEditable -->`;
            };

            // Build segments (static/region)
            type Segment = { kind: 'static'; text: string } | { kind: 'region'; region: ParsedRegion };
            const segments: Segment[] = [];
            let cursor = 0;
            for (const r of topLevelRegions) {
                if (r.begin > cursor) {
                    segments.push({ kind: 'static', text: templateContent.slice(cursor, r.begin) });
                }
                segments.push({ kind: 'region', region: r });
                cursor = r.end;
            }
            if (cursor < templateContent.length) {
                segments.push({ kind: 'static', text: templateContent.slice(cursor) });
            }
            console.log(`[DW-MERGE] Segments -> static:${segments.filter(s=>s.kind==='static').length} region:${segments.filter(s=>s.kind==='region').length}`);
            outputChannel.appendLine(`[DW-MERGE] Segments -> static:${segments.filter(s=>s.kind==='static').length} region:${segments.filter(s=>s.kind==='region').length}`);

            // Process optional regions and template syntax in segments
            const processOptionalRegions = (content: string): string => {
                let processedContent = content;
                
                // Convert TemplateParam to InstanceParam
                processedContent = processedContent.replace(
                    /<!--\s*TemplateParam\s+name="([^"]+)"\s+type="([^"]+)"\s+value="([^"]*?)"\s*-->/g,
                    '<!-- InstanceParam name="$1" type="$2" value="$3" -->'
                );
                
                // Remove TemplateInfo comments (redundant with InstanceBegin)
                processedContent = processedContent.replace(
                    /<!--\s*TemplateInfo\s+[^>]*-->/g,
                    ''
                );
                
                // Convert TemplateBeginIf/TemplateEndIf to InstanceBeginIf/InstanceEndIf
                processedContent = processedContent.replace(
                    /<!--\s*TemplateBeginIf\s+cond="([^"]+)"\s*-->/g,
                    '<!-- InstanceBeginIf cond="$1" -->'
                );
                processedContent = processedContent.replace(
                    /<!--\s*TemplateEndIf\s*-->/g,
                    '<!-- InstanceEndIf -->'
                );
                
                // Evaluate optional regions based on instance parameters
                for (const region of optionalRegions) {
                    const shouldInclude = evaluateExpression(region.expression, instanceParameters);
                    
                    if (!shouldInclude) {
                        // Remove the entire optional region if condition is false
                        const regionRegex = new RegExp(
                            `<!--\\s*(?:Template|Instance)BeginIf\\s+cond="${region.expression.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*-->[\\s\\S]*?<!--\\s*(?:Template|Instance)EndIf\\s*-->`,
                            'g'
                        );
                        processedContent = processedContent.replace(regionRegex, '');
                        console.log(`[DW-MERGE] Removed optional region with expression: ${region.expression}`);
                        outputChannel.appendLine(`[DW-MERGE] Removed optional region: ${region.expression} (evaluated to false)`);
                    } else {
                        console.log(`[DW-MERGE] Keeping optional region with expression: ${region.expression}`);
                        outputChannel.appendLine(`[DW-MERGE] Keeping optional region: ${region.expression} (evaluated to true)`);
                    }
                }
                
                return processedContent;
            };

            // InstanceBegin (preserve existing reference)
            const instanceBeginMatch = instanceContent.match(/<!--\s*InstanceBegin\s+template="([^"]+)"[^>]*-->/i);
            let instanceBegin = instanceBeginMatch ? instanceBeginMatch[0] : `<!-- InstanceBegin template="/Templates/${path.basename(templatePath)}" codeOutsideHTMLIsLocked="true" -->`;

            if (instanceBeginMatch) {
                // Normalize whitespace for downstream comparisons
                instanceBegin = instanceBeginMatch[0];
            } else if (templateLockStatus) {
                instanceBegin = `<!-- InstanceBegin template="/Templates/${path.basename(templatePath)}" codeOutsideHTMLIsLocked="${templateLockStatus}" -->`;
            }

            if (templateLockStatus) {
                const lockAttrRegex = /codeOutsideHTMLIsLocked="(true|false)"/i;
                if (lockAttrRegex.test(instanceBegin)) {
                    const currentLock = instanceBegin.match(lockAttrRegex)?.[1].toLowerCase();
                    if (currentLock !== templateLockStatus) {
                        console.log(`[DW-MERGE] Aligning codeOutsideHTMLIsLocked from ${currentLock} to ${templateLockStatus}`);
                        outputChannel.appendLine(`[DW-MERGE] Aligning codeOutsideHTMLIsLocked from ${currentLock} to ${templateLockStatus}`);
                    }
                    instanceBegin = instanceBegin.replace(lockAttrRegex, `codeOutsideHTMLIsLocked="${templateLockStatus}"`);
                } else {
                    console.log(`[DW-MERGE] Adding missing codeOutsideHTMLIsLocked="${templateLockStatus}" attribute to InstanceBegin`);
                    outputChannel.appendLine(`[DW-MERGE] Adding missing codeOutsideHTMLIsLocked="${templateLockStatus}" attribute to InstanceBegin`);
                    instanceBegin = instanceBegin.replace(/-->$/, ` codeOutsideHTMLIsLocked="${templateLockStatus}" -->`);
                }
            }

            // Remove only header InstanceBegin occurrences in static segments (avoid touching InstanceBeginRepeat)
            for (const s of segments) {
                if (s.kind === 'static') {
                    s.text = s.text.replace(/<!--\s*InstanceBegin\s+template="[^"]+"[^>]*-->\s*/gi, '');
                }
            }

            // Rebuild
            let rebuilt = '';
            let injectedInstanceBegin = false;
            const originalStaticBytes = segments.filter(s=>s.kind==='static').reduce((a,b)=>a+ (b as any).text.length,0);
            for (const s of segments) {
                if (s.kind === 'static') {
                    if (!injectedInstanceBegin) {
                        const htmlTagRegex = /<html[^>]*>/i;
                        if (htmlTagRegex.test(s.text)) {
                            rebuilt += s.text.replace(htmlTagRegex, match => `${match}\n${instanceBegin}`);
                            injectedInstanceBegin = true;
                            continue;
                        }
                    }
                    // Process optional regions and template syntax in static content
                    rebuilt += processOptionalRegions(s.text);
                } else {
                    const name = s.region.name;
                    if (namesInsideRepeat.has(name)) {
                        rebuilt += s.region.full;
                        continue;
                    }
                    const preserved = preservedRegions.get(name);
                    const defaultContent = s.region.defaultContent;
                    const contentToUse = preserved !== undefined ? preserved : defaultContent;
                    if (preserved === undefined) {
                        console.log(`[DW-MERGE] Region "${name}" new (using template default)`);
                    }
                    // Preserve surrounding whitespace style: check if original full was single-line
                    const singleLine = !/\n/.test(s.region.full.trim());
                    const wrapped = wrapInstanceEditable(name, contentToUse, { singleLine });
                    rebuilt += wrapped;
                }
            }

            // Repeat block handling: transplant existing instance repeat blocks; then auto-convert leftover template repeat sections
            if (templateRepeatBlocks.size) {
                if (instanceRepeatBlocks.size) {
                    for (const [rName] of templateRepeatBlocks.entries()) {
                        const instBlock = instanceRepeatBlocks.get(rName);
                        if (instBlock) {
                            const repRe = new RegExp(`<!--\\s*TemplateBeginRepeat\\s+name=\"${rName.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\"\\s*-->[\\s\\S]*?<!--\\s*TemplateEndRepeat\\s*-->`, 'i');
                            if (repRe.test(rebuilt)) {
                                rebuilt = rebuilt.replace(repRe, instBlock);
                                console.log(`[DW-MERGE] Preserved repeat block "${rName}" from instance`);
                                outputChannel.appendLine(`[DW-MERGE] Preserved repeat block "${rName}" from instance`);
                            }
                        }
                    }
                }
                // Auto-convert any remaining Template repeat wrappers (provide initial structure when instance had none)
                rebuilt = rebuilt.replace(/<!--\s*TemplateBeginRepeat\s+name="([^"]+)"\s*-->[\s\S]*?<!--\s*TemplateEndRepeat\s*-->/gi, (full, name) => {
                    let converted = full
                        .replace(/TemplateBeginRepeat/g, 'InstanceBeginRepeat')
                        .replace(/TemplateEndRepeat/g, 'InstanceEndRepeat')
                        .replace(/TemplateBeginRepeatEntry/g, 'InstanceBeginRepeatEntry')
                        .replace(/TemplateEndRepeatEntry/g, 'InstanceEndRepeatEntry');
                    // Ensure at least one repeat entry wrapper exists
                    const hasEntry = /InstanceBeginRepeatEntry/.test(converted);
                    if (!hasEntry) {
                        // Wrap inner rows (between first line after begin and before end) into a single entry
                        const m = /<!--\s*InstanceBeginRepeat\s+name="([^"]+)"\s*-->([\s\S]*?)<!--\s*InstanceEndRepeat\s*-->/i.exec(converted);
                        if (m) {
                            const inner = m[2].trim();
                            const wrappedInner = `\n<!-- InstanceBeginRepeatEntry -->\n${inner}\n<!-- InstanceEndRepeatEntry -->\n`;
                            converted = converted.replace(m[0], `${m[0].replace(m[2], wrappedInner)}`);
                        }
                    }
                    return converted;
                });
            }

            // Post-processing normalization: ensure no stray TemplateEndRepeat left and each InstanceBeginRepeat has a matching InstanceEndRepeat
            try {
                // Convert any remaining TemplateEndRepeat tokens defensively
                rebuilt = rebuilt.replace(/<!--\s*TemplateEndRepeat\s*-->/gi, '<!-- InstanceEndRepeat -->');
                // For every InstanceBeginRepeat name="X" ensure a closing InstanceEndRepeat exists after its content
                const beginRepeatRe = /<!--\s*InstanceBeginRepeat\s+name="([^"]+)"\s*-->/gi;
                const requiredClosers: {name:string; index:number}[] = [];
                let br: RegExpExecArray | null;
                while ((br = beginRepeatRe.exec(rebuilt)) !== null) {
                    requiredClosers.push({ name: br[1], index: br.index });
                }
                // Simple heuristic: count closers; if fewer than begins, append missing at end of tbody or end of file
                const endRepeatCount = (rebuilt.match(/<!--\s*InstanceEndRepeat\s*-->/gi) || []).length;
                if (endRepeatCount < requiredClosers.length) {
                    const missing = requiredClosers.length - endRepeatCount;
                    // Try to insert before closing </tbody> if present else before </table> else end of file
                    let insertionPoint = rebuilt.search(/<\/tbody>/i);
                    if (insertionPoint === -1) insertionPoint = rebuilt.search(/<\/table>/i);
                    if (insertionPoint === -1) insertionPoint = rebuilt.length;
                    const insertion = '\n' + Array(missing).fill('<!-- InstanceEndRepeat -->').join('\n') + '\n';
                    rebuilt = rebuilt.slice(0, insertionPoint) + insertion + rebuilt.slice(insertionPoint);
                }
            } catch (normErr) {
                console.warn('[DW-MERGE] Repeat normalization issue:', normErr);
            }

            // Append InstanceEnd
            rebuilt = rebuilt.replace(/<!--\s*InstanceEnd\s*-->/gi, '');
            rebuilt = rebuilt.replace(/(<\/html>)/i, '<!-- InstanceEnd -->$1');

            // Idempotency cleanup
            rebuilt = rebuilt.replace(/\n{4,}/g, '\n\n');

            // Fallback injection: if some preserved regions were not present in parsed template
            // (e.g., parser missed inside complex constructs), replace any matching TemplateBeginEditable
            // blocks in rebuilt with InstanceBeginEditable and preserved content to avoid data loss.
            for (const [pName, pContent] of preservedRegions.entries()) {
                if (!templateRegionNames.has(pName) && allTemplateEditableNames.has(pName)) {
                    const blockRe = new RegExp(`<!--\s*TemplateBeginEditable\s+name="${pName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\s*-->([\s\S]*?)<!--\s*TemplateEndEditable\s*-->`, 'i');
                    if (blockRe.test(rebuilt)) {
                        const preferSingleLine = !/\n/.test(pContent);
                        rebuilt = rebuilt.replace(blockRe, wrapInstanceEditable(pName, pContent, { singleLine: preferSingleLine }));
                        console.log(`[DW-MERGE] Fallback injected preserved region "${pName}" into rebuilt content`);
                    }
                }
            }

            if (shouldRemoveTemplateInfo) {
                const beforeRemoval = rebuilt;
                rebuilt = rebuilt.replace(/<!--\s*TemplateInfo\s+codeOutsideHTMLIsLocked="(true|false)"\s*-->/gi, '');
                if (beforeRemoval !== rebuilt) {
                    console.log('[DW-MERGE] Removed TemplateInfo codeOutsideHTMLIsLocked comment from instance');
                    outputChannel.appendLine('[DW-MERGE] Removed TemplateInfo codeOutsideHTMLIsLocked comment from instance');
                    rebuilt = rebuilt.replace(/\n{3,}/g, '\n\n');
                }
            }
            
            // Additional comprehensive template syntax cleanup
            const beforeFinalCleanup = rebuilt;
            
            // Convert any remaining TemplateParam to InstanceParam
            rebuilt = rebuilt.replace(/<!--\s*TemplateParam\s+name="([^"]+)"\s+type="([^"]+)"\s+value="([^"]*?)"\s*-->/g, 
                '<!-- InstanceParam name="$1" type="$2" value="$3" -->');

            // Convert any remaining optional region markers to Instance variants
            rebuilt = rebuilt.replace(/<!--\s*TemplateBeginIf\b([^>]*)-->/gi, (_match, attrs) => `<!-- InstanceBeginIf${attrs}-->`);
            rebuilt = rebuilt.replace(/<!--\s*TemplateEndIf\s*-->/gi, '<!-- InstanceEndIf -->');
            
            // Remove any remaining TemplateInfo comments (belt and suspenders approach)
            rebuilt = rebuilt.replace(/<!--\s*TemplateInfo\s+[^>]*-->/g, '');

            // Remove helper comments left from manual edits warning about TemplateInfo preservation
            rebuilt = rebuilt.replace(/<!--\s*Below line\. This should have been removed[^>]*-->/gi, '');
            
            // Clean up comment spacing and extra newlines
            rebuilt = rebuilt.replace(/\n\s*\n\s*\n/g, '\n\n');
            
            if (beforeFinalCleanup !== rebuilt) {
                console.log('[DW-MERGE] Applied final template syntax cleanup to instance');
                outputChannel.appendLine('[DW-MERGE] Applied final template syntax cleanup to instance');
            }

            // Preserve code outside <html> when codeOutsideHTMLIsLocked="false"
            try {
                const outsideLockFalse = /codeOutsideHTMLIsLocked\s*=\s*"false"/i.test(instanceBegin);
                if (outsideLockFalse) {
                    const instHtmlOpen = (() => { const m = /<html[^>]*>/i.exec(instanceContent); return m ? { idx: m.index, len: m[0].length } : null; })();
                    const instHtmlClose = (() => { let m: RegExpExecArray | null; let last: RegExpExecArray | null = null; const r = /<\/html>/ig; while ((m = r.exec(instanceContent)) !== null) last = m; return last ? { idx: last.index, len: last[0].length } : null; })();
                    const rebHtmlOpen = (() => { const m = /<html[^>]*>/i.exec(rebuilt); return m ? { idx: m.index, len: m[0].length } : null; })();
                    const rebHtmlClose = (() => { let m: RegExpExecArray | null; let last: RegExpExecArray | null = null; const r = /<\/html>/ig; while ((m = r.exec(rebuilt)) !== null) last = m; return last ? { idx: last.index, len: last[0].length } : null; })();

                    if (instHtmlOpen && rebHtmlOpen) {
                        const instancePrefix = instanceContent.slice(0, instHtmlOpen.idx);
                        // Replace prefix before <html> in rebuilt with instance prefix
                        rebuilt = instancePrefix + rebuilt.slice(rebHtmlOpen.idx);
                        console.log('[DW-MERGE] Preserved code before <html> due to codeOutsideHTMLIsLocked="false"');
                    }
                    // Preserve content after InstanceEnd; if absent, fallback to after </html>
                    const instEndExecAll = (() => { let m: RegExpExecArray | null; let last: RegExpExecArray | null = null; const r = /<!--\s*InstanceEnd\s*-->/ig; while ((m = r.exec(instanceContent)) !== null) last = m; return last; })();
                    if (instEndExecAll) {
                        const tail = instanceContent.slice(instEndExecAll.index + instEndExecAll[0].length);
                        const afterHtml = tail.replace(/^[\s\r\n]*<\/html>/i, '');
                        if (afterHtml.length > 0) {
                            rebuilt = rebuilt + afterHtml;
                            console.log('[DW-MERGE] Preserved content after InstanceEnd/</html>');
                        }
                    } else if (instHtmlClose) {
                        const afterHtmlOnly = instanceContent.slice(instHtmlClose.idx + instHtmlClose.len);
                        if (afterHtmlOnly.length > 0) {
                            rebuilt = rebuilt + afterHtmlOnly;
                            console.log('[DW-MERGE] Preserved content after </html> (no InstanceEnd found)');
                        }
                    }
                }
            } catch (e) {
                console.warn('[DW-MERGE] Failed to preserve outside-HTML code:', e);
            }

            // Final enforcement: ensure InstanceEnd and </html> exist
            const hasInstEnd = /<!--\s*InstanceEnd\s*-->/i.test(rebuilt);
            const hasHtmlClose = /<\/html>/i.test(rebuilt);
            if (!hasInstEnd && hasHtmlClose) {
                rebuilt = rebuilt.replace(/(<\/html>)/i, '<!-- InstanceEnd -->$1');
            } else if (!hasInstEnd && !hasHtmlClose) {
                rebuilt += '\n<!-- InstanceEnd --></html>';
            } else if (hasInstEnd && !hasHtmlClose) {
                rebuilt += '\n</html>';
            }
            // Normalize order: ensure InstanceEnd precedes </html>
            rebuilt = rebuilt.replace(/<\/html>\s*<!--\s*InstanceEnd\s*-->/ig, '<!-- InstanceEnd --></html>');

            // --- Alternating bgcolor enforcement (NEW) ---
            // Extract repeat template row pattern with ternary: <tr bgcolor="@@(_index & 1 ? '#FFFFFF' : '#CCCCCC')@@">
            function extractBgcolorTernary(template: string): {repeatName: string; colorA: string; colorB: string}[] {
                const results: {repeatName: string; colorA: string; colorB: string}[] = [];
                const repeatBlockRe = /<!--\s*TemplateBeginRepeat\s+name="([^"]+)"\s*-->([\s\S]*?)<!--\s*TemplateEndRepeat\s*-->/gi;
                let rb: RegExpExecArray | null;
                while ((rb = repeatBlockRe.exec(template)) !== null) {
                    const rName = rb[1];
                    const block = rb[2];
                    const ternaryRe = /<tr[^>]*\sbgcolor="@@\(_index\s*&\s*1\s*\?\s*'([^']+)'\s*:\s*'([^']+)'\)@@"[^>]*>/i;
                    const m = ternaryRe.exec(block);
                    if (m) {
                        results.push({ repeatName: rName, colorA: m[1], colorB: m[2] });
                    }
                }
                return results;
            }

            function applyAlternatingBgColors(instanceHtml: string, patterns: {repeatName: string; colorA: string; colorB: string}[]): string {
                if (!patterns.length) return instanceHtml;
                // For each repeat with a ternary, locate its InstanceBeginRepeat block
                for (const pat of patterns) {
                    const instRepeatRe = new RegExp(`(<!--\\s*InstanceBeginRepeat\\s+name=\"${pat.repeatName.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\$&')}\"\\s*-->)([\\s\\S]*?)(<!--\\s*InstanceEndRepeat\\s*-->)`, 'i');
                    const match = instRepeatRe.exec(instanceHtml);
                    if (!match) continue;
                    const before = instanceHtml.slice(0, match.index);
                    const middle = match[2];
                    const after = instanceHtml.slice(match.index + match[0].length);
                    // Split into entries
                    const entryRe = /(<!--\s*InstanceBeginRepeatEntry\s*-->)([\s\S]*?)(<!--\s*InstanceEndRepeatEntry\s*-->)/g;
                    let em: RegExpExecArray | null;
                    let rebuiltEntries = '';
                    let idx = 0;
                    while ((em = entryRe.exec(middle)) !== null) {
                        const entryFull = em[0];
                        // Replace first <tr ... bgcolor="#XXXXXX" ...> inside entry
                        const desired = (idx & 1) ? pat.colorA : pat.colorB; // pattern colorA used when index is odd per (_index & 1 ? colorA : colorB)
                        const swapped = entryFull.replace(/(<tr[^>]*\sbgcolor=")(#?[A-Fa-f0-9]{3,6})("[^>]*>)/, (full, p1, _old, p3) => {
                            return `${p1}${desired}${p3}`;
                        });
                        rebuiltEntries += swapped;
                        idx++;
                    }
                    if (rebuiltEntries) {
                        const newBlock = match[1] + rebuiltEntries + match[3];
                        instanceHtml = before + newBlock + after;
                    }
                }
                return instanceHtml;
            }

            const ternaryPatterns = extractBgcolorTernary(templateContent);
            if (ternaryPatterns.length) {
                const beforeColorFix = rebuilt;
                rebuilt = applyAlternatingBgColors(rebuilt, ternaryPatterns);
                if (beforeColorFix !== rebuilt) {
                    console.log(`[DW-MERGE] Applied alternating bgcolor logic for repeats: ${ternaryPatterns.map(p=>p.repeatName).join(', ')}`);
                }
            }
            // --- End alternating bgcolor enforcement ---

            // Detect nested editable scenario (child template based on parent template)
            let nestedEditableMode = false;
            const ignoredParentEditableNames = new Set<string>();
            let parentTemplateStructure: TemplateStructureScan | null = null;
            try {
                const instBeginMatch = /<!--\s*InstanceBegin\s+template="([^"]+)"[^>]*-->/i.exec(templateContent);
                if (instBeginMatch) {
                    const relParent = instBeginMatch[1];
                    const ws = vscode.workspace.workspaceFolders?.[0];
                    if (ws) {
                        const parentFsPath = path.join(ws.uri.fsPath, relParent.replace(/^\//, ''));
                        if (fs.existsSync(parentFsPath)) {
                            const parentText = fs.readFileSync(parentFsPath, 'utf8');
                            parentTemplateStructure = scanTemplateStructure(parentText);
                            const parentNames = parentTemplateStructure.names;
                            for (const name of Array.from(parentNames)) {
                                if (!childStructure.names.has(name) && !instanceEditableNames.has(name)) {
                                    ignoredParentEditableNames.add(name);
                                }
                            }
                            const childHasTemplateMarkers = childStructure.beginCount > 0;
                            if (parentNames.size > 0 && (childHasTemplateMarkers || ignoredParentEditableNames.size > 0)) {
                                nestedEditableMode = true;
                            }
                        }
                    }
                }
            } catch { /* non-fatal */ }

            // If nested mode, promote child Template editables to Instance editables with PRESERVED PAGE CONTENT first,
            // then unwrap parent-level wrapper regions and finally convert any remaining Template editables generically.
            if (nestedEditableMode) {
                const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const childTemplateEditableNames = new Set<string>(Array.from(childStructure.names).filter(name => !namesInsideRepeat.has(name)));
                let before = rebuilt;

                // 1) For every Template editable name declared in child template, if this page already has
                // an Instance editable with that name, replace the Template block in rebuilt with the PAGE'S preserved content.
                for (const childName of Array.from(childTemplateEditableNames)) {
                    if (!preservedRegions.has(childName)) continue; // page didn't override yet; keep template default
                    const blockRe = new RegExp(`<!--\\s*TemplateBeginEditable\\s+name=\"${esc(childName)}\"\\s*-->([\\s\\S]*?)<!--\\s*TemplateEndEditable\\s*-->`, 'i');
                    if (blockRe.test(rebuilt)) {
                        const pContent = preservedRegions.get(childName)!;
                        const preferSingleLine = !/\n/.test(pContent);
                        rebuilt = rebuilt.replace(blockRe, wrapInstanceEditable(childName, pContent, { singleLine: preferSingleLine }));
                        outputChannel.appendLine(`[NESTED] Promoted child editable "${childName}" with page content.`);
                    }
                }

                // 2) Convert any remaining Template editables to Instance editables generically
                rebuilt = rebuilt
                    .replace(/<!--\s*TemplateBeginEditable\s+name="([^"]+)"\s*-->/gi, '<!-- InstanceBeginEditable name="$1" -->')
                    .replace(/<!--\s*TemplateEndEditable\s*-->/gi, '<!-- InstanceEndEditable -->');

                // 3) Unwrap parent-level wrappers that the child supersedes with nested child editables
                const unwrapParentWrapper = (html: string, parentName: string, childNames: Set<string>, instanceNames: Set<string>): string => {
                    const beginRe = new RegExp(`<!--\\s*InstanceBeginEditable\\s+name=\"${esc(parentName)}\"\\s*-->`, 'gi');
                    const tokenRe = /(<!--\s*InstanceBeginEditable\b[^>]*-->|<!--\s*InstanceEndEditable\s*-->)/gi;
                    let out = html;
                    let m: RegExpExecArray | null;
                    while ((m = beginRe.exec(out)) !== null) {
                        const beginStart = m.index;
                        const afterBegin = beginRe.lastIndex;
                        tokenRe.lastIndex = afterBegin;
                        let depth = 1;
                        let t: RegExpExecArray | null;
                        let endStart = -1;
                        let endEnd = -1;
                        while ((t = tokenRe.exec(out)) !== null) {
                            const tok = t[1];
                            if (/InstanceBeginEditable/i.test(tok)) depth++;
                            else if (/InstanceEndEditable/i.test(tok)) depth--;
                            if (depth === 0) {
                                endStart = t.index;
                                endEnd = tokenRe.lastIndex;
                                break;
                            }
                        }
                        if (endStart === -1) break; // unmatched; bail
                        const segment = out.slice(beginStart, endEnd);
                        let containsChild = false;
                        for (const cn of Array.from(childNames)) {
                            const cnRe = new RegExp(`<!--\\s*InstanceBeginEditable\\s+name=\"${esc(cn)}\"`, 'i');
                            if (cnRe.test(segment)) { containsChild = true; break; }
                        }
                        const shouldUnwrap = containsChild || !instanceNames.has(parentName);
                        if (shouldUnwrap) {
                            const before = out.slice(0, beginStart);
                            const middle = out.slice(afterBegin, endStart);
                            const after = out.slice(endEnd);
                            out = before + middle + after;
                            beginRe.lastIndex = Math.max(0, beginStart - 1);
                        }
                    }
                    return out;
                };
                for (const parentName of Array.from(ignoredParentEditableNames)) {
                    rebuilt = unwrapParentWrapper(rebuilt, parentName, childTemplateEditableNames, instanceEditableNames);
                }

                // 4) Reinstate page-specific content for nested child editables so template defaults never overwrite instances
                for (const childName of Array.from(childTemplateEditableNames)) {
                    const preserved = preservedRegions.get(childName);
                    if (preserved === undefined) continue;
                    const pattern = new RegExp(`(<!--\\s*InstanceBeginEditable\\s+name=\"${esc(childName)}\"\\s*-->)([\\s\\S]*?)(<!--\\s*InstanceEndEditable\\s*-->)`, 'i');
                    if (pattern.test(rebuilt)) {
                        rebuilt = rebuilt.replace(pattern, `$1${preserved}$3`);
                    }
                }

                if (before !== rebuilt) {
                    outputChannel.appendLine('[NESTED] Promoted child editables and unwrapped parent wrapper(s).');
                }
            }

            // After all nested handling, restore preserved repeat blocks wholesale.
            if (instanceRepeatBlocks.size) {
                const replaceRepeatBlock = (name: string, block: string): void => {
                    const escName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const anyRepeatRe = new RegExp(`<!--\\s*(?:Template|Instance)BeginRepeat\\s+name="${escName}"\\s*-->[\\s\\S]*?<!--\\s*(?:Template|Instance)EndRepeat\\s*-->`, 'gi');
                    if (anyRepeatRe.test(rebuilt)) {
                        rebuilt = rebuilt.replace(anyRepeatRe, block);
                    }
                };
                for (const [repeatName, instBlock] of instanceRepeatBlocks.entries()) {
                    replaceRepeatBlock(repeatName, instBlock);
                }
            }

            // Safety guard: comprehensive validation
            const safetyIssues: string[] = [];

            const registerStructureIssues = (label: string, scan: TemplateStructureScan | null): void => {
                if (!scan) return;
                if (scan.beginCount !== scan.endCount) {
                    safetyIssues.push(`${label} editable markers mismatch (${scan.beginCount} begin vs ${scan.endCount} end)`);
                }
                const duplicateNames: string[] = [];
                for (const [name, stats] of scan.nameStats.entries()) {
                    const outsideRepeat = stats.total - stats.insideRepeat;
                    if (outsideRepeat > 1) {
                        duplicateNames.push(name);
                    }
                }
                if (duplicateNames.length) {
                    safetyIssues.push(`${label} duplicate editable name(s): ${duplicateNames.join(', ')}`);
                }
            };

            registerStructureIssues('Template', childStructure);
            if (parentTemplateStructure) {
                registerStructureIssues('Parent template', parentTemplateStructure);
            }
            // A) Check that preserved region presence isn't lost
            for (const [rName, rContent] of preservedRegions.entries()) {
                if (!allTemplateEditableNames.has(rName)) continue;
                if (namesInsideRepeat.has(rName)) {
                    const hasRegion = new RegExp(`<!--\\s*InstanceBeginEditable\\s+name=\"${rName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\"`, 'i').test(rebuilt);
                    if (!hasRegion) safetyIssues.push(`Missing repeat editable region: "${rName}"`);
                } else {
                    if (nestedEditableMode && ignoredParentEditableNames.has(rName)) {
                        // This is a parent wrapper region intentionally removed; don't require preserved content
                        continue;
                    }
                    const trimmed = rContent.trim();
                    const snippet = trimmed.slice(0, Math.min(40, trimmed.length));
                    if (snippet && !rebuilt.includes(snippet)) safetyIssues.push(`Lost content for region: "${rName}"`);
                }
            }
            // B) Region count should not decrease
            const countOcc = (content: string, name: string): number => {
                const re = new RegExp(`<!--\\s*InstanceBeginEditable\\s+name=\"${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\"`, 'gi');
                return (content.match(re) || []).length;
            };
            for (const name of allTemplateEditableNames) {
                if (namesInsideRepeat.has(name)) continue;
                const instCount = countOcc(instanceContent, name);
                const rebCount = countOcc(rebuilt, name);
                // In nestedEditableMode, tolerate missing parent-level editables not present in child
                const tolerateMissing = nestedEditableMode && ignoredParentEditableNames.has(name);
                if (!tolerateMissing && instCount > 0 && rebCount < instCount) {
                    safetyIssues.push(`Region "${name}": count decreased (${rebCount} < ${instCount})`);
                }
            }
            // C) Repeat integrity: no template repeat tokens should remain after auto-conversion
            if (/<!--\s*Template(Begin|End)Repeat/.test(rebuilt)) {
                safetyIssues.push('Template repeat markers remained in output (post-conversion)');
            }
            for (const rn of Array.from(templateRepeatBlocks.keys())) {
                const instHas = new RegExp(`<!--\\s*InstanceBeginRepeat\\s+name=\"${rn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\"`, 'i').test(instanceContent);
                if (instHas) {
                    const rebuiltHasBegin = new RegExp(`<!--\\s*InstanceBeginRepeat\\s+name=\"${rn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\"`, 'i').test(rebuilt);
                    const rebuiltHasEnd = /<!--\s*InstanceEndRepeat\s*-->/i.test(rebuilt);
                    if (!rebuiltHasBegin || !rebuiltHasEnd) {
                        safetyIssues.push(`Repeat "${rn}": missing InstanceBeginRepeat/InstanceEndRepeat`);
                    }
                }
            }

            if (rebuilt !== instanceContent) {
                // D) Size & static shrink checks
                const ratio = rebuilt.length / Math.max(1, instanceContent.length);
                const minRatio = nestedEditableMode ? 0.25 : 0.4;
                if (instanceContent.length > 500 && ratio < minRatio) {
                    safetyIssues.push(`Rebuilt size ratio too small (${ratio.toFixed(2)})`);
                }
                const rebuiltStaticBytes = rebuilt.replace(/<!--\s*InstanceBeginEditable[\sS]*?InstanceEndEditable\s*-->/g,'').length;
                const staticThreshold = nestedEditableMode ? 0.3 : 0.5;
                if (rebuiltStaticBytes < originalStaticBytes * staticThreshold) {
                    safetyIssues.push(`Static content reduced significantly (${rebuiltStaticBytes} < ${Math.round(originalStaticBytes * 0.5)})`);
                }

                if (safetyIssues.length) {
                    const details = `Safety checks failed for ${path.basename(instancePath)}:\n- ${safetyIssues.join('\n- ')}`;
                    console.warn(`[DW-MERGE] ${details}`);
                    outputChannel.appendLine(details);
                    const NEXT = 'Next File';
                    const SHOW = 'Show Error';
                    const decision = await vscode.window.showWarningMessage(
                        `Safety checks flagged ${path.basename(instancePath)}.`,
                        { modal: true },
                        NEXT, SHOW
                    );
                    if (decision === SHOW) {
                        try {
                            const siteRoot = path.dirname(path.dirname(templatePath));
                            const tempDir = path.join(siteRoot, '.html-dwt-template-temp');
                            fs.mkdirSync(tempDir, { recursive: true });
                            const tempPath = path.join(tempDir, path.basename(instancePath));
                            fs.writeFileSync(tempPath, rebuilt, 'utf8');
                            await vscode.commands.executeCommand('vscode.diff', vscode.Uri.file(instancePath), vscode.Uri.file(tempPath), `Safety: ${path.basename(instancePath)}`);
                        } catch (e) {
                            vscode.window.showErrorMessage('Failed to show safety diff.');
                        }
                        // Secondary popup (show error popup)
                        const NEXT2 = 'Next File';
                        const decision2 = await vscode.window.showWarningMessage(
                            `Review safety diff for ${path.basename(instancePath)}.`,
                            { modal: true },
                            NEXT2
                        );
                        if (decision2 === undefined) {
                            // treat close as Next File (skip)
                        }
                        logProcessCompletion('updateHtmlLikeDreamweaver:item-safety-diff-shown', 4);
                        return { status: 'safetyFailed' }; // Skip editing
                    }
                    if (decision === NEXT) {
                        logProcessCompletion('updateHtmlLikeDreamweaver:item-safety-skip', 4);
                        return { status: 'safetyFailed' };
                    }
                    if (decision === undefined) { // user cancelled (native Cancel)
                        cancelRunForRun = true;
                        logProcessCompletion('updateHtmlLikeDreamweaver:run-cancelled', 2);
                        return { status: 'cancelled' };
                    }
                    // Any other outcome (should not happen) treat as skip
                    logProcessCompletion('updateHtmlLikeDreamweaver:item-safety-skip', 4);
                    return { status: 'safetyFailed' };
                }

                // --- Update Popup for passing safety ---
                let wrote = false;
                if (applyToAllForRun) {
                    fs.writeFileSync(instancePath, rebuilt, 'utf8');
                    disposeDiffState(instancePath);
                    wrote = true;
                } else {
                    const APPLY = 'Apply';
                    const APPLY_ALL = 'Apply to All';
                    const SHOW_DIFF = 'Show Diff';
                    const PREVIOUS_DIFF = 'Previous Diff';
                    const NEXT_DIFF = 'Next Diff';
                    const SKIP = 'Skip';
                    const promptMessage = `Update '${path.basename(instancePath)}' with template changes?`;
                    const siteRoot = path.dirname(path.dirname(templatePath));
                    const tempDir = path.join(siteRoot, '.html-dwt-template-temp');
                    let diffTempPath: string | null = null;
                    let diffShown = false;

                    const clearDiffNavigationState = () => {
                        disposeDiffState(instancePath);
                        diffTempPath = null;
                        diffShown = false;
                    };

                    const clampRangeToDocument = (range: vscode.Range, doc: vscode.TextDocument): vscode.Range => {
                        if (doc.lineCount === 0) {
                            const zero = new vscode.Position(0, 0);
                            return new vscode.Range(zero, zero);
                        }
                        const maxLine = doc.lineCount - 1;
                        const startLine = Math.min(Math.max(range.start.line, 0), maxLine);
                        const endLine = Math.min(Math.max(range.end.line, startLine), maxLine);
                        const start = new vscode.Position(startLine, 0);
                        const end = doc.lineAt(endLine).range.end;
                        return new vscode.Range(start, end);
                    };

                    const buildNavigationEntries = (): DiffNavigationEntry[] => {
                        try {
                            const patch = structuredPatch(
                                instancePath,
                                diffTempPath ?? path.basename(instancePath),
                                instanceContent,
                                rebuilt,
                                '',
                                ''
                            );
                            const entries: DiffNavigationEntry[] = [];
                            for (const hunk of patch.hunks) {
                                const oldStart = Math.max(0, hunk.oldStart - 1);
                                const oldLines = Math.max(hunk.oldLines, 1);
                                const newStart = Math.max(0, hunk.newStart - 1);
                                const newLines = Math.max(hunk.newLines, 1);
                                const originalRange = new vscode.Range(oldStart, 0, oldStart + oldLines - 1, Number.MAX_SAFE_INTEGER);
                                const modifiedRange = new vscode.Range(newStart, 0, newStart + newLines - 1, Number.MAX_SAFE_INTEGER);
                                const preferredSide: 'original' | 'modified' =
                                    hunk.newLines === 0 && hunk.oldLines > 0 ? 'original' : 'modified';
                                entries.push({ originalRange, modifiedRange, preferredSide });
                            }
                            return entries;
                        } catch (err) {
                            console.warn('[DW-MERGE] Failed to build diff navigation data:', err);
                            return [];
                        }
                    };

                    const updateDiffNavigationState = (tempPath: string, originalUri: vscode.Uri, usingVirtualOriginal: boolean): DiffNavigationState => {
                        const existing = diffNavigationStates.get(instancePath);
                        const ranges = buildNavigationEntries();
                        let currentIndex = existing?.currentIndex ?? -1;
                        if (ranges.length === 0) {
                            currentIndex = -1;
                        } else if (currentIndex >= ranges.length || currentIndex < -1) {
                            currentIndex = -1;
                        }
                        const state: DiffNavigationState = { tempPath, ranges, currentIndex, originalUri, usingVirtualOriginal };
                        diffNavigationStates.set(instancePath, state);
                        return state;
                    };

                    const focusDiffEntry = async (state: DiffNavigationState, index: number): Promise<void> => {
                        if (index < 0 || index >= state.ranges.length) {
                            return;
                        }
                        const entry = state.ranges[index];
                        const editors = vscode.window.visibleTextEditors;
                        const targetOriginalUri = state.originalUri.toString();
                        const originalEditor = editors.find(e => e.document.uri.toString() === targetOriginalUri);
                        const modifiedEditor = editors.find(e => e.document.uri.fsPath === state.tempPath);
                        const prefersModified = entry.preferredSide === 'modified' && !!modifiedEditor;
                        const focusCommand = prefersModified
                            ? 'workbench.action.compareEditor.focusSecondarySide'
                            : 'workbench.action.compareEditor.focusPrimarySide';
                        await vscode.commands.executeCommand(focusCommand);
                        const targetEditor = (prefersModified ? modifiedEditor : originalEditor) ?? vscode.window.activeTextEditor;
                        if (!targetEditor) {
                            return;
                        }
                        const targetRange = prefersModified && modifiedEditor ? entry.modifiedRange : entry.originalRange;
                        const boundedRange = clampRangeToDocument(targetRange, targetEditor.document);
                        const selection = new vscode.Selection(boundedRange.start, boundedRange.start);
                        targetEditor.selections = [selection];
                        targetEditor.revealRange(boundedRange, vscode.TextEditorRevealType.InCenter);
                    };

                    const ensureDiffShown = async (): Promise<void> => {
                        try {
                            if (!diffTempPath) {
                                fs.mkdirSync(tempDir, { recursive: true });
                                diffTempPath = path.join(tempDir, path.basename(instancePath));
                            }
                            fs.writeFileSync(diffTempPath, rebuilt, 'utf8');
                            const existingEditor = vscode.window.visibleTextEditors.find(e => e.document.uri.fsPath === instancePath);
                            let originalUri: vscode.Uri;
                            let usingVirtualOriginal = false;
                            if (existingEditor) {
                                originalUri = vscode.Uri.file(instancePath);
                                usingVirtualOriginal = false;
                            } else {
                                originalUri = setVirtualOriginalContent(instancePath, instanceContent);
                                usingVirtualOriginal = true;
                            }
                            const state = updateDiffNavigationState(diffTempPath, originalUri, usingVirtualOriginal);
                            await vscode.commands.executeCommand(
                                'vscode.diff',
                                state.originalUri,
                                vscode.Uri.file(diffTempPath),
                                `Diff: ${path.basename(instancePath)}`
                            );
                            diffShown = true;
                            if (state.ranges.length > 0) {
                                if (state.currentIndex === -1) {
                                    state.currentIndex = 0;
                                    diffNavigationStates.set(instancePath, state);
                                }
                                await focusDiffEntry(state, state.currentIndex);
                            } else {
                                vscode.window.setStatusBarMessage('No differences detected for navigation.', 2000);
                            }
                        } catch (e) {
                            vscode.window.showErrorMessage('Failed to show diff.');
                        }
                    };

                    const navigateDiff = async (direction: 'next' | 'previous'): Promise<void> => {
                        await ensureDiffShown();
                        const state = diffNavigationStates.get(instancePath);
                        if (!state || state.ranges.length === 0) {
                            return;
                        }
                        if (state.ranges.length === 1) {
                            state.currentIndex = 0;
                            diffNavigationStates.set(instancePath, state);
                            await focusDiffEntry(state, state.currentIndex);
                            vscode.window.setStatusBarMessage('Showing the only difference.', 1500);
                            return;
                        }
                        if (state.currentIndex === -1) {
                            state.currentIndex = direction === 'next' ? 0 : state.ranges.length - 1;
                        } else {
                            const delta = direction === 'next' ? 1 : -1;
                            state.currentIndex = (state.currentIndex + delta + state.ranges.length) % state.ranges.length;
                        }
                        diffNavigationStates.set(instancePath, state);
                        await focusDiffEntry(state, state.currentIndex);
                    };

                    let decision: string | undefined;
                    while (true) {
                        const options = diffShown
                            ? [APPLY, APPLY_ALL, PREVIOUS_DIFF, NEXT_DIFF, SKIP]
                            : [APPLY, APPLY_ALL, SHOW_DIFF, SKIP];
                        decision = await vscode.window.showInformationMessage(
                            promptMessage,
                            { modal: true },
                            ...options
                        );
                        if (decision === SHOW_DIFF) {
                            await ensureDiffShown();
                            continue;
                        }
                        if (decision === NEXT_DIFF) {
                            await navigateDiff('next');
                            continue;
                        }
                        if (decision === PREVIOUS_DIFF) {
                            await navigateDiff('previous');
                            continue;
                        }
                        break;
                    }

                    if (decision === APPLY_ALL) {
                        applyToAllForRun = true;
                        fs.writeFileSync(instancePath, rebuilt, 'utf8');
                        clearDiffNavigationState();
                        wrote = true;
                    } else if (decision === APPLY) {
                        fs.writeFileSync(instancePath, rebuilt, 'utf8');
                        clearDiffNavigationState();
                        wrote = true;
                    } else if (decision === SKIP) {
                        clearDiffNavigationState();
                        logProcessCompletion('updateHtmlLikeDreamweaver:item-skipped', 3);
                        return { status: 'skipped' };
                    } else if (decision === undefined) { // user pressed native Cancel (X) in modal
                        cancelRunForRun = true;
                        clearDiffNavigationState();
                        logProcessCompletion('updateHtmlLikeDreamweaver:run-cancelled', 2);
                        return { status: 'cancelled' };
                    } else { // unexpected label
                        clearDiffNavigationState();
                        logProcessCompletion('updateHtmlLikeDreamweaver:item-skipped', 3);
                        return { status: 'skipped' };
                    }

                    if (decision === APPLY_ALL || decision === APPLY) {
                        clearDiffNavigationState();
                    }
                }
                if (wrote) {
                    console.log(`[DW-MERGE] Wrote updated instance: ${instancePath}`);
                    outputChannel.appendLine(`[DW-MERGE] Wrote updated instance: ${instancePath}`);
                }
            } else {
                console.log('[DW-MERGE] No changes needed (already up to date)');
                outputChannel.appendLine('[DW-MERGE] No changes needed (already up to date)');
            }
            logProcessCompletion('updateHtmlLikeDreamweaver:item-updated');
            return { status: 'updated' };
        } catch (e) {
            console.error(`[DW-MERGE] Failed merging instance ${instanceUri.fsPath}:`, e);
            logProcessCompletion('updateHtmlLikeDreamweaver:item-error', 1);
            return { status: 'error' };
        }
    }

    async function updateHtmlBasedOnTemplate(templateUri: vscode.Uri): Promise<void> {
        if (!isTemplateSyncEnabled) {
            return;
        }

        // Show progress with cancel option
        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Updating HTML based on template (preserving content)",
            cancellable: true
        }, async (progress, token) => {
            const templateDirForTemp = path.dirname(templateUri.fsPath);
            const siteRootForTemp = path.dirname(templateDirForTemp);
            const tempDiffDir = path.join(siteRootForTemp, '.html-dwt-template-temp');
            let completionLogged = false;

            const cleanupTempDirectory = () => {
                try {
                    if (fs.existsSync(tempDiffDir)) {
                        fs.rmSync(tempDiffDir, { recursive: true, force: true });
                        console.log(`[DW-MERGE] Removed temporary diff directory: ${tempDiffDir}`);
                        if (outputChannel) {
                            outputChannel.appendLine(`[DW-MERGE] Removed temporary diff directory: ${tempDiffDir}`);
                        }
                    }
                } catch (cleanupError) {
                    console.warn(`[DW-MERGE] Failed to remove temporary diff directory ${tempDiffDir}:`, cleanupError);
                    if (outputChannel) {
                        const message = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
                        outputChannel.appendLine(`[DW-MERGE] Failed to remove temporary diff directory: ${message}`);
                    }
                }
            };

            try {
                console.log(`Starting Dreamweaver-style update for template: ${templateUri.fsPath}`);
                
                // Check for cancellation
                if (token.isCancellationRequested) {
                    return;
                }
                
                progress.report({ increment: 10, message: "Finding template instances..." });
                
                // Step 1: Find ONLY HTML instances of THIS template (not child templates)
                const instances = await findTemplateInstances(templateUri.fsPath);
                
                // Step 2: Find child templates separately (these will be updated differently)
                const childTemplates = await findChildTemplates(templateUri.fsPath);
                
                // Check for cancellation
                if (token.isCancellationRequested) {
                    return;
                }
                
                progress.report({ increment: 20, message: `Found ${instances.length} HTML/PHP instances and ${childTemplates.length} child templates` });
                
                // If no instances found, show message
                if (instances.length === 0) {
                    const templateDir = path.dirname(templateUri.fsPath);
                    const templateDirName = path.basename(templateDir);
                    
                    let message = `No HTML instance files found for template ${path.basename(templateUri.fsPath)}`;
                    if (templateDirName !== 'Templates') {
                        message += `\n\nNote: Template must be in a folder named "Templates" for instance detection to work. Current folder: "${templateDirName}"`;
                    }
                    
                    // Still update child templates even if no HTML instances
                    if (childTemplates.length > 0) {
                        message += `\n\nFound ${childTemplates.length} child template(s) that will be updated.`;
                    }
                    
                    vscode.window.showInformationMessage(message);
                    
                    // We may still proceed if child templates exist
                }

                // Temporarily disable protection during update
                const originalProtectionState = isProtectionEnabled;
                isProtectionEnabled = false;
                
                const templateContent = fs.readFileSync(templateUri.fsPath, 'utf8');
                const templateInfoLockMatch = templateContent.match(/<!--\s*TemplateInfo\s+codeOutsideHTMLIsLocked="(true|false)"\s*-->/i);
                const templateDeclaresParent = /<!--\s*InstanceBegin\s+template="/i.test(templateContent);
                const templateLockStateForInstances = !templateDeclaresParent && templateInfoLockMatch ? templateInfoLockMatch[1].toLowerCase() : undefined;
                const shouldSyncCodeOutsideLock = !!templateLockStateForInstances;
                
                // Check for cancellation
                if (token.isCancellationRequested) {
                    isProtectionEnabled = originalProtectionState;
                    return;
                }

                // Create backups (instances + child templates), preserving structure
                const toBackupMap = new Map<string, vscode.Uri>();
                for (const u of instances) toBackupMap.set(u.fsPath, u);
                for (const u of childTemplates) toBackupMap.set(u.fsPath, u);
                const toBackup = Array.from(toBackupMap.values());
                if (toBackup.length > 0) {
                    progress.report({ increment: 10, message: `Creating backups of ${toBackup.length} file(s)...` });
                    try {
                        const backupDir = await createHtmlBackups(toBackup, templateUri.fsPath);
                        vscode.window.showInformationMessage(
                            `Backed up ${toBackup.length} file(s) to: ${path.basename(backupDir)}`
                        );
                    } catch (error) {
                        console.error('Backup creation failed:', error);
                        vscode.window.showErrorMessage(
                            `Failed to create backups: ${error instanceof Error ? error.message : String(error)}. Proceeding without backup.`
                        );
                    }
                }
                
                // Step 3: Update child templates (but NOT their instances automatically)
                if (childTemplates.length > 0) {
                    console.log(`Found ${childTemplates.length} child templates to update`);
                    progress.report({ increment: 15, message: `Updating ${childTemplates.length} child templates...` });
                    
                    for (let i = 0; i < childTemplates.length; i++) {
                        // Check for cancellation
                        if (token.isCancellationRequested) {
                            isProtectionEnabled = originalProtectionState;
                            return;
                        }
                        
                        const childTemplate = childTemplates[i];
                        try {
                            // Update the child template based on the parent template
                            await updateTemplateBasedOnTemplate(childTemplate, templateUri.fsPath);
                            console.log(`Updated child template: ${childTemplate.fsPath}`);
                            
                            progress.report({ increment: 15 / childTemplates.length, message: `Updated child template ${i + 1}/${childTemplates.length}` });
                        } catch (error) {
                            console.error(`Error updating child template ${childTemplate.fsPath}:`, error);
                        }
                    }
                }
                
                // Step 4: Update HTML/PHP instances of THIS template only
                if (instances.length > 0) {
                    console.log(`Found ${instances.length} instances to update`);

                // Check for cancellation
                if (token.isCancellationRequested) {
                    isProtectionEnabled = originalProtectionState;
                    return;
                }

                progress.report({ increment: 10, message: "Preparing instance files for update..." });

                // Close all open editors for instance files to avoid conflicts
                console.log('Closing open editors for instance files...');
                for (const instanceUri of instances) {
                    const openEditor = vscode.window.visibleTextEditors.find(
                        editor => editor.document.uri.fsPath === instanceUri.fsPath
                    );
                    if (openEditor) {
                        console.log(`Found open editor for: ${instanceUri.fsPath}`);
                        // Save any unsaved changes first
                        if (openEditor.document.isDirty) {
                            console.log(`Saving unsaved changes for: ${instanceUri.fsPath}`);
                            await openEditor.document.save();
                        }
                    }
                }
                
                // Clear document snapshots to avoid conflicts
                documentSnapshots.clear();
                
                // Check for cancellation
                if (token.isCancellationRequested) {
                    isProtectionEnabled = originalProtectionState;
                    return;
                }
                
                // Update HTML files
                console.log('Starting instance file updates...');
                progress.report({ increment: 10, message: `Updating ${instances.length} file(s)...` });
                
                // Process sequentially so 'Apply to All' affects the whole run
                applyToAllForRun = false; // reset
                previewModeForRun = false; // reset
                cancelRunForRun = false; // reset
                const results: MergeResult[] = [];
                    for (let i = 0; i < instances.length; i++) {
                    if (token.isCancellationRequested) {
                        results.push({ status: 'cancelled' });
                        break;
                    }
                    const instanceUri = instances[i];
                    if (cancelRunForRun) {
                        results.push({ status: 'cancelled' });
                        break;
                    }
                        const result = await updateHtmlLikeDreamweaver(instanceUri, templateUri.fsPath, shouldSyncCodeOutsideLock ? {
                            templateCodeOutsideHTMLIsLocked: templateLockStateForInstances,
                            removeTemplateInfoFromInstance: true
                        } : {});
                    if (cancelRunForRun) {
                        results.push(result);
                        break;
                    }
                    results.push(result);
                    progress.report({ increment: 25 / instances.length, message: `Preserved content in ${i + 1}/${instances.length}` });
                }
                
                // Check if operation was cancelled
                if (token.isCancellationRequested) {
                    isProtectionEnabled = originalProtectionState;
                    vscode.window.showWarningMessage('Template update was cancelled.');
                    return;
                }
                
                // Determine success/failure counts
                const successCount = results.filter(r => r.status === 'updated' || r.status === 'unchanged').length;
                const safetyFailCount = results.filter(r => r.status === 'safetyFailed').length;
                const errorCount = results.filter(r => r.status === 'error').length;
                const skippedCount = results.filter(r => r.status === 'skipped').length;
                const totalProcessed = results.length;
                // (processSafetyCheckPass removed) Always show final completion popup later regardless
                
                let message = `Updated ${successCount} HTML file(s) while preserving editable content`;
                if (childTemplates.length > 0) {
                    message += ` and ${childTemplates.length} child template(s)`;
                }
                message += ` based on template ${path.basename(templateUri.fsPath)}`;
                
                if (cancelRunForRun) {
                    vscode.window.showWarningMessage('Template update was cancelled. Some files may not be updated.');
                } else {
                    // Show summary only if all safety checks passed OR there were updates; final failed safety popup handled below
                    vscode.window.showInformationMessage(`${message} (Safety failures: ${safetyFailCount}, Errors: ${errorCount}, Skipped: ${skippedCount})`);
                }
            } else {
                // Only child templates were updated
                if (childTemplates.length > 0) {
                    vscode.window.showInformationMessage(
                        `Updated ${childTemplates.length} child template(s) based on template ${path.basename(templateUri.fsPath)}`
                    );
                }
            }
            
            // Re-enable protection
            isProtectionEnabled = originalProtectionState;
            
            // Refresh decorations for any open editors
            if (vscode.window.activeTextEditor) {
                updateDecorations(vscode.window.activeTextEditor);
            }
            
            // Always show final completion popup
            if (!cancelRunForRun) {
                // Single-button completion notice (no Cancel)
                await vscode.window.showInformationMessage('The process of "Updating HTML Files Based on Template" is complete.', { modal: true });
            }
            if (cancelRunForRun) logProcessCompletion('updateHtmlBasedOnTemplate:cancelled', 2); else logProcessCompletion('updateHtmlBasedOnTemplate');
            completionLogged = true;
        } catch (error) {
            console.error('Error during template update:', error);
            vscode.window.showErrorMessage(`Template update failed: ${error instanceof Error ? error.message : String(error)}`);
            logProcessCompletion('updateHtmlBasedOnTemplate', 1);
            completionLogged = true;
        } finally {
            if (completionLogged) {
                cleanupTempDirectory();
            }
        }
    });
    }

    function setupTemplateWatcher(): void {
        if (templateWatcher) {
            templateWatcher.dispose();
        }

        // Watch for changes to .dwt files
        templateWatcher = vscode.workspace.createFileSystemWatcher('**/*.dwt');
        
        templateWatcher.onDidChange(async (uri) => {
            // Remove auto-sync - only sync when explicitly requested via right-click command
            vscode.window.showInformationMessage(
                `Template updated: ${path.basename(uri.fsPath)}. Right-click and select "Update HTML Based on Template" to update instances.`
            );
        });
        
        templateWatcher.onDidCreate(async (uri) => {
            vscode.window.showInformationMessage(
                `New Dreamweaver template created: ${path.basename(uri.fsPath)}`
            );
        });
    }

    const changeListener = vscode.workspace.onDidChangeTextDocument(async event => {
        if (isProcessingUndo || isRestoringContent) return;

        const editor = vscode.window.activeTextEditor;
        if (editor && event.document === editor.document && isProtectionEnabled) {
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
                    await restoreFromSnapshot(editor);
                    vscode.window.showWarningMessage('You cannot edit protected regions in Dreamweaver templates.');
                    break;
                }
            }

            // Update snapshot after processing changes
            if (shouldProtectFromEditing(editor.document)) {
                saveDocumentSnapshot(editor.document);
            }
        }
    });

    const editorChangeListener = vscode.window.onDidChangeActiveTextEditor(editor => {
        updateDecorations(editor);
        if (editor && shouldProtectFromEditing(editor.document)) {
            saveDocumentSnapshot(editor.document);
        }
    });

    const documentOpenListener = vscode.workspace.onDidOpenTextDocument(document => {
        if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document === document) {
            updateDecorations(vscode.window.activeTextEditor);
            if (shouldProtectFromEditing(document)) {
                saveDocumentSnapshot(document);
            }
        }
    });

    const showEditableRegionsCommand = vscode.commands.registerCommand('dreamweaverTemplate.showEditableRegions', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor && (isDreamweaverTemplate(editor.document) || isDreamweaverTemplateFile(editor.document))) {
            showEditableRegionsList(editor.document);
        } else {
            vscode.window.showInformationMessage('This command only works in Dreamweaver template files.');
        }
    });

    const toggleProtectionCommand = vscode.commands.registerCommand('dreamweaverTemplate.toggleProtection', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor && (isDreamweaverTemplate(editor.document) || isDreamweaverTemplateFile(editor.document))) {
            isProtectionEnabled = !isProtectionEnabled;
            vscode.window.showInformationMessage(
                `Dreamweaver template protection ${isProtectionEnabled ? 'enabled' : 'disabled'}.`
            );
            updateDecorations(editor);
        }
    });

    const syncTemplateCommand = vscode.commands.registerCommand('dreamweaverTemplate.syncTemplate', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor. Open a .dwt template file.');
            logProcessCompletion('syncTemplate:no-editor', 3);
            return;
        }
        if (!ensureWorkspaceContext(editor.document.uri)) return;
        if (editor.document.fileName.toLowerCase().endsWith('.dwt')) {
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

    const restoreBackupCommand = vscode.commands.registerCommand('dreamweaverTemplate.restoreBackup', async () => {
        // Check if backup info exists first
        if (!lastBackupInfo) {
            vscode.window.showErrorMessage('No backup information found. Cannot restore files.');
            logProcessCompletion('restoreBackup:no-backup', 1);
            return;
        }
        if (!ensureWorkspaceContext()) return;
        
        // Show confirmation dialog with template name
        const templateName = lastBackupInfo.templateName;
        const fileCount = lastBackupInfo.instances.length;
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

    const findInstancesCommand = vscode.commands.registerCommand('dreamweaverTemplate.findInstances', async () => {
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

    // Helper function to find repeat block containing cursor position
    function findRepeatBlockAtCursor(document: vscode.TextDocument, position: vscode.Position): { repeatName: string; firstEntry: string; entryStart: number; entryEnd: number } | null {
        const text = document.getText();
        const cursorOffset = document.offsetAt(position);
        
        // Find all repeat blocks in document
        const repeatBlockRegex = /<!--\s*InstanceBeginRepeat\s+name="([^"]+)"\s*-->([\s\S]*?)<!--\s*InstanceEndRepeat\s*-->/g;
        let repeatMatch;
        
        while ((repeatMatch = repeatBlockRegex.exec(text)) !== null) {
            const repeatName = repeatMatch[1];
            const repeatContent = repeatMatch[2];
            const repeatStart = repeatMatch.index;
            const repeatEnd = repeatStart + repeatMatch[0].length;
            
            // Check if cursor is within this repeat block
            if (cursorOffset >= repeatStart && cursorOffset <= repeatEnd) {
                // Find all repeat entries within this block
                const entryRegex = /<!--\s*InstanceBeginRepeatEntry\s*-->([\s\S]*?)<!--\s*InstanceEndRepeatEntry\s*-->/g;
                let entryMatch;
                let firstEntryContent = '';
                
                while ((entryMatch = entryRegex.exec(repeatContent)) !== null) {
                    const entryStart = repeatStart + repeatMatch[0].indexOf(repeatContent) + entryMatch.index;
                    const entryEnd = entryStart + entryMatch[0].length;
                    
                    // Check if cursor is within a repeat entry
                    if (cursorOffset >= entryStart && cursorOffset <= entryEnd) {
                        // Capture first entry content if not already captured
                        if (!firstEntryContent) {
                            firstEntryContent = entryMatch[0]; // Include the full entry with markers
                        }
                        
                        return {
                            repeatName,
                            firstEntry: firstEntryContent,
                            entryStart,
                            entryEnd
                        };
                    }
                }
            }
        }
        
        return null;
    }

    // Normalize alternating row colors for a repeat if template defines ternary bgcolor pattern
    async function normalizeRepeatColorsIfNeeded(document: vscode.TextDocument, repeatName: string): Promise<void> {
        try {
            const full = document.getText();
            const instBegin = /<!--\s*InstanceBegin\s+template="([^"]+)"[^>]*-->/i.exec(full);
            if (!instBegin) return;
            const templateRel = instBegin[1];
            const ws = vscode.workspace.workspaceFolders?.[0];
            if (!ws) return;
            const templateFsPath = path.join(ws.uri.fsPath, templateRel.replace(/^\//, ''));
            if (!fs.existsSync(templateFsPath)) return;
            const templateText = fs.readFileSync(templateFsPath, 'utf8');
            const repeatBlockRe = new RegExp(`<!--\\s*TemplateBeginRepeat\\s+name=\"${repeatName.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\$&')}\"\\s*-->[\\s\\S]*?<!--\\s*TemplateEndRepeat\\s*-->`,'i');
            const tmplRepeat = repeatBlockRe.exec(templateText);
            if (!tmplRepeat) return;
            const ternaryRe = /<tr[^>]*\sbgcolor="@@\(_index\s*&\s*1\s*\?\s*'([^']+)'\s*:\s*'([^']+)'\)@@"[^>]*>/i;
            const ternaryMatch = ternaryRe.exec(tmplRepeat[0]);
            if (!ternaryMatch) return;
            const colorA = ternaryMatch[1];
            const colorB = ternaryMatch[2];
            const instRepeatRe = new RegExp(`(<!--\\s*InstanceBeginRepeat\\s+name=\"${repeatName.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\$&')}\"\\s*-->)([\\s\\S]*?)(<!--\\s*InstanceEndRepeat\\s*-->)`,'i');
            const instMatch = instRepeatRe.exec(full);
            if (!instMatch) return;
            const before = full.slice(0, instMatch.index);
            const middle = instMatch[2];
            const after = full.slice(instMatch.index + instMatch[0].length);
            const entryRe = /(<!--\s*InstanceBeginRepeatEntry\s*-->)([\s\S]*?)(<!--\s*InstanceEndRepeatEntry\s*-->)/g;
            let em: RegExpExecArray | null;
            let rebuiltEntries = '';
            let idx = 0;
            while ((em = entryRe.exec(middle)) !== null) {
                const entryFull = em[0];
                // Replace first <tr ... bgcolor="#XXXXXX" ...> inside entry
                const desired = (idx & 1) ? colorA : colorB; // pattern colorA used when index is odd per (_index & 1 ? colorA : colorB)
                const swapped = entryFull.replace(/(<tr[^>]*\sbgcolor=")(#?[A-Fa-f0-9]{3,6})("[^>]*>)/, (full, p1, _old, p3) => {
                    return `${p1}${desired}${p3}`;
                });
                rebuiltEntries += swapped;
                idx++;
            }
            if (!rebuiltEntries) return;
            const newBlock = instMatch[1] + rebuiltEntries + instMatch[3];
            const updated = before + newBlock + after;
            if (updated !== full) {
                const edit = new vscode.WorkspaceEdit();
                edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(full.length)), updated);
                await vscode.workspace.applyEdit(edit);
                outputChannel.appendLine(`[REPEAT-ALT] Normalized alternating bg colors for repeat "${repeatName}" (${colorA}/${colorB}).`);
            }
        } catch (e) {
            console.warn('normalizeRepeatColorsIfNeeded failed:', e);
        }
    }

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
    setupTemplateWatcher();

    if (vscode.window.activeTextEditor) {
        updateDecorations(vscode.window.activeTextEditor);
        if (shouldProtectFromEditing(vscode.window.activeTextEditor.document)) {
            saveDocumentSnapshot(vscode.window.activeTextEditor.document);
        }
    }

    // Protection toggle commands
    const turnOffProtectionCommand = vscode.commands.registerCommand('dreamweaverTemplate.turnOffProtection', () => {
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

    const turnOnProtectionCommand = vscode.commands.registerCommand('dreamweaverTemplate.turnOnProtection', () => {
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

    // Create New Page from Template command
    const createPageFromTemplateCommand = vscode.commands.registerCommand('dreamweaverTemplate.createPageFromTemplate', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || !editor.document.fileName.toLowerCase().endsWith('.dwt')) {
            vscode.window.showWarningMessage('Open a .dwt template to create a page.');
            return;
        }
        const templatePath = editor.document.uri.fsPath;
        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        if (!wsFolder) {
            vscode.window.showErrorMessage('Workspace folder required.');
            return;
        }
        // Determine site root dynamically: assume .dwt is inside a "Templates" folder that sits under site root
        const templateDir = path.dirname(templatePath);
        const basename = path.basename(templateDir).toLowerCase();
        let siteRoot: string;
        if (basename === 'templates') {
            siteRoot = path.dirname(templateDir);
        } else {
            // Fallback: search upward for a Templates folder sibling containing this template (unlikely path)
            let current = templateDir;
            let found: string | undefined;
            for (let i=0;i<6;i++) { // limit ascent to avoid runaway
                const candidate = path.join(current, 'Templates');
                if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
                    if (fs.existsSync(path.join(candidate, path.basename(templatePath)))) {
                        found = current;
                        break;
                    }
                }
                const parent = path.dirname(current);
                if (parent === current) break;
                current = parent;
            }
            if (found) {
                siteRoot = found;
            } else {
                vscode.window.showErrorMessage('Unable to determine site root (expected template in a "Templates" folder).');
                return;
            }
        }

        // Build folder tree structure
        interface FolderNode { name: string; fullPath: string; children: FolderNode[]; }
        function readFolders(dir: string): FolderNode {
            const node: FolderNode = { name: path.basename(dir), fullPath: dir, children: [] };
            try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const e of entries) {
                    if (e.isDirectory()) {
                        const fullChild = path.join(dir, e.name);
                        const lower = e.name.toLowerCase();
                        // Skip Templates root itself for destination + skip internal metadata folders
                        if (lower === 'templates' && fullChild === path.join(siteRoot, 'Templates')) continue;
                        if (lower.startsWith('.dwt-template') || lower.startsWith('.dwt-site-template')) continue;
                        node.children.push(readFolders(fullChild));
                    }
                }
                node.children.sort((a,b)=> a.name.localeCompare(b.name));
            } catch {}
            return node;
        }
        const tree = readFolders(siteRoot);

        // Serialize tree to send to webview
        function flatten(node: FolderNode, depth = 0): any[] {
            const rel = path.relative(siteRoot, node.fullPath).replace(/\\/g,'/');
            // Root node should display actual site root folder name (request)
            const rootName = path.basename(siteRoot);
            const display = (depth===0? rootName : node.name);
            const arr = [{ name: node.name, display, fullPath: node.fullPath, rel: rel || '.', depth, children: node.children.length>0 }];
            for (const c of node.children) arr.push(...flatten(c, depth+1));
            return arr;
        }
        const flat = flatten(tree);

        // Create panel
        const panel = vscode.window.createWebviewPanel(
            'createPageFromTemplate',
            'Create New Page from Template',
            vscode.ViewColumn.Active,
            { enableScripts: true }
        );

        const nonce = Date.now().toString();
        panel.webview.html = getCreatePageHtml(flat, nonce);

        panel.webview.onDidReceiveMessage(async msg => {
            if (msg.type === 'validateName') {
                const targetPath = path.join(siteRoot, msg.relPath === '.' ? '' : msg.relPath, msg.fileName + (msg.ext === 'php'? '.php': '.html'));
                const exists = fs.existsSync(targetPath);
                panel.webview.postMessage({ type: 'validationResult', exists });
            } else if (msg.type === 'save') {
                const relPath: string = msg.relPath; // '.' or relative folder
                const fileBase: string = msg.fileName || 'untitled';
                const ext: string = msg.ext === 'php' ? 'php' : 'html';
                const targetPath = path.join(siteRoot, relPath === '.' ? '' : relPath, `${fileBase}.${ext}`);
                if (fs.existsSync(targetPath) && !msg.overwrite) {
                    // Request overwrite confirmation
                    const choice = await vscode.window.showWarningMessage(`The file "${path.relative(siteRoot, targetPath)}" already exists. Overwrite?`, 'Yes', 'No', 'Cancel');
                    if (choice === 'Yes') {
                        await writeNewInstance(targetPath, templatePath, ext);
                        panel.dispose();
                    } else if (choice === 'No') {
                        panel.webview.postMessage({ type: 'overwriteDenied' });
                    } else {
                        panel.dispose();
                    }
                } else {
                    await writeNewInstance(targetPath, templatePath, ext);
                    panel.dispose();
                }
            } else if (msg.type === 'cancel') {
                panel.dispose();
            }
        });

        async function writeNewInstance(targetPath: string, templatePath: string, ext: string) {
            try {
                let output = fs.readFileSync(templatePath, 'utf8'); // start as raw copy (duplicate template)

                // Determine lock flag from template (default true)
                const info = /<!--\s*TemplateInfo\s+codeOutsideHTMLIsLocked="(true|false)"\s*-->/i.exec(output);
                const lockFlag = info ? info[1].toLowerCase() : 'true';

                // Insert InstanceBegin after <html...> preserving original <html> tag exactly once.
                // Remove only the existing template header (do NOT remove InstanceBeginEditable / Repeat markers)
                output = output.replace(/<!--\s*InstanceBegin\s+template="[^"]+"[^>]*-->/i, '');
                // Mark placeholder CHANGE first, then replace with final lockFlag after confirm.
                output = output.replace(/(<html[^>]*>)/i, (m)=> `${m}<!-- InstanceBegin template="/Templates/${path.basename(templatePath)}" codeOutsideHTMLIsLocked="CHANGE" -->`);

                // Convert TemplateBeginEditable/TemplateEndEditable to Instance equivalents (keep region names/content)
                output = output.replace(/<!--\s*TemplateBeginEditable/g, '<!-- InstanceBeginEditable');
                output = output.replace(/TemplateEndEditable/g, 'InstanceEndEditable');

                // Convert Template repeat related markers
                output = output.replace(/<!--\s*TemplateBeginRepeat/g, '<!-- InstanceBeginRepeat');
                output = output.replace(/TemplateEndRepeat/g, 'InstanceEndRepeat');
                output = output.replace(/TemplateBeginRepeatEntry/g, 'InstanceBeginRepeatEntry');
                output = output.replace(/TemplateEndRepeatEntry/g, 'InstanceEndRepeatEntry');

                // Finally convert any other TemplateBegin/TemplateEnd (safety) AFTER specific ones handled
                output = output.replace(/<!--\s*TemplateBegin/g, '<!-- InstanceBegin');
                output = output.replace(/TemplateEnd/g, 'InstanceEnd');

                // Remove TemplateInfo line entirely from instance file
                output = output.replace(/<!--\s*TemplateInfo\s+codeOutsideHTMLIsLocked="(true|false)"\s*-->/ig, '');

                // Replace CHANGE with proper lock flag validation (only true/false accepted)
                const finalLock = (lockFlag === 'true' || lockFlag === 'false') ? lockFlag : 'true';
                output = output.replace(/codeOutsideHTMLIsLocked="CHANGE"/, `codeOutsideHTMLIsLocked="${finalLock}"`);

                // Ensure single InstanceEnd before </html>
                output = output.replace(/<!--\s*InstanceEnd\s*-->/ig, '');
                output = output.replace(/(<\/html>)/i, '<!-- InstanceEnd -->$1');

                // Balance check: remove stray InstanceEndEditable without matching begin (simple stack)
                const tokenRe = /<!--\s*Instance(BeginEditable|EndEditable)[^>]*-->/g;
                let match: RegExpExecArray | null; let balance = 0; const removals: {start:number;end:number}[] = [];
                while ((match = tokenRe.exec(output)) !== null) {
                    const isBegin = /BeginEditable/i.test(match[0]);
                    if (isBegin) balance++; else { if (balance === 0) removals.push({start:match.index,end:match.index+match[0].length}); else balance--; }
                }
                if (removals.length) {
                    removals.sort((a,b)=>b.start-a.start).forEach(r=>{ output = output.slice(0,r.start)+output.slice(r.end); });
                }
                // Change extension-specific things (none currently) - placeholder
                const dir = path.dirname(targetPath);
                fs.mkdirSync(dir, { recursive: true });
                // Ensure any TemplateEndRepeat left is converted properly with entry markers (defensive)
                output = output.replace(/<!--\s*TemplateEndRepeat\s*-->/gi, '<!-- InstanceEndRepeatEntry --><!-- InstanceEndRepeat -->');
                fs.writeFileSync(targetPath, output, 'utf8');
                const rel = path.relative(siteRoot, targetPath).replace(/\\/g,'/');
                vscode.window.showInformationMessage(`Created new page: ${rel}`);
                const doc = await vscode.workspace.openTextDocument(targetPath);
                await vscode.window.showTextDocument(doc);
                logProcessCompletion('createPageFromTemplate');
            } catch (e:any) {
                vscode.window.showErrorMessage(`Failed to create page: ${e.message || e}`);
                logProcessCompletion('createPageFromTemplate', 1);
            }
        }

                function getCreatePageHtml(flatFolders: any[], nonce: string): string {
                        // Build a hierarchical map for dynamic expand/collapse in client
                        const json = JSON.stringify(flatFolders);
                        return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Create Page</title>
<style>
body { font-family: Consolas, monospace; padding:12px; }
fieldset { border:1px solid #888; margin-bottom:12px; }
legend { font-weight:bold; }
.row { margin:8px 0; }
label { display:inline-block; min-width:100px; }
input[type=text] { width:260px; }
.ext-toggle span { cursor:pointer; padding:4px 10px; border:1px solid #666; margin-right:4px; }
.ext-toggle span.active { background:#004; color:#fff; }
.folder-container { border:1px solid #666; height:240px; overflow:auto; padding:4px; background:#111; color:#ccc; font-size:13px; }
.folder { cursor:pointer; user-select:none; white-space:nowrap; }
.folder.selected { background:#333; color:#fff; }
.buttons { text-align:center; margin-top:16px; }
button { width:140px; padding:6px 0; margin:0 12px; font-weight:bold; }
button#saveBtn { background:#0a0; color:#fff; border:1px solid #050; }
button#cancelBtn { background:#555; color:#fff; border:1px solid #333; }
.exist-warning { color:#f80; font-size:12px; height:16px; }
.twisty { display:inline-block; width:14px; }
.collapsed > .children { display:none; }
.children { margin-left:16px; }
</style></head><body>
<div class="row"><strong>Create New Page from Template</strong></div>
<div class="row ext-toggle" id="extToggle" role="radiogroup" aria-label="File Extension">
  <span data-ext="html" class="active" role="radio" aria-checked="true">html</span>
  <span data-ext="php" role="radio" aria-checked="false">php</span>
</div>
<div class="row"><label>File Name:</label><input id="fileName" type="text" value="untitled" /> <span>. <span id="extLabel">html</span></span></div>
<div class="exist-warning" id="existWarn"></div>
<div class="row"><label style="vertical-align:top;">Save to Folder:</label>
    <div class="folder-container" id="folderContainer"></div>
</div>
<div class="buttons"><button id="saveBtn">Save</button><button id="cancelBtn">Cancel</button></div>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
let currentExt = 'html';
let selectedRel = '.';
const flat = ${json};

// Build tree (flat contains ordered depth info). We'll reconstruct parent-child by path depth.
const byRel = new Map(flat.map(f => [f.rel, f]));
function relDepth(rel){ return rel === '.' ? 0 : rel.split('/').length; }
function childrenOf(rel){
    return flat.filter(f => f.rel !== rel && (rel === '.' ? !f.rel.includes('/') : f.rel.startsWith(rel + '/')) && relDepth(f.rel) === relDepth(rel)+1);
}

function buildNode(rel){
    const data = byRel.get(rel);
    if (!data) return '';
    const kids = childrenOf(rel);
    const hasChildren = kids.length>0;
    const label = data.display;
    let html = '<div class="folder collapsed" data-rel="'+data.rel+'">';
    html += '<div class="line"><span class="twisty">'+(hasChildren ? '▶' : '')+'</span> <span class="name">'+label+'</span></div>';
    html += '<div class="children">'+kids.map(c=>buildNode(c.rel)).join('')+'</div>';
    html += '</div>';
    return html;
}
document.getElementById('folderContainer').innerHTML = buildNode('.');

document.querySelectorAll('#extToggle span').forEach(span=>{
  span.addEventListener('click', () => {
    if (span.dataset.ext === currentExt) return; // toggle like radio
    currentExt = span.dataset.ext;
    document.querySelectorAll('#extToggle span').forEach(s=>{ s.classList.remove('active'); s.setAttribute('aria-checked','false'); });
    span.classList.add('active'); span.setAttribute('aria-checked','true');
    document.getElementById('extLabel').textContent = currentExt;
    validate();
  });
});
document.getElementById('folderContainer').addEventListener('click', (e)=>{
    const line = e.target.closest('.line');
    if (!line) return;
    const folder = line.parentElement;
    if (!folder) return;
    // Toggle collapse if has children
    if (folder.querySelector('.children') && folder.querySelector('.children').children.length) {
        folder.classList.toggle('collapsed');
        const twisty = folder.querySelector('.twisty');
        if (twisty) twisty.textContent = folder.classList.contains('collapsed') ? '▶' : '▼';
    }
    document.querySelectorAll('.folder').forEach(f=>f.classList.remove('selected'));
    folder.classList.add('selected');
    selectedRel = folder.getAttribute('data-rel');
    validate();
});
function validate(){
  const fileName = (document.getElementById('fileName').value||'').trim();
  if (!fileName) { setWarn('Enter a file name.'); return; }
  vscode.postMessage({ type:'validateName', fileName, relPath: selectedRel, ext: currentExt });
}
function setWarn(msg){ document.getElementById('existWarn').textContent = msg||''; }
document.getElementById('fileName').addEventListener('input', validate);
document.getElementById('saveBtn').addEventListener('click', ()=>{
  const fileName = (document.getElementById('fileName').value||'').trim();
  if (!fileName) { setWarn('Enter a file name.'); return; }
  vscode.postMessage({ type:'save', fileName, relPath: selectedRel, ext: currentExt });
});
document.getElementById('cancelBtn').addEventListener('click', ()=> vscode.postMessage({ type:'cancel' }));
window.addEventListener('message', event => {
  const msg = event.data;
  if (msg.type === 'validationResult') {
    setWarn(msg.exists ? 'File exists (will ask to overwrite on Save).' : '');
  } else if (msg.type === 'overwriteDenied') {
    setWarn('Choose a different name or folder.');
  }
});
validate();
</script></body></html>`;
        }
    });

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
            const currentParams = getInstanceParameters(editor.document);
            
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
                    setInstanceParameters(editor.document, msg.parameters);
                    
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
            const instanceParams = getInstanceParameters(editor.document);
            
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
        nonEditableDecorationType, editableDecorationType, optionalRegionDecorationType
    );

    if (templateWatcher) {
        context.subscriptions.push(templateWatcher);
    }
}

export function deactivate() {
    console.log('Dreamweaver Template Protection deactivated');
}
