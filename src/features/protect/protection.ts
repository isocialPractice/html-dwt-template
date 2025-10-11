// protection
// Encapsulates protection toggles, state, and protected range calculations.

import * as vscode from 'vscode';
import { getPositionAt } from '../../utils/textPosition';
import { isDreamweaverTemplate, isDreamweaverTemplateFile } from '../../utils/templateDetection';

let isProtectionEnabled = true;
let fileProtectionState = new Map<string, boolean>();

export function setGlobalProtection(enabled: boolean) {
    isProtectionEnabled = enabled;
}

export function getGlobalProtection(): boolean {
    return isProtectionEnabled;
}

export function getFileProtectionState(document: vscode.TextDocument): boolean {
    const uri = document.uri.toString();
    const fileState = fileProtectionState.get(uri);
    if (fileState !== undefined) {
        return fileState;
    }
    const config = vscode.workspace.getConfiguration('dreamweaverTemplate');
    return config.get('enableProtection', true);
}

export function setFileProtectionState(document: vscode.TextDocument, enabled: boolean): void {
    const uri = document.uri.toString();
    fileProtectionState.set(uri, enabled);
}

export function shouldProtectFromEditing(document: vscode.TextDocument): boolean {
    // Allow full editing of .dwt template files
    if (isDreamweaverTemplateFile(document)) {
        return false;
    }
    // Check file-specific protection state
    const fileProtectionEnabled = getFileProtectionState(document);
    // Protect instance files (.html with Dreamweaver comments) only if protection is enabled for this file
    return isProtectionEnabled && fileProtectionEnabled && isDreamweaverTemplate(document);
}

// Determine if a specific text change touches protected ranges
export function isProtectedRegionChange(
    change: vscode.TextDocumentContentChangeEvent,
    protectedRanges: vscode.Range[],
    _document: vscode.TextDocument
): boolean {
    const changeStart = change.range.start;
    const changeEnd = change.range.end;

    for (const protectedRange of protectedRanges) {
        if (protectedRange.contains(changeStart)) {
            return true;
        }
        if (protectedRange.contains(changeEnd)) {
            return true;
        }
        const changeRange = new vscode.Range(changeStart, changeEnd);
        const intersect = protectedRange.intersection(changeRange);
        if (intersect && !intersect.isEmpty) {
            return true;
        }
        if (change.rangeLength === 0 && change.text.length > 0) {
            if (protectedRange.start.isEqual(changeStart) || protectedRange.end.isEqual(changeStart)) {
                return true;
            }
        }
        if (change.text.length > 0) {
            const lines = change.text.split('\n');
            const changeEndAfterInsert = new vscode.Position(
                changeStart.line + (lines.length - 1),
                lines.length > 1 ? lines[lines.length - 1].length : changeStart.character + change.text.length
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

export function getEditableRanges(document: vscode.TextDocument): vscode.Range[] {
    const text = document.getText();
    const ranges: vscode.Range[] = [];
    const beginRegex = /<!--\s*(?:InstanceBeginEditable|TemplateBeginEditable|InstanceBeginRepeat)\s*name="[^"]+"\s*-->/g;
    const endRegex = /<!--\s*(?:InstanceEndEditable|TemplateEndEditable|InstanceEndRepeat)\s*-->/g;

    const beginMatches: { index: number; length: number }[] = [];
    let beginMatch: RegExpExecArray | null;
    while ((beginMatch = beginRegex.exec(text)) !== null) {
        beginMatches.push({ index: beginMatch.index, length: beginMatch[0].length });
    }

    const endMatches: { index: number }[] = [];
    let endMatch: RegExpExecArray | null;
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

export function getOptionalRegionRanges(document: vscode.TextDocument): vscode.Range[] {
    const text = document.getText();
    const ranges: vscode.Range[] = [];
    const instanceOptionalRegex = /<!--\s*InstanceBeginIf\s+cond="[^"]+"\s*-->[\s\S]*?<!--\s*InstanceEndIf\s*-->/g;

    let match: RegExpExecArray | null;
    while ((match = instanceOptionalRegex.exec(text)) !== null) {
        const startPos = getPositionAt(text, match.index);
        const endPos = getPositionAt(text, match.index + match[0].length);
        ranges.push(new vscode.Range(startPos, endPos));
    }

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

export function getProtectedRanges(document: vscode.TextDocument): vscode.Range[] {
    const text = document.getText();
    const editableRanges = getEditableRanges(document);

    if (!isDreamweaverTemplate(document) || editableRanges.length === 0) {
        return [];
    }

    const protectedRanges: vscode.Range[] = [];
    let lastPosition = new vscode.Position(0, 0);

    if (editableRanges.length > 0) {
        lastPosition = editableRanges[0].end;
    }

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
