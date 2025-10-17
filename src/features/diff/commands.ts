import * as vscode from 'vscode';

import { disposeDiffState } from './diffStateDisposal';
import { diffNavigationCache } from './diffNavigationCache';
import { focusDiffEntry } from './navigationActions';
import { diffNavigationStates } from './diffNavigationState';
import { DiffNavigationState } from './diffNavigationTypes';

type CommandDisposer = (context: vscode.ExtensionContext) => void;

export interface DiffCommandsApi {
    registerCommands: CommandDisposer;
}

export const createDiffCommands = (
    navigateToEntry: (state: DiffNavigationState, index: number) => Promise<void> = focusDiffEntry
) => {
    const registerCommands: CommandDisposer = (context) => {
        context.subscriptions.push(
            vscode.commands.registerCommand('dreamweaverTemplateProtection.resetDiffNavigation', () => {
                const active = vscode.window.activeTextEditor;
                if (!active) {
                    return;
                }
                const instancePath = active.document.uri.fsPath;
                diffNavigationCache.delete(instancePath);
                disposeDiffState(instancePath);
            }),
            vscode.commands.registerCommand('dreamweaverTemplateProtection.navigateDiff', async (direction: 'next' | 'previous', indexOverride?: number) => {
                const active = vscode.window.activeTextEditor;
                if (!active) {
                    return;
                }
                const instancePath = active.document.uri.fsPath;
                const state = diffNavigationStates.get(instancePath);
                if (!state) {
                    return;
                }
                const nextIndex = typeof indexOverride === 'number'
                    ? Math.max(0, Math.min(indexOverride, state.ranges.length - 1))
                    : direction === 'next'
                        ? Math.min(state.currentIndex + 1, state.ranges.length - 1)
                        : Math.max(state.currentIndex - 1, 0);
                await navigateToEntry(state, nextIndex);
            })
        );
    };

    return { registerCommands } satisfies DiffCommandsApi;
};