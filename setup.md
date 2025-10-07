# Dreamweaver Template Protection - Developer Setup

This document outlines the steps to set up a local development environment for the extension.

## Prerequisites

-   [Node.js](https://nodejs.org/) (version 16 or higher)
-   [Visual Studio Code](https://code.visualstudio.com/)

## Setup Steps

1.  **Clone the Repository**
    ```bash
    git clone https://github.com/isocialPractice/html-dwt-template.git
    cd html-dwt-template
    ```

2.  **Install Dependencies**
    Install the project dependencies using npm.
    ```bash
    npm install
    ```

3.  **Compile the Extension**
    The extension is written in TypeScript and needs to be compiled to JavaScript.
    ```bash
    npm run compile
    ```
    You can also run `npm run watch` to automatically recompile the extension whenever you save a file in the `src` directory.

## Testing the Extension

1.  **Launch the Development Host**
    -   Open the project folder (`html-dwt-template`) in VS Code.
    -   Press `F5` to open a new "Extension Development Host" window. This window runs your extension's code.

2.  **Test the Features**
    - Use the bundled sample site under `site/` (for example `site/index.html` or `site/seo-optimization.html`). These files are provided for evaluation only and are not deployed with the extension.
    - Walk through the following checks:
        - **Protection overlay**: verify content outside `<!-- InstanceBeginEditable -->` regions renders with reduced opacity, and typing in those regions is reverted automatically. Toggle the behavior with `Dreamweaver Template: Toggle Protection`.
        - **Editable navigation**: run `Dreamweaver Template: Show Editable Regions` to confirm all editable blocks appear in the quick pick.
        - **Template sync & diff**: open a `.dwt` file in `site/Templates/`, make a change, then run `Dreamweaver Template: Sync Template` on the corresponding instance. Ensure the diff opens without focusing the real instance tab, confirm navigation with **Next/Previous Diff**, and choose **Apply** to persist changes.
        - **Optional regions**: modify a `TemplateBeginIf` condition in the template and resync. Confirm that the paired `InstanceParam` remains intact while the conditional block updates in the instance.
        - **Repeating regions**: inside an `InstanceBeginRepeat` block, run `Dreamweaver Template: Insert Repeat Entry After/Before` and confirm alternating styles (e.g., table row colors) remain consistent.
        - **Parameter tooling**: open an instance, execute `Dreamweaver Template: Show Template Parameters`, and ensure values reflect the template defaults or instance overrides.
        - **Backups & logging**: after a sync, verify a new snapshot appears under `site/.html-dwt-template-backups/` and review the **Dreamweaver Template Protection** output channel for status messages.
    - Known gaps to keep in mind while testing: XML export/import workflows, editable tag-attribute bindings, template authoring preference dialogs, and automated apply/remove-template flows are not yet implemented.

## Packaging the Extension

To create a `.vsix` file for distribution:

```bash
# Install the vsce packaging tool globally (if you haven't already)
npm install -g vsce

# Package the extension
vsce package
```

This will create a `html-dwt-template-x.x.x.vsix` file in your project directory.
