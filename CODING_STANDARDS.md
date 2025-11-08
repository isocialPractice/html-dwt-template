# html-dwt-template Coding Standards

This document defines the coding standards and style conventions for the html-dwt-template VS Code extension project. All contributions should follow these guidelines to maintain consistency and code quality.

## 1. Purpose and Scope

**Purpose:** To ensure consistent code quality, readability, and maintainability across the TypeScript codebase for the Dreamweaver-style template extension.

**Scope:** Applies to all TypeScript files in the `src/` directory and its subdirectories.

## 2. File Organization

### 2.1 File Headers

Every file should begin with a single-line comment identifying the module:

```typescript
// moduleName
// Brief description of the module's purpose.
```

**Example:**
```typescript
// logger
// Provides structured logging utilities for the extension.
```

### 2.2 Import Organization

Imports should be grouped in the following order, with blank lines separating each group:

1. Node.js built-in modules (`path`, `fs`, etc.)
2. VS Code API (`vscode`)
3. Third-party libraries (`diff`, etc.)
4. Local project utilities (from `./utils/` or `../utils/`)
5. Local feature modules (from `./features/` or sibling directories)

**Example:**
```typescript
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { structuredPatch } from 'diff';
import { isDreamweaverTemplate } from './utils/templateDetection';
import { parseTemplateParameters } from './features/update/params';
```

### 2.3 Module Structure

Files should be organized in this order:
1. File header comment
2. Imports
3. Type/interface definitions
4. Constants
5. Module-level variables
6. Functions (public functions first, then private/helper functions)
7. Exports

## 3. Naming Conventions

### 3.1 Variables and Constants

| Type | Convention | Example |
|------|------------|---------|
| Local variables | `camelCase` | `instancePath`, `templateContent` |
| Module-level variables | `camelCase` | `outputChannel`, `isProtectionEnabled` |
| Constants | `UPPER_SNAKE_CASE` | `OUTPUT_CHANNEL_NAME`, `DREAMWEAVER_COMMENT_REGEX` |
| Boolean variables | Prefix with `is`, `has`, `should` | `isProtectionEnabled`, `hasBackup`, `shouldProtectFromEditing` |

### 3.2 Functions and Methods

- Use `camelCase` for function names
- Use descriptive, action-oriented names
- Prefer verb-noun patterns for clarity

**Examples:**
```typescript
function updateDecorations(editor: vscode.TextEditor): void
function findTemplateInstances(templatePath: string): Promise<vscode.Uri[]>
function parseTemplateParameters(templateContent: string): TemplateParam[]
```

### 3.3 Types and Interfaces

- Use `PascalCase` for all type and interface names
- Prefer descriptive names that indicate the data structure's purpose

**Examples:**
```typescript
interface TemplateParam { ... }
interface MergeResult { ... }
type MergeResultStatus = 'updated' | 'unchanged' | 'skipped';
```

### 3.4 File Names

- Use `camelCase` for TypeScript file names
- Name files after their primary export or purpose
- Use descriptive names that reflect the module's responsibility

**Examples:**
```
extension.ts
templateDetection.ts
updateEngine.ts
diffControlPanel.ts
```

## 4. Code Formatting

### 4.1 Indentation

- Use **2 spaces** per indent level (no tabs)
- Consistent across all TypeScript files

### 4.2 Line Length

- Maximum line length: **120 characters** (flexible guideline)
- Break long lines at logical points (parameters, operators)

### 4.3 Spacing

- One space after control flow keywords: `if (condition)`, not `if(condition)`
- No space between function name and parameters: `functionName(arg)`
- Space around binary operators: `a + b`, `x === y`
- No trailing whitespace

### 4.4 Semicolons

- Always use semicolons to terminate statements
- Do not rely on automatic semicolon insertion (ASI)

### 4.5 Quotes

- Use **single quotes** (`'`) for string literals
- Use template literals (backticks) for string interpolation or multi-line strings

**Examples:**
```typescript
const message = 'This is a string';
const interpolated = `Template: ${templateName}`;
```

### 4.5 Braces

- Use K&R style (opening brace on same line)
- Always use braces for control structures, even single-line blocks

