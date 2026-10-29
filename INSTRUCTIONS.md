# HTML `dwt` Template: Detailed Instructions

HTML `dwt` Template follows the Adobe Dreamweaver templating system. It is not
affiliated with Adobe; Adobe and Dreamweaver are trademarks of Adobe.

> The `site/` folder in this repository is a demo site for learning and
> regression tests. It is not part of the packaged extension, and you may
> remove it after you finish evaluating the workflows.
>
> Store all screenshots and GIFs referenced here under `support/instruct/`.

## 1. Prerequisites

- VS Code `1.74.0` or later.
- A site folder with a `Templates/` folder at its root. Without one, the
  extension stays inactive for that workspace.
- To build from source: Windows, macOS, or Linux with Node.js 18 or later, npm,
  and Git.
- Optional: the Adobe Dreamweaver template documentation, linked in the
  specification, for reference.

[Screenshot Placeholder: VS Code extensions prerequisites]

## 2. Install and Build

1. Clone the repository and install dependencies:

   ```cmd
   git clone https://github.com/<owner>/html-dwt-template.git
   cd html-dwt-template
   npm install
   ```

   `npm install` also installs the template engine,
   `@isocialpractice/html-dwt-cmd-template`. If the npm registry cannot provide
   it, run `npm run install:engine` instead (Windows; it runs
   `scripts\install-engine.cmd`): it tries the registry first, then installs
   the engine from its GitHub release tag and prints how to switch back once
   the registry works. On macOS or Linux, run
   `npm pkg set "dependencies.@isocialpractice/html-dwt-cmd-template=github:<owner>/html-dwt-cmd-template#v1.0.0"`
   and then `npm install`.

2. Compile the TypeScript sources:

   ```cmd
   npm run compile
   ```

3. Open the folder in VS Code and press `F5` to start an Extension Development
   Host. Open a site folder (or `site/`) in that window.

[Screenshot Placeholder: VS Code debug launch configuration]

## 3. Workspace Layout

| Path | Contents |
| --- | --- |
| `Templates/` | Templates (`.dwt`, `.html`, `.htm`, `.php`) at the site root; required |
| `.html-dwt-template-backups/` | Backups made before updates, three per template, at the site root |
| `src/extension.ts` | Activation and command registration |
| `src/features/` | VS Code features: protection, diffs, page creation, repeat entries, the engine host |
| `site/` | Demo site; not packaged |
| `support/instruct/` | Documentation assets (screenshots and GIFs) |

The merge logic itself lives in the engine package, not in `src/`. See
section 8.

[Screenshot Placeholder: Explorer view highlighting Templates/]

## 4. Core Workflow

### 4.1 Update Files Based on a Template

1. Open a template, for example `Templates/main.dwt`.
2. Change markup outside its editable regions, and save.
3. Run **html-dwt-template: Update Files Based on Template** from the Command
   Palette or the editor's right-click menu, and confirm.
4. For each file that would change, choose to apply it, skip it, apply to all,
   or show the diff first. In the diff, the **Next** and **Previous** buttons
   move between changes.
5. Child templates based on the template are updated too, and so are the
   files based on them.

To update everything without prompts, run **html-dwt-template: UPDATE ALL
FILES USING TEMPLATE** instead. It applies every change, then repeats for each
child template below the one you started from.

When the template you update is itself a child template whose parent uses
editable attributes (`@@(param)@@`), the child is first updated from its parent,
keeping the child's own `InstanceParam` values, and then the files based on the
child are updated.

[Screenshot Placeholder: Command Palette with Update Files Based on Template]
[GIF Placeholder: Navigating a diff and applying changes]

### 4.2 Template Sync on Save

With **Enable Template Sync** on (the default), saving a template updates every
file based on it that is open in an editor, child templates included:

- no prompts and no backups;
- a file with unsaved changes keeps them and stays unsaved;
- files that are not open are not touched.

**html-dwt-template: Toggle Template Synchronization** switches the setting.
**Update Files Based on Template** works whether it is on or off.

### 4.3 Optional (Conditional) Regions

- `TemplateBeginIf` blocks are evaluated against each file's `InstanceParam`
  values; blocks that evaluate false are removed from that file. A block that
  holds an editable region is kept for now, whatever its condition (a known
  engine limitation).
- Each file keeps its own parameter values; changes to the conditions come from
  the template.
- Run **Update Files Based on Template** again after changing a condition to
  refresh every file.

[Screenshot Placeholder: Optional region markup before and after an update]

### 4.4 Repeating Regions

- Place the cursor inside a repeat entry and run **html-dwt-template: Insert
  Entry After Selection** or **Insert Entry Before Selection**.
- When the entries use `_index` expressions for alternating row colors, the
  colors are renumbered after the insert.

[GIF Placeholder: Inserting a repeat entry]

### 4.5 Protection

- Pages and child templates based on a template accept edits only inside their
  editable regions. Edits elsewhere are reverted with a warning.
- Master templates (templates not based on another template) are always fully
  editable.
- **html-dwt-template: Turn Off Protection** and **Turn On Protection** switch
  protection for the open file. **Enable Protection** in Settings switches it
  for every file.

