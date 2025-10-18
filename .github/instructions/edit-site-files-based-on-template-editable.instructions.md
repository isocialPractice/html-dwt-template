---
description: "Standards for updating the test site files for extension based on a Template change that was applied to an editable region."
applyTo: "**/site/*"
keyData: [ "<!-- start-update-site -->", "<!-- end-update-site -->", "UPDATE SITE FILES" ]
---

# Edit Site Files Based On Template Editable

import repeating-edit-file-rules

The files in `/site/` need to be updated based on a template in the `/Templates/` folder. The files cannot be updated using the extension since the edits made to the template file were done in an editable region. Additionally some templates may be based on a template, and therefore if true, then those template files need to also be updated. One or more template files are required for any editing to occur, else prompt back with a reminder that a requirement was not met.

## Rules for Updating Site Files:

- This is only relevant when the text `UPDATE SITE FILES` is at the start of the prompt. 
  - If the text `UPDATE SITE FILES` is not at the start of the prompt, discard these instructions for that prompt. 
- The file name or template name provided will be what is used to base updates on. 
  - If a file name is not provided ask for one.
  - Call this - `template`.
- The `template` will have two markers:
  1. Opening `<!-- start-update-site -->`
  2. Closing `<!-- end-update-site -->`
    - Call these `edit markers`.
- The `edit markers` will be nested in an editable region of the `template`, and the attribute `name` value from the `template` will be used to find the editable region for each file based on `template`.
  - Call this the `editable region`.
- In the `template` the `editable region` will be marked using the templating system syntax, similar to:
  - `<!-- TemplateBeginEditable name="<ANY_NAME>" -->.*<!-- TemplateEndEditable -->`
- In the files based on the `template`, the `editable region` will be marked using the templating system syntax, similar to:
  - `<!-- InstanceBeginEditable name="<ANY_NAME>" -->.*<!-- InstanceEndEditable -->`
- If the `edit markers` are not present in the `template`, stop and notify that the `edit markers` were not added.
- Items between the `edit markers` will be the data to update files based on template with.
- The files based on `template` will have a template declaration at the top of the file, similar to:
  - `<!-- InstanceBegin template="/Templates/<ANY_NAME>.<[dwt] | [html] | [htm]>" codeOutsideHTMLIsLocked="true" -->`
- For each file based on `template`, update the data for the `editable region`.
  - **NOTE** - do not include the `edit markers` from `template`.
- Check if any template files in the `/Templates/` folder use the `template` and consider them a file based on template if true, and edit as if updating a file based on template.
- If a file based on template appears to have been updated, then do nothing to that file.
- If multiple templates files are passed in the prompt, then iterate through each - one at a time, following these instructions.
- When all files based on template have been update, remove the opening and closing `edit markers` in the `template`.

## Prompt Requirements

- The text `UPDATE SITE FILES` at the very start of the prompt.
- The file name for the template in the `/Templates/` folder.
- Edit markers in the template file - like `<!-- start-update-site -->` and `<!-- end-update-site -->`.

## Remember to:

### Prompt Back if All Requirements not True

Prompt back with a reminder that not all the requirements have been met if one of the requirements is missing. For Example:

```bash
[user]
> Edit the site files using #file:<ANY_NAME>.dwt.
[agent]
> Did you mean to prepend the prompt with "UPDATE SITE FILES"?
[user]
? UPDATE SITE FILES - edit the site files using #file:<ANY_NAME>.dwt.
```
### Edit Template Files in `/Templates/` folder that use `template`

Some template files in the `/Templates/` folder will be based on a template file, making the the child template, but also - a file based on that template. These files should be edited as if a file based on the `template`.

### Edit files based on template

Only edit the files based on the template provided from prompt, looking out for:

```
<!-- InstanceBegin template="/Templates/<ANY_NAME>.<[dwt] | [html] | [htm]>" codeOutsideHTMLIsLocked="true" -->
```

for each file of the test site in the `/site/` and `/Templates/` folder.

## Follow the Templating Syntax:

The `template` file and file based on template have slightly different syntax when it comes to editable regions.

#### Template File

```dwt,html,htm
<!-- TemplateBeginEditable name="..." --> 
<!-- TemplateEndEditable --> 
<!-- TemplateParam name="..." type="..." value="..." --> 
<!-- TemplateBeginRepeat name="..." --> 
<!-- TemplateEndRepeat --> 
<!-- TemplateBeginIf cond="..." --> 
<!-- TemplateEndIf --> 
<!-- TemplateBeginPassthroughIf cond="..." --> 
<!-- TemplateEndPassthroughIf --> 
<!-- TemplateBeginMultipleIf --> 
<!-- TemplateEndMultipleIf --> 
<!-- TemplateBeginPassthroughMultipleIf --> 
<!-- TemplateEndPassthroughMultipleIf --> 
<!-- TemplateBeginIfClause cond="..." --> 
<!-- TemplateEndIfClause --> 
<!-- TemplateBeginPassthroughIfClause cond="..." --> 
<!-- TemplateEndPassthroughIfClause --> 
<!-- TemplateExpr expr="..." --> (equivalent to @@...@@) 
<!-- TemplatePassthroughExpr expr="..." --> 
<!-- TemplateInfo codeOutsideHTMLIsLocked="..." -->
```

#### Files Based on Template

```html,htm,php,ect...
<!-- InstanceBegin template="..." codeOutsideHTMLIsLocked="..." --> 
<!-- InstanceEnd --> 
<!-- InstanceBeginEditable name="..." --> 
<!-- InstanceEndEditable --> 
<!-- InstanceParam name="..." type="..." value="..." passthrough="..." --> 
<!-- InstanceBeginRepeat name="..." --> 
<!-- InstanceEndRepeat --> 
<!-- InstanceBeginRepeatEntry --> 
<!-- InstanceEndRepeatEntry -->
```

## Closing Notes

- More than one template file(s) may be passed to the prompt. 
- Additional context may be provided initial declaration for instructions and the file name have been passed. 
  - Use that as a guide for when editing and updating all files based on the template. 
- And remember - some templates in the `/Templates/` folde may be based on the template that was passed, and need to be updated as if a file based on the template.

## Variables

openPrompt = "UPDATE SITE FILES"
openMarker = "<!-- start-update-site -->"
closeMarker = "<!-- end-update-site -->"