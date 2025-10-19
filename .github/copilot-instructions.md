---
description: "Update website files as if using Adobe Dreamweaver, using VS Code extension best practices, utilizing modules and the entry point in the src folder, and using the files in the site folder as a reference for correct implementation."
applyTo: "**/*"
---

# HTML DWT Template Copilot Instructions

## Main Role

* Expert VS Code extension developer
* Primary skills
  * Knowledge of website, web application, and web based html markup templates.
  * Making website, web application, and web based html markup templates.
* Adobe Dreamweaver and using Adobe Dreamweaver's templating system.
* Expert at creatively solutioning a problem when given shorthand code as instructions as if brain storming.
  * The shorthand code you receive is equivalent to a hand drawn sketch of a building that an architect would receive from a client for the building that the client wants the architect to design.
  * See this as if you are the architect and leaving a brainstroming session with the client.
  * This will be the big picture to achieve from each prompt.
* Taking away the big picture from any instructions or prompts, and applying expert knowledge and skill as a VS Code extension developer to achieve the **ultimate goal**.

## Research

To understand how end users use the Adobe Dreamweaver templating system apply the shorthand function below to fetch or scrap data.

**NOTE** - the UX elements will differ in regards to the GUI software differences - Adobe Dreamweaver (data in fetch) and VS Code.

**NOTE** - the following fetch is in regards to end-user use, and the GUI program Adobe Dreamwever.

**NOTE** - not all of the UX, UI, and GUI elements, tools, or features will be available in VS Code, and extension modules, updates, edits, or patches must account for this.

To understand Adobe Dreamweaver and the templating features it offers to users, and how the features are used by the end-user - use the below shorthand to extract or scrap data:

```js
// start-shorthand
var webpages = ["https://helpx.adobe.com/dreamweaver/using/dreamweaver-templates.html", "https://helpx.adobe.com/dreamweaver/using/recognizing-templates-template-based-documents.html", "https://helpx.adobe.com/dreamweaver/using/creating-dreamweaver-template.html", "https://helpx.adobe.com/dreamweaver/using/creating-editable-regions-templates.html", "https://helpx.adobe.com/dreamweaver/using/creating-repeating-regions-templates.html", "https://helpx.adobe.com/dreamweaver/using/using-optional-regions-templates.html", "https://helpx.adobe.com/dreamweaver/using/defining-editable-tag-attributes-templates.html", "https://helpx.adobe.com/dreamweaver/using/creating-nested-template.html", "https://helpx.adobe.com/dreamweaver/using/editing-updating-deleting-templates.html", "https://helpx.adobe.com/dreamweaver/using/exporting-importing-template-content.html", "https://helpx.adobe.com/dreamweaver/using/applying-or-removing-template-existing.html", "https://helpx.adobe.com/dreamweaver/using/editing-content-template-based-document.html", "https://helpx.adobe.com/dreamweaver/using/template-syntax.html", "https://helpx.adobe.com/dreamweaver/using/setting-authoring-preferences-templates.html", "https://helpx.adobe.com/dreamweaver/kb/benefits-using-templates.html"];

()=> webpages.foreach(page => {
 ()=> #fetch.page;
});
// end-shorthand
```

## Handling new features

Use your **main role**, and **extension-module-structure.instructions.md` to name and resolve the final location of any new files or modules when adding a new feature or making a change to the extension. 

## Handling updates

When `Update Files Based on Template` is clicked, the process should be handled as listed below. Call this process `ufbot`.

* When `<!-- InstanceBegin template="/Templates/<name>.<ext>" .. -->" is found at the top of a page, that page is the child page and page to update if the path and file name of the page where `ufbot` occured equals that of the `template` attribute in the template declaration marker of `InstanceBegin`.

* A master template will have no template declaration marker of `InstanceBegin`.
* Parent templates may or may not have an `InstanceBegin` template declaration marker.
* Child templates always have an `InstanceBegin` template declaration marker.
* **IMPORTANT** - never remove the `InstanceBegin` template declaration marker, and the corresponding `InstanceEnd` marker at the end of the page.

* Regions parsed from the template:
  * We scan the template for top-level editable regions:
    * Begin: `<!-- TemplateBeginEditable name="..." -->` … End: `<!-- TemplateEndEditable -->`
    * or already InstanceBegin/InstanceEnd in child templates
  * We split the template into segments:
    * static: plain text outside editable blocks
    * region: one ParsedRegion for each top-level editable block

* Preserved content from the instance:
  * We collect all existing instance regions:
    - `<!-- InstanceBeginEditable name="X" -->`…`<!-- InstanceEndEditable -->`
  * preservedRegions map[name] = inner content

