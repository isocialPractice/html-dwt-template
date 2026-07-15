// features/update/paramState
// In-memory store for InstanceParameters keyed by document URI.

import * as vscode from 'vscode';
import { InstanceParameters } from './params';
import { updateDecorations } from '../protect/decorations';

const instanceParametersStore = new Map<string, InstanceParameters>();

export function buildInstanceParameterState(instanceUri: vscode.Uri, instanceContent: string, templateParams: { name: string; value: string }[], parseInstanceParameters: (s: string) => InstanceParameters): InstanceParameters {
  const merged: InstanceParameters = {};
  for (const p of templateParams) {
    merged[p.name] = p.value;
  }
  const stored = instanceParametersStore.get(instanceUri.toString());
  if (stored) {
    for (const [n, v] of Object.entries(stored)) {
      merged[n] = v;
    }
  }
  const docParams = parseInstanceParameters(instanceContent);
  for (const [n, v] of Object.entries(docParams)) {
    merged[n] = v;
  }
  return merged;
}

export function getInstanceParameters(document: vscode.TextDocument, parseInstanceParameters: (s: string) => InstanceParameters): InstanceParameters {
  const uri = document.uri.toString();
  const fromStore = instanceParametersStore.get(uri) || {};
  const fromDoc = parseInstanceParameters(document.getText());
  return { ...fromStore, ...fromDoc };
}

export function setInstanceParameters(document: vscode.TextDocument, parameters: InstanceParameters): void {
  const uri = document.uri.toString();
  instanceParametersStore.set(uri, parameters);
  const editor = vscode.window.activeTextEditor;
  if (editor && editor.document === document) {
    updateDecorations(editor);
  }
}

export function setInstanceParametersForUri(uri: vscode.Uri, parameters: InstanceParameters): void {
  instanceParametersStore.set(uri.toString(), parameters);
}

export function getInstanceParametersForUri(uri: vscode.Uri): InstanceParameters | undefined {
  return instanceParametersStore.get(uri.toString());
}
