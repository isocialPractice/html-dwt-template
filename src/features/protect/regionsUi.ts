// regionsUi
// Presents editable regions list and navigates to selection.

import * as vscode from 'vscode';
import { getEditableRanges } from './protection';

export function showEditableRegionsList(document: vscode.TextDocument) {
  const text = document.getText();
  const editableRanges = getEditableRanges(document);
  const regionNames: string[] = [];
  const beginRegex = /<!--\s*(?:InstanceBeginEditable|TemplateBeginEditable|InstanceBeginRepeat)\s*name=\"([^\"]+)\"\s*-->/g;
  let match: RegExpExecArray | null;
  while ((match = beginRegex.exec(text)) !== null) {
    const marker = match[0].includes('InstanceBeginRepeat') ? `${match[1]} (repeat)` : match[1];
    regionNames.push(marker);
  }

  if (regionNames.length > 0) {
    vscode.window.showQuickPick(regionNames, {
      placeHolder: 'Select an editable region to navigate to'
    }).then(selectedRegion => {
      if (selectedRegion) {
        const selectedIndex = regionNames.indexOf(selectedRegion);
        if (selectedIndex >= 0 && selectedIndex < editableRanges.length) {
            const range = editableRanges[selectedIndex];
            const editor = vscode.window.activeTextEditor;
            if (editor) {
              editor.selection = new vscode.Selection(range.start, range.start);
              editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
            }
          }
        }
    });
  } else {
    vscode.window.showInformationMessage('No editable regions found in this template.');
  }
}
