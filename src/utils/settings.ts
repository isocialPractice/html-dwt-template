// utils/settings
// The extension's settings section, and switching a boolean setting the way its toggle commands do.

import * as vscode from 'vscode';

export const SETTINGS_SECTION = 'htmlDwtTemplate';

export function getSettings(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration(SETTINGS_SECTION);
}

export function getBooleanSetting(key: string, defaultValue: boolean): boolean {
  return getSettings().get<boolean>(key, defaultValue);
}

/**
 * Switches a boolean setting in the workspace settings (user settings when no folder is
 * open), so the Settings checkbox and the toggle command change the same value. Returns
 * the new value.
 */
export async function toggleBooleanSetting(key: string, defaultValue: boolean): Promise<boolean> {
  const next = !getBooleanSetting(key, defaultValue);
  const target = vscode.workspace.workspaceFolders?.length
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;
  await getSettings().update(key, next, target);
  return next;
}
