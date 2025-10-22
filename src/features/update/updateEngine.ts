// features/update/updateEngine
// Encapsulates Dreamweaver-style update engine for instances and child templates.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { structuredPatch } from 'diff';
import { setVirtualOriginalContent } from '../virtualOriginalProvider';
import { diffNavigationStates } from '../diff/diffNavigationState';
import { DiffNavigationEntry, DiffNavigationState } from '../diff/diffNavigationTypes';
import { disposeDiffState } from '../diff/diffStateDisposal';
import { parseTemplateParameters, parseInstanceParameters, parseOptionalRegions, evaluateExpression } from './params';
import { buildInstanceParameterState as buildInstanceParameterStateStore, setInstanceParametersForUri } from './paramState';
import { findChildTemplates } from './templateHierarchy';
import { createHtmlBackups } from '../../utils/backups';

export type MergeResultStatus = 'updated' | 'unchanged' | 'skipped' | 'safetyFailed' | 'cancelled' | 'error';
export interface MergeResult { status: MergeResultStatus; }
export interface UpdateHtmlMergeOptions {
    templateCodeOutsideHTMLIsLocked?: string;
    removeTemplateInfoFromInstance?: boolean;
    // When true, skip safety gating UI and proceed with write (used for silent child pre-pass)
    suppressSafetyChecks?: boolean;
}

export interface UpdateHtmlBasedOnTemplateOptions {
    autoApplyAll?: boolean;
    suppressCompletionPrompt?: boolean;
    // Internal: skip the editable-attributes parent substitution phase when re-invoking on a child template
    skipEditableAttributesPhase?: boolean;
}

// NOTE: For maintainability and minimal risk, we lifted the implementation as-is from extension.ts
// and kept function signatures intact. Only imports are adjusted.

