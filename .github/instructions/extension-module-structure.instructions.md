---
description: "Folder structure guidance for creating or modifying extension modules."
applyTo: "**/src/*"
---

# Extension Module Structure

Folders are named according to their role in the extension. Place each module in the folder that reflects its purpose, introducing deeper nesting only when the feature breaks into distinct categories or use cases. The illustration below shows the intended structure. If a folder does not yet exist, do not create it prematurely; instead, use the description to decide where future modules should live. The only required file today is the entry point `extension.ts`.

## Role

Expert VS Code extension programmer knowledgeable of best practices for VS Codee extensions. You make the final decision on the structure, but are handed a sketch or illustration from a client. Using that illustration you use your expert knowledge of TypeScript, and skill as a programmer to implement the modules and extension structure similar to the illustration that was received. You act independently and make the final decsion based on the illustration. 

## Rules 

- If a folder is missing, then add it.
- If a file or module should be moved, then move it.
- If a file or module should be created, then create it.
- If it can be done outside of `/src/extension.ts`, then do it outside of `/src/extension.ts`.

## Module Structure Illustration

### Key for the Illustration

- `[]` = Folder
- `--` = Will be on the line below each folder, and will state how to be used, and what modules nested in folder should do. Use this as a strict rule of thumb.

### Illustration Overview

```text
/
[] src
-- Holds the extension entry point and top-level feature folders.
  [] features
  -- Contains feature entry modules that orchestrate functionality exposed to users. Each folder beneath `features` represents a capability and hosts the TypeScript files that call supporting modules.
    [] diff
    -- Handles the "Show Diff" workflow and renders updated differences.
    [] update
    -- Provides functions that update files in response to template changes.
    [] protect
    -- Implements editing protection for template-based files, including repeat regions.
  [] support
  -- Reserved for late-stage additions: helper surfaces that expose hover info and a step-by-step tutorial. Store the coordinating TypeScript modules here once work begins on branch `support-module`, `tutorial`, or a similarly named branch.
    [] assist
    -- Assist mode that mirrors the guided playground experience.
      [] cmd
      -- Commands specific to assist configuration. Use shared helpers when possible.
      [] data
      -- Configuration data for assist mode. Use shared helpers when possible.
    [] helpers
    -- Reusable data sets and pop-up definitions for both the tutorial and assist mode.
      [] cmd
      -- Commands that deliver tutorial or assist prompts. Prefer reuse over duplication.
      [] data
      -- Shared data structures consumed by tutorial sequences and assist mode.
  [] tutorial
  -- Tutorial orchestration modules and data. Derives from the current `/site/` folder that powers extension tests, split into two states: (1) a read-only baseline and (2) a mutable state for user interaction.
  [] env
  -- Helper functions and state for walkthrough sequences and the assisted playground. Reads from the sibling `site` folder; treat those assets as authoritative.
        [] assist
        -- Playground tutorial modules that allow practice after each lesson.
          [] cmd
          -- Commands unique to the assisted playground. Use shared helpers when practical.
          [] data
          -- Playground-specific data. Use shared helpers when practical.
        [] data
        -- Lesson data for the tutorial sequence.
          [] lesson
          -- Per-lesson data. Folder names are digits (`1`, `2`, `3`, etc.). Store lesson-specific state while reusing shared helpers when possible.
        [] sequence
        -- Features, commands, and utilities for the sequential walkthrough tutorial.
          [] cmd
          -- Sequenced-lesson commands. Defer to shared helpers when viable.
          [] data
          -- Progress-aware data sourced from `../data/lessons`. Defer to shared helpers when viable.
      [] site
      -- Tutorial site assets to compress and distribute.
        [] data
        -- Archived site data such as `site.zip`. Maintain both a read-only copy representing each lesson state and a mutable copy that tracks the user's tutorial progress.
        [] state
        -- Data and commands describing the expected site state per lesson, plus mutable data that changes as the user practices in the assisted playground.
          [] cmd
          -- Commands unique to each lesson or site state. Reuse shared helpers when viable.
          [] data
          -- Lesson-specific site data. Reuse shared helpers when viable.
  [] tests
  -- Commands and data for testing.
    [] log
    -- Stores raw and summarized test results.
    [] sequence
    -- Walkthrough tests of the extension.
      [] verbose
      -- Detailed output of the walkthrough test.
      [] doc
      -- Concise, non-redundant documentation of the walkthrough test.
    [] type
    -- Catalog of test types.
      [] edge
      -- Edge-case testing for the extension.
        [] case
        -- Individual edge-case scenarios.
        [] torture
        -- Stress tests to probe extension limits and prevent corruption.
      [] unit
      -- Unit-test definitions.
  [] utils
  -- Shared utilities and tools. Favor parameterized functions that can be reused across features.
    [] log
    -- Logging utilities for terminal output.
    [] path
    -- Path and file-location utilities activated once a workspace contains a `Templates` folder.
    [] file
    -- Utilities for updating, previewing diffs, protecting, and creating files.
  - extension.ts
```