import * as vscode from 'vscode';

/**
 * Inserts a new repeating entry before or after the currently selected entry within a Dreamweaver repeating region.
 * @param editor The active text editor.
 * @param where A string indicating whether to insert 'before' or 'after' the current entry.
 */
export async function insertRepeatingEntry(editor: vscode.TextEditor, where: 'before' | 'after') {
  const document = editor.document;
  const position = editor.selection.active;

  const text = document.getText();
  const offset = document.offsetAt(position);

  // Regex to find the entire TemplateBeginRepeat/TemplateEndRepeat block
  const repeatRegionRegex = /<!--\s*TemplateBeginRepeat\s+name="([^"]+)"\s*-->([\s\S]*?)<!--\s*TemplateEndRepeat\s*-->/g;
  let repeatRegionMatch;

  while ((repeatRegionMatch = repeatRegionRegex.exec(text)) !== null) {
    const repeatRegionStart = repeatRegionMatch.index;
    const repeatRegionEnd = repeatRegionStart + repeatRegionMatch[0].length;

    // Check if the cursor is within the current repeat region
    if (offset >= repeatRegionStart && offset <= repeatRegionEnd) {
      const repeatContent = repeatRegionMatch[2];
      // Regex to find individual entries within the repeat region
      const entryRegex = /<!--\s*InstanceBeginRepeatEntry\s*-->([\s\S]*?)<!--\s*InstanceEndRepeatEntry\s*-->/g;

      let lastEntryEnd = -1;
      let entryToCopy: string | null = null;
      let insertionPoint = -1;

      let entryMatch;
      // Find the specific entry the cursor is in
      while ((entryMatch = entryRegex.exec(repeatContent)) !== null) {
        // We need to calculate the absolute start and end of the entry match within the document
        const entryStartInContent = entryMatch.index;
        const entryEndInContent = entryStartInContent + entryMatch[0].length;
        const repeatContentStart = text.indexOf(repeatContent, repeatRegionStart);

        const absoluteEntryStart = repeatContentStart + entryStartInContent;
        const absoluteEntryEnd = repeatContentStart + entryEndInContent;

        if (offset >= absoluteEntryStart && offset <= absoluteEntryEnd) {
          entryToCopy = entryMatch[0];
          insertionPoint = where === 'after' ? absoluteEntryEnd : absoluteEntryStart;
          break;
        }
        lastEntryEnd = absoluteEntryEnd;
      }

      // If we found an entry to copy and a place to insert it, perform the edit
      if (entryToCopy && insertionPoint !== -1) {
        const insertPosition = document.positionAt(insertionPoint);
        await editor.edit(editBuilder => {
          // Insert the copied entry with a newline to separate it
          editBuilder.insert(insertPosition, (where === 'after' ? '\n' : '') + entryToCopy + (where === 'before' ? '\n' : ''));
        });
        return; // Exit after successful insertion
      }

      // If the cursor is not inside a specific entry but is within the repeating region,
      // and there's at least one entry, duplicate the last one.
      if (lastEntryEnd !== -1) {
         const lastEntryMatch = repeatContent.match(/(<!--\s*InstanceBeginRepeatEntry\s*-->[\s\S]*?<!--\s*InstanceEndRepeatEntry\s*-->\s*)$/);
         entryToCopy = lastEntryMatch ? lastEntryMatch[1].trim() : null;

         if(entryToCopy) {
           const insertPosition = document.positionAt(lastEntryEnd);
           await editor.edit(editBuilder => {
             editBuilder.insert(insertPosition, '\n' + entryToCopy);
           });
           return;
        }
      }
    }
  }
  // If no valid location was found, inform the user.
  vscode.window.showInformationMessage('Cursor must be inside a repeating entry to duplicate it.');
}
