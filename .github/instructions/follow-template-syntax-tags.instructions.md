---
description: "Example of the difference between the template tag syntax for template files, and files based on a template."
applyTo: "**/src/*"
---

# Follow Template Syntax Tags

import edit-update-code-file-from-shorthand.instructions.md

Template files and files based on templates have slightly different syntax for the template tags used. There are two types of files syntax:

1. **Template File** (*parent file*)
2. **File Based on Template** (*child file*)

And with each file syntax there are two type of markers or **marker-type**:

1. **Conventional Markers**
2. **Non-conventional Markers**

## Template File Tag Syntax

**marker-type** = conventional | non-conventional

```html
<!-- TemplateInfo codeOutsideHTMLIsLocked="..." -->
<!-- TemplateParam name="..." type="..." value="..." --> 
<!-- TemplateExpr expr="..." --> (equivalent to @@...@@) 
<!-- TemplatePassthroughExpr expr="..." --> 

non-editable data
<!-- TemplateBeginEditable name="..." --> 
<!-- TemplateEndEditable --> 
non-editable data
non-editable data
<!-- TemplateBeginRepeat name="..." --> 
<!-- TemplateEndRepeat --> 
non-editable data
<!-- TemplateBeginIf cond="..." --> 
<!-- TemplateEndIf --> 
non-editable data
<!-- TemplateBeginPassthroughIf cond="..." --> 
<!-- TemplateEndPassthroughIf --> 
non-editable data
<!-- TemplateBeginMultipleIf --> 
<!-- TemplateEndMultipleIf --> 
non-editable data
<!-- TemplateBeginPassthroughMultipleIf --> 
<!-- TemplateEndPassthroughMultipleIf --> 
non-editable data
<!-- TemplateBeginIfClause cond="..." --> 
<!-- TemplateEndIfClause --> 
non-editable data
<!-- TemplateBeginPassthroughIfClause cond="..." --> 
<!-- TemplateEndPassthroughIfClause --> 
non-editable data
```

### Conventional Elements for Template File

**marker-type** = conventional

```html
<!-- TemplateInfo codeOutsideHTMLIsLocked="..." -->

non-editable data
<!-- TemplateBeginEditable name="..." --> 
<!-- TemplateEndEditable --> 
non-editable data
```

### Non-conventional Elements for Template File

**marker-type** = non-conventional

```html
<!-- TemplateParam name="..." type="..." value="..." --> 
<!-- TemplateExpr expr="..." --> (equivalent to @@...@@) 
<!-- TemplatePassthroughExpr expr="..." --> 

non-editable data
<!-- TemplateBeginRepeat name="..." --> 
<!-- TemplateEndRepeat --> 
non-editable data
<!-- TemplateBeginIf cond="..." --> 
<!-- TemplateEndIf --> 
non-editable data
<!-- TemplateBeginPassthroughIf cond="..." --> 
<!-- TemplateEndPassthroughIf --> 
non-editable data
<!-- TemplateBeginMultipleIf --> 
<!-- TemplateEndMultipleIf --> 
non-editable data
<!-- TemplateBeginPassthroughMultipleIf --> 
<!-- TemplateEndPassthroughMultipleIf --> 
non-editable data
<!-- TemplateBeginIfClause cond="..." --> 
<!-- TemplateEndIfClause --> 
non-editable data
<!-- TemplateBeginPassthroughIfClause cond="..." --> 
<!-- TemplateEndPassthroughIfClause --> 
non-editable data
```

## Files Based on Template Tag Syntax

**marker-type** = conventional | non-conventional

**IMPORTANT** - all files based on template will have a `<!-- InstanceBegin template=.* -->` marker at the top of the file. This is the template declaration marker, and should never be removed or the corresponding closing tag of `<!-- InstanceEnd -->`.

**IMPORTANT** - Files based on template or child templates may also have template markers.

```html
()=> if (codeOutsideHTMLIsLocked == true) non-editable
()=> if (codeOutsideHTMLIsLocked == false || undefined) editable
<!-- InstanceBegin template="..." codeOutsideHTMLIsLocked="..." --> 
()=> <head></head><body>ENTIRE FILE WITH EDITABLE AND NON-EDITABLE ELEMENTS</body>
<!-- InstanceEnd -->
<!-- InstanceParam name="..." type="..." value="editable data" passthrough="..." --> 

<!-- InstanceBeginEditable name="..." --> 
editable data
<!-- InstanceEndEditable --> 
<!-- InstanceBeginRepeat name="..." --> 
editable data
<!-- InstanceEndRepeat --> 
<!-- InstanceBeginRepeatEntry --> 
editable data
<!-- InstanceEndRepeatEntry -->
```

### Conventional Elements for Files Based on Template

