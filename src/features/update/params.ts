// features/update/params
// Parsing and evaluation utilities for template parameters and optional regions.

import * as vscode from 'vscode';

export interface TemplateParam {
  name: string;
  type: 'text' | 'URL' | 'color' | 'number' | 'boolean';
  value: string;
}

export interface OptionalRegion {
  name: string;
  expression: string;
  content: string;
  isEditable: boolean;
  startOffset: number;
  endOffset: number;
}

export interface InstanceParameters {
  [paramName: string]: string;
}

// Match both TemplateParam (in .dwt files) and InstanceParam (in .html files)
const templateOrInstanceParamRegex = /<!--\s*(?:Template|Instance)Param\s+name="([^"]+)"\s+type="([^"]+)"\s+value="([^"]*?)"\s*-->/g;
const instanceParamRegex = /<!--\s*InstanceParam\s+name="([^"]+)"\s+type="([^"]+)"\s+value="([^"]*?)"\s*-->/g;

export function parseTemplateParameters(templateContent: string): TemplateParam[] {
  const parameters: TemplateParam[] = [];
  let match: RegExpExecArray | null;
  templateOrInstanceParamRegex.lastIndex = 0;
  while ((match = templateOrInstanceParamRegex.exec(templateContent)) !== null) {
    parameters.push({
      name: match[1],
      type: match[2] as TemplateParam['type'],
      value: match[3]
    });
  }
  return parameters;
}

export function parseInstanceParameters(instanceContent: string): InstanceParameters {
  const parameters: InstanceParameters = {};
  let match: RegExpExecArray | null;
  instanceParamRegex.lastIndex = 0;
  while ((match = instanceParamRegex.exec(instanceContent)) !== null) {
    parameters[match[1]] = match[3];
  }
  return parameters;
}

export function parseOptionalRegions(templateContent: string): OptionalRegion[] {
  const regions: OptionalRegion[] = [];
  const optionalRegionRegex = /<!--\s*TemplateBeginIf\s+cond="([^"]+)"\s*-->(([\s\S]*?))<!--\s*TemplateEndIf\s*-->/g;
  let match: RegExpExecArray | null;
  optionalRegionRegex.lastIndex = 0;
  while ((match = optionalRegionRegex.exec(templateContent)) !== null) {
    const expression = match[1];
    const content = match[2];
    const startOffset = match.index;
    const endOffset = match.index + match[0].length;
    const editableRegionRegex = /<!--\s*TemplateBeginEditable\s+name="([^"]+)"\s*-->/;
    const isEditable = editableRegionRegex.test(content);
    regions.push({
      name: `optional_${regions.length + 1}`,
      expression,
      content,
      isEditable,
      startOffset,
      endOffset
    });
  }
  return regions;
}

export function evaluateExpression(expression: string, parameters: InstanceParameters): boolean {
  try {
    // Handle negation, equality/inequality, and simple boolean param checks.
    const expr = expression.trim();
    if (expr.startsWith('!')) {
      const paramName = expr.substring(1).trim();
      const value = parameters[paramName] || 'false';
      return value.toLowerCase() !== 'true';
    }
    if (expr.includes('==') || expr.includes('!=')) {
      const isEquality = expr.includes('==');
      const parts = expr.split(isEquality ? '==' : '!=').map(p => p.trim());
      if (parts.length === 2) {
        const paramName = parts[0];
        const expectedValue = parts[1].replace(/["']/g, '');
        const actualValue = parameters[paramName] || '';
        return isEquality ? actualValue === expectedValue : actualValue !== expectedValue;
      }
    }
    const value = parameters[expr] || 'false';
    return value.toLowerCase() === 'true';
  } catch (error) {
    console.warn(`Error evaluating expression "${expression}":`, error);
    return false;
  }
}

// Note: Former shorthand helpers for parent-template checks were removed. The update engine performs
// parent/child and editable-attribute checks directly during update runs.