export async function updateHtmlLikeDreamweaver(
    instanceUri: vscode.Uri,
    templatePath: string,
    options: UpdateHtmlMergeOptions = {},
    deps: {
        outputChannel: vscode.OutputChannel | undefined;
        logProcessCompletion: (context: string, errorCode?: number) => void;
        getApplyToAll: () => boolean;
        setApplyToAll: (v: boolean) => void;
        getCancelRun: () => boolean;
        setCancelRun: (v: boolean) => void;
    }
): Promise<MergeResult> {
    try {
        const childTemplateMode = options.removeTemplateInfoFromInstance === false; // treat instance as a child template merge
        const outputChannel = deps.outputChannel;
        const instancePath = instanceUri.fsPath;
        console.log(`[DW-MERGE] Start merge for instance: ${instancePath}`);
        if (outputChannel) outputChannel.appendLine(`[DW-MERGE] Start merge for instance: ${instancePath}`);

        const rawInstance = fs.readFileSync(instancePath, 'utf8');
        const rawTemplate = fs.readFileSync(templatePath, 'utf8');
        const instanceContent = rawInstance.replace(/\r\n?/g, '\n');
        let templateContent = rawTemplate.replace(/\r\n?/g, '\n');
        const templateLockStatus = options.templateCodeOutsideHTMLIsLocked?.toLowerCase();
        const shouldRemoveTemplateInfo = options.removeTemplateInfoFromInstance !== false; // Default to true

        const stripNestedInstanceEditableWrappers = (html: string): { html: string; removedNames: Set<string> } => {
            const removedNames = new Set<string>();
            const blockRe = /<!--\s*InstanceBeginEditable\s+name="([^"]+)"\s*-->([\s\S]*?)<!--\s*InstanceEndEditable\s*-->/g;
            const sanitized = html.replace(blockRe, (full, name: string, inner: string) => {
                if (/<!--\s*TemplateBeginEditable\s+name="/.test(inner)) {
                    removedNames.add(name);
                    return inner;
                }
                return full;
            });
            return { html: sanitized, removedNames };
        };

        // Capture repeat blocks from instance and template for preservation
        const instanceRepeatBlocks = new Map<string, string>();
        try {
            const instRepeatRe = /<!--\s*InstanceBeginRepeat\s+name="([^"]+)"\s*-->[\s\S]*?<!--\s*InstanceEndRepeat\s*-->/gi;
            let im: RegExpExecArray | null;
            while ((im = instRepeatRe.exec(instanceContent)) !== null) {
                instanceRepeatBlocks.set(im[1], im[0]);
            }
        } catch {}

        // Parse template parameters and optional regions
        const stripResult = stripNestedInstanceEditableWrappers(templateContent);
        if (stripResult.removedNames.size) {
            console.log(`[DW-MERGE] Removed parent instance wrapper(s): ${Array.from(stripResult.removedNames).join(', ')}`);
            if (outputChannel) outputChannel.appendLine(`[DW-MERGE] Removed parent instance wrapper(s): ${Array.from(stripResult.removedNames).join(', ')}`);
        }
        templateContent = stripResult.html;

        const templateParameters = parseTemplateParameters(templateContent);
        const instanceParameters = buildInstanceParameterStateStore(instanceUri, instanceContent, templateParameters, parseInstanceParameters);
        const optionalRegions = parseOptionalRegions(templateContent);
        setInstanceParametersForUri(instanceUri, instanceParameters);

        const ensureParameterValue = (name: string, fallback: string): string => {
            const key = name.trim();
            if ((instanceParameters as any)[key] === undefined) {
                (instanceParameters as any)[key] = fallback;
            }
            return (instanceParameters as any)[key];
        };

        const convertTemplateParamMarkers = (content: string): string => {
            return content.replace(
                /<!--\s*TemplateParam\s+name="([^"]+)"\s+type="([^"]+)"\s+value="([^"]*?)"\s*-->/g,
                (_full, paramName, paramType, paramValue) => {
                    const normalizedName = (paramName as string).trim();
                    const valueToUse = ensureParameterValue(normalizedName, paramValue);
                    return `<!-- InstanceParam name="${normalizedName}" type="${paramType}" value="${valueToUse}" -->`;
                }
            );
        };

        const substituteParamPlaceholders = (content: string): string => {
            if (childTemplateMode) return content; // preserve placeholders in child templates by default
            return content.replace(/@@\(\s*([A-Za-z0-9_]+)\s*\)@@/g, (match, rawName) => {
                const key = (rawName as string).trim();
                if ((instanceParameters as any)[key] !== undefined) {
                    return (instanceParameters as any)[key];
                }
                return match;
            });
        };

        // Forced placeholder substitution used during Update Editable Attributes Process
        const substituteParamPlaceholdersChildMode = (content: string): string => {
            return content.replace(/@@\(\s*([A-Za-z0-9_]+)\s*\)@@/g, (match, rawName) => {
                const key = (rawName as string).trim();
                if ((instanceParameters as any)[key] !== undefined) {
                    return (instanceParameters as any)[key];
                }
                return match;
            });
        };

        console.log(`[DW-MERGE] Found ${templateParameters.length} template parameters, ${optionalRegions.length} optional regions`);
        if (outputChannel) {
            outputChannel.appendLine(`[DW-MERGE] Template parameters: ${templateParameters.map(p => `${p.name}(${p.type})`).join(', ') || '(none)'}`);
            outputChannel.appendLine(`[DW-MERGE] Optional regions: ${optionalRegions.length} found`);
        }

        // Detection for placeholder substitution in child merges: trigger when parent contains
        // any @@(param)@@ that intersects with the child's parameter names.
        const childHasInstanceParam = /<!--\s*InstanceParam\b/i.test(instanceContent);
        const parentPlaceholderNames: string[] = [];
        try {
            const phRe = /@@\(\s*([A-Za-z0-9_]+)\s*\)@@/g;
            let pm: RegExpExecArray | null;
            while ((pm = phRe.exec(templateContent)) !== null) parentPlaceholderNames.push((pm[1] || '').trim());
        } catch {}
    const childTemplateParamNames = parseTemplateParameters(instanceContent).map(p => p.name.trim());
    const childInstanceParamNames = Object.keys(parseInstanceParameters(instanceContent) || {}).map(n => (n || '').trim());
    const childParamNames = new Set<string>([...childTemplateParamNames, ...childInstanceParamNames]);
    const hasIntersection = parentPlaceholderNames.length > 0 && parentPlaceholderNames.some(n => childParamNames.has(n));
        const updateEditableAttributesMode = childTemplateMode && childHasInstanceParam && hasIntersection;
        if (updateEditableAttributesMode) {
            console.log('[DW-MERGE] Detected editable-attributes mode: parent has @@(param)@@ and child has InstanceParam.');
            if (outputChannel) outputChannel.appendLine('[DW-MERGE] Mode: Update Editable Attributes Process is applicable for this child template.');
        }

        const templateRepeatBlocks = new Map<string, string>();
        try {
            const tmplRepeatRe = /<!--\s*TemplateBeginRepeat\s+name="([^"]+)"\s*-->([\s\S]*?)<!--\s*TemplateEndRepeat\s*-->/gi;
            let tm: RegExpExecArray | null;
            while ((tm = tmplRepeatRe.exec(templateContent)) !== null) {
                templateRepeatBlocks.set(tm[1], tm[0]);
            }
        } catch {}

        // Preserve existing instance editable regions
        const preservedRegions = new Map<string, string>();
        const instanceEditablePattern = /<!--\s*InstanceBeginEditable\s+name="([^"]+)"\s*-->([\s\S]*?)<!--\s*InstanceEndEditable\s*-->/g;
        let m: RegExpExecArray | null;
        while ((m = instanceEditablePattern.exec(instanceContent)) !== null) {
            preservedRegions.set(m[1], m[2]);
        }
        if (childTemplateMode) {
            // Also capture Template editables from child template file
            const tplEditablePattern = /<!--\s*TemplateBeginEditable\s+name="([^"]+)"\s*-->([\s\S]*?)<!--\s*TemplateEndEditable\s*-->/g;
            let tm: RegExpExecArray | null;
            while ((tm = tplEditablePattern.exec(instanceContent)) !== null) {
                if (!preservedRegions.has(tm[1])) preservedRegions.set(tm[1], tm[2]);
            }
        }
        console.log(`[DW-MERGE] Preserved regions (${preservedRegions.size}): ${Array.from(preservedRegions.keys()).join(', ') || '(none)'}`);
        if (outputChannel) outputChannel.appendLine(`[DW-MERGE] Preserved regions (${preservedRegions.size}): ${Array.from(preservedRegions.keys()).join(', ') || '(none)'}`);

        // Robust region parser for template
        interface ParsedRegion { name: string; begin: number; end: number; defaultContent: string; full: string; kind: 'template' | 'instance'; }
        const regionPattern = /<!--\s*(TemplateBeginEditable|InstanceBeginEditable)\s+name="([^"]+)"\s*-->([\s\S]*?)<!--\s*(TemplateEndEditable|InstanceEndEditable)\s*-->/g;
        const parsedRegions: ParsedRegion[] = [];
        let rp: RegExpExecArray | null;
        while ((rp = regionPattern.exec(templateContent)) !== null) {
            const beginToken = rp[1] || '';
            const kind: 'template' | 'instance' = /^Template/i.test(beginToken) ? 'template' : 'instance';
            parsedRegions.push({ name: rp[2], begin: rp.index, end: rp.index + rp[0].length, defaultContent: rp[3], full: rp[0], kind });
        }
        console.log(`[DW-MERGE] Template regions parsed: ${parsedRegions.map(r=>r.name).join(', ') || '(none)'}`);
        if (outputChannel) outputChannel.appendLine(`[DW-MERGE] Template regions parsed: ${parsedRegions.map(r=>r.name).join(', ') || '(none)'}`);
        const templateRegionNames = new Set(parsedRegions.map(r => r.name));
        const topLevelRegions: ParsedRegion[] = (() => {
            const out: ParsedRegion[] = [];
            let currentEnd = -1;
            for (const r of parsedRegions) {
                if (r.begin >= currentEnd) {
                    out.push(r);
                    currentEnd = r.end;
                }
            }
            return out;
        })();
        const allTemplateEditableNames = new Set<string>();
        try {
            const scanEditableNames = /<!--\s*TemplateBeginEditable\s+name="([^"]+)"\s*-->/gi;
            let nm: RegExpExecArray | null;
            while ((nm = scanEditableNames.exec(templateContent)) !== null) {
                allTemplateEditableNames.add(nm[1]);
            }
        } catch {}

        interface TemplateStructureScan {
            beginCount: number;
            endCount: number;
            names: Set<string>;
            namesInsideRepeat: Set<string>;
            nameStats: Map<string, { total: number; insideRepeat: number }>;
        }
        const scanTemplateStructure = (html: string): TemplateStructureScan => {
            const tokenRe = /<!--\s*(TemplateBeginRepeat\s+name="([^"]+)"|TemplateEndRepeat|TemplateBeginEditable\s+name="([^"]+)"|TemplateEndEditable)\s*-->/gi;
            const repeatStack: string[] = [];
            const names = new Set<string>();
            const namesInsideRepeat = new Set<string>();
            const nameStats = new Map<string, { total: number; insideRepeat: number }>();
            let beginCount = 0;
            let endCount = 0;
            let tokenMatch: RegExpExecArray | null;
            while ((tokenMatch = tokenRe.exec(html)) !== null) {
                const raw = tokenMatch[1] ?? '';
                if (/^TemplateBeginRepeat/i.test(raw)) {
                    repeatStack.push(tokenMatch[2] ?? '');
                    continue;
                }
                if (/^TemplateEndRepeat/i.test(raw)) {
                    if (repeatStack.length) repeatStack.pop();
                    continue;
                }
                if (/^TemplateBeginEditable/i.test(raw)) {
                    beginCount++;
                    const name = tokenMatch[3] ?? '';
                    names.add(name);
                    const insideRepeat = repeatStack.length > 0;
                    if (insideRepeat) namesInsideRepeat.add(name);
                    const stats = nameStats.get(name) ?? { total: 0, insideRepeat: 0 };
                    stats.total += 1;
                    if (insideRepeat) stats.insideRepeat += 1;
                    nameStats.set(name, stats);
                    continue;
                }
                if (/^TemplateEndEditable/i.test(raw)) {
                    endCount++;
                    continue;
                }
            }
            return { beginCount, endCount, names, namesInsideRepeat, nameStats };
        };
        const collectInstanceEditableNames = (html: string): Set<string> => {
            const names = new Set<string>();
            const re = /<!--\s*InstanceBeginEditable\s+name="([^"]+)"\s*-->/gi;
            let m: RegExpExecArray | null;
            while ((m = re.exec(html)) !== null) names.add(m[1]);
            return names;
        };

        const childStructure = scanTemplateStructure(templateContent);
        const namesInsideRepeat = new Set<string>(childStructure.namesInsideRepeat);
        const instanceEditableNames = collectInstanceEditableNames(instanceContent);
        for (const repeatEditableName of namesInsideRepeat) {
            if (preservedRegions.has(repeatEditableName)) preservedRegions.delete(repeatEditableName);
        }

        const escapeForRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        interface EditableWrapOptions { singleLine?: boolean; }
        const unwrapEditable = (name: string, rawContent: string | undefined): string => {
            let working = rawContent ?? '';
            const escName = escapeForRegex(name);
            const leadingRe = new RegExp(`^\s*<!--\s*InstanceBeginEditable\s+name="${escName}"\s*-->\s*`, 'i');
            const trailingRe = new RegExp(`\s*<!--\s*InstanceEndEditable\s*-->\s*$`, 'i');
            if (leadingRe.test(working)) working = working.replace(leadingRe, '');
            if (trailingRe.test(working)) working = working.replace(trailingRe, '');
            return working;
        };
        const wrapEditable = (name: string, rawContent: string | undefined, options?: EditableWrapOptions): string => {
            const singleLine = options?.singleLine ?? false;
            const escName = escapeForRegex(name);
            let body = rawContent ?? '';
            if (/<!--\s*Template(Begin|End)Editable/i.test(body)) {
                // Only convert nested Template editables to Instance editables for instance pages.
                // For child templates, keep Template markers so nested repeat/editables remain authorable.
                if (!childTemplateMode) {
                    body = body
                        .replace(/<!--\s*TemplateBeginEditable\s+name="([^"]+)"\s*-->/gi, '<!-- InstanceBeginEditable name="$1" -->')
                        .replace(/<!--\s*TemplateEndEditable\s*-->/gi, '<!-- InstanceEndEditable -->');
                }
            }
            // If body is already an Instance-wrapped block of the same name, return as-is
            const fullInstanceBlockRe = new RegExp(`^\\s*<!--\\s*InstanceBeginEditable\\s+name="${escName}"\\s*-->[\\s\\S]*<!--\\s*InstanceEndEditable\\s*-->\\s*$`, 'i');
            if (fullInstanceBlockRe.test(body)) return body;
            let working = body;
            let removedLeading = false;
            const leadingRe = new RegExp(`^\\s*<!--\\s*InstanceBeginEditable\\s+name="${escName}"\\s*-->`, 'i');
            if (leadingRe.test(working)) { working = working.replace(leadingRe, ''); removedLeading = true; }
            if (removedLeading) {
                const trailingRe = new RegExp(`\\s*<!--\\s*InstanceEndEditable\\s*-->\\s*$`, 'i');
                if (trailingRe.test(working)) working = working.replace(trailingRe, '');
            }
            if (!singleLine) {
                const needsLead = working.length > 0 && !working.startsWith('\n');
                const needsTail = working.length > 0 && !working.endsWith('\n');
                if (needsLead) working = '\n' + working;
                if (needsTail) working = working + '\n';
            }
            // Always wrap with Instance markers at the top level; child templates can still contain
            // nested Template editables within the body.
            return `<!-- InstanceBeginEditable name="${name}" -->${working}<!-- InstanceEndEditable -->`;
        };

        // Build segments (static/region)
        type Segment = { kind: 'static'; text: string } | { kind: 'region'; region: ParsedRegion };
        const segments: Segment[] = [];
        let cursor = 0;
        for (const r of topLevelRegions) {
            if (r.begin > cursor) segments.push({ kind: 'static', text: templateContent.slice(cursor, r.begin) });
            segments.push({ kind: 'region', region: r });
            cursor = r.end;
        }
        if (cursor < templateContent.length) segments.push({ kind: 'static', text: templateContent.slice(cursor) });
        console.log(`[DW-MERGE] Segments -> static:${segments.filter(s=>s.kind==='static').length} region:${segments.filter(s=>s.kind==='region').length}`);
        if (outputChannel) outputChannel.appendLine(`[DW-MERGE] Segments -> static:${segments.filter(s=>s.kind==='static').length} region:${segments.filter(s=>s.kind==='region').length}`);

        // Process optional regions and template syntax in segments
        const processOptionalRegions = (content: string): string => {
            if (childTemplateMode) {
                // In child templates: convert parent TemplateParam to InstanceParam in static segments.
                // Keep authoring markers otherwise; optionally resolve placeholders in special mode.
                let processed = convertTemplateParamMarkers(content);
                if (updateEditableAttributesMode) {
                    processed = substituteParamPlaceholdersChildMode(processed);
                }
                return processed;
            }
            let processedContent = convertTemplateParamMarkers(content);
            processedContent = processedContent.replace(/<!--\s*TemplateInfo\s+[^>]*-->/g, '');
            processedContent = processedContent.replace(/<!--\s*TemplateBeginIf\s+cond="([^"]+)"\s*-->/g, '<!-- InstanceBeginIf cond="$1" -->');
            processedContent = processedContent.replace(/<!--\s*TemplateEndIf\s*-->/g, '<!-- InstanceEndIf -->');
            for (const region of optionalRegions) {
                const shouldInclude = evaluateExpression(region.expression, instanceParameters as any);
                if (!shouldInclude) {
                    const escapedExpr = region.expression.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const regionRegex = new RegExp(`<!--\\s*(?:Template|Instance)BeginIf\\s+cond="${escapedExpr}"\\s*-->[\\s\\S]*?<!--\\s*(?:Template|Instance)EndIf\\s*-->`, 'g');
                    processedContent = processedContent.replace(regionRegex, '');
                    console.log(`[DW-MERGE] Removed optional region with expression: ${region.expression}`);
                    if (outputChannel) outputChannel.appendLine(`[DW-MERGE] Removed optional region: ${region.expression} (evaluated to false)`);
                } else {
                    console.log(`[DW-MERGE] Keeping optional region with expression: ${region.expression}`);
                    if (outputChannel) outputChannel.appendLine(`[DW-MERGE] Keeping optional region: ${region.expression} (evaluated to true)`);
                }
            }
            return substituteParamPlaceholders(processedContent);
        };

        // InstanceBegin handling
        const instanceBeginMatch = instanceContent.match(/<!--\s*InstanceBegin\s+template="([^"]+)"[^>]*-->/i);
        let instanceBegin = instanceBeginMatch ? instanceBeginMatch[0] : `<!-- InstanceBegin template="/Templates/${path.basename(templatePath)}" codeOutsideHTMLIsLocked="true" -->`;
        if (instanceBeginMatch) instanceBegin = instanceBeginMatch[0];
        else if (templateLockStatus) instanceBegin = `<!-- InstanceBegin template="/Templates/${path.basename(templatePath)}" codeOutsideHTMLIsLocked="${templateLockStatus}" -->`;
        if (templateLockStatus) {
            const lockAttrRegex = /codeOutsideHTMLIsLocked="(true|false)"/i;
            if (lockAttrRegex.test(instanceBegin)) {
                const currentLock = instanceBegin.match(lockAttrRegex)?.[1].toLowerCase();
                if (currentLock !== templateLockStatus) {
                    console.log(`[DW-MERGE] Aligning codeOutsideHTMLIsLocked from ${currentLock} to ${templateLockStatus}`);
                    if (outputChannel) outputChannel.appendLine(`[DW-MERGE] Aligning codeOutsideHTMLIsLocked from ${currentLock} to ${templateLockStatus}`);
                }
                instanceBegin = instanceBegin.replace(lockAttrRegex, `codeOutsideHTMLIsLocked="${templateLockStatus}"`);
            } else {
                console.log(`[DW-MERGE] Adding missing codeOutsideHTMLIsLocked="${templateLockStatus}" attribute to InstanceBegin`);
                if (outputChannel) outputChannel.appendLine(`[DW-MERGE] Adding missing codeOutsideHTMLIsLocked="${templateLockStatus}" attribute to InstanceBegin`);
                instanceBegin = instanceBegin.replace(/-->$/, ` codeOutsideHTMLIsLocked="${templateLockStatus}" -->`);
            }
        }
        for (const s of segments) {
            // Remove parent's InstanceBegin marker from template static segments, but do NOT gobble following whitespace/newlines.
            if (s.kind === 'static') s.text = s.text.replace(/<!--\s*InstanceBegin\s+template="[^"]+"[^>]*-->/gi, '');
        }

        let rebuilt = '';
        let injectedInstanceBegin = false;
        // Preserve original placement style of InstanceBegin relative to <html> in the instance file
        const instHtmlMatch = /<html[^>]*>/i.exec(instanceContent);
        let placeInstanceBeginOnSameLine = false;
        if (instHtmlMatch) {
            const htmlEnd = instHtmlMatch.index + instHtmlMatch[0].length;
            const nextNewline = instanceContent.indexOf('\n', htmlEnd);
            const slice = nextNewline === -1 ? instanceContent.slice(htmlEnd) : instanceContent.slice(htmlEnd, nextNewline);
            placeInstanceBeginOnSameLine = /<!--\s*InstanceBegin\b/i.test(slice);
        }
        const originalStaticBytes = segments.filter(s=>s.kind==='static').reduce((a,b)=>a+ (b as any).text.length,0);
        for (const s of segments) {
            if (s.kind === 'static') {
                if (!injectedInstanceBegin) {
                    const htmlTagRegex = /<html[^>]*>/i;
                    if (htmlTagRegex.test(s.text)) {
                        rebuilt += s.text.replace(htmlTagRegex, match => placeInstanceBeginOnSameLine ? `${match}${instanceBegin}` : `${match}\n${instanceBegin}`);
                        injectedInstanceBegin = true;
                        continue;
                    }
                }
                rebuilt += processOptionalRegions(s.text);
            } else {
                const name = s.region.name;
                if (namesInsideRepeat.has(name)) { rebuilt += s.region.full; continue; }
                const preserved = preservedRegions.get(name);
                const defaultContent = s.region.defaultContent;
                let contentToUse = preserved !== undefined ? preserved : defaultContent;
                if (preserved === undefined) console.log(`[DW-MERGE] Region "${name}" new (using template default)`);
                const singleLine = !/\n/.test(s.region.full.trim());
                // Child templates: if parent region is TemplateBeginEditable, wrap; if it's InstanceBeginEditable, emit body-only.
                if (childTemplateMode) {
                    // In Update Editable Attributes mode, prefer the parent's default content for parent instance-defined regions
                    // so that attribute placeholders are substituted using the child's InstanceParam values, overriding stale child literals.
                    let forcedParentContent = false;
                    if (updateEditableAttributesMode && s.region.kind === 'instance') {
                        contentToUse = defaultContent;
                        forcedParentContent = true;
                    }
                    let parentDerived = contentToUse ?? '';
                    // Only convert TemplateParam → InstanceParam when the content originated from the parent (or was forced parent in editable-attr mode).
                    const contentFromParent = forcedParentContent || preserved === undefined;
                    if (contentFromParent) {
                        parentDerived = convertTemplateParamMarkers(parentDerived);
                    }
                    parentDerived = substituteParamPlaceholdersChildMode(parentDerived);
                    if (s.region.kind === 'template') {
                        const wrapped = wrapEditable(name, parentDerived, { singleLine });
                        rebuilt += wrapped;
                    } else {
                        // Parent region is instance-defined. If the child originally had this editable region,
                        // keep it wrapped; otherwise emit body-only.
                        if (instanceEditableNames.has(name)) {
                            const wrapped = wrapEditable(name, parentDerived, { singleLine });
                            rebuilt += wrapped;
                        } else {
                            const unwrapped = unwrapEditable(name, parentDerived);
                            rebuilt += unwrapped;
                        }
                    }
                } else {
                    // Instances: wrap with Instance markers; for defaults, convert params and resolve placeholders
                    let parentDerived = contentToUse ?? '';
                    if (preserved === undefined) {
                        parentDerived = convertTemplateParamMarkers(parentDerived);
                        parentDerived = substituteParamPlaceholders(parentDerived);
                    }
                    const wrapped = wrapEditable(name, parentDerived, { singleLine });
                    rebuilt += wrapped;
                }
            }
        }

        if (templateRepeatBlocks.size) {
            if (instanceRepeatBlocks.size) {
                for (const [rName] of templateRepeatBlocks.entries()) {
                    const instBlock = instanceRepeatBlocks.get(rName);
                    if (instBlock) {
                        const repRe = new RegExp(`<!--\\s*TemplateBeginRepeat\\s+name=\"${escapeForRegex(rName)}\"\\s*-->[\\s\\S]*?<!--\\s*TemplateEndRepeat\\s*-->`, 'i');
                        if (repRe.test(rebuilt)) {
                            rebuilt = rebuilt.replace(repRe, instBlock);
                            console.log(`[DW-MERGE] Preserved repeat block "${rName}" from instance`);
                            if (outputChannel) outputChannel.appendLine(`[DW-MERGE] Preserved repeat block "${rName}" from instance`);
                        }
                    }
                }
            }
            if (!childTemplateMode) {
                rebuilt = rebuilt.replace(/<!--\s*TemplateBeginRepeat\s+name="([^"]+)"\s*-->[\s\S]*?<!--\s*TemplateEndRepeat\s*-->/gi, (full) => {
                let converted = full
                    .replace(/TemplateBeginRepeat/g, 'InstanceBeginRepeat')
                    .replace(/TemplateEndRepeat/g, 'InstanceEndRepeat')
                    .replace(/TemplateBeginRepeatEntry/g, 'InstanceBeginRepeatEntry')
                    .replace(/TemplateEndRepeatEntry/g, 'InstanceEndRepeatEntry');
                const hasEntry = /InstanceBeginRepeatEntry/.test(converted);
                if (!hasEntry) {
                    const m = /<!--\s*InstanceBeginRepeat\s+name="([^"]+)"\s*-->([\s\S]*?)<!--\s*InstanceEndRepeat\s*-->/i.exec(converted);
                    if (m) {
                        const inner = m[2].trim();
                        const wrappedInner = `\n<!-- InstanceBeginRepeatEntry -->\n${inner}\n<!-- InstanceEndRepeatEntry -->\n`;
                        converted = converted.replace(m[0], `${m[0].replace(m[2], wrappedInner)}`);
                    }
                }
                return converted;
                });
            }
        }

        if (!childTemplateMode) {
            try {
                rebuilt = rebuilt.replace(/<!--\s*TemplateEndRepeat\s*-->/gi, '<!-- InstanceEndRepeat -->');
                const beginRepeatRe = /<!--\s*InstanceBeginRepeat\s+name="([^"]+)"\s*-->/gi;
                const requiredClosers: {name:string; index:number}[] = [];
                let br: RegExpExecArray | null;
                while ((br = beginRepeatRe.exec(rebuilt)) !== null) requiredClosers.push({ name: br[1], index: br.index });
                const endRepeatCount = (rebuilt.match(/<!--\s*InstanceEndRepeat\s*-->/gi) || []).length;
                if (endRepeatCount < requiredClosers.length) {
                    const missing = requiredClosers.length - endRepeatCount;
                    let insertionPoint = rebuilt.search(/<\/tbody>/i);
                    if (insertionPoint === -1) insertionPoint = rebuilt.search(/<\/table>/i);
                    if (insertionPoint === -1) insertionPoint = rebuilt.length;
                    const insertion = '\n' + Array(missing).fill('<!-- InstanceEndRepeat -->').join('\n') + '\n';
                    rebuilt = rebuilt.slice(0, insertionPoint) + insertion + rebuilt.slice(insertionPoint);
                }
            } catch (normErr) {
                console.warn('[DW-MERGE] Repeat normalization issue:', normErr);
            }
        }

        rebuilt = rebuilt.replace(/<!--\s*InstanceEnd\s*-->/gi, '');
        rebuilt = rebuilt.replace(/(<\/html>)/i, '<!-- InstanceEnd -->$1');
        rebuilt = rebuilt.replace(/\n{4,}/g, '\n\n');

        for (const [pName, pContent] of preservedRegions.entries()) {
            if (!templateRegionNames.has(pName) && allTemplateEditableNames.has(pName)) {
                const blockRe = new RegExp(`<!--\\s*TemplateBeginEditable\\s+name=\"${escapeForRegex(pName)}\"\\s*-->([\\s\\S]*?)<!--\\s*TemplateEndEditable\\s*-->`, 'i');
                if (blockRe.test(rebuilt)) {
                    const preferSingleLine = !/\n/.test(pContent);
                    rebuilt = rebuilt.replace(blockRe, wrapEditable(pName, pContent, { singleLine: preferSingleLine }));
                    console.log(`[DW-MERGE] Fallback injected preserved region "${pName}" into rebuilt content`);
                }
            }
        }

        if (!childTemplateMode && shouldRemoveTemplateInfo) {
            const beforeRemoval = rebuilt;
            rebuilt = rebuilt.replace(/<!--\s*TemplateInfo\s+codeOutsideHTMLIsLocked="(true|false)"\s*-->/gi, '');
            if (beforeRemoval !== rebuilt) {
                console.log('[DW-MERGE] Removed TemplateInfo codeOutsideHTMLIsLocked comment from instance');
                if (outputChannel) outputChannel.appendLine('[DW-MERGE] Removed TemplateInfo codeOutsideHTMLIsLocked comment from instance');
                rebuilt = rebuilt.replace(/\n{3,}/g, '\n\n');
            }
        }

        const beforeFinalCleanup = rebuilt;
        // In child templates, preserve TemplateParam markers and do not substitute placeholders globally
        if (!childTemplateMode) {
            rebuilt = convertTemplateParamMarkers(rebuilt);
            rebuilt = substituteParamPlaceholders(rebuilt);
        }
        if (!childTemplateMode) {
            rebuilt = rebuilt.replace(/<!--\s*TemplateBeginIf\b([^>]*)-->/gi, (_match, attrs) => `<!-- InstanceBeginIf${attrs}-->`);
            rebuilt = rebuilt.replace(/<!--\s*TemplateEndIf\s*-->/gi, '<!-- InstanceEndIf -->');
            rebuilt = rebuilt.replace(/<!--\s*TemplateInfo\s+[^>]*-->/g, '');
        }
        rebuilt = rebuilt.replace(/<!--\s*Below line\. This should have been removed[^>]*-->/gi, '');
        rebuilt = rebuilt.replace(/\n\s*\n\s*\n/g, '\n\n');
        if (beforeFinalCleanup !== rebuilt) {
            console.log('[DW-MERGE] Applied final template syntax cleanup to instance');
            if (outputChannel) outputChannel.appendLine('[DW-MERGE] Applied final template syntax cleanup to instance');
        }

        // Parameters sanitation for instance pages (non-child templates):
        // - Never output TemplateParam in child files
        // - If the parent template used InstanceParam for a name, remove only those InstanceParam markers by name from the child output
        if (!childTemplateMode) {
            const parentInstanceParams = parseInstanceParameters(templateContent) || {};
            // Convert any lingering TemplateParam to InstanceParam one-to-one (safety net)
            rebuilt = rebuilt.replace(
                /<!--\s*TemplateParam\s+name="([^"]+)"\s+type="([^"]+)"\s+value="([^"]*?)"\s*-->/gi,
                '<!-- InstanceParam name="$1" type="$2" value="$3" -->'
            );
            const parentIpNamesArr = Object.keys(parentInstanceParams).map(n => (n || '').trim()).filter(Boolean);
            if (parentIpNamesArr.length > 0) {
                for (const ipName of parentIpNamesArr) {
                    const esc = ipName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const lineRe = new RegExp(`^[\\t ]*<!--\\s*InstanceParam\\b[^>]*\\bname="${esc}"[^>]*-->[\\t ]*\r?\n?`, 'gmi');
                    rebuilt = rebuilt.replace(lineRe, '');
                    const inlineRe = new RegExp(`<!--\\s*InstanceParam\\b[^>]*\\bname="${esc}"[^>]*-->`, 'gi');
                    rebuilt = rebuilt.replace(inlineRe, '');
                }
            }
        } else {
            // Child template: Parameter sanitation based on parent's markers
            // Only strip InstanceParam markers in the child that correspond to names the parent
            // already defined as InstanceParam. Keep InstanceParam converted from TemplateParam.
            try {
                const parentInstanceParams = parseInstanceParameters(templateContent) || {};
                const parentIpNamesArr = Object.keys(parentInstanceParams).map((n) => (n || '').trim()).filter((s): s is string => !!s);
                if (parentIpNamesArr.length > 0) {
                    for (const ipName of parentIpNamesArr) {
                        const esc = ipName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const lineRe = new RegExp(`^[\t ]*<!--\s*InstanceParam\b[^>]*\bname="${esc}"[^>]*-->[\t ]*\r?\n?`, 'gmi');
                        rebuilt = rebuilt.replace(lineRe, '');
                        const inlineRe = new RegExp(`<!--\s*InstanceParam\b[^>]*\bname="${esc}"[^>]*-->`, 'gi');
                        rebuilt = rebuilt.replace(inlineRe, '');
                    }
                }
            } catch {}
            // Note: We intentionally retain child InstanceParam generated from parent TemplateParam.
        }

        try {
            const outsideLockFalse = /codeOutsideHTMLIsLocked\s*=\s*"false"/i.test(instanceBegin);
            if (outsideLockFalse) {
                const instHtmlOpen = (() => { const m = /<html[^>]*>/i.exec(instanceContent); return m ? { idx: m.index, len: m[0].length } : null; })();
                const instHtmlClose = (() => { let m: RegExpExecArray | null; let last: RegExpExecArray | null = null; const r = /<\/html>/ig; while ((m = r.exec(instanceContent)) !== null) last = m; return last ? { idx: last.index, len: last[0].length } : null; })();
                const rebHtmlOpen = (() => { const m = /<html[^>]*>/i.exec(rebuilt); return m ? { idx: m.index, len: m[0].length } : null; })();
                if (instHtmlOpen && rebHtmlOpen) {
                    const instancePrefix = instanceContent.slice(0, instHtmlOpen.idx);
                    rebuilt = instancePrefix + rebuilt.slice(rebHtmlOpen.idx);
                    console.log('[DW-MERGE] Preserved code before <html> due to codeOutsideHTMLIsLocked="false"');
                }
                const instEndExecAll = (() => { let m: RegExpExecArray | null; let last: RegExpExecArray | null = null; const r = /<!--\s*InstanceEnd\s*-->/ig; while ((m = r.exec(instanceContent)) !== null) last = m; return last; })();
                if (instEndExecAll) {
                    const tail = instanceContent.slice(instEndExecAll.index + instEndExecAll[0].length);
                    const afterHtml = tail.replace(/^[\s\r\n]*<\/html>/i, '');
                    if (afterHtml.length > 0) {
                        rebuilt = rebuilt + afterHtml;
                        console.log('[DW-MERGE] Preserved content after InstanceEnd/</html>');
                    }
                } else if (instHtmlClose) {
                    const afterHtmlOnly = instanceContent.slice(instHtmlClose.idx + instHtmlClose.len);
                    if (afterHtmlOnly.length > 0) {
                        rebuilt = rebuilt + afterHtmlOnly;
                        console.log('[DW-MERGE] Preserved content after </html> (no InstanceEnd found)');
                    }
                }
            }
        } catch (e) {
            console.warn('[DW-MERGE] Failed to preserve outside-HTML code:', e);
        }

        // Ensure InstanceBegin exists: if it was not injected earlier (e.g., <html> tag within a region),
        // add it after <html> when present, else prepend at top. Applies to both instances and child templates.
        if (!/<!--\s*InstanceBegin\s+template="[^"]+"[^>]*-->/.test(rebuilt)) {
            const htmlOpenRe = /<html[^>]*>/i;
            if (htmlOpenRe.test(rebuilt)) {
                rebuilt = rebuilt.replace(htmlOpenRe, m => placeInstanceBeginOnSameLine ? `${m}${instanceBegin}` : `${m}\n${instanceBegin}`);
            } else {
                rebuilt = `${instanceBegin}\n${rebuilt}`;
            }
        }

        // Ensure InstanceEnd exists at document end for both instances and child templates
        {
            const hasInstEnd = /<!--\s*InstanceEnd\s*-->/i.test(rebuilt);
            const hasHtmlClose = /<\/html>/i.test(rebuilt);
            if (!hasInstEnd && hasHtmlClose) rebuilt = rebuilt.replace(/(<\/html>)/i, '<!-- InstanceEnd -->$1');
            else if (!hasInstEnd && !hasHtmlClose) rebuilt += '\n<!-- InstanceEnd --></html>';
            else if (hasInstEnd && !hasHtmlClose) rebuilt += '\n</html>';
            rebuilt = rebuilt.replace(/<\/html>\s*<!--\s*InstanceEnd\s*-->/ig, '<!-- InstanceEnd --></html>');
        }

        // Inject InstanceParam header comments for any parent TemplateParam names that are not declared
        // as InstanceParam by the parent. This mirrors Dreamweaver behavior where TemplateParam definitions
        // in the parent produce InstanceParam comments in child outputs, independent of where they appear.
        try {
            const parentIpMap = parseInstanceParameters(templateContent) || {};
            const parentIpNames = new Set<string>(Object.keys(parentIpMap));
            const parentAllParams = parseTemplateParameters(templateContent) || [];
            const templOnlyByName = new Map<string, { type: string; value: string }>();
            for (const p of parentAllParams) {
                const n = (p.name || '').trim();
                if (!n || parentIpNames.has(n)) continue; // skip names parent already declared as InstanceParam
                if (!templOnlyByName.has(n)) templOnlyByName.set(n, { type: p.type, value: p.value });
            }
            if (templOnlyByName.size > 0) {
                // Avoid injecting duplicates already present in rebuilt
                const existingIpNames = new Set<string>();
                try {
                    const ipNameRe = /<!--\s*InstanceParam\s+name="([^"]+)"/gi;
                    let mm: RegExpExecArray | null;
                    while ((mm = ipNameRe.exec(rebuilt)) !== null) existingIpNames.add((mm[1] || '').trim());
                } catch {}
                // Capture original InstanceParam text and same-line placement from instanceContent
                const originalIpByName = new Map<string, { text: string; sameLine: boolean }>();
                try {
                    const instBeginIdx = instanceContent.search(/<!--\s*InstanceBegin\b[\s\S]*?-->/i);
                    const instBeginLineStart = instBeginIdx >= 0 ? instanceContent.lastIndexOf('\n', instBeginIdx) : -1;
                    const instBeginLineEnd = instBeginIdx >= 0 ? instanceContent.indexOf('\n', instBeginIdx) : -1;
                    const ipRe = /<!--\s*InstanceParam\s+name="([^"]+)"[^>]*-->/gi;
                    let ipm: RegExpExecArray | null;
                    while ((ipm = ipRe.exec(instanceContent)) !== null) {
                        const name = (ipm[1] || '').trim();
                        const text = ipm[0];
                        let sameLine = false;
                        if (instBeginIdx >= 0 && instBeginLineEnd >= 0) {
                            // If the InstanceParam occurs on the same line as InstanceBegin in the original file
                            const ipIdx = ipm.index;
                            sameLine = ipIdx > instBeginIdx && ipIdx < instBeginLineEnd;
                        }
                        originalIpByName.set(name, { text, sameLine });
                    }
                } catch {}
                const injectSameLine: string[] = [];
                const injectNextLines: string[] = [];
                for (const [name, meta] of templOnlyByName.entries()) {
                    if (existingIpNames.has(name)) continue;
                    const val = ensureParameterValue(name, meta.value);
                    const original = originalIpByName.get(name);
                    if (original) {
                        if (original.sameLine) injectSameLine.push(original.text);
                        else injectNextLines.push(original.text);
                    } else {
                        const line = `<!-- InstanceParam name="${name}" type="${meta.type}" value="${val}" -->`;
                        injectNextLines.push(line);
                    }
                }
                if (injectSameLine.length > 0 || injectNextLines.length > 0) {
                    const beginRe = /<!--\s*InstanceBegin\s+template="[^"]+"[^>]*-->/i;
                    if (beginRe.test(rebuilt)) {
                        rebuilt = rebuilt.replace(beginRe, m => {
                            let out = m;
                            if (injectSameLine.length > 0) out = `${out} ${injectSameLine.join(' ')}`;
                            if (injectNextLines.length > 0) out = `${out}\n${injectNextLines.join('\n')}`;
                            return out;
                        });
                    } else {
                        // As a fallback (shouldn't happen), prepend
                        const header = [instanceBegin];
                        if (injectSameLine.length > 0) header[0] = `${header[0]} ${injectSameLine.join(' ')}`;
                        if (injectNextLines.length > 0) header.push(...injectNextLines);
                        rebuilt = `${header.join('\n')}\n${rebuilt}`;
                    }
                }
            }
        } catch {}

        // Final parameter cleanup for child templates:
        // Per rules: remove InstanceParam markers in the child when the parent declares that name as InstanceParam.
        // Run this after any header injection to guarantee compliance.
        if (childTemplateMode) {
            try {
                const parentInstanceParams = parseInstanceParameters(templateContent) || {};
                const parentIpNamesArr = Object.keys(parentInstanceParams).map((n) => (n || '').trim()).filter((s): s is string => !!s);
                if (parentIpNamesArr.length > 0) {
                    let removedNames: string[] = [];
                    for (const ipName of parentIpNamesArr) {
                        const esc = ipName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const lineRe = new RegExp(`^[\t ]*<!--\\s*InstanceParam\\b[^>]*\\bname="${esc}"[^>]*-->[\t ]*\r?\n?`, 'gmi');
                        const inlineRe = new RegExp(`<!--\\s*InstanceParam\\b[^>]*\\bname="${esc}"[^>]*-->`, 'gi');
                        const before = rebuilt;
                        rebuilt = rebuilt.replace(lineRe, '');
                        rebuilt = rebuilt.replace(inlineRe, '');
                        if (before !== rebuilt) removedNames.push(ipName);
                    }
                    if (removedNames.length && outputChannel) {
                        outputChannel.appendLine(`[PARAM-CLEANUP] Removed child InstanceParam(s) declared by parent: ${removedNames.join(', ')}`);
                    }
                }
            } catch {}
        }

        function extractBgcolorTernary(template: string): {repeatName: string; colorA: string; colorB: string}[] {
            const results: {repeatName: string; colorA: string; colorB: string}[] = [];
            const repeatBlockRe = /<!--\s*TemplateBeginRepeat\s+name="([^"]+)"\s*-->([\s\S]*?)<!--\s*TemplateEndRepeat\s*-->/gi;
            let rb: RegExpExecArray | null;
            while ((rb = repeatBlockRe.exec(template)) !== null) {
                const rName = rb[1];
                const block = rb[2];
                const ternaryRe = /<tr[^>]*\sbgcolor="@@\(_index\s*&\s*1\s*\?\s*'([^']+)'\s*:\s*'([^']+)'\)@@"[^>]*>/i;
                const m = ternaryRe.exec(block);
                if (m) results.push({ repeatName: rName, colorA: m[1], colorB: m[2] });
            }
            return results;
        }
        function applyAlternatingBgColors(instanceHtml: string, patterns: {repeatName: string; colorA: string; colorB: string}[]): string {
            if (!patterns.length) return instanceHtml;
            for (const pat of patterns) {
                const instRepeatRe = new RegExp(`(<!--\\s*InstanceBeginRepeat\\s+name=\"${pat.repeatName.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}\"\\s*-->)([\\s\\S]*?)(<!--\\s*InstanceEndRepeat\\s*-->)`, 'i');
                const match = instRepeatRe.exec(instanceHtml);
                if (!match) continue;
                const before = instanceHtml.slice(0, match.index);
                const middle = match[2];
                const after = instanceHtml.slice(match.index + match[0].length);
                const entryRe = /(<!--\s*InstanceBeginRepeatEntry\s*-->)([\s\S]*?)(<!--\s*InstanceEndRepeatEntry\s*-->)/g;
                let em: RegExpExecArray | null;
                let rebuiltEntries = '';
                let idx = 0;
                while ((em = entryRe.exec(middle)) !== null) {
                    const entryFull = em[0];
                    const desired = (idx & 1) ? pat.colorA : pat.colorB;
                    const swapped = entryFull.replace(/(<tr[^>]*\sbgcolor=")(#?[A-Fa-f0-9]{3,6})("[^>]*>)/, (_full, p1, _old, p3) => `${p1}${desired}${p3}`);
                    rebuiltEntries += swapped;
                    idx++;
                }
                if (rebuiltEntries) {
                    const newBlock = match[1] + rebuiltEntries + match[3];
                    instanceHtml = before + newBlock + after;
                }
            }
            return instanceHtml;
        }
        const ternaryPatterns = extractBgcolorTernary(templateContent);
        if (!childTemplateMode && ternaryPatterns.length) {
            const beforeColorFix = rebuilt;
            rebuilt = applyAlternatingBgColors(rebuilt, ternaryPatterns);
            if (beforeColorFix !== rebuilt) console.log(`[DW-MERGE] Applied alternating bgcolor logic for repeats: ${ternaryPatterns.map(p=>p.repeatName).join(', ')}`);
        }

        let nestedEditableMode = false;
        const ignoredParentEditableNames = new Set<string>();
        let parentTemplateStructure: TemplateStructureScan | null = null;
        try {
            const instBeginMatch = /<!--\s*InstanceBegin\s+template="([^"]+)"[^>]*-->/i.exec(templateContent);
            if (instBeginMatch) {
                const relParent = instBeginMatch[1];
                const ws = vscode.workspace.workspaceFolders?.[0];
                if (ws) {
                    const parentFsPath = path.join(ws.uri.fsPath, relParent.replace(/^\//, ''));
                    if (fs.existsSync(parentFsPath)) {
                        const parentText = fs.readFileSync(parentFsPath, 'utf8');
                        parentTemplateStructure = scanTemplateStructure(parentText);
                        const parentNames = parentTemplateStructure.names;
                        for (const name of Array.from(parentNames)) {
                            if (!childStructure.names.has(name) && !instanceEditableNames.has(name)) ignoredParentEditableNames.add(name);
                        }
                        const childHasTemplateMarkers = childStructure.beginCount > 0;
                        if (parentNames.size > 0 && (childHasTemplateMarkers || ignoredParentEditableNames.size > 0)) nestedEditableMode = true;
                    }
                }
            }
        } catch { }

        if (!childTemplateMode && nestedEditableMode) {
            const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const childTemplateEditableNames = new Set<string>(Array.from(childStructure.names).filter(name => !namesInsideRepeat.has(name)));
            let before = rebuilt;
            for (const childName of Array.from(childTemplateEditableNames)) {
                if (!preservedRegions.has(childName)) continue;
                const blockRe = new RegExp(`<!--\\s*TemplateBeginEditable\\s+name=\"${esc(childName)}\"\\s*-->([\\s\\S]*?)<!--\\s*TemplateEndEditable\\s*-->`, 'i');
                if (blockRe.test(rebuilt)) {
                    const pContent = preservedRegions.get(childName)!;
                    const preferSingleLine = !/\n/.test(pContent);
                    rebuilt = rebuilt.replace(blockRe, wrapEditable(childName, pContent, { singleLine: preferSingleLine }));
                    if (outputChannel) outputChannel.appendLine(`[NESTED] Promoted child editable "${childName}" with page content.`);
                }
            }
            rebuilt = rebuilt
                .replace(/<!--\s*TemplateBeginEditable\s+name="([^"]+)"\s*-->/gi, '<!-- InstanceBeginEditable name="$1" -->')
                .replace(/<!--\s*TemplateEndEditable\s*-->/gi, '<!-- InstanceEndEditable -->');
            const unwrapParentWrapper = (html: string, parentName: string, childNames: Set<string>, instanceNames: Set<string>): string => {
                const beginRe = new RegExp(`<!--\\s*InstanceBeginEditable\\s+name=\"${esc(parentName)}\"\\s*-->`, 'gi');
                const tokenRe = /(<!--\s*InstanceBeginEditable\b[^>]*-->|<!--\s*InstanceEndEditable\s*-->)/gi;
                let out = html;
                let m: RegExpExecArray | null;
                while ((m = beginRe.exec(out)) !== null) {
                    const beginStart = m.index;
                    const afterBegin = beginRe.lastIndex;
                    tokenRe.lastIndex = afterBegin;
                    let depth = 1;
                    let t: RegExpExecArray | null;
                    let endStart = -1;
                    let endEnd = -1;
                    while ((t = tokenRe.exec(out)) !== null) {
                        const tok = t[1];
                        if (/InstanceBeginEditable/i.test(tok)) depth++;
                        else if (/InstanceEndEditable/i.test(tok)) depth--;
                        if (depth === 0) { endStart = t.index; endEnd = tokenRe.lastIndex; break; }
                    }
                    if (endStart === -1) break;
                    const segment = out.slice(beginStart, endEnd);
                    let containsChild = false;
                    for (const cn of Array.from(childNames)) {
                        const cnRe = new RegExp(`<!--\\s*InstanceBeginEditable\\s+name=\"${esc(cn)}\"`, 'i');
                        if (cnRe.test(segment)) { containsChild = true; break; }
                    }
                    const shouldUnwrap = containsChild || !instanceNames.has(parentName);
                    if (shouldUnwrap) {
                        const before = out.slice(0, beginStart);
                        const middle = out.slice(afterBegin, endStart);
                        const after = out.slice(endEnd);
                        out = before + middle + after;
                        beginRe.lastIndex = Math.max(0, beginStart - 1);
                    }
                }
                return out;
            };
            for (const parentName of Array.from(ignoredParentEditableNames)) {
                rebuilt = unwrapParentWrapper(rebuilt, parentName, childTemplateEditableNames, instanceEditableNames);
            }
            for (const childName of Array.from(childTemplateEditableNames)) {
                const preserved = preservedRegions.get(childName);
                if (preserved === undefined) continue;
                const pattern = new RegExp(`(<!--\\s*InstanceBeginEditable\\s+name=\"${esc(childName)}\"\\s*-->)([\\s\\S]*?)(<!--\\s*InstanceEndEditable\\s*-->)`, 'i');
                if (pattern.test(rebuilt)) rebuilt = rebuilt.replace(pattern, `$1${preserved}$3`);
            }
            if (before !== rebuilt && outputChannel) outputChannel.appendLine('[NESTED] Promoted child editables and unwrapped parent wrapper(s).');
        }

        if (instanceRepeatBlocks.size && !childTemplateMode) {
            const replaceRepeatBlock = (name: string, block: string): void => {
                const escName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const anyRepeatRe = new RegExp(`<!--\\s*(?:Template|Instance)BeginRepeat\\s+name="${escName}"\\s*-->[\\s\\S]*?<!--\\s*(?:Template|Instance)EndRepeat\\s*-->`, 'gi');
                if (anyRepeatRe.test(rebuilt)) rebuilt = rebuilt.replace(anyRepeatRe, block);
            };
            for (const [repeatName, instBlock] of instanceRepeatBlocks.entries()) replaceRepeatBlock(repeatName, instBlock);
        }

        const safetyIssues: string[] = [];
        const registerStructureIssues = (label: string, scan: TemplateStructureScan | null): void => {
            if (!scan) return;
            if (scan.beginCount !== scan.endCount) safetyIssues.push(`${label} editable markers mismatch (${scan.beginCount} begin vs ${scan.endCount} end)`);
            const duplicateNames: string[] = [];
            for (const [name, stats] of scan.nameStats.entries()) {
                const outsideRepeat = stats.total - stats.insideRepeat;
                if (outsideRepeat > 1) duplicateNames.push(name);
            }
            if (duplicateNames.length) safetyIssues.push(`${label} duplicate editable name(s): ${duplicateNames.join(', ')}`);
        };
        registerStructureIssues('Template', childStructure);
        // parentTemplateStructure handled earlier if present
        for (const [rName, rContent] of preservedRegions.entries()) {
            if (!allTemplateEditableNames.has(rName)) continue;
            if (namesInsideRepeat.has(rName)) {
                const hasRegion = new RegExp(`<!--\\s*InstanceBeginEditable\\s+name=\"${escapeForRegex(rName)}\"`, 'i').test(rebuilt);
                if (!hasRegion) safetyIssues.push(`Missing repeat editable region: "${rName}"`);
            } else {
                const trimmed = rContent.trim();
                const snippet = trimmed.slice(0, Math.min(40, trimmed.length));
                if (snippet && !rebuilt.includes(snippet)) safetyIssues.push(`Lost content for region: "${rName}"`);
            }
        }
        const countOcc = (content: string, name: string): number => {
            const re = new RegExp(`<!--\\s*InstanceBeginEditable\\s+name=\"${escapeForRegex(name)}\"`, 'gi');
            return (content.match(re) || []).length;
        };
        for (const name of allTemplateEditableNames) {
            if (namesInsideRepeat.has(name)) continue;
            const instCount = countOcc(instanceContent, name);
            const rebCount = countOcc(rebuilt, name);
            if (instCount > 0 && rebCount < instCount) safetyIssues.push(`Region "${name}": count decreased (${rebCount} < ${instCount})`);
        }
    if (!childTemplateMode && /<!--\s*Template(Begin|End)Repeat/.test(rebuilt)) safetyIssues.push('Template repeat markers remained in output (post-conversion)');
        for (const rn of Array.from(templateRepeatBlocks.keys())) {
            const instHas = new RegExp(`<!--\\s*InstanceBeginRepeat\\s+name=\"${escapeForRegex(rn)}\"`, 'i').test(instanceContent);
            if (instHas) {
                const rebuiltHasBegin = new RegExp(`<!--\\s*InstanceBeginRepeat\\s+name=\"${escapeForRegex(rn)}\"`, 'i').test(rebuilt);
                const rebuiltHasEnd = /<!--\s*InstanceEndRepeat\s*-->/i.test(rebuilt);
                if (!rebuiltHasBegin || !rebuiltHasEnd) safetyIssues.push(`Repeat "${rn}": missing InstanceBeginRepeat/InstanceEndRepeat`);
            }
        }
        if (rebuilt !== instanceContent) {
            const ratio = rebuilt.length / Math.max(1, instanceContent.length);
            const minRatio = 0.4;
            if (instanceContent.length > 500 && ratio < minRatio) safetyIssues.push(`Rebuilt size ratio too small (${ratio.toFixed(2)})`);
            const rebuiltStaticBytes = rebuilt.replace(/<!--\s*InstanceBeginEditable[\sS]*?InstanceEndEditable\s*-->/g,'').length;
            const staticThreshold = 0.5;
            if (rebuiltStaticBytes < originalStaticBytes * staticThreshold) safetyIssues.push(`Static content reduced significantly (${rebuiltStaticBytes} < ${Math.round(originalStaticBytes * 0.5)})`);
            if (safetyIssues.length && !options.suppressSafetyChecks) {
                const details = `Safety checks failed for ${path.basename(instancePath)}:\n- ${safetyIssues.join('\n- ')}`;
                console.warn(`[DW-MERGE] ${details}`);
                if (outputChannel) outputChannel.appendLine(details);
                const NEXT = 'Next File';
                const SHOW = 'Show Error';
                const decision = await vscode.window.showWarningMessage(
                    `Safety checks flagged ${path.basename(instancePath)}.`,
                    { modal: true },
                    NEXT, SHOW
                );
                if (decision === SHOW) {
                    try {
                        const siteRoot = path.dirname(path.dirname(templatePath));
                        const tempDir = path.join(siteRoot, '.html-dwt-template-temp');
                        fs.mkdirSync(tempDir, { recursive: true });
                        const tempPath = path.join(tempDir, path.basename(instancePath));
                        fs.writeFileSync(tempPath, rebuilt, 'utf8');
                        await vscode.commands.executeCommand('vscode.diff', vscode.Uri.file(instancePath), vscode.Uri.file(tempPath), `Safety: ${path.basename(instancePath)}`);
                    } catch (e) {
                        vscode.window.showErrorMessage('Failed to show safety diff.');
                    }
                    const NEXT2 = 'Next File';
                    const decision2 = await vscode.window.showWarningMessage(
                        `Review safety diff for ${path.basename(instancePath)}.`,
                        { modal: true },
                        NEXT2
                    );
                    if (decision2 === undefined) {
                        // treated as Next File
                    }
                    deps.logProcessCompletion('updateHtmlLikeDreamweaver:item-safety-diff-shown', 4);
                    return { status: 'safetyFailed' };
                }
                if (decision === NEXT) {
                    deps.logProcessCompletion('updateHtmlLikeDreamweaver:item-safety-skip', 4);
                    return { status: 'safetyFailed' };
                }
                if (decision === undefined) {
                    deps.setCancelRun(true);
                    deps.logProcessCompletion('updateHtmlLikeDreamweaver:run-cancelled', 2);
                    return { status: 'cancelled' };
                }
                deps.logProcessCompletion('updateHtmlLikeDreamweaver:item-safety-skip', 4);
                return { status: 'safetyFailed' };
            } else if (safetyIssues.length && options.suppressSafetyChecks) {
                const details = `Safety checks (suppressed) for ${path.basename(instancePath)}:\n- ${safetyIssues.join('\n- ')}`;
                console.warn(`[DW-MERGE] ${details}`);
                if (outputChannel) outputChannel.appendLine(details);
            }

            let wrote = false;
            if (deps.getApplyToAll()) {
                fs.writeFileSync(instancePath, rebuilt, 'utf8');
                disposeDiffState(instancePath);
                wrote = true;
            } else {
                const APPLY = 'Apply';
                const APPLY_ALL = 'Apply to All';
                const SHOW_DIFF = 'Show Diff';
                const PREVIOUS_DIFF = 'Previous Diff';
                const NEXT_DIFF = 'Next Diff';
                const SKIP = 'Skip';
                const promptMessage = `Update '${path.basename(instancePath)}' with template changes?`;
                const siteRoot = path.dirname(path.dirname(templatePath));
                const tempDir = path.join(siteRoot, '.html-dwt-template-temp');
                let diffTempPath: string | null = null;
                let diffShown = false;
                const clearDiffNavigationState = () => {
                    try { if (diffTempPath && fs.existsSync(diffTempPath)) fs.unlinkSync(diffTempPath); } catch {}
                    disposeDiffState(instancePath);
                    diffTempPath = null; diffShown = false;
                };
                const buildNavigationEntries = (): DiffNavigationEntry[] => {
                    try {
                        const patch = structuredPatch(
                            instancePath,
                            diffTempPath ?? path.basename(instancePath),
                            instanceContent,
                            rebuilt,
                            '',
                            ''
                        );
                        const entries: DiffNavigationEntry[] = [];
                        for (const hunk of patch.hunks) {
                            const oldStart = Math.max(0, hunk.oldStart - 1);
                            const oldLines = Math.max(hunk.oldLines, 1);
                            const newStart = Math.max(0, hunk.newStart - 1);
                            const newLines = Math.max(hunk.newLines, 1);
                            const originalRange = new vscode.Range(oldStart, 0, oldStart + oldLines - 1, Number.MAX_SAFE_INTEGER);
                            const modifiedRange = new vscode.Range(newStart, 0, newStart + newLines - 1, Number.MAX_SAFE_INTEGER);
                            const preferredSide: 'original' | 'modified' = hunk.newLines === 0 && hunk.oldLines > 0 ? 'original' : 'modified';
                            entries.push({ originalRange, modifiedRange, preferredSide });
                        }
                        return entries;
                    } catch { return []; }
                };
                const updateDiffNavigationState = (tempPath: string, originalUri: vscode.Uri, usingVirtualOriginal: boolean): DiffNavigationState => {
                    const existing = diffNavigationStates.get(instancePath);
                    const ranges = buildNavigationEntries();
                    let currentIndex = existing?.currentIndex ?? -1;
                    if (ranges.length === 0) currentIndex = -1;
                    else if (currentIndex >= ranges.length || currentIndex < -1) currentIndex = -1;
                    const state: DiffNavigationState = { tempPath, ranges, currentIndex, originalUri, usingVirtualOriginal };
                    diffNavigationStates.set(instancePath, state);
                    return state;
                };
                const ensureDiffShown = async (): Promise<void> => {
                    try {
                        if (!diffTempPath) { fs.mkdirSync(tempDir, { recursive: true }); diffTempPath = path.join(tempDir, path.basename(instancePath)); }
                        fs.writeFileSync(diffTempPath, rebuilt, 'utf8');
                        const existingEditor = vscode.window.visibleTextEditors.find(e => e.document.uri.fsPath === instancePath);
                        let originalUri: vscode.Uri; let usingVirtualOriginal = false;
                        if (existingEditor) { originalUri = vscode.Uri.file(instancePath); usingVirtualOriginal = false; }
                        else { originalUri = setVirtualOriginalContent(instancePath, instanceContent); usingVirtualOriginal = true; }
                        const state = updateDiffNavigationState(diffTempPath, originalUri, usingVirtualOriginal);
                        await vscode.commands.executeCommand('vscode.diff', state.originalUri, vscode.Uri.file(diffTempPath), `Diff: ${path.basename(instancePath)}`);
                        diffShown = true;
                        if (state.ranges.length > 0) {
                            if (state.currentIndex === -1) { state.currentIndex = 0; diffNavigationStates.set(instancePath, state); }
                            // Focus first range (uses command wired elsewhere)
                            await vscode.commands.executeCommand('dreamweaverTemplateProtection.navigateDiff', 'current');
                        } else {
                            vscode.window.setStatusBarMessage('No differences detected for navigation.', 2000);
                        }
                    } catch { vscode.window.showErrorMessage('Failed to show diff.'); }
                };
                const navigateDiff = async (direction: 'next' | 'previous'): Promise<void> => {
                    await ensureDiffShown();
                    const state = diffNavigationStates.get(instancePath);
                    if (!state || state.ranges.length === 0) return;
                    if (state.ranges.length === 1) {
                        state.currentIndex = 0; diffNavigationStates.set(instancePath, state);
                        await vscode.commands.executeCommand('dreamweaverTemplateProtection.navigateDiff', 'current');
                        vscode.window.setStatusBarMessage('Showing the only difference.', 1500);
                        return;
                    }
                    await vscode.commands.executeCommand('dreamweaverTemplateProtection.navigateDiff', direction);
                };
                let decision: string | undefined;
                while (true) {
                    const options = diffShown ? [APPLY, APPLY_ALL, PREVIOUS_DIFF, NEXT_DIFF, SKIP] : [APPLY, APPLY_ALL, SHOW_DIFF, SKIP];
                    decision = await vscode.window.showInformationMessage(promptMessage, { modal: true }, ...options);
                    if (decision === SHOW_DIFF) { await ensureDiffShown(); continue; }
                    if (decision === NEXT_DIFF) { await navigateDiff('next'); continue; }
                    if (decision === PREVIOUS_DIFF) { await navigateDiff('previous'); continue; }
                    break;
                }
                if (decision === APPLY_ALL) {
                    deps.setApplyToAll(true);
                    fs.writeFileSync(instancePath, rebuilt, 'utf8');
                    clearDiffNavigationState();
                    wrote = true;
                } else if (decision === APPLY) {
                    fs.writeFileSync(instancePath, rebuilt, 'utf8');
                    clearDiffNavigationState();
                    wrote = true;
                } else if (decision === SKIP) {
                    clearDiffNavigationState();
                    deps.logProcessCompletion('updateHtmlLikeDreamweaver:item-skipped', 3);
                    return { status: 'skipped' };
                } else if (decision === undefined) {
                    deps.setCancelRun(true);
                    clearDiffNavigationState();
                    deps.logProcessCompletion('updateHtmlLikeDreamweaver:run-cancelled', 2);
                    return { status: 'cancelled' };
                } else {
                    clearDiffNavigationState();
                    deps.logProcessCompletion('updateHtmlLikeDreamweaver:item-skipped', 3);
                    return { status: 'skipped' };
                }
                if (decision === APPLY_ALL || decision === APPLY) clearDiffNavigationState();
            }
            if (wrote) {
                console.log(`[DW-MERGE] Wrote updated instance: ${instancePath}`);
                if (outputChannel) outputChannel.appendLine(`[DW-MERGE] Wrote updated instance: ${instancePath}`);
            }
        } else {
            console.log('[DW-MERGE] No changes needed (already up to date)');
            if (outputChannel) outputChannel.appendLine('[DW-MERGE] No changes needed (already up to date)');
        }
        deps.logProcessCompletion('updateHtmlLikeDreamweaver:item-updated');
        return { status: 'updated' };
    } catch (e) {
        console.error(`[DW-MERGE] Failed merging instance ${instanceUri.fsPath}:`, e);
        deps.logProcessCompletion('updateHtmlLikeDreamweaver:item-error', 1);
        return { status: 'error' };
    }
}

