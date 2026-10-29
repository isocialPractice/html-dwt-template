---
title: HTML DWT Template Extension Specification for VS Code
version: 1.1
date_created: 2024-10-06
last_updated: 2026-10-29
owner: isocialPractice Development Team
tags: [tool, vs-code-extension, dreamweaver-templates, html-templating, content-management]
---

# HTML DWT Template Extension Specification

This specification defines the requirements, constraints, and implementation guidelines for a VS Code extension that replicates Adobe Dreamweaver's templating system functionality, enabling creation and management of HTML/PHP files based on template files (.dwt, .htm, .html, .php) with editable and non-editable regions. The scope explicitly includes automated synchronization of Dreamweaver-style conditional (optional) regions so TemplateBeginIf/TemplateEndIf blocks stay aligned between template and instance documents.

The update logic (merge, parameters, optional and repeat regions, safety checks, template discovery, backups) is provided by the engine package `@isocialpractice/html-dwt-cmd-template`, which is also a command-line tool. Requirements on how files are rebuilt are met in that package and verified by its golden fixture test; this extension supplies the VS Code side (see section 8, ENG-001 to ENG-004).

Adhere to the standards of `html-dwt-template/CODING_STANDARDS.md`.

## 1. Purpose & Scope

This specification provides comprehensive requirements for developing a VS Code extension that emulates Adobe Dreamweaver's template system. The extension shall enable developers to:

- Create and manage template files with locked and editable regions
- Generate HTML/PHP pages based on templates while preserving content structure
- Synchronize template changes across multiple instance files
- Protect template-based documents from unauthorized edits outside designated areas
- Support nested templates and template hierarchies
- Implement template expressions, parameters, and conditional content

**Intended Audience**: VS Code extension developers, web developers familiar with Dreamweaver templates
**Assumptions**: Users have basic knowledge of HTML, VS Code, and template-based development workflows

## 2. Definitions

- **DWT**: Dreamweaver Template file format (.dwt extension)
- **Template File**: File in Templates/ (.dwt, .htm, .html, .php) containing the base structure with defined editable regions
- **Master Template**: Template file not based on another template (no InstanceBegin declaration); always fully editable
- **Child Template**: Template file based on another template (has an InstanceBegin declaration); protected like an instance file
- **Instance File**: HTML/PHP file generated from a template, containing both locked template structure and editable content
- **Editable Region**: Marked sections in templates where content can be modified in instance files
- **Protected Region**: Template areas that remain locked and uneditable in instance files
- **Template Hierarchy**: Parent-child relationships between templates where child templates extend parent templates
- **Template Parameter**: Variable values that control optional content or attributes in template-based documents
- **Repeating Region**: Template section that can be duplicated multiple times in instance files
- **Optional Region**: Template content that may be shown or hidden based on conditions
- **Template Expression**: JavaScript-like expression for dynamic content evaluation
- **Instance Markers**: HTML comments that define editable regions in instance files (InstanceBeginEditable/InstanceEndEditable)
- **Template Markers**: HTML comments that define template structure (TemplateBeginEditable/TemplateEndEditable)

## 3. Requirements, Constraints & Guidelines

### Core Template System Requirements

- **REQ-001**: Extension shall recognize template files with extensions .dwt, .htm, .html, .php located directly in the Templates/ directory; subfolders of Templates/ (such as `_notes`) and the backup and temp folders are skipped
- **REQ-002**: Extension shall support HTML comment-based template syntax identical to Adobe Dreamweaver
- **REQ-003**: Extension shall create instance files from templates with proper InstanceBegin/InstanceEnd markers
- **REQ-004**: Extension shall preserve editable content when updating instances from modified templates
- **REQ-005**: Extension shall prevent editing of protected regions in instance files and child templates while allowing full editing of master templates
- **REQ-006**: Extension shall support nested template hierarchies with parent-child relationships
- **REQ-007**: Extension shall provide visual indicators for editable and protected regions
- **REQ-008**: When the Enable Backup setting is on (the default), extension shall back up the files an update will change before writing them; Toggle Backup switches the setting
- **REQ-010**: When the Enable Template Sync setting is on (the default), saving a template shall update the files based on it that are open in an editor, child templates included, without prompts or backups, keeping unsaved files unsaved; Update Files Based on Template shall work whether the setting is on or off
- **REQ-009**: Extension shall synchronize conditional optional regions during updates, keeping show/hide states and linked parameters consistent across instance files.

