---
description: "Reusable rules applied when an instructions.md file includes `import repeating-edit-file-rules` after the first level-one header."
applyTo: "**/.github/instructions/edit-*.instructions.md"
---

# Repeating Edit File Rules

Whenever a `/.github/instructions/edit-*.instructions.md` file contains a line exactly matching `import repeating-edit-file-rules` immediately after the first level-one header, apply the rules in this document.

## Rules

- Use variables declared at the end of the file under the level two header `Variables`.
- The variables should always have the same names:
  - openPrompt = "STRING VALUE"
  - openMarker = "STRING VALUE"
  - closeMarker = "STRING VALUE"
- The variable `openPrompt` will be the string to lookout for in order for the instructions for the instructions file to take effect, else disregard that files instructions.
- The variable `openMarker` will be the marker relevant as to where or how edits should be applied or what edits should be based on, and is the **start** of the editing context.
- The variable `closeMarker` will be the marker relevant as to where or how edits should be applied or what edits should be based on, and is the **end** of the editing context.
- If any of the **Repeat `<type>`** seem to have already been applied, then those rule override the rules of this file.
- Apply **Run Goal** of `export <file-name>` to the file importing these rules, enabling that instruction file to be utilized in future prompts.

## Repeat Opening

Add the following introductory sentence immediately after the first level-one header of any file that imports these rules:

```
One or more files will be provided in the prompt. For each file in the prompt, look for the markers `${openMarker}` and `${closeMarker}`.
```

## Repeat Rules

Apply the following at the first level-two header that starts with `Rules` in the importing file.

- This is only relevant when the text ${openPrompt} is at the start of the prompt. 
  - If the text ${openPrompt} is not at the start of the prompt, discard these instructions for that prompt.
- The REQUIRED_FILE will have two markers:
  1. Opening ${openMarker}
  2. Closing ${closeMarker}
    - Call these `edit markers`.
- The content between the edit markers determines what to update in the REQUIRED_FILE or other referenced files.
- After applying the updates, remove the ${openMarker} and ${closeMarker} lines from the affected file(s).

## Repeating Prompt Requirements

Apply these requirements after the level-two header that starts with `Prompt Requirements` in the importing file.

- The text ${openPrompt} at the very start of the prompt.
- Edit markers in the template file - like ${openMarker} and ${closeMarker}.

## Repeating Prompt Back

Place the following examples after the level-three or level-two header that starts with `Prompt Back` in the importing file.

```bash
[user]
> Edit the site files using <FILE_PATH>.
[agent]
> Did you mean to prepend the prompt with "${openMarker}"?
[user]
> ${openMarker} - edit the site files using <FILE_PATH>.
```
# GOAL

Use these repeating rules only when the importing file contains the exact line:

```text
import repeating-edit-file-rules
```

directly after its first level-one header.

### Run Goal

export repeating-edit-file-rules