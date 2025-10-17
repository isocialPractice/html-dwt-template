// commands
// Registers diff navigation commands for Dreamweaver template diffs.

import * as vscode from 'vscode';

import { disposeDiffState } from './diff/diffStateDisposal';
import { diffNavigationCache } from './diff/diffNavigationCache';
import { focusDiffEntry } from './navigationActions';
import { diffNavigationStates } from './diff/diffNavigationState';
import { DiffNavigationState } from './diff/diffNavigationTypes';

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
        // Helper: find the diff navigation state that corresponds to the active diff editor.
        const resolveActiveState = (): { key: string; state: DiffNavigationState } | undefined => {
            const active = vscode.window.activeTextEditor;
            if (!active) {
                return undefined;
            }
            const activeUriStr = active.document.uri.toString();
            const activeFsPath = active.document.uri.fsPath;

            // 1) Direct key match (when the backing instance file itself is focused)
            const direct = diffNavigationStates.get(activeFsPath);
            if (direct) {
                return { key: activeFsPath, state: direct };
            }

            // 2) Search all states for a match against originalUri (left) or tempPath (right)
            for (const [key, st] of diffNavigationStates.entries()) {
                if (st.originalUri && st.originalUri.toString() === activeUriStr) {
                    return { key, state: st };
                }
                if (st.tempPath && st.tempPath === activeFsPath) {
                    return { key, state: st };
                }
            }

            // 3) As a fallback, try to find any visible editor that matches and then map to a state
            for (const editor of vscode.window.visibleTextEditors) {
                const uriStr = editor.document.uri.toString();
                const fsPath = editor.document.uri.fsPath;
                for (const [key, st] of diffNavigationStates.entries()) {
                    if (st.originalUri && st.originalUri.toString() === uriStr) {
                        return { key, state: st };
                    }
                    if (st.tempPath && st.tempPath === fsPath) {
                        return { key, state: st };
                    }
                }
            }

            return undefined;
        };

        const commandDisposables: vscode.Disposable[] = [
            vscode.commands.registerCommand('dreamweaverTemplateProtection.resetDiffNavigation', () => {
                const resolved = resolveActiveState();
                if (!resolved) {
                    return;
                }
                const { key } = resolved;
                diffNavigationCache.delete(key);
                disposeDiffState(key);
            }),
            vscode.commands.registerCommand('dreamweaverTemplateProtection.navigateDiff', async (direction: 'next' | 'previous', indexOverride?: number) => {
                const resolved = resolveActiveState();
                if (!resolved) {
                    return;
                }
                const { key, state } = resolved;

                const nextIndex = resolveNextIndex(state, direction, indexOverride);

                if (nextIndex === -1) {
                    return;
                }

                state.currentIndex = nextIndex;
                diffNavigationStates.set(key, state);

                await navigateToEntry(state, nextIndex);
            })
        ];

    context.subscriptions.push(...commandDisposables);
    };

    return { registerCommands } satisfies DiffCommandsApi;
};