[Screenshot Placeholder: Highlighted protected and editable regions]

### 4.6 Backups and Restore

- With **Enable Backup** on (the default), every file an update is about to
  change is copied to `.html-dwt-template-backups/<template>/1/` first. Older
  backups move to `2` and `3`; the oldest is dropped.
- **html-dwt-template: Toggle Backup** switches the setting. Updates made while
  it is off have no backup.
- **html-dwt-template: Restore Last HTML Backup** asks for confirmation, then
  puts back the files saved by the newest backup.

## 5. Command Reference

| Command Palette name | Purpose |
| --- | --- |
| `html-dwt-template: Update Files Based on Template` | Update the files based on the open template, with a diff to apply or skip for each |
| `html-dwt-template: UPDATE ALL FILES USING TEMPLATE` | Update every file based on the template, and on its child templates, without prompts |
| `html-dwt-template: Find Template Instances` | List the files based on the open template |
| `html-dwt-template: Create New Page from Template` | Make a new page from the open template |
| `html-dwt-template: Show Editable Regions` | List the editable regions of the open file |
| `html-dwt-template: Insert Entry After Selection` | Add a repeat entry after the one at the cursor |
| `html-dwt-template: Insert Entry Before Selection` | Add a repeat entry before the one at the cursor |
| `html-dwt-template: Turn Off Protection` | Allow edits outside editable regions in the open file |
| `html-dwt-template: Turn On Protection` | Block edits outside editable regions in the open file |
| `html-dwt-template: Toggle Template Synchronization` | Switch **Enable Template Sync** |
| `html-dwt-template: Toggle Backup` | Switch **Enable Backup** |
| `html-dwt-template: Restore Last HTML Backup` | Put back the files saved by the newest backup |

## 6. Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| `htmlDwtTemplate.enableProtection` | `true` | Protect the non-editable regions of pages and child templates |
| `htmlDwtTemplate.enableTemplateSync` | `true` | Saving a template updates the open files based on it (section 4.2) |
| `htmlDwtTemplate.enableBackup` | `true` | Back up files before an update changes them (section 4.6) |
| `htmlDwtTemplate.useStickyDiffPanel` | `false` | Show the diff controls in a movable panel instead of a modal popup |
| `htmlDwtTemplate.highlightEditableRegions` | `true` | Highlight editable regions |
| `htmlDwtTemplate.highlightProtectedRegions` | `true` | Highlight protected regions |
| `htmlDwtTemplate.highlightOptionalRegions` | `true` | Highlight optional regions |
| `htmlDwtTemplate.showWarnings` | `true` | Reserved; not read yet |
| `htmlDwtTemplate.confirmBeforeApply` | `true` | Reserved; not read yet |

Settings customized under the keys of `1.0.0-alpha` (`dreamweaverTemplate.*`)
are not carried over; set them again under `htmlDwtTemplate.*`.

## 7. Safety and Validation

- Every write stays inside the site root; files outside it are never changed.
- A diff can be shown before any file is written.
- Before a file is written, it is checked for unbalanced editable region
  markers and broken optional regions. A file that fails is skipped; you can
  show its diff, move on to the next file, or cancel the run.
- The **HTML DWT Template** output channel logs each run.

[Screenshot Placeholder: Safety prompt]

## 8. Template Engine and Versioning

The merge logic comes from the npm package
`@isocialpractice/html-dwt-cmd-template`, which is also a command-line tool
(`html-dwt-cmd`). The extension supplies only the VS Code side. A behavior
change in how files are rebuilt is made in the engine first, then the extension
moves to the new engine version.

Pre-release builds of the extension are numbered `1.0.0-alpha.x.y.z`, where
`x.y.z` counts breaking, feature, and fix releases. The first Visual Studio
Marketplace release will be `1.0.0`.

## 9. Known Gaps and Manual Workarounds

| Missing capability | Status or workaround |
| --- | --- |
| Exporting and importing template content (XML) | Not implemented; manage exports by hand or with custom scripts |
| Optional region linking UI | Link parameters by hand inside template comments |
| Template authoring preferences dialog | Change the settings in section 6 |
| Applying a template to an existing page, or removing one | Not implemented; follow the Adobe guide referenced in the specification |
| Setting and showing template parameters from the Command Palette | Registered but not listed yet; planned |

## 10. Asset Capture Checklist

- [ ] Screenshot of the Command Palette with the core commands: `support/instruct/cmd-palette.png`
- [ ] GIF of diff navigation during an update: `support/instruct/diff-navigation.gif`
- [ ] Screenshot of an optional region before and after an update: `support/instruct/optional-region.png`
- [ ] Screenshot of protected and editable highlighting: `support/instruct/editable-highlighting.png`

## 11. Guided Tutorial (Future Plan)

A guided walkthrough that uses the `site/` demo is planned for a future
release. It will let new users run through common scenarios and then decide
whether to keep or delete the demo content.

## 12. Further Reading

- `.github/spec/spec-tool-html-dwt-template-extension.md`: the functional
  specification and roadmap.
- The Adobe Dreamweaver optional regions guide, linked in the specification.
