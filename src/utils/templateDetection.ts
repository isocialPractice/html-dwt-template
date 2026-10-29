// templateDetection
// TextDocument wrappers over the engine's template detection.

import * as vscode from 'vscode';
import { hasTemplateMarkers, isTemplateFilePath, isTemplateInstanceText } from '@isocialpractice/html-dwt-cmd-template';

/** The document holds editable-region markers: a template or a file based on one. */
export function usesTemplateMarkers(document: vscode.TextDocument): boolean {
  return hasTemplateMarkers(document.getText());
}

/** The document is a template file in a Templates folder (master or child). */
export function isTemplateFileDocument(document: vscode.TextDocument): boolean {
  return isTemplateFilePath(document.fileName);
}

/** A child template: a template that is itself based on another template. */
export function isChildTemplateDocument(document: vscode.TextDocument): boolean {
  return isTemplateFileDocument(document) && isTemplateInstanceText(document.getText());
}

/** A master template: a template not based on any other template. Always fully editable. */
export function isMasterTemplateDocument(document: vscode.TextDocument): boolean {
  return isTemplateFileDocument(document) && !isTemplateInstanceText(document.getText());
}
