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

const clampIndex = (index: number, total: number): number => {
    if (total <= 0) {
        return -1;
    }

    const upperBound = total - 1;
    if (index < 0) {
        return 0;
    }
    if (index > upperBound) {
        return upperBound;
    }

    return index;
};

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
                let nextIndex: number;
                if (typeof indexOverride === 'number') {
                    nextIndex = clampIndex(indexOverride, state.ranges.length);
                } else if (state.currentIndex === -1) {
                    nextIndex = direction === 'next' ? 0 : state.ranges.length - 1;
                } else if (direction === 'next') {
                    nextIndex = clampIndex(state.currentIndex + 1, state.ranges.length);
                } else {
                    nextIndex = clampIndex(state.currentIndex - 1, state.ranges.length);
                }

                if (nextIndex === -1) {
                    return;
                }

                state.currentIndex = nextIndex;
                diffNavigationStates.set(instancePath, state);

                await navigateToEntry(state, nextIndex);
            })
        );
    };

    return { registerCommands } satisfies DiffCommandsApi;
};