**Example:**
```typescript
if (condition) {
  doSomething();
}

function myFunction() {
  return value;
}
```

### 4.6 Blank Lines

- One blank line between top-level functions
- One blank line between logical sections within a function
- Two blank lines between major sections in a file (optional, for clarity)

## 5. TypeScript Conventions

### 5.1 Type Annotations

- Always explicitly type function parameters
- Always explicitly type function return values
- Let TypeScript infer local variable types when obvious
- Use explicit types for complex or ambiguous cases

**Example:**
```typescript
// Explicit parameter and return types
function parseTemplateParameters(templateContent: string): TemplateParam[] {
  const parameters: TemplateParam[] = []; // Explicit when helpful
  return parameters;
}

// Inferred local variable
const instancePath = instanceUri.fsPath; // Type inferred as string
```

### 5.2 Interfaces vs Types

- Prefer `interface` for object shapes and public APIs
- Use `type` for unions, intersections, and type aliases

**Examples:**
```typescript
// Prefer interface for object shapes
interface TemplateParam {
  name: string;
  type: 'text' | 'URL' | 'color' | 'number' | 'boolean';
  value: string;
}

// Use type for unions
type MergeResultStatus = 'updated' | 'unchanged' | 'skipped' | 'safetyFailed';
```

### 5.3 Null and Undefined

- Use `undefined` for uninitialized or absent values
- Use `null` only when required by external APIs
- Use optional chaining (`?.`) and nullish coalescing (`??`) where appropriate

**Examples:**
```typescript
const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
const value = parameters[name] ?? defaultValue;
```

### 5.4 Async/Await

- Prefer `async`/`await` over raw Promises for readability
- Always handle errors with try/catch in async functions
- Mark async functions with explicit `Promise<T>` return type

**Example:**
```typescript
async function updateHtmlBasedOnTemplate(templateUri: vscode.Uri): Promise<void> {
  try {
    const content = await vscode.workspace.fs.readFile(templateUri);
    // process content
  } catch (error) {
    console.error('Failed to read template:', error);
  }
}
```

## 6. Comments and Documentation

### 6.1 File-Level Comments

Every file should start with a brief comment explaining its purpose:

```typescript
// moduleName
// Brief description of what this module does.
```

### 6.2 Function Comments

- Add comments for non-trivial or public functions
- Explain **why**, not **what** (code should be self-explanatory)
- Use TSDoc-style comments for exported functions when helpful

**Example:**
```typescript
/**
 * Finds all HTML files that reference the given template.
 * Excludes .dwt template files themselves.
 */
async function findTemplateInstances(templatePath: string): Promise<vscode.Uri[]> {
  // implementation
}
```

### 6.3 Inline Comments

- Use inline comments sparingly
- Explain complex logic, non-obvious decisions, or workarounds
- Keep comments up-to-date with code changes

**Examples:**
```typescript
// Defensive reset so a prior run (like Update All) can't leave sticky state
applyToAllForRun = false;

// Allow full editing of .dwt template files
if (isDreamweaverTemplateFile(document)) {
  return false;
}
```

### 6.4 TODO and FIXME Tags

Use standardized tags for follow-up work:

```typescript
// TODO: Add support for nested optional regions
// FIXME: Known issue with CRLF line endings on Windows
// NOTE: This workaround is needed for VS Code API limitation
```

## 7. Error Handling

### 7.1 Try-Catch Blocks

- Always wrap potentially failing operations in try-catch
- Provide meaningful error messages to users
- Log errors for debugging purposes

**Example:**
```typescript
try {
  const content = fs.readFileSync(templatePath, 'utf8');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  vscode.window.showErrorMessage(`Failed to read template: ${message}`);
  console.error('Template read error:', error);
}
```

### 7.2 Error Codes

Use consistent error/exit codes:

```typescript
// 0 success
// 1 error/exception
// 2 cancelled (user cancelled entire run)
// 3 skipped (user skipped this specific item)
// 4 safety-skip (user skipped due to safety issues)
```

### 7.3 Defensive Programming

- Validate inputs at function boundaries
- Check for null/undefined before accessing properties
- Provide sensible defaults when appropriate

