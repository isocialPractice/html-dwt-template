// virtualOriginalEmitter
// Emits events when virtual original documents need refresh or disposal.

import * as vscode from 'vscode';

export const virtualOriginalEmitter = new vscode.EventEmitter<vscode.Uri>();