# html-dwt-template

HTML template system emulating Adobe Dreamweaver templating.

## Features to Implement

### Extension Features to Implement

#### Template Inserts

- [ ] Add template **insert** features.  
  - [ ] Add feature to `Insert Editable Region`.  
  - [ ] Add feature to `Insert Optional Region`.  
  - [ ] Add feature to `Insert Repeating Region`.  
  - [ ] Add feature to `Insert Editable Optional Region`.  
  - [ ] Add feature to `Insert Repeating Table`.  

#### Template Tools

- [ ] Add template **tool** features.  
  - [ ] Add feature to `Apply Template to Page`.  
  - [ ] Add feature to `Open Parent Template`.  
  - [ ] Add feature to `Remove Template Markers`.  
  - [ ] Add feature to `Make Editable Attribute`.  

#### Template Updates

- [ ] Add template **update** features.  
  - [ ] Add feature to `Update Current <pageType>`.  
    - [ ] pageType = If site page based on template, `Update Current Page`.  
    - [ ] pageType = If child template, `Update Current Template`.  
    - [ ] pageType = If master template, mute menu list item.  
  - [ ] Add feature to `Update Editable Attributes`.  

### UI Features to Implement

#### Dropdown to Display Features

- [ ] Add dropdown menu `Extension html-dwt-template`.  
  - [ ] In dropdown add nested dropdown `Template Inserts`.  
  - [ ] In dropdown add nested dropdown `Template Tools`.  
  - [ ] In dropdown add nested dropdown `Template Updates`.  

#### Dropdown to Apply Template Inserts

- [ ] Add dropdown menu `Template Inserts`.  
  - [ ] In dropdown add `Insert Editable Region`.  
  - [ ] In dropdown add `Insert Optional Region`.  
  - [ ] In dropdown add `Insert Repeating Region`.  
  - [ ] In dropdown add `Insert Editable Optional Region`.  
  - [ ] In dropdown add `Insert Repeating Table`.  

#### Dropdown to Apply Template Tools

- [ ] Add dropdown menu `Template Tools`.  
  - [ ] In dropdown add `Apply Template to Page`.  
  - [ ] In dropdown add `Open Parent Template`.  
  - [ ] In dropdown add `Remove Template Markers`.  
  - [ ] In dropdown add `Make Editable Attribute`.  

#### Dropdown to Apply Template Updates

- [ ] Add dropdown menu `Template Updates`.  
  - [ ] In dropdown add `Update Current <pageType>`.  
    - [ ] pageType = If site page based on template, `Update Current Page`.  
    - [ ] pageType = If child template, `Update Current Template`.  
    - [ ] pageType = If master template, mute menu list item.  
  - [ ] In dropdown add `Update Files Based on Template`.  
  - [ ] In dropdown add `Update Editable Attributes`.  
  - [ ] In dropdown add `UPDATE ALL FILES USING TEMPLATE`.  

## Tests to Implement

### Isolated Test Folder and Files to Create

#### Folder - `test/config`

- [ ] Folder `test` in root of repo `html-dwt-template` with nested `config` folder that will hold a json file so test can be run without user interaction.  
  - [ ] JSON file `run.json`, which will pre-define the feature to test so that the extension can be tested without user interaction.  

#### Folder - `test/data`

- [ ] Folder `test` in root of repo `html-dwt-template` with nested `data` folder that will hold essential data for test, and a compressed version of the example `site`.  
  - [ ] Template files with only essential elements to test.  
  - [ ] Webpage files based on templates.  
  - [ ] `test/data/site.zip` - if `Download Tutorial` is chosen when extension is downloaded, an included compressed version of the example site that will be used for testing and a tutorial.   
    - [ ] **NOTE** - exclude if **No** is selected when `Download Tutorial` popup is thrown on extension download.  
    - [ ] **NOTE** - delete if setting's property for extension is `html-dwt-template.tutorial: false` and compressed file is in `test/data/site.zip`.  
    - [ ] **NOTE** - if setting's property for extension is toggled to `html-dwt-template.tutorial: true`, then download compressed file to `test/data/site.zip`.  

#### Folder - `test/dump`

