---
description: "Current rules for templating system that emulates Adobe Dreamweaver templating."
applyTo: "**/src/*"
---

# Templating System

import follow-template-syntax-tags.instructions.md
import edit-update-code-file-from-shorthand.instructions.md

These instructions pertain to the terminology, and rules for the templating system for the VS Code extension **HTML-DWT-Template**. There will be two sections and a closing portion of reminders. One section is regarding the terms. The other sections is regarding the templating rules, which will mostly be explained via examples. The closin portion consist of the terms to remember for futer prompts, and the most important rules for this instruction document.

Adhere to the standards of `html-dwt-template/CODING_STANDARDS.md`.

**IMPORTANT** – Some examples use quasi-regular-expression notation to highlight key points.

## Section I. - Templating Terms

A few guidelines before defining and storing these terms for all future updates:

* Treat synonyms (for example, *page* and *file*) carefully in future prompts.
* The word *site* refers either to the `/site/` folder in this extension or to the website where the templating system is applied.
* There are two fundamental file roles: **parent** and **child**.
* Parent files are always templates. They may also be child files, but they are never non-template files. Every parent file has at least one child file.
* Child files can be templates, parent templates, or non-template files, but they always have a parent file.

### Template Files

The below term definition set pertains to the files in the `/Templates/` folder, and must be in the `/Templates/` folder of the root of the website or site.

* **Template File** – A file containing template markers that produce repeating web elements. It serves as the parent of its file-based-on-template children and may itself be a child template. Every template file lives in the site’s `/Templates/` folder and may use the extensions `dwt`, `html`, `htm`, or `php`. There are three subtypes—**Master Template**, **Parent Template**, and **Child Template**—any of which can define the `codeOutsideHTMLIsLocked` tag. The first template in the hierarchy to define the tag establishes the value applied to all descendants. If no template defines the tag, default to `false` and omit it from template declarations in child files, while still allowing pages based on the template to set the attribute.
* **Master Template** – The top-most template used to create pages. It is always a parent template and never a file based on another template. Pages derived from the master template are either child templates or files based on the template. If `codeOutsideHTMLIsLocked` is defined here, all descendants inherit the value for their template declarations. The master template does **not** include an `InstanceBegin template="/Templates/<ANY_NAME>.<dwt | html | htm | php>"` declaration.
* **Parent Template** – A template that serves as the parent for its child templates or pages. It may be the master template (with no parent above it) or a child template based on another template. When it inherits from a parent template, it includes the `<!-- InstanceBegin template="/Templates/<ANY_NAME>.<dwt | html | htm | php>" -->` declaration marker and adopts repeating content from its parent. If it defines `codeOutsideHTMLIsLocked`, the value cascades to its descendants.
* **Child Template** – A template that inherits from its parent template and can also act as a parent to template instances or further child templates. It always includes a template declaration marker and is always a file based on another template.

### Files Based on Template

The below term definition set pertains to fhe files in the `/Templates/` folder, and pages outside of the `/Templates/` folder, but must always be within the boundaries of the website.

* **File Based on Template** – Any file that relies on a template so the non-editable, repeating elements stay synchronized with the parent template. This can be a page outside `/Templates/` or a nested template file. It is always a child file and may itself be a parent (if it is a child template) or a descendant page.
* **Site File** – A file outside `/Templates/` that uses a parent template. It is always a child file and includes a template declaration marker. If no marker is present, treat it as a non-templated page.

### Template Markers

Use the instructions from `/.github/instructions/follow-template-syntax-tags.instructions.md` for the template syntax.

* **Marker** – Any template-related token enclosed in an HTML comment (`<!-- -->`) that begins with `Template` or `Instance`, or any editable-attribute placeholder using the `@@(<NAME>)@@` syntax. For editable attributes, the child file uses the value from the corresponding template marker; e.g. with `<!-- TemplateParam name="a" value="b" -->` and `<img src="@@(a)@@">`, the child resolves the attribute to `<img src="b">`.
* **Template Declaration Marker** – Declared near the top of a file, immediately after the opening `<html>` tag, using `<!-- InstanceBegin template="/Templates/<ANY_NAME>.<dwt | html | htm | php>" -->`. It may include `codeOutsideHTMLIsLocked="true|false"`. Master templates never include this marker.
* **codeOutsideHTMLIsLocked** – The marker `<!-- TemplateInfo codeOutsideHTMLIsLocked="true" -->` defined in a parent template. Once declared, all descendant templates inherit that value for their template declarations.
* **Template Marker** – Any marker in a template file that starts with `Template` or `Instance` and follows template syntax.
* **Child Marker** – Any marker in child files that starts with `Instance`. The content within is unique to the child and should remain untouched unless specific rules direct otherwise.
* **Parent Marker** – Any marker in template files that starts with `Template`. Content inside the marker becomes editable in descendant files, while content outside repeats.

### Data and/or Templating Elements

The below terms pertain to the content that is editable or repeating.

* **Editable** – Content inside any marker beginning with `Instance`.
* **Repeating** – Content outside markers beginning with `Template` that replicates across child files.
* **Conventional** - This should make up the bulk of the template files and files based on templates, and use the rule of thumb:
  - If outsitde `TemplateBeginEditable` in template file, then repeating data to update files based on template with.
  - If outsitde `InstanceBeginEditable` in file based on template, then old repeating data.
* **Non-conventional** - This includes repeating table entries, repeating entries, template parameters, and editable attributes.

