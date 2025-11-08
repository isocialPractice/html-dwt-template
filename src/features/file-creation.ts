import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Finds the deepest common directory path from an array of file paths.
 * @param filePaths An array of absolute file paths.
 * @returns The common parent directory path, or null if none is found.
 */
function findCommonParent(filePaths: string[]): string | null {
  if (!filePaths || filePaths.length === 0) {
    return null;
  }
  // On Windows, paths are case-insensitive
  const splitPaths = filePaths.map(p => p.toLowerCase().split(path.sep));
  const firstPath = filePaths[0].split(path.sep);
  let commonPath = [];

  for (let i = 0; i < splitPaths[0].length; i++) {
    const currentPart = splitPaths[0][i];
    if (splitPaths.every(p => p.length > i && p[i] === currentPart)) {
      // Use the original casing from the first path for the result
      commonPath.push(firstPath[i]);
    } else {
      break;
    }
  }
  // A common path should be more than just the drive letter (e.g., 'C:')
  return commonPath.length > 1 ? commonPath.join(path.sep) : null;
}

/**
 * Creates a new HTML file from a selected Dreamweaver template.
 */
export async function createPageFromTemplate() {
  const templateUris = await vscode.workspace.findFiles('**/Templates/*.dwt');
  if (templateUris.length === 0) {
    vscode.window.showErrorMessage('No Dreamweaver templates (.dwt) found in the workspace.');
    return;
  }

  const templateChoice = await vscode.window.showQuickPick(
    templateUris.map(uri => ({ label: path.basename(uri.fsPath), description: uri.fsPath })),
    { placeHolder: 'Select a template to create a new page from' }
  );

  if (!templateChoice) return;

  const templateUri = vscode.Uri.file(templateChoice.description!);
  const templateContent = fs.readFileSync(templateUri.fsPath, 'utf8');

  const fileName = await vscode.window.showInputBox({
    prompt: 'Enter the name for the new HTML file (without extension)',
    validateInput: value => value ? null : 'File name cannot be empty'
  });

  if (!fileName) return;

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(templateUri);
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('Cannot determine workspace folder for the selected template.');
    return;
  }

  // Find a sensible default directory to save the new file.
  // Prioritize a common directory of existing HTML/PHP files.
  let defaultPath = workspaceFolder.uri.fsPath;
  const htmlFiles = await vscode.workspace.findFiles('**/*.{html,php}', '**/node_modules/**');
  if (htmlFiles.length > 0) {
    const commonDir = findCommonParent(htmlFiles.map(f => f.fsPath));
    if (commonDir) {
      defaultPath = commonDir;
    }
  }

  const filePathInput = await vscode.window.showInputBox({
    prompt: 'Enter the path to save the new file',
    value: path.join(defaultPath, `${fileName}.html`),
  });

  if (!filePathInput) return;

  const newFilePath = path.isAbsolute(filePathInput) ? filePathInput : path.join(workspaceFolder.uri.fsPath, filePathInput);
  const newFileUri = vscode.Uri.file(newFilePath);

  if (fs.existsSync(newFileUri.fsPath)) {
    const overwrite = await vscode.window.showWarningMessage(
      `File ${path.basename(newFileUri.fsPath)} already exists. Overwrite?`,
      { modal: true },
      'Overwrite'
    );
    if (overwrite !== 'Overwrite') return;
  }

  // Calculate the relative path from the new file to the template
  const relativeTemplatePath = path.relative(path.dirname(newFileUri.fsPath), templateUri.fsPath).replace(/\\/g, '/');

  // Extract all editable region names from the template
  const editableRegionRegex = /<!--\s*TemplateBeginEditable\s+name="([^"]+)"\s*-->/g;
  let match;
  const regionNames = new Set<string>();
  while((match = editableRegionRegex.exec(templateContent)) !== null) {
    regionNames.add(match[1]);
  }

  // Build the content for the new instance file
  let instanceBoilerplate = `<!-- InstanceBegin template="${relativeTemplatePath}" codeOutsideHTMLIsLocked="false" -->\n`;

  const headContent = templateContent.match(/<head[^>]*>([\s\S]*)<\/head>/i)?.[1] || '';
  const bodyContent = templateContent.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] || '';

  // A common pattern is to have doctitle and head regions inside the <head> tag.
  if (regionNames.has('doctitle') || regionNames.has('head') || headContent.includes('name="doctitle"') || headContent.includes('name="head"')) {
    instanceBoilerplate += `<head>\n`;
    if (regionNames.has('doctitle')) {
      instanceBoilerplate += `<!-- InstanceBeginEditable name="doctitle" -->\n<title>Untitled Document</title>\n<!-- InstanceEndEditable -->\n`;
    }
    if (regionNames.has('head')) {
      instanceBoilerplate += `<!-- InstanceBeginEditable name="head" -->\n<!-- InstanceEndEditable -->\n`;
    }
    instanceBoilerplate += `</head>\n\n`;
  }

  instanceBoilerplate += `<body>\n`;

  // Add all other editable regions that are found within the template's body
  for (const name of regionNames) {
    if (name !== 'doctitle' && name !== 'head') {
      if (bodyContent.includes(`name="${name}"`)) {
        instanceBoilerplate += `<!-- InstanceBeginEditable name="${name}" -->\nContent for ${name}\n<!-- InstanceEndEditable -->\n\n`;
      }
    }
  }
  instanceBoilerplate += `</body>\n`;
  instanceBoilerplate += `<!-- InstanceEnd -->`;

  // Create directory if it doesn't exist and write the file
  fs.mkdirSync(path.dirname(newFileUri.fsPath), { recursive: true });
  fs.writeFileSync(newFileUri.fsPath, instanceBoilerplate);

  // Open the newly created file in the editor
  const newDocument = await vscode.workspace.openTextDocument(newFileUri);
  await vscode.window.showTextDocument(newDocument);
}
