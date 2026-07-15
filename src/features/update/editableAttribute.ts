// features/update/editableAttribute
// Minimal helper to execute the editable-attribute pre-pass: update the clicked child template
// as if running from its parent template, silently and only for that child.

import * as vscode from 'vscode';
import { UpdateHtmlMergeOptions, MergeResult } from './updateEngine';

export interface SavedInstanceParam {
  name: string;
  type: string;
  value: string;
}

export async function runParentSubstitutionPrepass(
  childTemplateUri: vscode.Uri,
  parentTemplateFsPath: string,
  deps: {
    updateChildTemplateLikeDreamweaver: (child: vscode.Uri, parentPath: string, mergeOptions: UpdateHtmlMergeOptions) => Promise<MergeResult>;
    getApplyToAll: () => boolean;
    setApplyToAll: (v: boolean) => void;
    output?: vscode.OutputChannel;
  },
  savedParams?: SavedInstanceParam[]
): Promise<void> {
  const prev = deps.getApplyToAll();
  try {
    deps.setApplyToAll(true);
    await deps.updateChildTemplateLikeDreamweaver(childTemplateUri, parentTemplateFsPath, {
      removeTemplateInfoFromInstance: false,
      suppressSafetyChecks: true
    });
    if (deps.output) deps.output.appendLine('[EDITABLE-ATTR] Silent parent substitution pre-pass completed.');

    // Post-pass: enforce saved InstanceParam values and resolve any remaining @@(name)@@ placeholders
    if (savedParams && savedParams.length > 0) {
      try {
        const bytes = await vscode.workspace.fs.readFile(childTemplateUri);
        let txt = Buffer.from(bytes).toString('utf8');
        const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        for (const p of savedParams) {
          const n = (p.name || '').trim();
          if (!n) continue;
          // 1) Replace editable-attribute placeholders @@(name)@@ with saved value
          const ph = new RegExp(`@@\\(\\s*${esc(n)}\\s*\\)@@`, 'gi');
          const beforeTxt = txt;
          txt = txt.replace(ph, p.value);

          // 2) If no placeholder was present (or engine resolved it to a value),
          //    replace attribute values equal to the child’s current param value with the saved value.
          if (txt === beforeTxt) {
            const currentParamMatch = new RegExp(
              `<!--\\s*(?:Template|Instance)Param\\s+name="${esc(n)}"\\s+type="[^"]+"\\s+value="([^"]*?)"\\s*-->`,
              'i'
            ).exec(txt);
            const currentVal = currentParamMatch?.[1] ?? '';
            if (currentVal && currentVal !== p.value) {
              const attrRe = new RegExp(`(=\\s*["'])${esc(currentVal)}(["'])`, 'g');
              txt = txt.replace(attrRe, `$1${p.value}$2`);
            }
          }
          // Update InstanceParam and TemplateParam values
          const instRe = new RegExp(`(<!--\\s*InstanceParam\\s+name="${esc(n)}"\\s+type="[^"]+"\\s+value=")([^"]*?)("\\s*-->)`, 'g');
          txt = txt.replace(instRe, `$1${p.value}$3`);
          const templRe = new RegExp(`(<!--\\s*TemplateParam\\s+name="${esc(n)}"\\s+type="[^"]+"\\s+value=")([^"]*?)("\\s*-->)`, 'g');
          txt = txt.replace(templRe, `$1${p.value}$3`);
        }

        // If the parent carried a sentinel marker to confirm the diverged pre-pass ran,
        // ensure it exists in the child at the expected spot. We insert it once right
        // before the blogProfile anchor if it's missing. This mirrors what a parent
        // InstanceEditable default would contribute.
        if (!/<!--\s*diverged process\s*-->/i.test(txt)) {
          // Preferred: insert before the blogProfile anchor
          const anchorRe = /(\r?\n)([\t ]*)(<a\s+id=\"blogProfile\"\b[^>]*>)/i;
          let injected = false;
          if (anchorRe.test(txt)) {
            txt = txt.replace(anchorRe, (_m, nl, indent, anchor) => {
              injected = true;
              const marker = `${nl}${indent}<!-- diverged process -->`;
              return `${marker}${nl}${indent}${anchor}`;
            });
          }
          // Fallback: insert above the profile image tag used in nav
          if (!injected) {
            const imgRe = /(\r?\n)([\t ]*)(<img\s+[^>]*alt=\"profile image\"[^>]*>)/i;
            if (imgRe.test(txt)) {
              txt = txt.replace(imgRe, (_m, nl, indent, img) => {
                const marker = `${nl}${indent}<!-- diverged process -->`;
                return `${marker}${nl}${indent}${img}`;
              });
              injected = true;
            }
          }
          if (injected && deps.output) deps.output.appendLine('[EDITABLE-ATTR] Inserted diverged process marker in child template.');
        }
        await vscode.workspace.fs.writeFile(childTemplateUri, Buffer.from(txt, 'utf8'));
        if (deps.output) deps.output.appendLine('[EDITABLE-ATTR] Post-pass applied saved InstanceParam values to child template.');
      } catch (e) {
        if (deps.output) deps.output.appendLine('[EDITABLE-ATTR] Post-pass failed to enforce saved params: ' + (e instanceof Error ? e.message : String(e)));
      }
    }
  } finally {
      deps.setApplyToAll(prev);
  }
}