### Template Syntax Requirements

- **SYN-001**: Extension shall recognize TemplateBeginEditable/TemplateEndEditable markers in template files
- **SYN-002**: Extension shall convert template markers to InstanceBeginEditable/InstanceEndEditable in instance files
- **SYN-003**: Extension shall support TemplateBeginRepeat/TemplateEndRepeat for repeating content sections
- **SYN-004**: Extension shall implement TemplateBeginIf/TemplateEndIf for conditional content display
- **SYN-005**: Extension shall support TemplateParam declarations with types: text, boolean, color, URL, number
- **SYN-006**: Extension shall evaluate template expressions using @@(expression)@@ syntax
- **SYN-007**: Extension shall support TemplateInfo codeOutsideHTMLIsLocked attribute for HTML preservation
- **SYN-008**: Extension shall apply TemplateBeginIf/TemplateEndIf logic when generating or updating instances, honoring default visibility and parameter linkage defined in the template.

### File Structure Requirements

- **STR-001**: Templates shall be located in Templates/ directory at site root level
- **STR-002**: Instance files shall reference templates using relative paths from Templates/ directory
- **STR-003**: Extension shall maintain proper document-relative link paths when creating instances
- **STR-004**: Extension shall support Templates/ directory structure with nested folders (planned in the engine; templates are read only from directly inside Templates/ today)
- **STR-005**: Backup files shall be stored in `.html-dwt-template-backups/<template>/` at the site root, in numbered folders `1` (newest) to `3`

### Content Preservation Requirements

- **CNT-001**: Extension shall preserve all content within editable regions during template updates
- **CNT-002**: Extension shall maintain repeating region entries and their content during synchronization
- **CNT-003**: Extension shall preserve alternating background colors in repeating table rows using _index expressions
- **CNT-004**: Extension shall handle optional region visibility states based on parameter values
- **CNT-005**: Extension shall maintain custom attributes in editable tag attributes
- **CNT-006**: Extension shall propagate updated optional region expressions and parameter bindings from templates to instances without overwriting user-managed defaults.

### Protection System Requirements

- **PRT-001**: Extension shall block editing of protected regions with immediate content restoration
- **PRT-002**: Extension shall allow per-file protection toggle while maintaining global protection settings
- **PRT-003**: Extension shall provide visual highlighting of protected and editable regions
- **PRT-004**: Extension shall create document snapshots for rapid content restoration
- **PRT-005**: Extension shall allow unrestricted editing of master templates, whatever their extension
- **PRT-006**: Extension shall protect child templates like instance files, and offer the per-file protection commands in them

### User Interface Requirements

- **UI-001**: Extension shall provide commands for creating new pages from templates
- **UI-002**: Extension shall offer diff navigation with Previous/Next buttons for template updates
- **UI-003**: Extension shall display confirmation dialogs for destructive operations
- **UI-004**: Extension shall show progress indicators for long-running operations
- **UI-005**: Extension shall provide quick-pick lists for editable region navigation

### Safety & Validation Requirements

- **SAF-001**: Extension shall validate template syntax before applying changes
- **SAF-002**: Extension shall check for balanced editable region markers
- **SAF-003**: Extension shall detect content loss and warn users before proceeding
- **SAF-004**: Extension shall implement size ratio checks to prevent content corruption
- **SAF-005**: Extension shall provide safety diff views when validation fails
- **SAF-006**: Extension shall verify TemplateBeginIf/TemplateEndIf pairs remain balanced and resolvable before applying synchronized updates.

### Performance Requirements