### Site

* **Site** – The website or folder containing the `/Templates/` directory. It is always the parent directory of `/Templates/`. Updates to files based on template should recurse through all folders of the site directory (whatever its name) but must never traverse outside the site’s root. This is **critical**. See the illustration below.

```text
- folderA
  - dirA
    - file.ext
  - dirB
    - file.ext
- folderB
  - dirA
    - file.ext
  - dirB
    - file.ext
- folderC
  - dirA
  - site | <ANY_NAME>
    - Templates
      - <master>.<dwt | html | htm | php>
      - <parent>.<dwt | html | htm | php>
      - <child>.<dwt | html | htm | php>
    - css
      - style.css (<= will never use template)
    - js
      - scripts.js (<= will never use template) 
    - index.html (<= may or may not use template)
    - about.html (<= may or may not use template)
    - contact.php (<= may or may not use template)
    about
      - company.html (<= may or may not use template)
      - work.html (<= may or may not use template)
- folderD
  - dirA
  - etc..
```
In the illustration above, `/folderC/site | <ANY_NAME>/` represents the site root; any name is acceptable. The presence of a `/Templates/` folder enables the extension. If the workspace lacks `/Templates/`, the extension remains effectively dormant. **Do not edit** folders outside `/site/` (or its equivalent). When a site folder includes `/Templates/`, the extension features—such as right-clicking and selecting `Update Files Based on Template`—are active.

* **Website** - alias for site.
* **Root** - alias for site.

## Section II. - Template Syntax Rules

### Getting Started

Below is the most basic, and best general rule of thumb for the templating rules, and syntax.

#### General Rule of Thumb

These mostly apply to conventional template data, and most non-conventional data and/or template elements.

- If a `Template` marker is found in a parent file or template, then the child file will have an `Instance` marker of the same name and with the same attributes, and if the markers is a nested marker, then that data is considered editable and unique to the page based on template.
- If a `Instance` marker is found in a parent file or template, then the child file or file based on template will have that `Instance` marker removed, and if nested marker, the corresponding nest marker i.e. `InstanceEnd` removed, making that data now non-editable and repeating data.

#### MASTER TEMPLATE
```html
<html>
<!-- TemplateInfo codeOutsideHTMLIsLocked="true" -->
<!-- TemplateBeginEditable name="<ANY_NAME_1>" -->
<!-- TemplateEndEditable -->
<!-- TemplateBeginEditable name="<ANY_NAME_2>" -->
<!-- TemplateEndEditable -->
</html>
````

#### MASTER Child Template

```html
<html>
<!-- InstanceBegin template="/Templates/<MASTER_NAME>.<dwt | html | htm | php>" codeOutsideHTMLIsLocked="true" -->
<!-- InstanceBeginEditable name="<ANY_NAME_1>" -->
 <!-- TemplateBeginEditable name="<ANY_NAME_a>" -->
 <!-- TemplateEndEditable -->
<!-- InstanceEndEditable -->
<!-- InstanceBeginEditable name="<ANY_NAME_2>" -->
<!-- InstanceEndEditable -->
</html>
```

#### File Based on Template

```html
<html>
<!-- InstanceBegin template="/Templates/<CHILD_TEMPLATE_NAME>.<dwt | html | htm | php>" codeOutsideHTMLIsLocked="true" -->
<!-- InstanceBeginEditable name="<ANY_NAME_a>" -->
<!-- InstanceEndEditable -->
<!-- InstanceBeginEditable name="<ANY_NAME_2>" -->
<!-- InstanceEndEditable -->
</html>
```

**IMPORTANT** – Notice that the file based on the template does **not** include `<!-- InstanceBeginEditable name="<ANY_NAME_1>" -->`. That region remains controlled by the parent until the template defines `<!-- TemplateBeginEditable name="<ANY_NAME>" -->`, at which point the child replaces the block with `InstanceBeginEditable` markers.

### Workflow.

In the simpliest form, using shorthand - the break down of workflow is:

```text
// start-shorthand
// Below is shorthand using about 90% english and 20% psuedo Javascript.

