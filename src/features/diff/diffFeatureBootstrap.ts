// diffFeatureBootstrap
// Wires diff navigation services into the VS Code extension lifecycle.

import * as vscode from 'vscode';

import { registerVirtualOriginalProvider } from '../virtualOriginalProvider';
import { virtualOriginalEmitter } from '../virtualOriginalEmitter';

export const initializeDiffFeature = (context: vscode.ExtensionContext): void => {
    registerVirtualOriginalProvider(context);
    context.subscriptions.push(virtualOriginalEmitter);
};