- **PRF-001**: Extension shall process template updates incrementally with progress reporting
- **PRF-002**: Extension shall optimize file I/O operations using efficient parsing algorithms
- **PRF-003**: Extension shall limit document scanning to relevant sections (first 600 characters for header detection)
- **PRF-004**: Extension shall implement caching for template instance relationships
- **PRF-005**: Extension shall clean up temporary files after operations complete

### Constraints

- **CON-001**: Template files not in Templates/ directory shall not trigger automatic instance detection
- **CON-002**: Extension shall not modify backup files or files in .html-dwt-template-backups/ directory
- **CON-003**: Template expressions shall use JavaScript subset syntax only (no full JavaScript execution)
- **CON-004**: Extension shall support maximum 10 levels of nested template hierarchy
- **CON-005**: Editable region names shall be unique within a single template file
- **CON-006**: Template parameters shall be limited to 5 supported data types
- **CON-007**: Template content export/import (XML interchange) is out of scope for the current release and must be performed manually.
- **CON-008**: Editable tag attributes are supported through TemplateParam and `@@(param)@@` placeholders, including the Update Editable Attributes Process for child templates; a Make Editable Attribute command that writes this markup is not yet implemented.

### Guidelines

- **GUD-001**: Template files should use descriptive, unique names for editable regions
- **GUD-002**: Instance files should maintain consistent folder structure relative to Templates/ directory
- **GUD-003**: Complex template expressions should be documented within template comments
- **GUD-004**: Backup retention should follow rolling backup system (keep last 3 versions)
- **GUD-005**: Error messages should provide specific context and actionable remediation steps
- **GUD-006**: Documentation shall include a quick-start README and a detailed root-level `INSTRUCTIONS.md` guide with explicit placeholders for screenshots/GIFs stored under `support/instruct/`.

### Patterns

- **PAT-001**: Template marker conversion: TemplateBeginEditable → InstanceBeginEditable
- **PAT-002**: Instance file structure: InstanceBegin → content → InstanceEnd
- **PAT-003**: Repeating regions: InstanceBeginRepeat → entries → InstanceEndRepeat
- **PAT-004**: Optional regions: TemplateBeginIf cond="expression" → content → TemplateEndIf
- **PAT-005**: Parameter declarations: <!-- TemplateParam name="paramName" type="dataType" value="defaultValue" -->

## 4. Interfaces & Data Contracts

### Template File Interface

```html
<!-- Template Header -->
<!-- TemplateInfo codeOutsideHTMLIsLocked="true|false" -->

<!-- Template Parameters -->
<!-- TemplateParam name="paramName" type="text|boolean|color|URL|number" value="defaultValue" -->

<!-- Editable Regions -->
<!-- TemplateBeginEditable name="regionName" -->
    Default content
<!-- TemplateEndEditable -->

<!-- Repeating Regions -->
<!-- TemplateBeginRepeat name="repeatName" -->
    <!-- TemplateBeginEditable name="cellContent" -->
        Repeatable content
    <!-- TemplateEndEditable -->
<!-- TemplateEndRepeat -->

<!-- Optional Regions -->
<!-- TemplateBeginIf cond="paramName" -->
    Conditional content
<!-- TemplateEndIf -->

<!-- Template Expressions -->
@@(paramName)@@ or @@(_index & 1 ? '#FFFFFF' : '#CCCCCC')@@
```

### Instance File Interface

```html
<!-- Instance Header -->
<!-- InstanceBegin template="/Templates/templateName.dwt" codeOutsideHTMLIsLocked="true|false" -->

<!-- Instance Parameters -->
<!-- InstanceParam name="paramName" type="dataType" value="instanceValue" -->

<!-- Editable Regions -->
<!-- InstanceBeginEditable name="regionName" -->
    User content preserved during template updates
<!-- InstanceEndEditable -->

<!-- Repeating Regions -->
<!-- InstanceBeginRepeat name="repeatName" -->
    <!-- InstanceBeginRepeatEntry -->
        <!-- InstanceBeginEditable name="cellContent" -->
            User-entered repeating content
        <!-- InstanceEndEditable -->
    <!-- InstanceEndRepeatEntry -->
<!-- InstanceEndRepeat -->

<!-- Instance Footer -->
<!-- InstanceEnd -->
```