()=> Update Files Based on Template = true;
()=> if (Update Files Based on Template == true) {
 ()=> var updateContent;
 // This would be the data of a site file, and not code block.
 ()=> const parent = // template file
 `
  <html>
  <!-- <Template Declaration Marker> --> # NOTE - will not be present if master.
  <head>
   repeating content
   <!-- TemplateBeginEditable name="<any_name_a>" -->
   editable content
   <!-- TemplateEndEditable -->
  </head>
  <body>
   repeating content
   <!-- TemplateBeginEditable name="<any_name_b>" -->
   editable content
   <!-- TemplateEndEditable -->
   repeating content
  </body>
  </html>
 `;
 ()=> const child = // child or file based on template
 `
  <html>
  <!-- <Template Declaration Marker> -->.
  <head>
   repeating content
   <!-- InstanceBeginEditable name="<any_name_a>" -->
   editable content unique to page.
   <!-- InstanceEndEditable -->
  </head>
  <body>
   repeating content
   <!-- InstanceBeginEditable name="<any_name_b>" -->
   editable content unique to page.
   <!-- InstanceEndEditable -->
   repeating content
  </body>
  </html>
 `;
 ()=> const parentFile = parent.template
 ()=> const childFile = child.file;
 ()=> var parentArray = parentFile.split(/<!-- TemplateBeginEditable name=.* -->/);
 ()=> var childEditableArray = [];
 ()=> var childRepeatArray   = [];
 ()=> var childData = (currentTask) => {
  ()=> childFile.foreach(editable => {
   // get all content between template marker.
   // NOTE - mind repeating regions; both table entry and repeat entry.
   let currentData;
   ()=> if (currentTask == "editable") {
    ()=> currentData = childFile(/<!-- TemplateBeginEditable name=.* -->(.*)<!-- TemplateEndEditable -->/);
    ()=> childEditableArray.push(currentData);
   } else {
    ()=> currentData = childFile(/<!-- TemplateBeginEditable name=.* -->(.*)<!-- TemplateEndEditable -->/);
    ()=> childRepeatArray.push(currentData);
   }
  });
 };
 ()=> const showFail = false; // defined to true in UX process when pop-up gives option to show why fail.
 ()=> const safetyCheckFail = (fileName) => {
  ()=> store data for the filName so it can be shown as to why file based on template cannot be update;
  ()=> if (showFail == true) { safetyCheckFailData.foreach(fail => { return fail; });
 };
 // Variables, arrays, objects, and functions defined before proceeding with support functions.
 ()=> safetyCheckFailData = [];
 ()=> const showDiff = []; // data when showing what will be updated when updating file based on template
 ()=> const conventional = template data and/or template elements categorized as conventional;
 ()=> const nonConventional = template data and/or template elements categorized as non-conventional;
 ()=> const safetyCheckFail = data to return when showing why file based on template could not be updated; 
 ()=> conts handle = {
  ()=> nonConventionalData: { some function or code block to handle non-conventional data for updating file; },
  ()=> conventionalData: { some function or code block to handle conventional data for updating file; }
 }; 
 /************************************* START SUPPORT FUNCTIONS *************************************/
 // Handle repeating data, and update according to conventional vs non-conventional repeating data.
 ()=> const handleTemplatingElements = (data) => {
  ()=> if (data == conventional) { handle.conventionalData(); } // handle conventional data
  ()=> else if (data == nonConventional) { handle.nonConventionalData(); } // hand non-conventional data
  ()=> else { 
   ()=> safetyCheckFailed= true;
   ()=> safetyCheckFailData.push(data[*]); // extract fail data
  }
  ()=> if (safetyCheckFailed == false) {
   ()=> showDiff.push(data);
  } else {
   ()=> if (childFile != currenlty stored in failing files) {
    ()=> safetyCheckFail(childFile);    
   } else {
    ()=> Safely do nothing.   
   }
  }
 };
 ()=> const addUpdateToDiff = () => {
  ()=> childData("editable");
  ()=> childData("repeating");
  ()=> updateContent = childFile;
  ()=> childRepeatArray.foreach(update => {
   // Update the repeatable data of the child file.
   ()=> updateContent = updateContent.replace(childRepeatArray[update], handleTemplatingElements(parentArray[i]));
   ()=> updateContent = updateContent.run(someActionToUpdateEditableAttributesCorrectly());  
  });  
  ()=> childEditableArray.foreach(editable => {
   // Keep editable content form child file intact!
   ()=> updateContent = updateContent.keep(childEditableArray[editable]);
  });
  ()=> childFile = updateContent;
 };
 /************************************** END SUPPORT FUNCTIONS **************************************/
 // Check if child file has template declaration, and if so addUpdateToDiff() function.
 ()=> if (childFile.indexOf(parentFile('<!-- InstanceBegin template="/Templates/fileName.(dwt|html|htm|php)"')) > -1) {
  addUpdateToDiff();
 } else {
  ()=> Safetly do nothing and continue.
 }
} else {
 ()=> Safely do nothing.
}
//end-shorthand
```

Below look for lines starting with `|-` and looking out for the variables `parentArray`, `childEditableArray`, and `childRepeatArray` for the shorthand above this would essentially use the template data as:

#### Template File in Shorthand Context
```html
|-parentArray  <html>
  <!-- <Template Declaration Marker> -->
|-parentArray  <head>
|-parentArray   repeating content
   <!-- TemplateBeginEditable name="<any_name_a>" -->
   editable content
   <!-- TemplateEndEditable -->
|-parentArray  </head>
|-parentArray  <body>
|-parentArray   repeating content
   <!-- TemplateBeginEditable name="<any_name_b>" -->
   editable content
   <!-- TemplateEndEditable -->
|-parentArray   repeating content
|-parentArray  </body>
|-parentArray  </html>
```

#### File Based on Template in Shorthand Context
```html
|-childRepeatArray  <html>
  <!-- <Template Declaration Marker> -->.
|-childRepeatArray  <head>
|-childRepeatArray   repeating content
   <!-- InstanceBeginEditable name="<any_name_a>" -->
|-childEditableArray   editable content unique to page.
   <!-- InstanceEndEditable -->
|-childRepeatArray  </head>
|-childRepeatArray  <body>
|-childRepeatArray   repeating content
   <!-- InstanceBeginEditable name="<any_name_b>" -->
|-childEditableArray   editable content unique to page.
   <!-- InstanceEndEditable -->
|-childRepeatArray   repeating content
|-childRepeatArray  </body>
|-childRepeatArray  </html>
```

For the most part the rules of the templating system can be explained using a sequence of file edits.

### Example of Rules Using Edit Sequence

Below demonstrates the templating rules using a sequence of edits.

```text
I. INITIAL STATE
  **parent.dwt**
  repeating data
  <!-- TemplateBeginEditable name="<ANY_NAME>" -->
  editable data
  <!-- TemplateEndEditable -->
  repeating data

  **child.dwt**
  repeating data
  <!-- InstanceBeginEditable name="<ANY_NAME>" -->
  editable data
  <!-- InstanceEndEditable -->
  repeating data

  **File Based on Template**
  repeating data
  <!-- InstanceBeginEditable name="<ANY_NAME>" -->
  editable data
  <!-- InstanceEndEditable -->
  repeating data


  II. UPDATE TO ****child.dwt****
  **parent.dwt**
  repeating data
  <!-- TemplateBeginEditable name="<ANY_NAME>" -->
  editable data
  <!-- TemplateEndEditable -->
  repeating data

  **child.dwt**
  repeating data
  <!-- InstanceBeginEditable name="<ANY_NAME>" -->
  editable data
   <!-- TemplateBeginEditable name="<ANY_NEST_NAME>" -->
   nested editable
   <!-- TemplateEndEditable -->
  <!-- InstanceEndEditable -->
  repeating data

  **File Based on Template**
  repeating data

  editable data
   <!-- InstanceBeginEditable name="<ANY_NEST_NAME>" -->
   nested editable
   <!-- InstanceEndEditable -->
  repeating data


  III. AN UPDATE TO **parent.dwt** AND **File Based on Template** - in file based on template (child.dwt) editable data was changed
  **parent.dwt**
  repeating data
  a line was added in parent
  <!-- TemplateBeginEditable name="<ANY_NAME>" -->
  editable data
  <!-- TemplateEndEditable -->
  repeating data

  **child.dwt**
  repeating data
  a line was added in parent
  <!-- InstanceBeginEditable name="<ANY_NAME>" -->
  editable data
   <!-- TemplateBeginEditable name="<ANY_NEST_NAME>" -->
   nested editable
   <!-- TemplateEndEditable -->
  <!-- InstanceEndEditable -->
  repeating data

  **File Based on Template**
  repeating data
  a line was added in parent
  editable data
   <!-- InstanceBeginEditable name="<ANY_NEST_NAME>" -->
   <!-- InstanceEndEditable -->
  repeating data


IV. AN UPDATE TO **child.dwt** AND **File Based on Template** - in both files editable data was changed.
  **parent.dwt**
  repeating data
  a line was added in parent
  <!-- TemplateBeginEditable name="<ANY_NAME>" -->
  editable data
  <!-- TemplateEndEditable -->
  repeating data

  **child.dwt**
  repeating data
  a line was added in parent
  <!-- InstanceBeginEditable name="<ANY_NAME>" -->
  editable data
   <!-- TemplateBeginEditable name="<ANY_NEST_NAME>" -->
   nested editable
   some changes to semantics and style
   <!-- TemplateEndEditable -->
  <!-- InstanceEndEditable -->
  repeating data

  **File Based on Template**
  repeating data
  a line was added in parent
  editable data
   <!-- InstanceBeginEditable name="<ANY_NEST_NAME>" -->
    editable data was added
   <!-- InstanceEndEditable -->
  repeating data


  V. AN UPDATE TO **File Based on Template**
  **parent.dwt**
  repeating data
  a line was added in parent
  <!-- TemplateBeginEditable name="<ANY_NAME>" -->
  editable data
  <!-- TemplateEndEditable -->
  repeating data

  **child.dwt**
  repeating data
  a line was added in parent
  <!-- InstanceBeginEditable name="<ANY_NAME>" -->
  editable data
   <!-- TemplateBeginEditable name="<ANY_NEST_NAME>" -->
   nested editable
   some changes to semantics and style
   <!-- TemplateEndEditable -->
  <!-- InstanceEndEditable -->
  repeating data

  **File Based on Template**
  repeating data
  a line was added in parent
  editable data
   <!-- InstanceBeginEditable name="<ANY_NEST_NAME>" -->
    html specific to page.html
   <!-- InstanceEndEditable -->
  repeating data


  VI.AN UPDATE TO **child.dwt**
  **parent.dwt**
  repeating data
  a line was added in parent
  <!-- TemplateBeginEditable name="<ANY_NAME>" -->
  editable data
  <!-- TemplateEndEditable -->
  repeating data

  **child.dwt**
  repeating data
  a line was added in parent
  <!-- InstanceBeginEditable name="<ANY_NAME>" -->
  editable data
  some NEW changes to semantics and style
   <!-- TemplateBeginEditable name="<ANY_NEST_NAME>" -->
   nested editable
   some changes to semantics and style
   <!-- TemplateEndEditable -->
  <!-- InstanceEndEditable -->
  repeating data

  **File Based on Template**
  repeating data
  a line was added in parent
  editable data
  some NEW changes to semantics and style
   <!-- InstanceBeginEditable name="<ANY_NEST_NAME>" -->
    html specific to page.html
   <!-- InstanceEndEditable -->
  repeating data
```

**NOTE** Notice how "html specific to page.html" is not changed in page.html

```text
VII. AN UPDATE TO **parent.dwt**
  **parent.dwt**
  repeating data
  a line was added in parent
  <!-- TemplateBeginEditable name="<ANY_NAME>" -->
  editable data
  semantic changes that don't carry over
  <!-- TemplateEndEditable -->
  repeating data
  <!-- TemplateBeginEditable name="<ANY_NAME>" -->
  editable data that will not be included in future updates
  <!-- TemplateEndEditable -->
  repeating data

  **child.dwt**
  repeating data
  a line was added in parent
  <!-- InstanceBeginEditable name="<ANY_NAME>" -->
  editable data
  some NEW changes to semantics and style
   <!-- TemplateBeginEditable name="<ANY_NEST_NAME>" -->
   nested editable
   some changes to semantics and style
   <!-- TemplateEndEditable -->
  <!-- InstanceEndEditable -->
  repeating data
  <!-- InstanceBeginEditable name="<ANY_NAME>" -->
  editable data that will not be included in future updates
  <!-- InstanceEndEditable -->
  repeating data

  **File Based on Template**
  repeating data
  a line was added in parent
  editable data
  some NEW changes to semantics and style
   <!-- InstanceBeginEditable name="<ANY_NEST_NAME>" -->
    html specific to page.html
   <!-- InstanceEndEditable -->
  repeating data
  <!-- InstanceBeginEditable name="<ANY_NAME>" -->
  editable data that will not be included in future updates
  <!-- InstanceEndEditable -->
  repeating data

  VIII. AN UPDATE TO **child.dwt**
  **parent.dwt**
  repeating data
  a line was added in parent
  <!-- TemplateBeginEditable name="<ANY_NAME>" -->
  editable data
  semantic changes that don't carry over
  <!-- TemplateEndEditable -->
  repeating data
  <!-- TemplateBeginEditable name="<ANY_NAME>" -->

  <!-- TemplateEndEditable -->
  repeating data

  **child.dwt**
  repeating data
  a line was added in parent
  <!-- InstanceBeginEditable name="<ANY_NAME>" -->
  editable data
  some NEW changes to semantics and style
   <!-- TemplateBeginEditable name="<ANY_NEST_NAME>" -->
   nested editable
   some changes to semantics and style
   <!-- TemplateEndEditable -->
  <!-- InstanceEndEditable -->
  repeating data
  <!-- InstanceBeginEditable name="<ANY_NAME>" -->

  <!-- InstanceEndEditable -->
  repeating data

  **File Based on Template**
  repeating data
  a line was added in parent
  editable data
  some NEW changes to semantics and style
   <!-- InstanceBeginEditable name="<ANY_NEST_NAME>" -->
    html specific to page.html
   <!-- InstanceEndEditable -->
  repeating data
  <!-- InstanceBeginEditable name="<ANY_NAME>" -->
  editable data that will not be included in future updates
  <!-- InstanceEndEditable -->
  repeating data

```

## Repeating Entries
Some templates will use repeating entries, letting some child markers to have the same name value. Here data within the `InstanceBegin` template marker should be treated as if data beween the `InstanceBeginEditable` marker.

### Repeating Table Entry

Below explains the rules of repeating tables using a sequence of edits. The major take-away here is that the `InstanceBeginRepeat` here holds mostly all editable data in the file based on template, but the data within the `@@(_index & 1 ? '#FFFFFF' : '#CCCCCC')@@` editable attribute will determine the rules for alternating rows from the template file, keeping raw data of html intact. If raw data cannot be kept intact, the safety check should fail, the file skipped, and an appropriate pop-up of safety check fail, and then update process continue.

```text
 I. INITIAL STATE
 ** template.html ** Quick note – the `.html` extension is allowed for template files as long as the file resides in `/Templates/`.
 repeat data
 <!-- InstanceBeginEditable name="<ANY_NAME>" -->
  editable data
 <!-- TemplateBeginRepeat name="<ANY_NAME>" -->
     <tr bgcolor="@@(_index & 1 ? '#FFFFFF' : '#CCCCCC')@@"> 
      <td><!-- TemplateBeginEditable name="Item" -->Custom Code<!-- TemplateEndEditable --></td>
      <td><!-- TemplateBeginEditable name="Description" -->Tailored functionality built for your requirements<!-- TemplateEndEditable --></td>
      <td><!-- TemplateBeginEditable name="Category" -->Development<!-- TemplateEndEditable --></td>
     </tr>
  <!-- TemplateEndRepeat --> 
 <!-- InstanceEndEditable -->

 **File Based on Template**
 repeat data
  repeat data
 <!-- InstanceBeginRepeat name="<ANY_NAME>" --><!-- InstanceBeginRepeatEntry -->
     <tr bgcolor="#CCCCCC"> 
      <td><!-- InstanceBeginEditable name="Item" -->Custom Code<!-- InstanceEndEditable --></td>
      <td><!-- InstanceBeginEditable name="Description" -->Tailored functionality built for your requirements<!-- InstanceEndEditable --></td>
      <td><!-- InstanceBeginEditable name="Category" -->Development<!-- InstanceEndEditable --></td>
     </tr>
 <!-- InstanceEndRepeatEntry --><!-- InstanceBeginRepeatEntry -->
     <tr bgcolor="#FFFFFF"> 
      <td><!-- InstanceBeginEditable name="Item" -->Custom Code<!-- InstanceEndEditable --></td>
      <td><!-- InstanceBeginEditable name="Description" -->Tailored functionality built for your requirements<!-- InstanceEndEditable --></td>
      <td><!-- InstanceBeginEditable name="Category" -->Development<!-- InstanceEndEditable --></td>
     </tr>
 <!-- InstanceEndRepeatEntry --><!-- InstanceEndRepeat -->
```

**Quick note** for `template.html` - mind that html extension is allowd for template files as long as the file is nested in the `/Templates/` folder.

```text
 II. EDIT TO **template.html** - the editable regions are changed
 **template.html**
 repeat data
 <!-- InstanceBeginEditable name="<ANY_NAME>" -->
  editable data
 <!-- TemplateBeginRepeat name="<ANY_NAME>" -->
     <tr bgcolor="@@(_index & 1 ? '#F1F1F1' : '#C0C0C0')@@"> 
      <td><!-- TemplateBeginEditable name="Item" -->Custom Code<!-- TemplateEndEditable --></td>
      <td><!-- TemplateBeginEditable name="Description" -->Tailored functionality built for your requirements<!-- TemplateEndEditable --></td>
      <td><!-- TemplateBeginEditable name="Category" -->Development<!-- TemplateEndEditable --></td>
     </tr>
  <!-- TemplateEndRepeat --> 
 <!-- InstanceEndEditable -->

 **File Based on Template**
 repeat data
  repeat data
 <!-- InstanceBeginRepeat name="<ANY_NAME>" --><!-- InstanceBeginRepeatEntry -->
     <tr bgcolor="#C0C0C0"> 
      <td><!-- InstanceBeginEditable name="Item" -->Custom Code<!-- InstanceEndEditable --></td>
      <td><!-- InstanceBeginEditable name="Description" -->Tailored functionality built for your requirements<!-- InstanceEndEditable --></td>
      <td><!-- InstanceBeginEditable name="Category" -->Development<!-- InstanceEndEditable --></td>
     </tr>
 <!-- InstanceEndRepeatEntry --><!-- InstanceBeginRepeatEntry -->
     <tr bgcolor="#F1F1F1"> 
      <td><!-- InstanceBeginEditable name="Item" -->Custom Code<!-- InstanceEndEditable --></td>
      <td><!-- InstanceBeginEditable name="Description" -->Tailored functionality built for your requirements<!-- InstanceEndEditable --></td>
      <td><!-- InstanceBeginEditable name="Category" -->Development<!-- InstanceEndEditable --></td>
     </tr>
 <!-- InstanceEndRepeatEntry --><!-- InstanceEndRepeat -->
```

**NOTE** The next example will use some quasi-git-diff syntax to show the changes.

**Lookout for**:

    Look for **-- right click `<value>` <[0-9]> <= sequence of clicks --**
    Look for [0-9]--** -()=> before <update> | +()=> after <update> **--
    (The leading digit corresponds to the sequence of clicks.)

```text
 III. DATA IS ADDED TO **File Based on Template** – Right-click `Insert Entry Before/After Selection` is noted where the click occurred.
 **template.html**
 repeat data
 <!-- InstanceBeginEditable name="<ANY_NAME>" -->
  editable data
 <!-- TemplateBeginRepeat name="<ANY_NAME>" -->
     <tr bgcolor="@@(_index & 1 ? '#F1F1F1' : '#C0C0C0')@@"> 
      <td><!-- TemplateBeginEditable name="Item" -->Custom Code<!-- TemplateEndEditable --></td>
      <td><!-- TemplateBeginEditable name="Description" -->Tailored functionality built for your requirements<!-- TemplateEndEditable --></td>
      <td><!-- TemplateBeginEditable name="Category" -->Development<!-- TemplateEndEditable --></td>
     </tr>
  <!-- TemplateEndRepeat --> 
 <!-- InstanceEndEditable -->

 **File Based on Template** 
 repeat data
  repeat data
 <!-- InstanceBeginRepeat name="<ANY_NAME>" --><!-- InstanceBeginRepeatEntry -->
     <tr bgcolor="#C0C0C0"> 
      <td><!-- InstanceBeginEditable name="Item" -->Custom Code<!-- InstanceEndEditable --></td>
      <td><!-- InstanceBeginEditable name="Description" -->Tailored functionality built for your requirements<!-- InstanceEndEditable --></td>
      <td><!-- InstanceBeginEditable name="Category" -->Development<!-- InstanceEndEditable --></td>
      **-- right click `Insert Entry Before Selection` 2--**
     </tr>
 <!-- InstanceEndRepeatEntry --><!-- InstanceBeginRepeatEntry -->
     <tr bgcolor="#F1F1F1"> 
      <td><!-- InstanceBeginEditable name="Item" -->Custom Code<!-- InstanceEndEditable --></td>
      <td><!-- InstanceBeginEditable name="Description" -->Tailored functionality built for your requirements<!-- InstanceEndEditable --></td>
      <td><!-- InstanceBeginEditable name="Category" -->Development<!-- InstanceEndEditable --></td>
     </tr>
 <!-- InstanceEndRepeatEntry --><!-- InstanceBeginRepeatEntry -->
     2--** -()=> <tr bgcolor="#F1F1F1"> +()=> <tr bgcolor="#C0C0C0"> **--
      <td><!-- InstanceBeginEditable name="Item" -->Custom Code<!-- InstanceEndEditable --></td>
      <td><!-- InstanceBeginEditable name="Description" -->Tailored functionality built for your requirements<!-- InstanceEndEditable --></td>
      <td><!-- InstanceBeginEditable name="Category" -->Development<!-- InstanceEndEditable --></td>
     </tr>
 <!-- InstanceEndRepeatEntry --><!-- InstanceBeginRepeatEntry -->
     1--** -()=> <tr bgcolor="#F1F1F1"> +()=> <tr bgcolor="#C0C0C0"> **--
     2--** -()=> <tr bgcolor="#C0C0C0"> +()=> <tr bgcolor="#F1F1F1"> **--
      <td><!-- InstanceBeginEditable name="Item" -->Custom Code<!-- InstanceEndEditable --></td>
      <td><!-- InstanceBeginEditable name="Description" -->Tailored functionality built for your requirements<!-- InstanceEndEditable --></td>
      <td><!-- InstanceBeginEditable name="Category" -->Development<!-- InstanceEndEditable --></td>
     </tr> **-- right click `Insert Entry Before Selection` 1--**
 <!-- InstanceEndRepeatEntry --><!-- InstanceEndRepeat -->
```

### Repeating Entry

Similar to repeating tables, but simpler. The same insertion rules apply (right-click and choose `Insert New Entry <Before | After>`).

```text
  I. INITIAL STATE
  **Template File**
  Repeating Data
  <!-- InstanceBeginEditable name="<ANY_NAME>" -->
   <!-- TemplateBeginRepeat name="<ANY_NAME>" -->
   <!-- TemplateBeginEditable name="<ANY_NAME>" -->
   <p>Any Set of repeating html tags and elements.</p>
   <!-- TemplateEndEditable -->
   <!-- TemplateEndRepeat -->
  <!-- InstanceEndEditable -->
   
  **File Based on Template**
  Repeating Data
   <!-- InstanceBeginRepeat name="<ANY_NAME>" --><!-- InstanceBeginRepeatEntry -->
   <!-- InstanceBeginEditable name="<ANY_NAME>" -->
    <p>Any Set of repeating html tags and elements.</p>    
   <!-- InstanceEndEditable -->
   <!-- InstanceEndRepeatEntry --><!-- InstanceBeginEditable name="<ANY_NAME>" -->
    <p>Any Set of repeating html tags and elements.</p>    
   <!-- InstanceEndEditable -->
   <!-- InstanceEndRepeatEntry -->
   <!-- InstanceBeginEditable name="<ANY_NAME>" -->
    <p>Any Set of repeating html tags and elements.</p>    
   <!-- InstanceEndEditable -->
   <!-- InstanceEndRepeatEntry --><!-- InstanceEndRepeat -->
  
  II. UPDATE STATE - both files were changed. The repeating data in the template file and the editable data in the file based on template.
  **Template File**
  Repeating Data Was update
  right here.
  <!-- InstanceBeginEditable name="<ANY_NAME>" -->
   <!-- TemplateBeginRepeat name="<ANY_NAME>" -->
   <!-- TemplateBeginEditable name="<ANY_NAME>" -->
   <p>Any Set of repeating html tags and elements.</p>
   <!-- TemplateEndEditable -->
   <!-- TemplateEndRepeat -->
  <!-- InstanceEndEditable -->
   
  **File Based on Template**
  Repeating Data Was update
  right here.
   <!-- InstanceBeginRepeat name="<ANY_NAME>" --><!-- InstanceBeginRepeatEntry -->
   <!-- InstanceBeginEditable name="<ANY_NAME>" -->
    <p>Any Set of repeating html tags and elements.</p>    
   <!-- InstanceEndEditable -->
   <!-- InstanceEndRepeatEntry --><!-- InstanceBeginEditable name="<ANY_NAME>" -->
    <p>Any Set of repeating html tags and elements.</p>    
   <!-- InstanceEndEditable -->
   <!-- InstanceEndRepeatEntry -->
   <!-- InstanceBeginEditable name="<ANY_NAME>" -->
    <p>Any Set of repeating html tags and elements.</p>    
   <!-- InstanceEndEditable -->
   <!-- InstanceEndRepeatEntry -->
   <!-- InstanceBeginEditable name="<ANY_NAME>" -->
    <h3>And this was aded within the editable data</h3>
    <p>Any Set of repeating html tags and elements.</p>    
   <!-- InstanceEndEditable -->
   <!-- InstanceEndRepeatEntry -->
   <!-- InstanceEndRepeat -->
```

### Editable Attributes

Some templates or parents will have a `TemplateParam` and a child with a `InstanceParam` marker like:

```text
I. INITIAL STATE
**parent.dwt** - note URL is for example purposes and can be <ANY_NAME>
<!-- TemplateParam name="<ANY_NAME_a>" type="URL" value="/<ANY_VALUE_a>/<ANY_DEFAULT_NAME>.<any_ext>" -->
 <!-- InstanceBeginEditable name="blogProfile" -->
   <img src="@@(<ANY_NAME_a>)@@" alt="profile image">
 <!-- InstanceEndEditable -->
 
**child.dwt**
..to be created next..

II. CREATE PAGE BASED ON **parent** ()=> **child.dwt**
**parent.dwt**
<!-- TemplateParam name="<ANY_NAME_a>" type="URL" value="/<ANY_VALUE_a>/<ANY_DEFAULT_NAME>.<any_ext>" -->
 <!-- InstanceBeginEditable name="blogProfile" -->
   <img src="@@(<ANY_NAME_a>)@@" alt="profile image">
 <!-- InstanceEndEditable -->

**child.dwt**
<!-- InstanceParam name="<ANY_NAME_a>" type="URL" value="/<ANY_VALUE_a>/<ANY_DEFAULT_NAME>.<any_ext>" --> 
   <img src="/<ANY_VALUE_a>/<ANY_DEFAULT_NAME>.<any_ext>" alt="profile image">
```

**NOTE** The child file uses the value from the `TemplateParam name="<ANY_NAME_a>"` marker as the value for the `src` attribute.

```text
III. UPDATE **child.dwt**
**parent.dwt**
<!-- TemplateParam name="<ANY_NAME_a>" type="URL" value="/<ANY_VALUE_a>/<ANY_DEFAULT_NAME>.<any_ext>" -->
 <!-- InstanceBeginEditable name="blogProfile" -->
   <img src="@@(<ANY_NAME_a>)@@" alt="profile image">
 <!-- InstanceEndEditable -->

**child.dwt**
<!-- InstanceParam name="<ANY_NAME_a>" type="URL" value="/<ANY_VALUE_a>/<ANY_NAME>.<any_ext>" --> 
   <img src="/<ANY_VALUE_a>/<ANY_DEFAULT_NAME>.<any_ext>" alt="profile image">
```

**NOTE** The `src` attribute remains unchanged. It updates only after executing `Update Files Based on Template`.

```text
IV. RUN `Update Files Based on Template` is performed
**parent.dwt**
<!-- TemplateParam name="<ANY_NAME_a>" type="URL" value="/<ANY_VALUE_a>/<ANY_DEFAULT_NAME>.<any_ext>" -->
 <!-- InstanceBeginEditable name="blogProfile" -->
   <img src="@@(<ANY_NAME_a>)@@" alt="profile image">
 <!-- InstanceEndEditable -->

**child.dwt**
<!-- InstanceParam name="<ANY_NAME_a>" type="URL" value="/<ANY_VALUE_a>/<ANY_NAME>.<any_ext>" --> 
   <img src="/<ANY_VALUE_a>/<ANY_NAME>.<any_ext>" alt="profile image">
```

**NOTE** Now the `src` attribute changes in the `img` element of **child.dwt**.

```text
V. CREATE **File Based on Template**
**parent.dwt**
<!-- TemplateParam name="<ANY_NAME_a>" type="URL" value="/<ANY_VALUE_a>/<ANY_DEFAULT_NAME>.<any_ext>" -->
 <!-- InstanceBeginEditable name="blogProfile" -->
   <img src="@@(<ANY_NAME_a>)@@" alt="profile image">
 <!-- InstanceEndEditable -->

**child.dwt**
<!-- InstanceParam name="<ANY_NAME_a>" type="URL" value="/<ANY_VALUE_a>/<ANY_NAME>.<any_ext>" --> 
   <img src="/<ANY_VALUE_a>/<ANY_NAME>.<any_ext>" alt="profile image">

**File Based on Template**
   <img src="/<ANY_VALUE_a>/<ANY_NAME>.<any_ext>" alt="profile image">
```

**NOTE** Notice how the `InstanceParam` marker was removed, now the `src` attribute of the file based on template **child.dwt** uses the value of the `value` attribute form `InstanceParam name="<ANY_NAME_a>"`.

```text
VI. CHANGE **child.dwt** AND RUN `Update Files Based on Template` is performed
**parent.dwt**
<!-- TemplateParam name="<ANY_NAME_a>" type="URL" value="/<ANY_VALUE_a>/<ANY_DEFAULT_NAME>.<any_ext>" -->
 <!-- InstanceBeginEditable name="blogProfile" -->
   <img src="@@(<ANY_NAME_a>)@@" alt="profile image">
 <!-- InstanceEndEditable -->

**child.dwt**
<!-- InstanceParam name="<ANY_NAME_a>" type="URL" value="/<ANY_VALUE_a>/<ANY_new_NAME>.<any_ext>" --> 
   <img src="/<ANY_VALUE_a>/<ANY_new_NAME>.<any_ext>" alt="profile image">

**File Based on Template**
    <img src="/<ANY_VALUE_a>/<ANY_new_NAME>.<any_ext>" alt="profile image">
```

**NOTE** Now the `src` attibute always updates with changes of the `value` attribute in **child.dwt**.

## Closing Notes

### List of Terms to Remember

**NOTE** Additional a set of actions that are available when `right click` is performed is listed.

**NOTE** If the term is followed by `(ks)=`, then that equates to an abbreviation for the term when used in an active prompt.

#### Template Files

* Template File 
* Master Template
* Parent Template
* Child Template 

#### Files Based on Template

* File Based on Template
* Site File

#### Template Markers

* Marker
* Template Declaration Marker 
* codeOutsideHTMLIsLocked 
* Template Marker
* Child Marker
* Parent Marker 

#### Data and/or Templating Elements

* Editable 
* Repeating
* Conventional
* Non-conventional 

#### Site

* Site 
* Website 
* Root

#### Right Click Actions

* Update Files Based on Template (ks)=ufbot

### Most Important Rules to Remember

Below is a list of **most important** considerations, and/or rules when updating files based on template.

* Never edit or update files outside of the site or website's root folder.
* If the currently opened workspace (or site root) lacks a `/Templates/` folder, the extension must deactivate itself and remain silent for that workspace.
* Always keep the `<!-- InstanceBegin template=.* -->` template declaration marker at the top of the file based on template, and the corresponding `<!-- InstanceEnd -->` marker at the bottom.
* If the parent and child file share an `InstanceBegin` marker, and there is no template marker of `TemplateBegin` for raw and html data or `@@(<ANY_NAME)@@` for html attributes, then the `InstanceBegin` marker will stay in the child file.