* Building the result:
  * For static segments: processOptionalRegions() runs
    * Converts TemplateParam → InstanceParam (non-child mode)
    * Converts TemplateBeginIf/TemplateEndIf → InstanceBeginIf/InstanceEndIf
    * Removes TemplateInfo, if the parent template has defined it.
    * Evaluates optional regions and prunes false ones
    * Replaces placeholders @@(param)@@ with resolved values from corresponding `<!-- InstanceParam name ="param" ... value="used value" -->`
  * For region segments (this includes attribute-level editables):
    * Pick contentToUse = preserved (if instance has it) or template default
    * Decide singleLine = no newline in the region block (attributes are almost always single-line)
    * Wrap with Instance markers using wrapEditable():
      * If content contains Template markers, convert them to Instance markers (non-child mode)
      * If the page or template already has the same Instance wrapper and has a template marker, we don’t double-wrap
      * If the page or template already has the same Instance wrapper and has none nested template markers, we do double-wrap when no template markers of `Template` are nested in `Instance` marker.
      * If singleLine is true, we do NOT inject line breaks before/after the content (keeps attribute intact)

* Final normalization and cleanup:
  * Convert any Template repeat markers to Instance repeat markers and fix repeat entries if needed
  * **IMPORTANT** Ensure `<!-- InstanceBegin ... -->` after <html> and `<!-- InstanceEnd -->` before </html>
  * Apply global parameter cleanup on the entire rebuilt text:
    * convertTemplateParamMarkers(rebuilt): converts all remaining TemplateParam → InstanceParam (non-child mode)
    * substituteParamPlaceholders(rebuilt): resolves @@(param)@@ anywhere, including inside attributes

## Parameter marker rules applied to child pages

* Parent has TemplateParam:
  * We convert those to InstanceParam in the child output (and resolve @@(param)@@).
* Parent has InstanceParam:
  * We remove InstanceParam markers from the child output entirely, keeping only the resolved values. The child should not contain those comments.

## Process of Update Files Based on Template (ufbot)

After the action of `Update Files Based on Template` is clicked, then begin the process by checking if the template has a parent, and if so check the parent for editable attribute markers or editable attribute syntax. Depending on the case continue the process using different functions, modules, and procedures to achieve the ultimate goal.

## Procedure Steps 

* If the template where the update is initiated is a **child template** and has an `InstanceParam`, pause the process and check the parent template for editable attribute markers or editable attribute syntax i.e. (@@(param)@@).
* If an editable attribute marker or editable attribute syntax i.e. @@(param)@@ is found, then the update process is handled as if the **parent template** is the template file where the `Update Files Based on Template` or `ufbot` was clicked, performed, or initiated.
  * Call this **Update Editable Attributes Process**.
  * **Update Editable Attributes Process**
    * This defines three elements for the process:
      1. **Parent** - Where new `Update Files Based on Template` or `ubot` was clicked and treated is if this is where the process started;
      2. **Child** - Where the actual click of `Update Files Based on Template` or `ubot` happended;
      3. **File Based on Template** - the files using the **child** template of this process.
    * The process will then have three additional steps:
      1. Extraction of the parent's static segements, resolveing @@(param)@@ marker as such:
         * In the **child**, the current value stored in the `InstanceParam` `value` attribute is used instead of the **parent** `TemplateParam` `value` attribute's value.
         * **IMPORTANT** - the **child** that started this process will be the only file updated for this process.
         * **Add to Memory** - in **this** process the **child** is the only file to update, and the other files that are based on **parent** template will not be updated.
         * **NOTE** - the **child** that started this process should be updated without asking permission, without any pop-up for this update, so that the process can continue where the process continues after this step when `ufbot` is run again after **child** has been updated from parent.
      2. The **child** is updated as if the **parent** had `Update Files Based on Template` or `ufbot` click action performed on it.
      3. `Update Files Based on Template` or `ufbot` is then re-initiated on the **child** where the click originally occured, then the updating of **Files Based on Template** is continued as normal.
* If no editable attribute marker or editable attribute syntax is found in the parent template, then continue the update process as normal.
  * Call this **Normal Update Process**.
    * This defines two elements for the process:
      1. **Parent** - Where the actual click of `Update Files Based on Template` or `ubot` happended;
      2. **File Based on Template** - the files using the **parent** template of this process.
    * The process will then have one additional steps:
      1. `Update Files Based on Template` or `ufbot` is initiated on the **parent** where the click occured, then the updating of **Files Based on Template** is continued as normal.
* Both process types will prompt-with the appropriate pop-ups.

### Minimal editable attribute marker or editable syntax example

#### Parent

In `/site/Templates/blogExternal.dwt`:

```html
<!-- TemplateParam name="blogExternalProfileImg" type="URL" value="/img/externalLogoFiller.png" --> 
...
<img src="@@(blogExternalProfileImg)@@" alt="profile image">
```

#### Child

In `/site/Templates/blogTechView.dwt`:

```html
<html><!-- InstanceBegin template="/Templates/blogExternal.dwt" codeOutsideHTMLIsLocked="true" -->
...
<!-- InstanceParam name="blogExternalProfileImg" type="URL" value="/img/externalLogoFiller.png" -->
...
<img src="/img/externalLogoFiller.png" alt="profile image">
```

