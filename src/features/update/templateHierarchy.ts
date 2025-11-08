// features/update/templateHierarchy
// Utilities to discover child templates and walk template inheritance.

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export async function findChildTemplates(templatePath: string): Promise<vscode.Uri[]> {
  const childTemplates: vscode.Uri[] = [];
  const templateName = path.basename(templatePath).toLowerCase();
  const templateDir = path.dirname(templatePath);
  const siteRoot = path.dirname(templateDir);
  const relativeTemplatePath = path.relative(siteRoot, templatePath).replace(/\\/g, '/');
  const expectedReference = relativeTemplatePath.startsWith('..') ? undefined : `/${relativeTemplatePath}`.toLowerCase();

  try {
    const templateFiles = await vscode.workspace.findFiles('**/Templates/*.dwt', '{**/node_modules/**,**/.html-dwt-template-backups/**}');
    for (const templateFile of templateFiles) {
      if (templateFile.fsPath === templatePath) continue;
      try {
        const content = fs.readFileSync(templateFile.fsPath, 'utf8');
        const headSlice = content.slice(0, 600);
        const instanceBeginRegex = /<!--\s*InstanceBegin\s+template="([^"]+)"/i;
        const match = headSlice.match(instanceBeginRegex);
        if (match) {
          const referencedTemplate = match[1].replace(/\\/g, '/');
          const referencedTemplateName = path.basename(referencedTemplate).toLowerCase();
          const matchesByName = referencedTemplateName === templateName;
          const matchesByPath = expectedReference ? referencedTemplate.toLowerCase() === expectedReference : false;
          if (matchesByName || matchesByPath) {
            if (!childTemplates.some(t => t.fsPath === templateFile.fsPath)) {
              childTemplates.push(templateFile);
            }
          }
        }
      } catch (error) {
        console.error(`Error reading template file ${templateFile.fsPath}:`, error);
      }
    }
  } catch (error) {
    console.error('Error finding child templates:', error);
  }
  return childTemplates;
}

export async function findAllChildTemplatesRecursive(templatePath: string): Promise<vscode.Uri[]> {
  const discovered: vscode.Uri[] = [];
  const visited = new Set<string>([templatePath]);
  const queue: string[] = [templatePath];
  while (queue.length > 0) {
    const current = queue.shift()!;
    try {
      const directChildren = await findChildTemplates(current);
      for (const child of directChildren) {
        if (!visited.has(child.fsPath)) {
          visited.add(child.fsPath);
          discovered.push(child);
          queue.push(child.fsPath);
        }
      }
    } catch (error) {
      console.error(`Error while searching nested templates for ${current}:`, error);
    }
  }
  return discovered;
}