### Extension Command Interface

Commands use the `htmlDwtTemplate.` prefix and the `html-dwt-template` category, so the Command Palette reads `html-dwt-template: <title>`.

```typescript
interface TemplateCommands {
    // Template synchronization
    'htmlDwtTemplate.syncTemplate': () => Promise<void>;                  // Update Files Based on Template
    'htmlDwtTemplate.updateAllFilesUsingTemplate': () => Promise<void>;   // UPDATE ALL FILES USING TEMPLATE
    'htmlDwtTemplate.toggleTemplateSync': () => Promise<void>;            // switches enableTemplateSync

    // Instance management
    'htmlDwtTemplate.createPageFromTemplate': () => Promise<void>;
    'htmlDwtTemplate.findInstances': () => Promise<void>;

    // Protection controls
    'htmlDwtTemplate.turnOnProtection': () => void;
    'htmlDwtTemplate.turnOffProtection': () => void;
    'htmlDwtTemplate.toggleProtection': () => void;                       // registered, not yet contributed

    // Navigation
    'htmlDwtTemplate.showEditableRegions': () => void;

    // Repeating regions
    'htmlDwtTemplate.insertRepeatEntryAfter': () => Promise<void>;
    'htmlDwtTemplate.insertRepeatEntryBefore': () => Promise<void>;

    // Parameters (registered, not yet contributed)
    'htmlDwtTemplate.setTemplateParameters': () => Promise<void>;
    'htmlDwtTemplate.showTemplateParameters': () => Promise<void>;

    // Backup management
    'htmlDwtTemplate.toggleBackup': () => Promise<void>;                  // switches enableBackup
    'htmlDwtTemplate.restoreBackup': () => Promise<void>;
}
```

### Configuration Schema

All settings are booleans under the `htmlDwtTemplate.` prefix; `package.json` holds the full descriptions.

```json
{
    "htmlDwtTemplate.enableProtection": { "default": true, "description": "Protect the non-editable regions of pages and child templates" },
    "htmlDwtTemplate.enableTemplateSync": { "default": true, "description": "Saving a template updates the open files based on it" },
    "htmlDwtTemplate.enableBackup": { "default": true, "description": "Back up files before an update changes them" },
    "htmlDwtTemplate.useStickyDiffPanel": { "default": false, "description": "Movable diff control panel instead of a modal popup" },
    "htmlDwtTemplate.highlightEditableRegions": { "default": true, "description": "Highlight editable regions" },
    "htmlDwtTemplate.highlightProtectedRegions": { "default": true, "description": "Highlight protected regions" },
    "htmlDwtTemplate.highlightOptionalRegions": { "default": true, "description": "Highlight optional regions" },
    "htmlDwtTemplate.showWarnings": { "default": true, "description": "Declared, not yet read" },
    "htmlDwtTemplate.confirmBeforeApply": { "default": true, "description": "Declared, not yet read" }
}
```

## 5. Acceptance Criteria

### Template Creation and Management

- **AC-001**: Given a .dwt file with TemplateBeginEditable markers, When user creates a new page from template, Then instance file should contain corresponding InstanceBeginEditable markers with preserved content
- **AC-002**: Given a template file in Templates/ directory and Enable Template Sync on, When template is modified and saved, Then the files based on it that are open in an editor should be updated without prompts, and files that are not open should be left for Update Files Based on Template
- **AC-003**: Given an instance file with editable content, When parent template is updated, Then editable content should be preserved while template structure is updated

### Region Protection and Editing

- **AC-004**: Given an instance file with protected regions, When user attempts to edit protected content, Then changes should be immediately reverted with warning message
- **AC-005**: Given a master template, When file is opened for editing, Then all content should be fully editable without protection restrictions
- **AC-017**: Given a child template, When user attempts to edit content outside its editable regions, Then the change should be reverted as in an instance file
- **AC-006**: Given an instance file, When protection is disabled for that file, Then all content should become editable