**marker-type** = conventional

```html
()=> if (codeOutsideHTMLIsLocked == true) non-editable
()=> if (codeOutsideHTMLIsLocked == false || undefined) editable
<!-- InstanceBegin template="..." codeOutsideHTMLIsLocked="..." --> 
()=> <head></head><body>ENTIRE FILE WITH EDITABLE AND NON-EDITABLE ELEMENTS</body>
<!-- InstanceEnd -->

<!-- InstanceBeginEditable name="..." --> 
editable data
<!-- InstanceEndEditable --> 
```

### Non-conventional Elements for Files Based on Template

**marker-type** = non-conventional

```html
<!-- InstanceParam name="..." type="..." value="editable data" passthrough="..." -->

<!-- InstanceBeginRepeat name="..." --> 
editable data
<!-- InstanceEndRepeat --> 
<!-- InstanceBeginRepeatEntry --> 
editable data
<!-- InstanceEndRepeatEntry -->
```

## Nested Markers

Both template files and files based on template use nested marker. A marker is considered a nested marker if it has a corresponding `TemplateBegin<NAME>` and `TemplateEnd<NAME>`, or `InstanceBegin<NAME>` and `InstanceEnd<NAME>`.

### Template File Nest Markers

**marker-type** = conventional | non-conventional

Specify what will be editable in the child file.

```html
<!-- Template<NAME> name="..." --> 
editable data
<!-- Template<NAME> -->
```

### File Based on Template Nest Marker

**marker-type** = conventional | non-conventional

Use editable designated as editable from parent template file and add content unique to page.

```html
<!-- Instance<NAME> name="..." --> 
editable data unique to page based on template
<!-- InstanceEnd<NAME> -->
```

## Non Nested Markers

Non nested template markers that specify whether or not an editable region should be have and/or be shown in child file, or what value to use for an editable attribute. In all cases the child file will inherit the `TemplatePara` from parent, keeping the attributes when the file is created, but making attribute unique and editable for that file, and change the marker from `TemplateParam` to `InstanceParam`, and if the child mentioned has a child template or child file based on the template, then the `InstanceParam` marker will most likely be removed when that file is created.

### Template File Non Nested Markers

**marker-type** = non-conventional

```html
<!-- TemplateParam name="..." type="..." value="..." --> 
<!-- TemplateExpr expr="..." --> (equivalent to @@...@@) 
<!-- TemplatePassthroughExpr expr="..." --> 
```

### File Based on Template Non Nested Markers

**marker-type** = non-conventional

```html
<!-- InstanceParam name="..." type="..." value="editable data" passthrough="..." -->
```

## Additional Notes

- All templates will be in the `/Templates/` folder at the root of the site or website.
- A template can be based on another template, making it a child template, but also - a file based on that template.
- Files based on a template will be identified with a template declaration at the start of a file, similar to:

```
<!-- InstanceBegin template="/Templates/<ANY_NAME>.<[dwt] | [html] | [htm]>" codeOutsideHTMLIsLocked="true" -->`
```

- The parent most template will define the attribute in the template declaration `codeOutsideHTMLIsLocked`.
  - If the parent template has not defined the `codeOutsideHTMLIsLocked` attribute, default to true.

## Additional Webpages to #fetch

- #fetch https://helpx.adobe.com/dreamweaver/using/dreamweaver-templates.html
- #fetch https://helpx.adobe.com/dreamweaver/using/recognizing-templates-template-based-documents.html
- #fetch https://helpx.adobe.com/dreamweaver/using/creating-dreamweaver-template.html
- #fetch https://helpx.adobe.com/dreamweaver/using/creating-editable-regions-templates.html
- #fetch https://helpx.adobe.com/dreamweaver/using/creating-repeating-regions-templates.html
- #fetch https://helpx.adobe.com/dreamweaver/using/using-optional-regions-templates.html
- #fetch https://helpx.adobe.com/dreamweaver/using/defining-editable-tag-attributes-templates.html
- #fetch https://helpx.adobe.com/dreamweaver/using/creating-nested-template.html
- #fetch https://helpx.adobe.com/dreamweaver/using/editing-updating-deleting-templates.html
- #fetch https://helpx.adobe.com/dreamweaver/using/exporting-importing-template-content.html
- #fetch https://helpx.adobe.com/dreamweaver/using/applying-or-removing-template-existing.html
- #fetch https://helpx.adobe.com/dreamweaver/using/editing-content-template-based-document.html
- #fetch https://helpx.adobe.com/dreamweaver/using/template-syntax.html
- #fetch https://helpx.adobe.com/dreamweaver/using/setting-authoring-preferences-templates.html
- #fetch https://helpx.adobe.com/dreamweaver/kb/benefits-using-templates.html