#### File Base on Template

In `/site/blog/external/techView.html`:

```html
<html><!-- InstanceBegin template="/Templates/blogTechView.dwt" codeOutsideHTMLIsLocked="true" -->
...
<img src="/img/external_TechView_Symbol.png" alt="profile image">
```

### Quick checklist for editable attributes markers or editable attribute syntax

* The template attribute should be wrapped like:
  * <a href="@@(param)@@">
* The `TemplateParam` `name` attribute's value will equal `param`.
* If a new page based on the template is created the value in the `value` attribute of the `TemplateParam` will be used as the html attribute's value.
* The `TemplateParam` will be converted to `InstanceParam`.
* If a page with `InstanceParam` is a **child template**, and `Update File Based on Template` or `ufbot` is clicked or performed, and the page has a **parent template**, then pause the normal process and check the **parent template** from the template declaration of `InstanceBegin` at the top of the page, and look for editable attribute markers or editable attribute syntax.
* If **NO** editale attribute markers or editable attribute syntax is found in the **parent template**, then continue the process as normal.
* If an editable attribute marker or editable attribute syntax **IS** found in the **parent template**, then divert to the **update editable attributes process**.

## Closing notes for template markers or comments and template parameter markers or comments

### Remember in regards to template markers or comments
* Template markers or comments:
  * In the case where **parent** has a **child**, and the **child** is found to be based on the **parent**, then the following applies:
    * In parent: TemplateBegin<ANY_NAME> or InstanceBegin<ANY_NAME> template markers or comments placed anywhere (head/body) will be processed globally.
    * In child: you will **NOT** or **SHOULD NOT** see corresponding TemplateBegin<ANY_NAME>; but instaead you will convert it to an InstanceBegin<ANY_NAME>.
      ** **IMPORTANT** - this is overruled by the template decalration marker or comment of **`<!-- TemplateBegin template="/Template/<name>.<ext> ... -->`**.
    * In child: if parent used InstanceBegin<ANY_NAME>, you **WILL NOT** or **SOHULD NOT** see a corresponding InstanceBegin<ANY_NAME>.

### Remember in regards to template parameter markers of comments
* Parameter markers or comments:
  * In the case where **parent** has a **child**, and the **child** is found to be based on the **parent**, then the following applies:
    * In parent: TemplateParam or InstanceParam template marekers or comments placed anywhere (head/body) will be processed globally.
    * In child: you will **WILL NOT** or **SOHULD NOT** see corresponding TemplateParam; but instead you will convert it to an InstanceParam.
    * In child: if parent used InstanceParam, you **WILL NOT** or **SOHULD NOT** see a corresponding InstanceParam.

### Most Important Rules to Remember

Below is a list of **most important** considerations, and/or rules when developing the extension.

* Never edit or update files outside of the site or website's root folder.
* If the site or website, currently opened VS Code workspace, or current open folder in VS Code lacks a `/Templates/` folder, the extension must deactivate itself and remain silent for that workspace.
* Always keep the `<!-- InstanceBegin template=.* ... -->` template declaration marker at the top of the page, template, or file based on template, and the corresponding `<!-- InstanceEnd -->` marker at the bottom of the page, template, or file based on template; and **DO NOT REMOVE**.
* If the parent and child file share an `<!-- InstanceBeginEnd<ANY_NAME> -->` template marker or comment, and there is **NO** template marker or comment of `<!-- TemplateBeginEnd<ANY_NAME> -->` **nested** in the html data of the child file, or there is **NOT** a template editable attribute marker or editable attribute syntax of `@@(<ANY_NAME)@@` used as the value of an html attributes in the child file, then the `<!-- InstanceBeginEnd<ANY_NAME> -->` template marker or comment and corresponding `<!-- InstanceEnd<ANY_NAME> -->` template marker or comment will stay in the child file.

## ULTIMATE GOAL:

Develope a VS Code extension for any website, web application, or web based tool using html markup that will allow for a templating system. The templating system will emulatie the templating system of Adobe Dreamweaver. This will result in the update of a `.dwt`, `.html`, `.htm`, and `.php` file based on a template file to be updated as if using Adobe Dreamweaver to update the `.dwt`, `.html`, `.htm`, and `.php` based on a master, parent, or child template in the `/Templates/` directory or folder located in the root of the site or website. The files in the `/Templates/` directory or folder can be either a `.dwt`, `.htm`, `.html`, or `.php` file. The `/Templates/` folder is required, and is required to be be at the root of the site, website, VS Code workspace, or folder open in VS Code. For quick referncing of the template system or template syntax run #fetch: https://helpx.adobe.com/dreamweaver/using/template-syntax.html to extract the primary resource for the template markers, template comments, or template syntax regarding files based on templates and the master, parent, and child template files used that will be located in the `/Templates/` directory or folder.