export async function updateHtmlBasedOnTemplate(
    templateUri: vscode.Uri,
    options: UpdateHtmlBasedOnTemplateOptions,
    deps: {
        findTemplateInstances: (templatePath: string) => Promise<vscode.Uri[]>;
        updateChildTemplateLikeDreamweaver: (childTemplateUri: vscode.Uri, parentTemplatePath: string, mergeOptions?: UpdateHtmlMergeOptions) => Promise<MergeResult>;
        updateHtmlLikeDreamweaver: (instanceUri: vscode.Uri, templatePath: string, options: UpdateHtmlMergeOptions) => Promise<MergeResult>;
        getOutputChannel: () => vscode.OutputChannel;
        logProcessCompletion: (context: string, errorCode?: number) => void;
        isProtectionEnabledGetter: () => boolean;
        setProtectionEnabled: (enabled: boolean) => void;
        getApplyToAll: () => boolean;
        setApplyToAll: (v: boolean) => void;
        getCancelRun: () => boolean;
        setCancelRun: (v: boolean) => void;
    }
): Promise<void> {
    const { autoApplyAll = false, suppressCompletionPrompt = false, skipEditableAttributesPhase = false } = options || {};
    const outputChannel = deps.getOutputChannel();

    // Ensure Apply-to-All is off for this run unless explicitly requested
    if (!autoApplyAll) deps.setApplyToAll(false);

    // Reset cancellation state at the start of each top-level run
    deps.setCancelRun(false);

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Updating HTML based on template (preserving content)'
        , cancellable: true
    }, async (progress, token) => {
        const templatePath = templateUri.fsPath;
        const templateDirForTemp = path.dirname(templatePath);
        const siteRootForTemp = path.dirname(templateDirForTemp);
        const tempDiffDir = path.join(siteRootForTemp, '.html-dwt-template-temp');
        let completionLogged = false;

        const cleanupTempDirectory = () => {
            try {
                // If any visible editor is using a file from the temp diff directory, skip cleanup to avoid "file not found" errors
                const hasOpenTempEditors = vscode.window.visibleTextEditors.some(e => e.document.uri.fsPath.includes('.html-dwt-template-temp'));
                if (hasOpenTempEditors) return;
                if (!fs.existsSync(tempDiffDir)) return;
                const entries = fs.readdirSync(tempDiffDir);
                for (const entry of entries) {
                    try { fs.unlinkSync(path.join(tempDiffDir, entry)); } catch {}
                }
                try { fs.rmdirSync(tempDiffDir); } catch {}
            } catch (cleanupError) {
                console.warn('[DW-ENGINE] Cleanup temp directory error:', cleanupError);
            }
        };

        try {
            console.log(`[DW-ENGINE] Starting update for template: ${templatePath}`);
            outputChannel?.appendLine(`[RUN] Update based on template -> ${path.basename(templatePath)}`);

            if (token.isCancellationRequested) {
                deps.setCancelRun(true);
                deps.logProcessCompletion('updateHtmlBasedOnTemplate:cancelled', 2);
                completionLogged = true;
                return;
            }

            progress.report({ increment: 10, message: 'Finding template instances...' });

            // Step 1: Find ONLY HTML/PHP instances of THIS template (not child templates)
            const instances = await deps.findTemplateInstances(templatePath);

            // Step 2: Find child templates separately (these will be updated differently)
            const childTemplates = await findChildTemplates(templatePath);

            if (token.isCancellationRequested) {
                deps.setCancelRun(true);
                deps.logProcessCompletion('updateHtmlBasedOnTemplate:cancelled', 2);
                completionLogged = true;
                return;
            }

            progress.report({ increment: 20, message: `Found ${instances.length} HTML/PHP instances and ${childTemplates.length} child templates` });

            if (instances.length === 0 && childTemplates.length === 0) {
                vscode.window.showInformationMessage('No instances or child templates found for this template.');
                deps.logProcessCompletion('updateHtmlBasedOnTemplate:empty');
                completionLogged = true;
                return;
            }

            // Temporarily disable protection during update
            const originalProtectionState = deps.isProtectionEnabledGetter();
            deps.setProtectionEnabled(false);

            const templateContent = fs.readFileSync(templatePath, 'utf8');
            const templateInfoLockMatch = templateContent.match(/<!--\s*TemplateInfo\s+codeOutsideHTMLIsLocked="(true|false)"\s*-->/i);
            const templateDeclaresParent = /<!--\s*InstanceBegin\s+template="/i.test(templateContent);
            const templateLockStateForInstances = !templateDeclaresParent && templateInfoLockMatch ? templateInfoLockMatch[1].toLowerCase() : undefined;
            const shouldSyncCodeOutsideLock = !!templateLockStateForInstances;

            // Special: Update Editable Attributes Process
            // Trigger only when the clicked template is a child (declares a parent) AND the parent has
            // attribute-level @@(param)@@ placeholders whose names intersect with this child's parameters.
            // Otherwise, proceed with the Normal Update Process.
            if (templateDeclaresParent && !skipEditableAttributesPhase) {
                try {
                    const childHasInstanceParam = /<!--\s*InstanceParam\b/i.test(templateContent);
                    const instBeginMatch = /<!--\s*InstanceBegin\s+template="([^"]+)"[^>]*-->/i.exec(templateContent);
                    if (instBeginMatch && childHasInstanceParam) {
                        const relParent = instBeginMatch[1];
                        const ws = vscode.workspace.workspaceFolders?.[0];
                        if (ws) {
                            const parentFsPath = path.join(ws.uri.fsPath, relParent.replace(/^\//, ''));
                            if (fs.existsSync(parentFsPath)) {
                                const parentContent = fs.readFileSync(parentFsPath, 'utf8');
                                // Extract static segments from parent (outside its InstanceBeginEditable wrappers)
                                const parentTokens: Array<{kind:'static'|'region'; text:string}> = [];
                                try {
                                    const token = /<!--\s*InstanceBeginEditable\s+name="[^"]+"\s*-->([\s\S]*?)<!--\s*InstanceEndEditable\s*-->/gi;
                                    let last = 0; let mm: RegExpExecArray | null;
                                    while ((mm = token.exec(parentContent)) !== null) {
                                        if (mm.index > last) parentTokens.push({ kind: 'static', text: parentContent.slice(last, mm.index) });
                                        parentTokens.push({ kind: 'region', text: mm[0] });
                                        last = token.lastIndex;
                                    }
                                    if (last < parentContent.length) parentTokens.push({ kind: 'static', text: parentContent.slice(last) });
                                } catch {}
                                // Look for attribute-level placeholders only in static segments
                                const attrNameRe = /<[^>]+\=\s*"[^"]*@@\(\s*([A-Za-z0-9_]+)\s*\)@@[^"]*"[^>]*>/gi;
                                const parentAttrNames = new Set<string>();
                                for (const seg of parentTokens) {
                                    if (seg.kind !== 'static') continue;
                                    let am: RegExpExecArray | null;
                                    while ((am = attrNameRe.exec(seg.text)) !== null) parentAttrNames.add((am[1] || '').trim());
                                }
                                if (parentAttrNames.size > 0) {
                                    const childParams = parseTemplateParameters(templateContent).map(p => p.name.trim());
                                    const childParamSet = new Set(childParams);
                                    const hasIntersect = Array.from(parentAttrNames).some(n => childParamSet.has(n));
                                    if (hasIntersect) {
                                    outputChannel?.appendLine('[EDITABLE-ATTR] Applying parent substitution phase for child template (silent).');
                                    // Phase 1: update only the clicked child template, silently apply without diff/prompt
                                        // Force Apply-to-All during this one call
                                        const prevApplyAll = deps.getApplyToAll();
                                        deps.setApplyToAll(true);
                                        await deps.updateChildTemplateLikeDreamweaver(templateUri, parentFsPath, {
                                        removeTemplateInfoFromInstance: false,
                                        suppressSafetyChecks: true
                                        });
                                        // Reset Apply-to-All to previous state for subsequent phases
                                        deps.setApplyToAll(prevApplyAll);
                                        // Phase 2: re-run ufbot on this child template to update its files normally (skip this phase)
                                        outputChannel?.appendLine('[EDITABLE-ATTR] Re-running update on child template to propagate changes.');
                                        // Ensure nested invocation starts fresh with no cancellation
                                        const prevCancel = deps.getCancelRun();
                                        deps.setCancelRun(false);
                                        await updateHtmlBasedOnTemplate(templateUri, { autoApplyAll, suppressCompletionPrompt, skipEditableAttributesPhase: true }, deps);
                                        deps.setCancelRun(prevCancel);
                                        return; // stop further processing in this first pass
                                    }
                                }
                            }
                        }
                    }
                } catch (eaErr) {
                    console.warn('[DW-ENGINE] Editable attributes phase detection failed:', eaErr);
                }
            }

            if (token.isCancellationRequested) {
                deps.setCancelRun(true);
                deps.logProcessCompletion('updateHtmlBasedOnTemplate:cancelled', 2);
                completionLogged = true;
                return;
            }

            // Create backups (instances + child templates)
            const toBackupMap = new Map<string, vscode.Uri>();
            for (const u of instances) toBackupMap.set(u.fsPath, u);
            for (const u of childTemplates) toBackupMap.set(u.fsPath, u);
            const toBackup = Array.from(toBackupMap.values());
            if (toBackup.length > 0) {
                try {
                    await createHtmlBackups(toBackup, templatePath);
                    outputChannel?.appendLine(`[BACKUP] Created backup for ${toBackup.length} item(s).`);
                } catch (e) {
                    console.warn('[DW-ENGINE] Failed to create backups:', e);
                }
            }

            // Step 3: Preview child templates FIRST (do not auto-apply), then proceed to instances
            let childResults: MergeResult[] = [];
            if (childTemplates.length > 0) {
                const prevApplyAll = deps.getApplyToAll();
                if (autoApplyAll) deps.setApplyToAll(true);
                progress.report({ increment: 10, message: autoApplyAll ? 'Updating child templates (Apply to All)...' : 'Previewing child templates...' });
                for (const childUri of childTemplates) {
                    if (deps.getCancelRun() || token.isCancellationRequested) {
                        deps.setCancelRun(true);
                        break;
                    }
                    const res = await deps.updateChildTemplateLikeDreamweaver(childUri, templatePath);
                    childResults.push(res);
                }
                if (autoApplyAll) deps.setApplyToAll(prevApplyAll);
            }

            // Step 4: Update HTML/PHP instances of THIS template only
            if (instances.length > 0) {
                if (autoApplyAll) deps.setApplyToAll(true);
                let processed = 0;
                for (const instanceUri of instances) {
                    if (deps.getCancelRun() || token.isCancellationRequested) {
                        deps.setCancelRun(true);
                        break;
                    }
                    const label = path.basename(instanceUri.fsPath);
                    progress.report({ message: `Merging ${label}... (${processed + 1}/${instances.length})` });
                    const mergeRes = await deps.updateHtmlLikeDreamweaver(instanceUri, templatePath, {
                        templateCodeOutsideHTMLIsLocked: shouldSyncCodeOutsideLock ? templateLockStateForInstances : undefined
                    });
                    processed++;
                    if (mergeRes.status === 'cancelled') {
                        deps.setCancelRun(true);
                        break;
                    }
                }
            } else {
                outputChannel?.appendLine('[RUN] No HTML/PHP instances to update.');
            }

            // Restore protection after processing
            deps.setProtectionEnabled(originalProtectionState);

            if (!suppressCompletionPrompt && !deps.getCancelRun()) {
                vscode.window.showInformationMessage('Template update completed.');
            }
            if (deps.getCancelRun()) deps.logProcessCompletion('updateHtmlBasedOnTemplate:cancelled', 2);
            else deps.logProcessCompletion('updateHtmlBasedOnTemplate');
            completionLogged = true;
        } catch (error) {
            console.error('[DW-ENGINE] Error during template update:', error);
            vscode.window.showErrorMessage(`Template update failed: ${error instanceof Error ? error.message : String(error)}`);
            deps.logProcessCompletion('updateHtmlBasedOnTemplate', 1);
            completionLogged = true;
        } finally {
            deps.setApplyToAll(false);
            cleanupTempDirectory();
        }
    });
}
