---
mode: 'agent'
description: 'Create a new specification file for the solution, optimized for Generative AI consumption.'
tools: ['createFile', 'createDirectory', 'editFiles', 'search', 'runCommands', 'runTasks', 'usages', 'vscodeAPI', 'problems', 'changes', 'testFailure', 'openSimpleBrowser', 'fetch', 'githubRepo', 'extensions', 'todos']
---

# Create Specification

Your goal is to create a new specification file for `${input:SpecPurpose}`.

The specification file must define the requirements, constraints, and interfaces for the solution components in a manner that is clear, unambiguous, and structured for effective use by Generative AIs. Follow established documentation standards and ensure the content is machine-readable and self-contained.

## Best Practices for AI-Ready Specifications

- Use precise, explicit, and unambiguous language.
- Clearly distinguish between requirements, constraints, and recommendations.
- Use structured formatting (headings, lists, tables) for easy parsing.
- Avoid idioms, metaphors, or context-dependent references.
- Define all acronyms and domain-specific terms.
- Include examples and edge cases where applicable.
- Ensure the document is self-contained and does not rely on external context.

The specification should be saved in the [/.github/spec/](/.github/spec/) directory, which must exist prior to saving (create it if it does not exist), and named according to the following convention: `spec-[a-z0-9-]+.md`, where the name should be descriptive of the specification's content and starting with the highlevel purpose, which is one of [schema, tool, data, infrastructure, process, architecture, or design].

The specification file must be formatted in well formed Markdown.

## Fetch Data for Templating Rules:

Fetch data from the following pages to apply rules for the templating system. The data fetched is to aide in the creation of the specification for editing the extension, but is not to be applied in full as some elements - especially those pertaining to the UI/UX will differ. Additionally note that the data being fetched is in regards to the Adobe Dreamweaver program. It is to be used as learning material in such a way that a similar templating system can be emulated using VS Code. The following pages should be fetched and scrapped for relevant data:

- [primary focus](https://helpx.adobe.com/dreamweaver/using/template-syntax.html)
- [reference for rules](https://helpx.adobe.com/dreamweaver/using/dreamweaver-templates.html)
- [reference for rules](https://helpx.adobe.com/dreamweaver/using/recognizing-templates-template-based-documents.html)
- [reference for rules](https://helpx.adobe.com/dreamweaver/using/creating-dreamweaver-template.html)
- [reference for rules](https://helpx.adobe.com/dreamweaver/using/creating-editable-regions-templates.html)
- [reference for rules](https://helpx.adobe.com/dreamweaver/using/creating-repeating-regions-templates.html)
- [reference for rules](https://helpx.adobe.com/dreamweaver/using/using-optional-regions-templates.html)
- [reference for rules](https://helpx.adobe.com/dreamweaver/using/defining-editable-tag-attributes-templates.html)
- [reference for rules](https://helpx.adobe.com/dreamweaver/using/creating-nested-template.html)
- [reference for rules](https://helpx.adobe.com/dreamweaver/using/editing-updating-deleting-templates.html)
- [reference for rules](https://helpx.adobe.com/dreamweaver/using/exporting-importing-template-content.html)
- [reference for rules](https://helpx.adobe.com/dreamweaver/using/applying-or-removing-template-existing.html)
- [reference for rules](https://helpx.adobe.com/dreamweaver/using/editing-content-template-based-document.html)
- [reference for rules](https://helpx.adobe.com/dreamweaver/using/setting-authoring-preferences-templates.html)
- [reference for rules](https://helpx.adobe.com/dreamweaver/kb/benefits-using-templates.html)


## Final Specification File

Specification files must follow the template below, ensuring that all sections are filled out appropriately. The front matter for the markdown should be structured correctly as per the example following:

```md
---
title: [Concise Title Describing the Specification's Focus]
version: [Optional: e.g., 1.0, Date]
date_created: [YYYY-MM-DD]
last_updated: [Optional: YYYY-MM-DD]
owner: [Optional: Team/Individual responsible for this spec]
tags: [Optional: List of relevant tags or categories, e.g., `infrastructure`, `process`, `design`, `app` etc]
---

# Introduction

[A short concise introduction to the specification and the goal it is intended to achieve.]

## 1. Purpose & Scope

[Provide a clear, concise description of the specification's purpose and the scope of its application. State the intended audience and any assumptions.]

## 2. Definitions

[List and define all acronyms, abbreviations, and domain-specific terms used in this specification.]

## 3. Requirements, Constraints & Guidelines

[Explicitly list all requirements, constraints, rules, and guidelines. Use bullet points or tables for clarity.]

- **REQ-001**: Requirement 1
- **SEC-001**: Security Requirement 1
- **[3 LETTERS]-001**: Other Requirement 1
- **CON-001**: Constraint 1
- **GUD-001**: Guideline 1
- **PAT-001**: Pattern to follow 1

## 4. Interfaces & Data Contracts

[Describe the interfaces, APIs, data contracts, or integration points. Use tables or code blocks for schemas and examples.]

## 5. Acceptance Criteria

[Define clear, testable acceptance criteria for each requirement using Given-When-Then format where appropriate.]

- **AC-001**: Given [context], When [action], Then [expected outcome]
- **AC-002**: The system shall [specific behavior] when [condition]
- **AC-003**: [Additional acceptance criteria as needed]

## 6. Test Automation Strategy

[Define the testing approach, frameworks, and automation requirements.]

- **Test Levels**: Unit, Integration, End-to-End
- **Frameworks**: MSTest, FluentAssertions, Moq (for .NET applications)
- **Test Data Management**: [approach for test data creation and cleanup]
- **CI/CD Integration**: [automated testing in GitHub Actions pipelines]
- **Coverage Requirements**: [minimum code coverage thresholds]
- **Performance Testing**: [approach for load and performance testing]

## 7. Rationale & Context

[Explain the reasoning behind the requirements, constraints, and guidelines. Provide context for design decisions.]

## 8. Dependencies & External Integrations

[Define the external systems, services, and architectural dependencies required for this specification. Focus on **what** is needed rather than **how** it's implemented. Avoid specific package or library versions unless they represent architectural constraints.]

### External Systems
- **EXT-001**: [External system name] - [Purpose and integration type]

### Third-Party Services
- **SVC-001**: [Service name] - [Required capabilities and SLA requirements]

### Infrastructure Dependencies
- **INF-001**: [Infrastructure component] - [Requirements and constraints]

### Data Dependencies
- **DAT-001**: [External data source] - [Format, frequency, and access requirements]

### Technology Platform Dependencies
- **PLT-001**: [Platform/runtime requirement] - [Version constraints and rationale]

### Compliance Dependencies
- **COM-001**: [Regulatory or compliance requirement] - [Impact on implementation]

**Note**: This section should focus on architectural and business dependencies, not specific package implementations. For example, specify "OAuth 2.0 authentication library" rather than "Microsoft.AspNetCore.Authentication.JwtBearer v6.0.1".

## 9. Examples & Edge Cases

    ```code
    // Code snippet or data example demonstrating the correct application of the guidelines, including edge cases
    ```

## 10. Validation Criteria

[List the criteria or tests that must be satisfied for compliance with this specification.]

## 11. Related Specifications / Further Reading

[Link to related spec 1]
[Link to relevant external documentation]

```
