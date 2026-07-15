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

  // Only treat Editable markers as defining editable ranges. Repeat markers are containers, not editable by themselves.
  const beginEditable = /<!--\s*(?:InstanceBeginEditable|TemplateBeginEditable)\s+name="[^"]+"\s*-->/gi;
  const endEditable = /<!--\s*(?:InstanceEndEditable|TemplateEndEditable)\s*-->/gi;

  // Collect all markers with type and index
  type Marker = { type: 'begin' | 'end'; index: number; length: number };
  const markers: Marker[] = [];
  let m: RegExpExecArray | null;
  while ((m = beginEditable.exec(text)) !== null) {
    markers.push({ type: 'begin', index: m.index, length: m[0].length });
  }
  while ((m = endEditable.exec(text)) !== null) {
    markers.push({ type: 'end', index: m.index, length: m[0].length });
  }
  // Sort by position to process in order
  markers.sort((a, b) => a.index - b.index);

  const stack: Marker[] = [];
  for (const mk of markers) {
    if (mk.type === 'begin') {
      stack.push(mk);
    } else {
      // Find the last unmatched begin before this end
      const begin = stack.pop();
      if (!begin) continue;
      const startPos = getPositionAt(text, begin.index + begin.length);
      const endPos = getPositionAt(text, mk.index);
      if (endPos.isAfterOrEqual(startPos)) {
        ranges.push(new vscode.Range(startPos, endPos));
      }
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
    // If it's an instance file without any editable ranges, protect everything
    return isDreamweaverTemplate(document) ? [
      new vscode.Range(new vscode.Position(0,0), getPositionAt(text, text.length))
    ] : [];
  }

  const protectedRanges: vscode.Range[] = [];
  // Normalize and sort editable ranges
  const sorted = [...editableRanges].sort((a, b) => a.start.isBefore(b.start) ? -1 : a.start.isAfter(b.start) ? 1 : 0);
  // Merge overlapping editable ranges just in case
  const merged: vscode.Range[] = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (!last) { merged.push(r); continue; }
    if (r.start.isBeforeOrEqual(last.end)) {
      // extend
      const end = r.end.isAfter(last.end) ? r.end : last.end;
      merged[merged.length - 1] = new vscode.Range(last.start, end);
    } else {
      merged.push(r);
    }
  }

  let cursor = new vscode.Position(0, 0);
  for (const er of merged) {
    if (er.start.isAfter(cursor)) {
        const prot = new vscode.Range(cursor, er.start);
        if (!prot.isEmpty) protectedRanges.push(prot);
    }
    cursor = er.end;
  }
  const docEnd = getPositionAt(text, text.length);
  if (docEnd.isAfter(cursor)) {
    const tail = new vscode.Range(cursor, docEnd);
    if (!tail.isEmpty) protectedRanges.push(tail);
  }

  return protectedRanges;
}
