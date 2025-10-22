// features/update/paramCheck
// Utilities to inspect InstanceParam markers and determine whether the editable-attribute
// pre-pass (parent substitution) should run.

export interface InstanceParamNameTypeValue {
  name: string;
  type: string;
  value: string;
}

export interface CheckEditableAttributeResult {
  attributeMeritsParentCheck: boolean;
  paramNameTypeValueList: InstanceParamNameTypeValue[];
  parentTemplateRelPath: string | null;
}

const INSTANCE_PARAM_RE = /<!--\s*InstanceParam\s+name="([^"]+)"\s+type="([^"]+)"\s+value="([^"]*?)"\s*-->/gi;
const INSTANCE_BEGIN_RE = /<!--\s*InstanceBegin\s+template="([^"]+)"[^>]*-->/i;

export function collectInstanceParams(content: string): InstanceParamNameTypeValue[] {
  const out: InstanceParamNameTypeValue[] = [];
  let m: RegExpExecArray | null;
  INSTANCE_PARAM_RE.lastIndex = 0;
  while ((m = INSTANCE_PARAM_RE.exec(content)) !== null) {
    out.push({ name: m[1], type: m[2], value: m[3] });
  }
  return out;
}

export function getParentTemplateRelPath(childContent: string): string | null {
  const m = INSTANCE_BEGIN_RE.exec(childContent);
  return m ? m[1] : null;
}

export function checkEditableAttributeMerit(childContent: string, parentContent: string): CheckEditableAttributeResult {
  const instanceParams = collectInstanceParams(childContent);
  const parentRel = getParentTemplateRelPath(childContent);
  if (!parentRel || instanceParams.length === 0) {
    return { attributeMeritsParentCheck: false, paramNameTypeValueList: instanceParams, parentTemplateRelPath: parentRel };
  }
  // Check if the parent contains any attribute placeholder @@(name)@@ matching child instance params
  const names = new Set(instanceParams.map(p => (p.name || '').trim()).filter(Boolean));
  let merits = false;
  for (const n of Array.from(names)) {
    const re = new RegExp(`@@\(\s*${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\s*\)@@`, 'i');
    if (re.test(parentContent)) { merits = true; break; }
  }
  return {
    attributeMeritsParentCheck: merits,
    paramNameTypeValueList: instanceParams,
    parentTemplateRelPath: parentRel
  };
}