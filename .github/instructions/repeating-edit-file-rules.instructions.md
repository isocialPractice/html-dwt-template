---
description: "Repetitive rules to follow when a instructions.md file declares `import repeating-edit-file-rules` at the top after the first level one header."
applyTo: "**/.gitHub/instructions/edit-*.instructions.md"
keyData: [ "import repeating-edit-file-rules", "openPrompt", "openMarker", "closeMarker" ]
---

# Repeating Edit File Rules

Whenever a `/.github/instructions/edit-*.instructions.md` file has a line exactly matching `import repeating-edit-file-rules` after the first level one header, then these rules should be applied.

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

## Repeat Opening

**NOTE** - after the first level one header of the file importing these instructions, apply the following to the beginning of the opening paragraph:

```
One or more files will be provided in the prompt. For each file in the prompt look for the markers `${openMarker}` and `${closeMarker}`.
```

## Repeat Rules

**NOTE** - apply these rules at the first level two header that starts with `Rules` of the file importing these instructions.

- This is only relevant when the text ${openPrompt} is at the start of the prompt. 
  - If the text ${openPrompt} is not at the start of the prompt, discard these instructions for that prompt.
- The **REQUIRED_FILE** will have two markers:
  1. Opening ${openMarker}
  2. Closing ${closeMarker}
    - Call these `edit markers`.
- Items between the `edit markers` will be the data to update files based on **REQUIRED_FILE** or to update **REQUIRED_FILE** with.
- When the file or all files have been update, remove the ${openMarker} and ${closeMarker} lines from the file(s).

## Repeating Prompt Requirements

**NOTE** - apply these requirements after the level two header that starts with `Prompt Requirements` of the file importing these instructions.

- The text ${openPrompt} at the very start of the prompt.
- Edit markers in the template file - like ${openMarker} and ${closeMarker}.

## Repeating Prompt Back

**NOTE** - apply these examples after the level three or two header that starts with `Prompt Back` of the file importing these instructions.

```bash
[user]
> Edit the site files using #file:<ANY_NAME>.<ext>.
[agent]
> Did you mean to prepend the prompt with "${openMarker}"?
[user]
> ${openMarker} - edit the site files using #file:<ANY_NAME>.<ext>.
```
