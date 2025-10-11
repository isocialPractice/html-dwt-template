// logger
// Provides structured logging utilities for the extension.

import * as vscode from 'vscode';

// Error/exit codes
// 0 success
// 1 error/exception
// 2 cancelled (user cancelled entire run)
// 3 skipped (user skipped this specific item)
// 4 safety-skip (user skipped due to safety issues)

const OUTPUT_CHANNEL_NAME = 'Dreamweaver Template Protection';

let channel: vscode.OutputChannel | undefined;

export function initializeLogger(): vscode.OutputChannel {
    if (!channel) {
        channel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
    }
    return channel;
}

export function getLoggerChannel(): vscode.OutputChannel {
    return channel ?? initializeLogger();
}

export function logProcessCompletion(context: string, errorCode: number = 0): void {
    const line = `[dwt-site-template] Extension process completed (${context}) with error code -> ${errorCode}`;
    console.log(line);
    getLoggerChannel().appendLine(line);
}

export function appendOutputLine(message: string): void {
    getLoggerChannel().appendLine(message);
}

export function disposeLogger(): void {
    channel?.dispose();
    channel = undefined;
}