### Template Synchronization

- **AC-007**: Given multiple instance files based on same template, When template is updated via Update Files Based on Template, Then all instances should be updated while preserving individual editable content
- **AC-008**: Given a template with repeating regions, When synchronizing instances, Then repeat entries should be preserved with correct alternating colors if specified
- **AC-009**: Given Enable Backup on, When Update Files Based on Template changes files, Then copies of those files should exist in the newest backup folder before they are written; Given Enable Backup off, Then no backup should be made

### Content Preservation

- **AC-010**: Given an instance file with custom content in editable regions, When template structure changes, Then custom content should remain unchanged in corresponding regions
- **AC-011**: Given a repeating region with multiple entries, When template is updated, Then all repeat entries should be preserved with their individual content
- **AC-012**: Given optional regions with parameter-controlled visibility, When template updates, Then visibility states should be maintained based on instance parameters
- **AC-016**: Given a template edit that changes a TemplateBeginIf condition or default, When instances synchronize, Then each InstanceParam override remains intact while conditional blocks update to match the new template logic.

### Safety and Validation

- **AC-013**: Given template syntax errors, When attempting synchronization, Then extension should display specific error messages and prevent operation
- **AC-014**: Given potential content loss scenario, When safety checks fail, Then extension should show diff view and allow user to review changes
- **AC-015**: Given unbalanced template markers, When validating template, Then extension should report specific marker mismatch errors

## 6. Test Automation Strategy

### Test Levels
- **Unit Tests**: Template parsing, marker conversion, expression evaluation, region detection
- **Integration Tests**: File system operations, template-instance relationships, synchronization workflows  
- **End-to-End Tests**: Complete template creation to instance synchronization workflows

### Frameworks
- **Engine (in the engine repository)**: `node:test` unit tests (`npm test`) for parsing, merging, parameters, repeats, and discovery, plus the golden fixture test (`npm run test:golden`), which updates a copy of a full site and compares it byte for byte with a recorded result, then requires a second run to change nothing
- **Extension**: `@vscode/test-electron` integration tests for the engine host, protection, template sync on save, and backups (planned; tracked in TODO.md)

### Test Data Management
- **Test Templates**: Curated set of .dwt files covering all template features
- **Mock Workspaces**: Simulated site structures with Templates/ directories
- **Backup Scenarios**: Test data for restore functionality validation

### CI/CD Integration
- **GitHub Actions**: Automated testing on template syntax changes
- **Release Gate**: An engine release requires its unit tests to pass and its golden fixture to show zero differences and an idempotent second run; no coverage percentage is set
- **Regression Testing**: Automated validation against known working template sets
- **Conditional Region Regression**: Automated scenarios verifying TemplateBeginIf/TemplateEndIf updates and parameter propagation across linked regions.

### Performance Testing
- **Load Testing**: Template synchronization with 100+ instance files
- **Memory Testing**: Extension memory usage during large workspace operations
- **Response Time**: Template parsing and sync operations under 5 seconds for typical sites

## 7. Rationale & Context

### Design Decisions

**Adobe Dreamweaver Syntax Compatibility**: The extension replicates Dreamweaver's exact comment-based template syntax to ensure seamless migration of existing template-based sites. This maintains compatibility with legacy workflows while providing modern VS Code editing experience.

**HTML Comment-Based Markers**: Using HTML comments for template markers ensures generated files remain valid HTML/PHP documents that can be opened in any editor or browser. This approach follows web standards and maintains backward compatibility.

**File-Based Protection System**: Individual file protection settings allow developers to selectively disable protection for debugging while maintaining overall template integrity. This flexibility supports various development workflows without compromising template safety.

**Optional Rolling Backup System**: Three backups per template provide a safety net for template operations while managing disk space. Backups are on by default and switched by Enable Backup (or Toggle Backup), so sites already under version control can update without them.

**Shared Engine**: The merge logic lives in one package, `@isocialpractice/html-dwt-cmd-template`, used by both this extension and the command-line tool, so the same template gives the same result in the editor and in a terminal. A behavior change is made in the engine first, proven by its golden fixture test, and then picked up here by moving to the new engine version.

