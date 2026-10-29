# HTML `dwt` Template

HTML templates for VS Code that follow the Adobe Dreamweaver templating system.
Not affiliated with Adobe; Adobe and Dreamweaver are trademarks of Adobe.

Keep the shared markup of a website in templates, and let each page based on a
template change only inside its editable regions. When a template changes,
**Update Files Based on Template** rebuilds every file based on it, keeps the
content of each editable region, and shows a diff before anything is written.

The `site/` folder in this repository is a demo site for learning and
regression tests. It is not part of the packaged extension.

## Requirements

- VS Code `1.74.0` or later.
- A workspace folder with a `Templates/` folder at its root. Without one, the
  extension stays inactive for that workspace.
- Templates are `.dwt`, `.html`, `.htm`, or `.php` files in `Templates/`.
  Pages based on a template can be `.html`, `.htm`, or `.php`.

## Quick Start

1. Open the site folder, the one that holds `Templates/`, in VS Code.
2. Open a template, for example `Templates/main.dwt`, change markup outside its
   editable regions, and save.
3. Right-click in the editor and choose **Update Files Based on Template**.
   Review the diff for each file, then apply or skip it.
4. Open a page based on that template, for example `about.html`. Only its
   editable regions accept edits.

See [INSTRUCTIONS.md](INSTRUCTIONS.md) for full workflows.

## Commands

Every command shows in the Command Palette under the `html-dwt-template`
category. Template commands also show in the editor's right-click menu.

| Command Palette name | What it does |
| --- | --- |
| `html-dwt-template: Update Files Based on Template` | With a template open, update the pages and child templates based on it, with a diff to apply or skip for each file |
| `html-dwt-template: UPDATE ALL FILES USING TEMPLATE` | Update every file based on the template without prompts, then do the same for each child template below it |
| `html-dwt-template: Find Template Instances` | List the files based on the open template |
| `html-dwt-template: Create New Page from Template` | Make a new page from the open template, with its parameters and editable regions in place |
| `html-dwt-template: Show Editable Regions` | List the editable regions of the open file |
| `html-dwt-template: Insert Entry After Selection` | Add a repeat entry after the one at the cursor |
| `html-dwt-template: Insert Entry Before Selection` | Add a repeat entry before the one at the cursor |
| `html-dwt-template: Turn Off Protection` | Allow edits outside the editable regions of the open file |
| `html-dwt-template: Turn On Protection` | Block edits outside the editable regions of the open file again |
| `html-dwt-template: Toggle Template Synchronization` | Switch the **Enable Template Sync** setting |
| `html-dwt-template: Toggle Backup` | Switch the **Enable Backup** setting |
| `html-dwt-template: Restore Last HTML Backup` | Put back the files saved by the newest backup |

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| `htmlDwtTemplate.enableProtection` | `true` | Protect the non-editable regions of pages and child templates based on a template. Master templates are always fully editable. |
| `htmlDwtTemplate.enableTemplateSync` | `true` | Saving a template updates every file based on it that is open in an editor, child templates included, without prompts and without backups. A file with unsaved changes stays unsaved. Files that are not open change only through **Update Files Based on Template**, which works whether this setting is on or off. |
| `htmlDwtTemplate.enableBackup` | `true` | Before **Update Files Based on Template** changes files, copy them to `.html-dwt-template-backups/` in the site root. The last three backups of each template are kept. Turn off to update without backups. |
| `htmlDwtTemplate.useStickyDiffPanel` | `false` | Show the diff controls in a panel that stays open and can be moved, instead of a modal popup |
| `htmlDwtTemplate.highlightEditableRegions` | `true` | Highlight editable regions |
| `htmlDwtTemplate.highlightProtectedRegions` | `true` | Highlight protected regions |
| `htmlDwtTemplate.highlightOptionalRegions` | `true` | Highlight optional regions |
| `htmlDwtTemplate.showWarnings` | `true` | Reserved; not read yet |
| `htmlDwtTemplate.confirmBeforeApply` | `true` | Reserved; not read yet |

## Template Engine

The merge logic that rebuilds a file from its template comes from the npm
package
[`@isocialpractice/html-dwt-cmd-template`](https://github.com/isocialPractice/html-dwt-cmd-template),
which is also a command-line tool. The extension supplies the VS Code side:
diffs, prompts, protection, highlighting, and settings. The same template gives
the same result in the editor and in a terminal.

## Versioning

Pre-release builds are numbered `1.0.0-alpha.x.y.z`, where `x.y.z` counts
breaking, feature, and fix releases, for example `1.0.0-alpha.0.1.0` for a
feature release. The first Visual Studio Marketplace release will be `1.0.0`.

## Development

```cmd
npm install
npm run compile
```

`npm install` also installs the template engine. If the npm registry cannot
provide it, `npm run install:engine` (Windows) installs it from its GitHub
release tag instead. Press `F5` in VS Code to start an Extension Development Host, then
open `site/` in it to try the commands.

## Known Gaps

- Exporting and importing template content as XML.
- Applying a template to an existing page, or removing one from a page.
- Visual editors for optional region parameters and authoring preferences.

See [CHANGELOG.md](CHANGELOG.md) for release notes and
[TODO.md](TODO.md) for planned work.
