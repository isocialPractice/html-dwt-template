# Changelog

All notable changes to the HTML `dwt` Template project are documented in this
file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0-alpha.0.1.0] - 2026-10-29

The extension now runs on the template engine published as
`@isocialpractice/html-dwt-cmd-template`, the same engine as the command-line
tool, and its commands and settings carry the HTML `dwt` Template name.

### Added

- **Toggle Backup** command and **Enable Backup** setting
  (`htmlDwtTemplate.enableBackup`): updates can run without backups, like the
  command-line tool's `--no-backup` option.
- Template sync on save: with **Enable Template Sync** on, saving a template
  updates the open files based on it, child templates included, without
  prompts or backups. A file with unsaved changes keeps them and stays unsaved;
  files that are not open are not touched.
- Protection for child templates: a template based on another template accepts
  edits only inside its editable regions, like a page. Master templates stay
  fully editable, and **Turn On Protection** and **Turn Off Protection** are
  offered in templates too.
- `npm run install:engine` (`scripts/install-engine.cmd`, Windows): installs
  the engine from the npm registry and falls back to its GitHub release tag
  when the registry cannot provide it.

### Changed

- The template engine is provided by the npm package
  `@isocialpractice/html-dwt-cmd-template`. The extension keeps the VS Code
  side: diffs, prompts, protection, highlighting, and settings. The same
  template gives the same result in the editor and in a terminal.
- Name and labels: the display name and output channel are HTML DWT Template,
  and commands show under the `html-dwt-template` category in the Command
  Palette. Adobe Dreamweaver is named only where text describes compatibility
  with its templating system.
- Command IDs and setting keys are renamed from `dreamweaverTemplate.*` and
  `dreamweaverTemplateProtection.*` to `htmlDwtTemplate.*`. Settings
  customized under the old keys are not carried over and need setting again,
  and keybindings to the old command IDs need updating.
- **Toggle Template Synchronization** switches the **Enable Template Sync**
  setting and no longer blocks **Update Files Based on Template**.
- Updates keep each file's own line endings.
- Versioning: pre-release builds are numbered `1.0.0-alpha.x.y.z`, where
  `x.y.z` counts breaking, feature, and fix releases. The first Visual Studio
  Marketplace release will be `1.0.0`.

### Removed

- The `autoSyncOnTemplateChange` setting; **Enable Template Sync** replaces it.
- The notification shown when a template changed.

### Fixed

- The `.github` folder and local working folders are kept out of the packaged
  extension.
- **Restore Last HTML Backup** found nothing after VS Code restarted; it now
  reads the newest backup from disk.
- Pages whose code outside `<html>` is not locked gained a blank line at the
  end on every update.
- The safety check on content outside editable regions used a broken pattern.
- The Update Editable Attributes Process ran only when the parent's
  `@@(param)@@` placeholder sat outside its editable regions, and could leave
  edit protection off afterwards.
- Renumbering alternating repeat-row colors could drop the text between
  entries.

## [1.0.0-alpha] - 2026-07-14

First public alpha of the HTML Dreamweaver Template extension for VS Code. This
release establishes the core templating engine, the editing safeguards around
it, and a complete demonstration website used to exercise every feature.

### Added

#### Template Engine

- Template files (`.dwt`) live in the site's `/Templates/` folder and drive the
  markup of every page created from them, emulating the Adobe Dreamweaver
  templating workflow inside VS Code.
- Full support for conventional template syntax in template files, including
  `TemplateInfo`, `TemplateBeginEditable`/`TemplateEndEditable`, and the
  `codeOutsideHTMLIsLocked` attribute.
- Full support for non-conventional template syntax, including
  `TemplateParam`, `TemplateExpr`, repeat regions
  (`TemplateBeginRepeat`/`TemplateEndRepeat`), and conditional regions
  (`TemplateBeginIf`, multiple-if, and passthrough variants).
- Instance syntax in pages based on a template, including the
  `InstanceBegin`/`InstanceEnd` declaration, `InstanceBeginEditable` regions,
  `InstanceParam`, and repeat entries
  (`InstanceBeginRepeat`, `InstanceBeginRepeatEntry`).
- Nested template support: a template can be based on another template, and
  child files inherit parameters and editable regions from the parent chain.

#### Editor Commands

- `Show Editable Regions` highlights the regions of a template instance that
  are safe to edit.
- `Update Files Based on Template` and `UPDATE ALL FILES USING TEMPLATE`
  propagate template changes to one or all instance pages.
- `Toggle Template Synchronization` turns automatic propagation on or off.
- `Find Template Instances` lists every page built from the current template.
- `Create New Page from Template` scaffolds a new instance page with all
  editable regions and instance markers in place.
- `Insert Entry After Selection` and `Insert Entry Before Selection` add new
  repeat-region entries relative to the current selection.
- `Turn On Protection` and `Turn Off Protection` control write protection for
  non-editable regions.
- `Restore Last HTML Backup` recovers a page from the automatic backup taken
  before a template update, stored under `.html-dwt-template-backups`.

#### Configuration

- Setting to enable or disable protection of non-editable regions in template
  instances.
- Setting to choose between a persistent movable panel and a standard modal
  popup for diff controls after running `Show Diff`.

#### Demonstration Site

- Complete sample website under `site/` built entirely from the template
  system, with placeholder content for a fictional web agency: about, blog,
  data, services, contact, and gallery sections, plus per-employee blog pages
  and individual project detail pages under `site/projects/`.
- Nineteen templates under `site/Templates/` covering page, blog, post,
  gallery, item, profile, service, table, and team layouts.
- Master project gallery at `site/gallery/projects.html` listing nine
  portfolio projects, each tagged with category data attributes
  (`data-web-design`, `data-mobile-app`, `data-graphic-design`,
  `data-branding`) and a slide carousel.
- Category gallery pages at `site/gallery/` for Web Design, Mobile
  Applications, Graphic Design, and Branding. Each page carries the project
  entries whose category attribute is set, copied from the master gallery with
  their repeat-entry and editable-region markers intact:
  - Web Design: Graphic Net, Spot Apparel Web Application, Web Assets.
  - Mobile Applications: Tech View, Maxo Tough, Web Assets.
  - Graphic Design: Coffee Matters UX/UI, Coffee Matters Branding, Tech View,
    Graphic Net, Maxo Tough, Spot Apparel Graphics, Web Assets.
  - Branding: Coffee Matters Branding, Maxo Tough Logo, Spot Apparel Web
    Application.
- Site-wide navigation and footer linking the gallery category pages, shared
  scripts for the slide carousels, page headers, and a quote-of-the-day
  footer widget.

#### Project Standards

- `CODING_STANDARDS.md` defining the conventions applied across the codebase,
  with matching Copilot instruction files under `.claude/`.

### Changed

- Gallery instance pages cleaned so they contain only production markup; all
  authoring annotations were resolved and removed from
  `site/gallery/projects.html`.

### Notes

- This is a pre-release build for evaluation. Template syntax coverage and
  command behavior may change before the stable `1.0.0` release.
- Requires VS Code `1.74.0` or later.

[1.0.0-alpha.0.1.0]: https://github.com/isocialPractice/html-dwt-template/releases/tag/v1.0.0-alpha.0.1.0
[1.0.0-alpha]: https://github.com/isocialPractice/html-dwt-template/releases/tag/v1.0.0-alpha