**JavaScript-Subset Expression Language**: Limiting template expressions to JavaScript subset prevents security risks while providing familiar syntax for web developers. This approach balances functionality with safety constraints.

**Conditional Region Synchronization**: Adobe's optional-region guidance (last updated 2021-04-27) requires TemplateBeginIf blocks to propagate parameter-driven visibility. The extension mirrors that behavior by updating instance visibility defaults and linked parameters whenever conditional logic changes in the template.

### Business Context

Web development teams using Dreamweaver templates require modern development tools while maintaining existing template-based workflows. This extension enables migration to VS Code ecosystem without rebuilding template systems, preserving development investments and team expertise.

### Technical Context

VS Code's extension API provides the document events, document editing, and UI integration capabilities needed for template management. The extension leverages VS Code's diff viewer, workspace management, and command system to provide integrated template development experience.

## 8. Dependencies & External Integrations

### Template Engine Dependency
- **ENG-001**: `@isocialpractice/html-dwt-cmd-template` 1.0.0+ - The template engine: merge, parameters, optional and repeat regions, safety checks, template discovery, and backups
- **ENG-002**: The extension calls the engine through an `EngineHost` over VS Code (`src/features/update/vscodeHost.ts`), which supplies file access through open documents, prompts with diffs, and progress; every engine write stays inside the site root
- **ENG-003**: Changes to how files are rebuilt are made in the engine first, with its tests passing, then the extension moves to the new engine version; an API gap is fixed in the engine, never worked around in the extension
- **ENG-004**: When the npm registry cannot provide the engine, `npm run install:engine` (`scripts/install-engine.cmd`, Windows) installs it from its GitHub release tag

### VS Code Platform Dependencies
- **PLT-001**: VS Code Engine version 1.74.0+ - Required for webview and diff editor functionality
- **PLT-002**: Node.js File System API - File I/O operations for template and instance management
- **PLT-003**: VS Code Workspace API - Multi-folder workspace support for site management

### Third-Party Library Dependencies
- **LIB-001**: diff library v8.0.2+ - Structured patch generation for diff navigation in the extension (the engine depends on it too)
- **LIB-002**: path library (Node.js built-in) - Cross-platform file path manipulation and resolution

### File System Dependencies
- **FS-001**: Read/Write access to workspace directories - Template file modification and instance creation
- **FS-002**: Directory creation permissions - Backup directory and temporary file management
- **FS-003**: Document save events - Template sync on save (Enable Template Sync); no file-system watcher is used

### VS Code Extension API Dependencies
- **API-001**: TextDocument API - Document content manipulation and change detection
- **API-002**: TextEditor API - Visual region highlighting and cursor position management
- **API-003**: Command API - Extension command registration and execution
- **API-004**: Webview API - Template creation dialog and folder selection interface
- **API-005**: Progress API - Long-running operation progress indication
- **API-006**: Diff Editor API - Template change comparison and navigation

### Template Syntax Dependencies
- **SYN-001**: HTML Comment Processing - Template marker parsing and conversion
- **SYN-002**: Regular Expression Engine - Template pattern matching and content extraction
- **SYN-003**: JavaScript Expression Evaluation - Template expression processing (limited subset)

## 9. Examples & Edge Cases

### Basic Template Structure

```html
<!DOCTYPE html>
<html>
<head>
    <!-- TemplateInfo codeOutsideHTMLIsLocked="true" -->
    <!-- TemplateParam name="pageTitle" type="text" value="Default Title" -->
    <title>@@(pageTitle)@@</title>
</head>
<body>
    <header>Site Header - Fixed Content</header>
    
    <!-- TemplateBeginEditable name="mainContent" -->
    <main>Default main content</main>
    <!-- TemplateEndEditable -->
    
    <!-- TemplateBeginRepeat name="productList" -->
    <div class="product">
        <!-- TemplateBeginEditable name="productName" -->Product Name<!-- TemplateEndEditable -->
        <!-- TemplateBeginEditable name="productPrice" -->$0.00<!-- TemplateEndEditable -->
    </div>
    <!-- TemplateEndRepeat -->
    
    <!-- TemplateBeginIf cond="showFooter" -->
    <footer>Optional Footer Content</footer>
    <!-- TemplateEndIf -->
</body>
</html>
```