- [ ] Folder `test` in root of repo `html-dwt-template` with nested `dump` folder that will hold a temporary copy of content from `test/data`.  
  - [ ] Script `clear.bat` to clear all files from `test/dump/data` after each test.  
    - [ ] Linux version of `clear.bat`.  
  - [ ] Script `copy.bat` to copy files from `test/data` to `test/dump/data` for each test.  
    - [ ] Linux version of `copy.bat`.  
  - [ ] Script `reset.bat` to call `clear.bat`, and `copy.bat` to reset test data for a new test.  
    - [ ] Linux version of `reset.bat`.  

#### Folder - `test/src`

- [ ] Folder `test` in root of repo `html-dwt-template` with nested `src` folder that will hold script for test.  
  - [ ] Script `extract.js` to extract the current extension files from `html-dwt-template/src` for isolated tests, using option and argument to determine the test configuration of `test/config/run.json`.  

#### Folder - `test/opt`

- [ ] Folder `test` in root of repo `html-dwt-template` with nested `opt` folder that will hold the functions that will be run depending on the options passed to `test/src/extract.js`.  
  - [ ] `test/opt/all.js` - when the option `-a, --all` is passed to `test/src/extract.js`, use `test/data` files and configure `test/config/run.json` to recurse all unit tests, resetting the test data and configuration after each test.  
  - [ ] `test/opt/fullSite.js` -  when option `--full-site` is passed to `test/src/extract.js`, use `test/data/site.zip` compressed file and configure `test/config/run.json` to recurse all unit tests, but **NOT** resetting the test data and configuration after each test.  
    - [ ] **NOTE** - disable use of **site** if **No** is selected when `Download Tutorial` popup is thrown on extension download.  
    - [ ] **NOTE** - disable use of **site** if setting's property for extension is `html-dwt-template.tutorial: false` and compressed file is in `test/data/site.zip`.  
    - [ ] **NOTE** - enable use of **site** if setting's property for extension is toggled to `html-dwt-template.tutorial: true`, then download compressed file to `test/data/site.zip`.  
  - [ ] `test/opt/site.js` -  when option `-s, --site` is passed to `test/src/extract.js`, use `test/data/site.zip` compressed file and configure `test/config/run.json` for a unit test specified by the next arugment i.e. `-s "Update Files Based on Template"` passing the second parameter from `extract.js`; or in this case `Update Files Based on Template` to `unit.js`, which is what will determine the configuration to use in `run.json`, and the file to call from `test/opt/unit`.  
    -  [ ] **NOTE** - disable use of **site** if **No** is selected when `Download Tutorial` popup is thrown on extension download.  
    -  [ ] **NOTE** - disable use of **site** if setting's property for extension is `html-dwt-template.tutorial: false` and compressed file is in `test/data/site.zip`.  
    -  [ ] **NOTE** - enable use of **site** if setting's property for extension is toggled to `html-dwt-template.tutorial: true`, then download compressed file to `test/data/site.zip`.  
  - [ ] `test/opt/unit.js` - when option `-u, --unit` is passed to `test/src/extract.js`, configure `test/config/run.json` for a unit test specified by the next arugment i.e. `-u "Update Files Based on Template"` passing the second parameter from `extract.js`; or in this case `Update Files Based on Template` to `unit.js`, which is what will determine the configuration to use in `run.json`, and the file to call from `test/opt/unit`.  
  - [ ] `test/opt/user.js` - when the option `--user` is passed to `test/src/extract.js`, run a test starting a new terminal window with instructions that will guide user through test.  
    - [ ] If the argument passed after `--user` is **site** i.e. `--user site`, then copy the compressed `test/data/site.zip` to `test/dump/site`, and use walkthrough test with example site.  
      - [ ] **NOTE** - disable use of **site** if **No** is selected when `Download Tutorial` popup is thrown on extension download.  
      - [ ] **NOTE** - disable use of **site** if setting's property for extension is `html-dwt-template.tutorial: false` and compressed file is in `test/data/site.zip`.  
      - [ ] **NOTE** - enable use of **site** if setting's property for extension is toggled to `html-dwt-template.tutorial: true`, then download compressed file to `test/data/site.zip`.  
    - [ ] If the argument passed after `--user` is **data** i.e. `--user data`, then copy the data from `test/data` to `test/dump/data`, excluding site, and use walkthrough test with essential test data.  

