# HTML DWT Template Extension — Detailed Instructions

> The `site/` directory in this repository is a bundled sample site for learning and regression testing. It is not part of the published extension payload, and you may remove it after you finish evaluating the workflows.
> 
> Store all screenshots and GIFs referenced here under `support/instruct/`.

## 1. Prerequisites

- Windows, macOS, or Linux with Node.js 18+ and npm installed
- Visual Studio Code 1.80 or newer (required for diff editor APIs used by the extension)
- Git for cloning and version control workflows
- Optional: Adobe Dreamweaver documentation for cross-reference (links in the project spec)

[Screenshot Placeholder – VS Code extensions prerequisites]

## 2. Install & Build

1. Clone the repository and install dependencies:

   ```cmd
   git clone <repo-url>
   cd html-dwt-template
   npm install
   ```

2. Compile TypeScript sources:

   ```cmd
   npm run compile
   ```

3. Open the folder in VS Code and press `F5` to launch an Extension Development Host.

[Screenshot Placeholder – VS Code debug launch configuration]

## 3. Workspace Layout

- `site/`: Sample Dreamweaver-style site for safe experimentation and regression tests. None of its assets ship with the extension.
- `site/Templates/`: Source `.dwt` templates used by sync commands.
- `site/.html-dwt-template-backups/`: Rolling backups created automatically before sync.
- `src/extension.ts`: Main VS Code extension logic.
- `support/instruct/`: Documentation assets (place the final screenshots and GIFs here).

[Screenshot Placeholder – Explorer view highlighting site/ and Templates/]

## 4. Core Workflow

### 4.1 Update Instances from a Template

1. Open the template (e.g., `site/Templates/item.dwt`).
2. Apply changes to locked areas.
3. Open the corresponding instance page (e.g., `site/item.html`).
4. Run **Dreamweaver Template: Sync Template** from the Command Palette.
5. Review the diff-only view; use **Next/Previous Diff** buttons in the prompt to navigate.
6. Choose **Apply** to update or **Skip** to leave the instance unchanged.

[Screenshot Placeholder – Command Palette with Sync Template command]
[GIF Placeholder – Navigating diff and applying changes]

### 4.2 Optional (Conditional) Region Updates

- The extension synchronizes `TemplateBeginIf/TemplateEndIf` blocks across instances.
- Instance parameters are preserved; conditional logic changes propagate from the template.
- Re-run **Sync Template** after modifying optional-region expressions to refresh every instance.

[Screenshot Placeholder – Optional region markup before/after sync]

### 4.3 Repeating Region Maintenance

- Use **Dreamweaver Template: Insert Repeat Entry After/Before** within a repeating block.
- The helper normalizes alternating row colors when `_index` expressions exist.

[GIF Placeholder – Inserting a repeat entry]

### 4.4 Region Protection Controls

- **Toggle Protection**: enables/disables edit locks for the active instance.
- **Turn On/Off Protection**: persistent per-file commands for cases where global toggles are needed.
- Edits to locked regions auto-revert and surface warnings in the status bar.

[Screenshot Placeholder – Highlighted protected vs editable regions]

## 5. Command Reference

| Command | Purpose |
| --- | --- |
| `Dreamweaver Template: Sync Template` | Merge template changes into the active instance with diff navigation |
| `Dreamweaver Template: Create Page From Template` | Scaffold a new instance using a selected template |
| `Dreamweaver Template: Toggle Protection` | Temporarily allow edits in locked regions |
| `Dreamweaver Template: Find Instances` | List all instance files linked to the current template |
| `Dreamweaver Template: Insert Repeat Entry After/Before` | Duplicate a repeating-region entry |
| `Dreamweaver Template: Restore Backup` | Revert instances from the latest automatic backup |
| `Dreamweaver Template: Show Template Parameters` | Inspect current `InstanceParam` values |

## 6. Safety & Validation

- Structured diff previews appear before any write to disk.
- Automatic backups are stored in `.html-dwt-template-backups/` (keep last three versions).
- Syntax checks validate balanced editable markers and optional-region integrity.
- Review the output channel **Dreamweaver Template Protection** for detailed logs.

[Screenshot Placeholder – Safety prompt with Apply/Skip buttons]

## 7. Known Gaps & Manual Workarounds

| Missing Capability | Status / Workaround |
| --- | --- |
| Exporting/importing template content (XML) | Not implemented; manage exports manually in Dreamweaver or with custom scripts |
| Editable tag attributes (`TemplateParam` on attributes) | Not yet supported; edit attribute values directly inside editable regions |
| Optional-region linking UI | Link parameters by hand inside template comments until UI is added |
| Template authoring preferences dialog | Adjust settings via manual editing of configuration entries |
| Applying/removing templates to existing pages | Currently manual; follow Dreamweaver guide referenced in the spec |

## 8. Asset Capture Checklist

- [ ] Screenshot of Command Palette highlighting core commands → `support/instruct/cmd-palette.png`
- [ ] GIF of diff navigation during sync → `support/instruct/diff-navigation.gif`
- [ ] Screenshot of optional-region update before/after → `support/instruct/optional-region.png`
- [ ] Screenshot of protected vs editable highlighting → `support/instruct/editable-highlighting.png`

## 9. Guided Tutorial (Future Plan)

A guided walkthrough that leverages the `site/` sample project is planned for a future release. The tutorial will allow new users to run through common scenarios and then decide whether to keep or delete the sample content.

## 10. Further Reading

- `.github/spec/spec-tool-html-dwt-template-extension.md` — full functional specification and roadmap
- Adobe Dreamweaver optional regions guide (linked in the spec) for parity requirements