**Example:**
```typescript
if (!editor) {
  vscode.window.showWarningMessage('No active editor.');
  return;
}

const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
if (!workspaceFolder) {
  vscode.window.showErrorMessage('No workspace folder open.');
  return false;
}
```

## 8. VS Code Extension Patterns

### 8.1 Command Registration

- Register all commands in the `activate` function
- Add all disposables to `context.subscriptions`
- Use descriptive command IDs with extension prefix

**Example:**
```typescript
const syncTemplateCommand = vscode.commands.registerCommand(
  'dreamweaverTemplate.syncTemplate',
  async () => {
    // implementation
  }
);

context.subscriptions.push(syncTemplateCommand);
```

### 8.2 Configuration Access

- Use the workspace configuration API
- Provide sensible defaults
- Cache configuration values when performance matters

**Example:**
```typescript
const config = vscode.workspace.getConfiguration('dreamweaverTemplate');
const enableProtection = config.get('enableProtection', true);
```

### 8.3 Output Channel Usage

- Initialize output channel once during activation
- Use consistent prefixes for log messages
- Log both to console and output channel for debugging

**Example:**
```typescript
if (outputChannel) {
  outputChannel.appendLine(`[DW-MERGE] Start merge for instance: ${instancePath}`);
}
console.log(`[DW-MERGE] Start merge for instance: ${instancePath}`);
```

## 9. Regular Expressions

### 9.1 Naming

- Use `UPPER_SNAKE_CASE` for regex constants
- Include descriptive suffixes like `_REGEX` or `_PATTERN`

**Example:**
```typescript
const DREAMWEAVER_COMMENT_REGEX = /<!--\s*(?:InstanceBeginEditable|TemplateBeginEditable)/;
const INSTANCE_PARAM_REGEX = /<!--\s*InstanceParam\s+name="([^"]+)"/g;
```

### 9.2 Global Flag

- Always reset `lastIndex` when reusing global regexes
- Or recreate the regex for each use

**Example:**
```typescript
const regex = /pattern/g;
regex.lastIndex = 0; // Reset before reuse
while ((match = regex.exec(text)) !== null) {
  // process match
}
```

## 10. Best Practices

### 10.1 Function Size

- Keep functions small and focused on a single responsibility
- Extract complex logic into separate helper functions
- Aim for functions under 50 lines when possible

### 10.2 Code Reuse

- Avoid repeating logic; prefer shared helper functions
- Extract common patterns into utility modules
- Use the utilities in `src/utils/` for shared functionality

### 10.3 Immutability

- Prefer `const` over `let` when values don't change
- Avoid mutating function parameters
- Use spread operator or `Array.map()` for transformations

**Example:**
```typescript
// Good
const updatedOptions = { ...options, suppressSafetyChecks: true };

// Avoid
options.suppressSafetyChecks = true; // Mutates parameter
```

### 10.4 Early Returns

- Use early returns to reduce nesting
- Handle error cases first, then the happy path

**Example:**
```typescript
function processTemplate(editor: vscode.TextEditor | undefined): void {
  if (!editor) {
    return; // Early return for error case
  }
  
  // Main logic with less nesting
  const content = editor.document.getText();
  // ...
}
```

### 10.5 Avoid Magic Numbers

- Use named constants for magic numbers and strings
- Provide context through meaningful names

**Example:**
```typescript
// Good
const MAX_LINE_LENGTH = 120;
const SUCCESS_CODE = 0;

// Avoid
if (line.length > 120) { ... }
```

## 11. Testing Considerations

- Write testable code by keeping functions pure when possible
- Separate business logic from VS Code API calls for easier testing
- Use dependency injection for external dependencies

**Example:**
```typescript
// Testable - pure function
function parseTemplateParameters(content: string): TemplateParam[] {
  // No external dependencies
}

// Dependency injection for testability
function updateEngine(
  instanceUri: vscode.Uri,
  deps: { outputChannel: vscode.OutputChannel }
): Promise<MergeResult> {
  // Dependencies passed as parameters
}
```

## 12. Changes to This Guide

Coding standards evolve with the project. To propose improvements:

1. Open an issue describing the proposed change and rationale
2. Discuss with maintainers before submitting a pull request
3. Update this document as part of any accepted style changes

---

**Last Updated:** November 2025  
**Version:** 1.0.0
