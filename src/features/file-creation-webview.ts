// features/file-creation-webview
// Registers a Webview-driven command to create a new page from a template.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { logProcessCompletion as logProcessCompletionShared } from '../utils/logger';

export function registerCreatePageFromTemplateCommand(context: vscode.ExtensionContext): vscode.Disposable {
  const logProcessCompletion = (ctx: string, code = 0) => logProcessCompletionShared(ctx, code);
  return vscode.commands.registerCommand('dreamweaverTemplate.createPageFromTemplate', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !editor.document.fileName.toLowerCase().endsWith('.dwt')) {
      vscode.window.showWarningMessage('Open a .dwt template to create a page.');
      return;
    }
    const templatePath = editor.document.uri.fsPath;
    const wsFolder = vscode.workspace.workspaceFolders?.[0];
    if (!wsFolder) {
      vscode.window.showErrorMessage('Workspace folder required.');
      return;
    }
    // Determine site root dynamically: assume .dwt is inside a "Templates" folder that sits under site root
    const templateDir = path.dirname(templatePath);
    const basename = path.basename(templateDir).toLowerCase();
    let siteRoot: string;
    if (basename === 'templates') {
      siteRoot = path.dirname(templateDir);
    } else {
      // Fallback: search upward for a Templates folder sibling containing this template (unlikely path)
      let current = templateDir;
      let found: string | undefined;
      for (let i = 0; i < 6; i++) { // limit ascent to avoid runaway
        const candidate = path.join(current, 'Templates');
        if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
          if (fs.existsSync(path.join(candidate, path.basename(templatePath)))) {
            found = current;
            break;
          }
        }
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
      }
      if (found) {
        siteRoot = found;
      } else {
        vscode.window.showErrorMessage('Unable to determine site root (expected template in a "Templates" folder).');
        return;
      }
    }

    // Build folder tree structure
    interface FolderNode { name: string; fullPath: string; children: FolderNode[]; }
    function readFolders(dir: string): FolderNode {
      const node: FolderNode = { name: path.basename(dir), fullPath: dir, children: [] };
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          if (e.isDirectory()) {
            const fullChild = path.join(dir, e.name);
            const lower = e.name.toLowerCase();
            // Skip Templates root itself for destination + skip internal metadata folders
            if (lower === 'templates' && fullChild === path.join(siteRoot, 'Templates')) continue;
            if (lower.startsWith('.dwt-template') || lower.startsWith('.dwt-site-template')) continue;
            node.children.push(readFolders(fullChild));
          }
        }
        node.children.sort((a, b) => a.name.localeCompare(b.name));
      } catch {}
      return node;
    }
    const tree = readFolders(siteRoot);

    // Serialize tree to send to webview
    function flatten(node: FolderNode, depth = 0): any[] {
      const rel = path.relative(siteRoot, node.fullPath).replace(/\\/g, '/');
      // Root node should display actual site root folder name (request)
      const rootName = path.basename(siteRoot);
      const display = (depth === 0 ? rootName : node.name);
      const arr = [{ name: node.name, display, fullPath: node.fullPath, rel: rel || '.', depth, children: node.children.length > 0 }];
      for (const c of node.children) arr.push(...flatten(c, depth + 1));
      return arr;
    }
    const flat = flatten(tree);

    // Create panel
    const panel = vscode.window.createWebviewPanel(
      'createPageFromTemplate',
      'Create New Page from Template',
      vscode.ViewColumn.Active,
      { enableScripts: true }
    );

    const nonce = Date.now().toString();
    panel.webview.html = getCreatePageHtml(flat, nonce, siteRoot);

    panel.webview.onDidReceiveMessage(async msg => {
      if (msg.type === 'validateName') {
        const targetPath = path.join(siteRoot, msg.relPath === '.' ? '' : msg.relPath, msg.fileName + (msg.ext === 'php' ? '.php' : '.html'));
        const exists = fs.existsSync(targetPath);
        panel.webview.postMessage({ type: 'validationResult', exists });
      } else if (msg.type === 'save') {
        const relPath: string = msg.relPath; // '.' or relative folder
        const fileBase: string = msg.fileName || 'untitled';
        const ext: string = msg.ext === 'php' ? 'php' : 'html';
        const targetPath = path.join(siteRoot, relPath === '.' ? '' : relPath, `${fileBase}.${ext}`);
        if (fs.existsSync(targetPath) && !msg.overwrite) {
          // Request overwrite confirmation
          const choice = await vscode.window.showWarningMessage(`The file "${path.relative(siteRoot, targetPath)}" already exists. Overwrite?`, 'Yes', 'No', 'Cancel');
          if (choice === 'Yes') {
            await writeNewInstance(targetPath, templatePath, ext, siteRoot);
            panel.dispose();
          } else if (choice === 'No') {
            panel.webview.postMessage({ type: 'overwriteDenied' });
          } else {
            panel.dispose();
          }
        } else {
          await writeNewInstance(targetPath, templatePath, ext, siteRoot);
          panel.dispose();
        }
      } else if (msg.type === 'cancel') {
        panel.dispose();
      }
    });

    async function writeNewInstance(targetPath: string, templatePath: string, _ext: string, siteRoot: string) {
      try {
        let output = fs.readFileSync(templatePath, 'utf8'); // start as raw copy (duplicate template)

        // Determine lock flag from template (default true)
        const info = /<!--\s*TemplateInfo\s+codeOutsideHTMLIsLocked="(true|false)"\s*-->/i.exec(output);
        const lockFlag = info ? info[1].toLowerCase() : 'true';

        // Insert InstanceBegin after <html...> preserving original <html> tag exactly once.
        // Remove only the existing template header (do NOT remove InstanceBeginEditable / Repeat markers)
        output = output.replace(/<!--\s*InstanceBegin\s+template="[^"]+"[^>]*-->/i, '');
        // Mark placeholder CHANGE first, then replace with final lockFlag after confirm.
        output = output.replace(/(<html[^>]*>)/i, (m) => `${m}<!-- InstanceBegin template="/Templates/${path.basename(templatePath)}" codeOutsideHTMLIsLocked="CHANGE" -->`);

        // Unwrap parent InstanceBeginEditable wrappers that only serve as shells for nested Template markers.
        // Rule: If a parent InstanceBeginEditable contains any TemplateBegin* marker inside, drop the outer Instance wrapper
        // so the child page will only get the converted inner Instance markers (no double Instance wrappers).
        output = output.replace(/<!--\s*InstanceBeginEditable[^>]*-->([\s\S]*?)<!--\s*InstanceEndEditable\s*-->/gi, (full, inner) => {
            return /<!--\s*TemplateBegin/i.test(inner) ? inner : full;
        });

        // Convert TemplateBeginEditable/TemplateEndEditable to Instance equivalents (keep region names/content)
        output = output.replace(/<!--\s*TemplateBeginEditable/g, '<!-- InstanceBeginEditable');
        output = output.replace(/TemplateEndEditable/g, 'InstanceEndEditable');

        // Convert Template repeat related markers
        output = output.replace(/<!--\s*TemplateBeginRepeat/g, '<!-- InstanceBeginRepeat');
        output = output.replace(/TemplateEndRepeat/g, 'InstanceEndRepeat');
        output = output.replace(/TemplateBeginRepeatEntry/g, 'InstanceBeginRepeatEntry');
        output = output.replace(/TemplateEndRepeatEntry/g, 'InstanceEndRepeatEntry');

        // Ensure a single default repeat entry exists when parent had a repeat block but no explicit entries
        // For every InstanceBeginRepeat ... InstanceEndRepeat block, inject missing Entry markers
        output = output.replace(/<!--\s*InstanceBeginRepeat[^>]*-->([\s\S]*?)<!--\s*InstanceEndRepeat\s*-->/gi, (full, inner) => {
          const hasBeginEntry = /<!--\s*InstanceBeginRepeatEntry\s*-->/i.test(inner);
          const hasEndEntry = /<!--\s*InstanceEndRepeatEntry\s*-->/i.test(inner);
          let patched = inner;
          if (!hasBeginEntry) {
            patched = `<!-- InstanceBeginRepeatEntry -->` + patched;
          }
          if (!hasEndEntry) {
            // place before the end of the block
            patched = patched + `<!-- InstanceEndRepeatEntry -->`;
          }
          return full.replace(inner, patched);
        });

        // Finally convert any other TemplateBegin/TemplateEnd (safety) AFTER specific ones handled
        output = output.replace(/<!--\s*TemplateBegin/g, '<!-- InstanceBegin');
        output = output.replace(/TemplateEnd/g, 'InstanceEnd');

        // Remove TemplateInfo line entirely from instance file
        output = output.replace(/<!--\s*TemplateInfo\s+codeOutsideHTMLIsLocked="(true|false)"\s*-->/ig, '');

        // Replace CHANGE with proper lock flag validation (only true/false accepted)
        const finalLock = (lockFlag === 'true' || lockFlag === 'false') ? lockFlag : 'true';
        output = output.replace(/codeOutsideHTMLIsLocked="CHANGE"/, `codeOutsideHTMLIsLocked="${finalLock}"`);

        // Ensure single InstanceEnd before </html>
        output = output.replace(/<!--\s*InstanceEnd\s*-->/ig, '');
        output = output.replace(/(<\/html>)/i, '<!-- InstanceEnd -->$1');

        // Balance check: remove stray InstanceEndEditable without matching begin (simple stack)
        const tokenRe = /<!--\s*Instance(BeginEditable|EndEditable)[^>]*-->/g;
        let match: RegExpExecArray | null; let balance = 0; const removals: { start: number; end: number }[] = [];
        while ((match = tokenRe.exec(output)) !== null) {
          const isBegin = /BeginEditable/i.test(match[0]);
          if (isBegin) balance++; else { if (balance === 0) removals.push({ start: match.index, end: match.index + match[0].length }); else balance--; }
        }
        if (removals.length) {
          removals.sort((a, b) => b.start - a.start).forEach(r => { output = output.slice(0, r.start) + output.slice(r.end); });
        }
        const dir = path.dirname(targetPath);
        fs.mkdirSync(dir, { recursive: true });
        // Ensure any TemplateEndRepeat left is converted properly with entry markers (defensive)
        output = output.replace(/<!--\s*TemplateEndRepeat\s*-->/gi, '<!-- InstanceEndRepeatEntry --><!-- InstanceEndRepeat -->');
        fs.writeFileSync(targetPath, output, 'utf8');
        const rel = path.relative(siteRoot, targetPath).replace(/\\/g, '/');
        vscode.window.showInformationMessage(`Created new page: ${rel}`);
        const doc = await vscode.workspace.openTextDocument(targetPath);
        await vscode.window.showTextDocument(doc);
        logProcessCompletion('createPageFromTemplate');
      } catch (e: any) {
        vscode.window.showErrorMessage(`Failed to create page: ${e.message || e}`);
        logProcessCompletion('createPageFromTemplate', 1);
      }
    }

    function getCreatePageHtml(flatFolders: any[], nonce: string, siteRoot: string): string {
      const json = JSON.stringify(flatFolders);
      return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Create Page</title>
<style>
body { font-family: Consolas, monospace; padding:12px; }
fieldset { border:1px solid #888; margin-bottom:12px; }
legend { font-weight:bold; }
.row { margin:8px 0; }
label { display:inline-block; min-width:100px; }
input[type=text] { width:260px; }
.ext-toggle span { cursor:pointer; padding:4px 10px; border:1px solid #666; margin-right:4px; }
.ext-toggle span.active { background:#004; color:#fff; }
.folder-container { border:1px solid #666; height:240px; overflow:auto; padding:4px; background:#111; color:#ccc; font-size:13px; }
.folder { cursor:pointer; user-select:none; white-space:nowrap; }
.folder.selected { background:#333; color:#fff; }
.buttons { text-align:center; margin-top:16px; }
button { width:140px; padding:6px 0; margin:0 12px; font-weight:bold; }
button#saveBtn { background:#0a0; color:#fff; border:1px solid #050; }
button#cancelBtn { background:#555; color:#fff; border:1px solid #333; }
.exist-warning { color:#f80; font-size:12px; height:16px; }
.twisty { display:inline-block; width:14px; }
.collapsed > .children { display:none; }
.children { margin-left:16px; }
</style></head><body>
<div class="row"><strong>Create New Page from Template</strong></div>
<div class="row ext-toggle" id="extToggle" role="radiogroup" aria-label="File Extension">
<span data-ext="html" class="active" role="radio" aria-checked="true">html</span>
<span data-ext="php" role="radio" aria-checked="false">php</span>
</div>
<div class="row"><label>File Name:</label><input id="fileName" type="text" value="untitled" /> <span>. <span id="extLabel">html</span></span></div>
<div class="exist-warning" id="existWarn"></div>
<div class="row"><label style="vertical-align:top;">Save to Folder:</label>
  <div class="folder-container" id="folderContainer"></div>
</div>
<div class="buttons"><button id="saveBtn">Save</button><button id="cancelBtn">Cancel</button></div>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
let currentExt = 'html';
let selectedRel = '.';
const flat = ${json};

// Build tree (flat contains ordered depth info). We'll reconstruct parent-child by path depth.
const byRel = new Map(flat.map(f => [f.rel, f]));
function relDepth(rel){ return rel === '.' ? 0 : rel.split('/').length; }
function childrenOf(rel){
  return flat.filter(f => f.rel !== rel && (rel === '.' ? !f.rel.includes('/') : f.rel.startsWith(rel + '/')) && relDepth(f.rel) === relDepth(rel)+1);
}

function buildNode(rel){
  const data = byRel.get(rel);
  if (!data) return '';
  const kids = childrenOf(rel);
  const hasChildren = kids.length>0;
  const label = data.display;
  let html = '<div class="folder collapsed" data-rel="'+data.rel+'">';
  html += '<div class="line"><span class="twisty">'+(hasChildren ? '▶' : '')+'</span> <span class="name">'+label+'</span></div>';
  html += '<div class="children">'+kids.map(c=>buildNode(c.rel)).join('')+'</div>';
  html += '</div>';
  return html;
}
document.getElementById('folderContainer').innerHTML = buildNode('.');

document.querySelectorAll('#extToggle span').forEach(span=>{
span.addEventListener('click', () => {
  if (span.dataset.ext === currentExt) return; // toggle like radio
  currentExt = span.dataset.ext;
  document.querySelectorAll('#extToggle span').forEach(s=>{ s.classList.remove('active'); s.setAttribute('aria-checked','false'); });
  span.classList.add('active'); span.setAttribute('aria-checked','true');
  document.getElementById('extLabel').textContent = currentExt;
  validate();
});
});
document.getElementById('folderContainer').addEventListener('click', (e)=>{
  const line = e.target.closest('.line');
  if (!line) return;
  const folder = line.parentElement;
  if (!folder) return;
  // Toggle collapse if has children
  if (folder.querySelector('.children') && folder.querySelector('.children').children.length) {
      folder.classList.toggle('collapsed');
      const twisty = folder.querySelector(' .twisty');
      if (twisty) twisty.textContent = folder.classList.contains('collapsed') ? '▶' : '▼';
  }
  document.querySelectorAll('.folder').forEach(f=>f.classList.remove('selected'));
  folder.classList.add('selected');
  selectedRel = folder.getAttribute('data-rel');
  validate();
});
function validate(){
const fileName = (document.getElementById('fileName').value||'').trim();
if (!fileName) { setWarn('Enter a file name.'); return; }
vscode.postMessage({ type:'validateName', fileName, relPath: selectedRel, ext: currentExt });
}
function setWarn(msg){ document.getElementById('existWarn').textContent = msg||''; }
document.getElementById('fileName').addEventListener('input', validate);
document.getElementById('saveBtn').addEventListener('click', ()=>{
const fileName = (document.getElementById('fileName').value||'').trim();
if (!fileName) { setWarn('Enter a file name.'); return; }
vscode.postMessage({ type:'save', fileName, relPath: selectedRel, ext: currentExt });
});
document.getElementById('cancelBtn').addEventListener('click', ()=> vscode.postMessage({ type:'cancel' }));
window.addEventListener('message', event => {
const msg = event.data;
if (msg.type === 'validationResult') {
  setWarn(msg.exists ? 'File exists (will ask to overwrite on Save).' : '');
} else if (msg.type === 'overwriteDenied') {
  setWarn('Choose a different name or folder.');
}
});
validate();
</script></body></html>`;
      }
  });
}