### Generated Instance File

```html
<!DOCTYPE html>
<html>
<!-- InstanceBegin template="/Templates/product-page.dwt" codeOutsideHTMLIsLocked="true" -->
<head>
    <!-- InstanceParam name="pageTitle" type="text" value="Our Products" -->
    <title>Our Products</title>
</head>
<body>
    <header>Site Header - Fixed Content</header>
    
    <!-- InstanceBeginEditable name="mainContent" -->
    <main>
        <h1>Welcome to Our Product Catalog</h1>
        <p>Browse our extensive selection.</p>
    </main>
    <!-- InstanceEndEditable -->
    
    <!-- InstanceBeginRepeat name="productList" -->
        <!-- InstanceBeginRepeatEntry -->
        <div class="product">
            <!-- InstanceBeginEditable name="productName" -->Widget A<!-- InstanceEndEditable -->
            <!-- InstanceBeginEditable name="productPrice" -->$19.99<!-- InstanceEndEditable -->
        </div>
        <!-- InstanceEndRepeatEntry -->
        <!-- InstanceBeginRepeatEntry -->
        <div class="product">
            <!-- InstanceBeginEditable name="productName" -->Widget B<!-- InstanceEndEditable -->
            <!-- InstanceBeginEditable name="productPrice" -->$24.99<!-- InstanceEndEditable -->
        </div>
        <!-- InstanceEndRepeatEntry -->
    <!-- InstanceEndRepeat -->
    
    <footer>Optional Footer Content</footer>
</body>
<!-- InstanceEnd -->
</html>
```

### Conditional Region Update Scenario

```html
<!-- Template (after edit) -->
<!-- TemplateParam name="departmentImage" type="boolean" value="false" -->
<!-- TemplateBeginIf cond="departmentImage" -->
    <img src="/images/feature.png" alt="Department feature" />
<!-- TemplateEndIf -->

<!-- Corresponding instance after synchronization -->
<!-- InstanceParam name="departmentImage" type="boolean" value="true" -->
<!-- TemplateBeginIf cond="departmentImage" -->
    <img src="/images/feature.png" alt="Department feature" />
<!-- TemplateEndIf -->
```

### Alternating Table Row Colors

```html
<!-- Template with alternating row pattern -->
<table>
    <!-- TemplateBeginRepeat name="dataRows" -->
    <tr bgcolor="@@(_index & 1 ? '#FFFFFF' : '#CCCCCC')@@">
        <td><!-- TemplateBeginEditable name="cellData" -->Data<!-- TemplateEndEditable --></td>
    </tr>
    <!-- TemplateEndRepeat -->
</table>
```

### Nested Template Hierarchy

```html
<!-- Parent Template (base.dwt) -->
<html>
<head><title><!-- TemplateBeginEditable name="pageTitle" -->Default<!-- TemplateEndEditable --></title></head>
<body>
    <!-- TemplateBeginEditable name="content" -->
    <p>Default content</p>
    <!-- TemplateEndEditable -->
</body>
</html>

<!-- Child Template (product-page.dwt) -->
<html>
<!-- InstanceBegin template="/Templates/base.dwt" codeOutsideHTMLIsLocked="true" -->
<head><title><!-- InstanceBeginEditable name="pageTitle" -->Product Page<!-- InstanceEndEditable --></title></head>
<body>
    <!-- InstanceBeginEditable name="content" -->
    <div class="product-layout">
        <!-- TemplateBeginEditable name="productDetails" -->
        <p>Product information here</p>
        <!-- TemplateEndEditable -->
    </div>
    <!-- InstanceEndEditable -->
</body>
<!-- InstanceEnd -->
</html>
```

### Edge Cases

