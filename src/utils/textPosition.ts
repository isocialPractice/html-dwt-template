// textPosition
// Offers helper math for converting string offsets to VS Code positions.

import * as vscode from 'vscode';

export const getPositionAt = (text: string, index: number): vscode.Position => {
    const lines = text.substring(0, index).split('\n');
    const line = lines.length - 1;
    const character = lines[line].length;
    return new vscode.Position(line, character);
};