#### Folder - `test/opt/unit`

- [ ] Folder `test` in root of repo `html-dwt-template` with nested `opt/unit` folder that will hold functions to run depending on argument passed to `test/opt/unit.js`.  
  - [ ] `test/opt/unit/applyTemplateToPage.js` - run a unit test of `Apply Template to Page` when argument of same name is passed to `test/opt/unit.js`.  
  - [ ] `test/opt/unit/insertEditableOptionalRegion.js` - run a unit test of `Insert Editable Optional Region` when argument of same name is passed to `test/opt/unit.js`.  
  - [ ] `test/opt/unit/insertEditableRegion.js` - run a unit test of `Insert Editable Region` when argument of same name is passed to `test/opt/unit.js`.  
  - [ ] `test/opt/unit/insertOptionalRegion.js` - run a unit test of `Insert Optional Region` when argument of same name is passed to `test/opt/unit.js`.  
  - [ ] `test/opt/unit/insertRepeatingRegion.js` - run a unit test of `Insert Repeating Region` when argument of same name is passed to `test/opt/unit.js`.  
  - [ ] `test/opt/unit/insertRepeatingTable.js` - run a unit test of `Insert Repeating Table` when argument of same name is passed to `test/opt/unit.js`.  
  - [ ] `test/opt/unit/makeEditableAttribute.js` - run a unit test of `Make Editable Attribute` when argument of same name is passed to `test/opt/unit.js`.  
  - [ ] `test/opt/unit/openParentTemplate.js` - run a unit test of `Open Parent Template` when argument of same name is passed to `test/opt/unit.js`.  
  - [ ] `test/opt/unit/removeTemplateMarkers.js` - run a unit test of `Remove Template Markers` when argument of same name is passed to `test/opt/unit.js`.  
  - [ ] `test/opt/unit/updateAllFilesUsingTemplate.js` - run a unit test of `UPDATE ALL FILES USING TEMPLATE` when argument of same name is passed to `test/opt/unit.js`.  
  - [ ] `test/opt/unit/updateEditableAttributes.js` - run a unit test of `Update Editable Attributes` when argument of same name is passed to `test/opt/unit.js`.  
  - [ ] `test/opt/unit/updateCurrentPage.js` - run a unit test of `Update Current Page` when argument of same name is passed to `test/opt/unit.js`.  
  - [ ] `test/opt/unit/updateCurrentTemplate.js` - run a unit test of `Update Current Template` when argument of same name is passed to `test/opt/unit.js`.  
  - [ ] `test/opt/unit/updateFilesBasedOnTemplate.js` - run a unit test of `Update Files Based on Template` when argument of same name is passed to `test/opt/unit.js`.  

### Extension Test Folder and Files to Create

#### Folder and Data for `src/tests`

- [ ] `src/tests` - Commands and data for testing.  
  - [ ] `src/tests/log` - Stores raw and summarized test results.  
  - [ ] `src/tests/sequence` - Walkthrough tests of the extension.  
    - [ ] `src/tests/sequence/verbose` - Detailed output of the walkthrough test.  
    - [ ] `src/tests/sequence/doc` - - Concise, non-redundant documentation of the walkthrough test.  
  - [ ] `src/tests/type` - Catalog of test types.  
    - [ ] `src/tests/type/edge` - Edge-case testing for the extension.  
      - [ ] `src/tests/type/edge/case` - Individual edge-case scenarios.  
      - [ ] `src/tests/type/edge/torture` - Stress tests to probe extension limits and prevent corruption.  
    - [ ] `src/tests/type/unit` - Unit-test definitions.  

## Supporting Content to Make