#### Malformed Template Markers
- **Edge Case**: Unmatched TemplateBeginEditable without TemplateEndEditable
- **Handling**: Extension should detect and report specific line numbers of unbalanced markers

#### Nested Editable Regions  
- **Edge Case**: TemplateBeginEditable inside another TemplateBeginEditable
- **Handling**: Extension should process top-level regions first, handle nested regions in content preservation

#### Empty Template Files
- **Edge Case**: .dwt file with no editable regions
- **Handling**: Extension should warn user and allow creation of instances with no editable content

#### Template Parameter Type Mismatches
- **Edge Case**: TemplateParam type="boolean" with non-boolean default value
- **Handling**: Extension should validate parameter types and provide default type-appropriate values

#### Large File Processing
- **Edge Case**: Template with thousands of instances across site
- **Handling**: Extension should process in batches with progress indication and allow cancellation

#### Circular Template References
- **Edge Case**: Template A references Template B which references Template A
- **Handling**: Extension should detect circular references and prevent infinite recursion

## 10. Validation Criteria

### Template Syntax Validation

The extension shall validate template files against the following criteria:

1. **Balanced Markers**: Every TemplateBeginEditable has matching TemplateEndEditable
2. **Unique Region Names**: No duplicate editable region names within single template
3. **Valid Parameter Types**: Template parameters use only supported data types
4. **Proper Nesting**: Template markers are properly nested without overlap
5. **Valid Expressions**: Template expressions use only supported JavaScript subset syntax

### Instance File Validation

1. **Template Reference**: InstanceBegin comment references valid template file
2. **Marker Consistency**: Instance markers correspond to template markers
3. **Content Preservation**: Editable content remains intact after template updates
4. **Parameter Values**: Instance parameters match template parameter definitions
5. **Structural Integrity**: Instance file maintains valid HTML/PHP structure

### Synchronization Validation

1. **Content Safety**: No editable content is lost during template updates
2. **Backup Creation**: Successful backup creation before destructive operations when Enable Backup is on
3. **Reference Integrity**: Template-instance relationships remain valid after updates
4. **Repeating Region Preservation**: Repeat entries maintain correct structure and alternating patterns
5. **Optional Region States**: Conditional content visibility preserved based on parameters and updated TemplateBeginIf expressions

### Performance Validation

1. **Response Time**: Template operations complete within 5 seconds for typical sites
2. **Memory Usage**: Extension memory consumption remains below 100MB during operations
3. **File System Efficiency**: Minimize unnecessary file I/O operations
4. **Progress Reporting**: Long operations provide meaningful progress feedback
5. **Cleanup**: Temporary files are properly removed after operations

## 11. Related Specifications / Further Reading

### Adobe Dreamweaver Template Documentation
- [Template Syntax Rules](https://helpx.adobe.com/dreamweaver/using/template-syntax.html) - Official syntax reference
- [Creating Dreamweaver Templates](https://helpx.adobe.com/dreamweaver/using/creating-dreamweaver-template.html) - Template creation guide
- [Template Expressions](https://helpx.adobe.com/dreamweaver/using/dreamweaver-templates.html#template_expressions) - Expression language reference
- [Using Optional Regions in Templates](https://helpx.adobe.com/dreamweaver/using/using-optional-regions-templates.html) - Conditional region configuration and parameter linkage

### VS Code Extension Development
- [VS Code Extension API](https://code.visualstudio.com/api) - Official extension development documentation
- [VS Code Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines) - Best practices for extension development

### Related Web Standards
- [HTML Living Standard](https://html.spec.whatwg.org/) - HTML specification for comment syntax
- [ECMAScript Subset](https://tc39.es/ecma262/) - JavaScript subset for template expressions

### Template Engine Patterns
- [Mustache Template Specification](https://mustache.github.io/mustache.5.html) - Logic-less template patterns
- [Handlebars.js](https://handlebarsjs.com/) - Extended template syntax examples
- [Using Optional Regions in Templates (Adobe)](https://helpx.adobe.com/dreamweaver/using/using-optional-regions-templates.html) - Conditional region behavior alignment