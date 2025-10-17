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

const resolveNextIndex = (
    state: DiffNavigationState,
    direction: 'next' | 'previous',
    indexOverride?: number
): number => {
    if (state.ranges.length === 0) {
        return -1;
    }

    if (typeof indexOverride === 'number') {
        return clampIndex(indexOverride, state.ranges.length);
    }

    if (state.currentIndex === -1) {
        return direction === 'next' ? 0 : state.ranges.length - 1;
    }

    const delta = direction === 'next' ? 1 : -1;
    return clampIndex(state.currentIndex + delta, state.ranges.length);
};

export const createDiffCommands = (
    navigateToEntry: (state: DiffNavigationState, index: number) => Promise<void> = focusDiffEntry
) => {
    const registerCommands: CommandDisposer = (context) => {
    const commandDisposables: vscode.Disposable[] = [
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

                const nextIndex = resolveNextIndex(state, direction, indexOverride);

                if (nextIndex === -1) {
                    return;
                }

                state.currentIndex = nextIndex;
                diffNavigationStates.set(instancePath, state);

                await navigateToEntry(state, nextIndex);
            })
        ];

    context.subscriptions.push(...commandDisposables);
    };

    return { registerCommands } satisfies DiffCommandsApi;
};