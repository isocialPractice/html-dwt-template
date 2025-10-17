// templateDetection
// Detects Dreamweaver template files and distinguishes instances.

import * as vscode from 'vscode';
import { isTemplateFilePath } from './templatePaths';

const DREAMWEAVER_COMMENT_REGEX = /<!--\s*(?:InstanceBeginEditable|TemplateBeginEditable|InstanceEndEditable|TemplateEndEditable|#BeginTemplate)/;
const CSP_COMMENT_REGEX = /;\s*--------------- (?:CAN BE EDITED|SHOULD NOT BE EDITED) -----------------/;

export function isDreamweaverTemplate(document: vscode.TextDocument): boolean {
    const text = document.getText();
    return DREAMWEAVER_COMMENT_REGEX.test(text) || CSP_COMMENT_REGEX.test(text);
}

export function isDreamweaverTemplateFile(document: vscode.TextDocument): boolean {
    return isTemplateFilePath(document.fileName);
}