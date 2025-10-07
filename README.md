# HTML DWT Template Extension

Dreamweaver-style templating for VS Code, including editable region protection, automated template-to-instance sync, and diff-first safety workflows. The `site/` folder is a bundled demo workspace for learning and regression tests; it is not part of the packaged extension.

## Quick Start

1. Install dependencies and build the extension:

   ```cmd
   npm install
   npm run compile
   ```

2. Press `F5` in VS Code to launch an Extension Development Host.
3. Open any page under `site/` and run **Dreamweaver Template: Sync Template** from the Command Palette to preview template updates with diff navigation.
4. Use **Dreamweaver Template: Toggle Protection** if you need to temporarily edit locked regions.
5. Refer to `INSTRUCTIONS.md` in the repo root for full workflows and troubleshooting tips.

[Screenshot Placeholder – Command Palette showing Dreamweaver template commands]

## Implemented Highlights

- Template/instance sync with editable-region preservation
- Optional-region conversion and conditional block updates
- Repeating-region helpers for inserting entries and normalizing alternating rows
- Dreamweaver-style protection overlays for non-editable sections
- Safety checks with structured diffs before writing to disk

## Sample Content

- `site/`: Regression-ready Dreamweaver-style site
- `.html-dwt-template-backups/`: Rolling backups created prior to template syncs

## Known Gaps & Pending Work

- Exporting/importing template content as XML (Dreamweaver `Export/Import` workflows)
- Editable tag-attribute bindings (`TemplateBeginEditable tag="..." attribute="..."`)
- Visual editors for optional-region parameter linking and authoring preferences
- Automated migration guides for applying/removing templates to existing non-templated pages

Contributions welcome—see the spec in `.github/spec/spec-tool-html-dwt-template-extension.md` for the full roadmap.