- [ ] `src/support` - Reserved for late-stage additions: helper surfaces that expose hover info and a step-by-step tutorial. Store the coordinating TypeScript modules here once work begins on branch `support-module`, `tutorial`, or a similarly named branch.  
  - [ ] `src/support/assist` - Assist mode that mirrors the guided playground experience.  
    - [ ] `src/support/assist/cmd` - Commands specific to assist configuration. Use shared helpers when possible.  
    - [ ] `src/support/assist/data` - Configuration data for assist mode. Use shared helpers when possible.  
  - [ ] `src/support/helpers` - Reusable data sets and pop-up definitions for both the tutorial and assist mode.  
    - [ ] `src/support/helpers/cmd` - Commands that deliver tutorial or assist prompts. Prefer reuse over duplication.  
    - [ ] `src/support/helpers/data` - Shared data structures consumed by tutorial sequences and assist mode.  
  - [ ] `src/support/tutorial` - Tutorial orchestration modules and data. Derives from the current `/site/` folder that powers extension tests, split into two states: (1) a read-only baseline and (2) a mutable state for user interaction, and extracted from `html-dwt-template/test/data/site.zip` if extension setting is `html-dwt-template.tutorial: true`.  
    - [ ] `src/support/tutorial/env` - Helper functions and state for walkthrough sequences and the assisted playground. Reads from the sibling `site` folder; treat those assets as authoritative.  
      - [ ] `src/support/tutorial/env/assist` - Playground tutorial modules that allow practice after each lesson.  
        - [ ] `src/support/tutorial/env/assist/cmd` - Commands unique to the assisted playground. Use shared helpers when practical.  
        - [ ] `src/support/tutorial/env/assist/data` - Playground-specific data. Use shared helpers when practical.  
      - [ ] `src/support/tutorial/env/data` - Lesson data for the tutorial sequence.  
        - [ ] `src/support/tutorial/env/data/lesson` - Per-lesson data. Folder names are digits (`1`, `2`, `3`, etc.). Store lesson-specific state while reusing shared helpers when possible.  
      - [ ] `src/support/tutorial/env/sequence` - Features, commands, and utilities for the sequential walkthrough tutorial.  
        - [ ] `src/support/tutorial/env/sequence/cmd` - Sequenced-lesson commands. Defer to shared helpers when viable.  
        - [ ] `src/support/tutorial/env/sequence/data` - Progress-aware data sourced from `../data/lessons`. Defer to shared helpers when viable.  
    - [ ] `src/support/tutorial/site` - Tutorial site assets to compress and distribute.  
      - [ ] `src/support/tutorial/site/data` - Archived site data such as `site.zip`. Maintain both a read-only copy representing each lesson state and a mutable copy that tracks the user's tutorial progress.  
      - [ ] `src/support/tutorial/site/state` - Data and commands describing the expected site state per lesson, plus mutable data that changes as the user practices in the assisted playground.  
        - [ ] `src/support/tutorial/site/state/cmd` - Commands unique to each lesson or site state. Reuse shared helpers when viable.  
        - [ ] `src/support/tutorial/site/state/data` - Lesson-specific site data. Reuse shared helpers when viable.  

## Extension Settings to Implement

- [ ] `html-dwt-template.tutorial: true | false`  
- [ ] `html-dwt-template.backups: true | false`  
- [ ] `html-dwt-template.numberOfBackups: [1-3]`  

## Extension Download Actions to Implement

- [ ] Popup to `Download Tutorial` which will set the value for the setting `html-dwt-template.tutorial`.  

## Complete Example/Tutorial/Test `site`

- [ ] Static instance of complete `site` compressed to `test/data`.  

### Finalize Existing Pages

- [ ] Finalize **Blog** pages.  
- [ ] Finalize **About** pages.  
- [ ] Finalize **Gallery** page with links.  
- [ ] Finalize **Data** pages.  
- [ ] Finalize **Contact** pages.  
- [ ] Finalize **Services** and **Services** pages.  

### Finish Existing Pages

- [ ] Finish blog post pages.  

### Create Pages

- [ ] Create pages from **Gallery** links.  
- [ ] Create library pages.  

## Repository Tools and Edits to Make

- [ ] Linux version of current scripts.  
  - [ ] Linux version of current `save.bat`.  
  - [ ] Linux version of `reset.bat`.  
- [ ] Finish documentation.  
  - [ ] Create `GUIDE.md` for guide of features, how-tos (*maybe tutorials*), and instructions on use.  
  - [ ] Finish `README.md`.  
