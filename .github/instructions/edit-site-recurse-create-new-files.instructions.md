---
description: "Recurse create or edit site files from prompt."
applyTo: "**/site"
keyData: ["UPDATE RECURSE CREATE NEW FILES"]
---

# Edit Site Recurse Create New Files

import repeating-edit-file-rules
import edit-site-files-based-on-file-comments
import edit-update-code-file-from-shorthand

Whenever the text `UPDATE RECURSE CREATE NEW FILES` is in a prompt use these instructions. Follow instructions from prompt or from update comments i.e. `<!-- UPDATE .* -->` if present parent or example file.

Detailed instructions will be passed in the prompt, and/or one or more files will be provided in the prompt. Use the files and instructions passed to define the variables from these instructions, then execute accordingly.

## Terms

* Parent File — The file that contains the source link(s) or original information used to create a new file.
* Example File — A reference file that demonstrates how a new file should be created and structured.

## Rules

- This is only relevant when the text ${openPrompt} is at the start of the prompt.
	- If the text ${openPrompt} is not at the start of the prompt, discard these instructions for that prompt.
- A parent file, example file, or detailed prompt instructions is required.
- If no file names are present, use the best file name(s) for case provided in parent file, example file, or prompt instructions.
- If using a parent file, then either `<!-- UPATE -->`, or `//start-shorthand .* //end-shorthand` markers must be present.
- If using a parent file, follow `<!-- UPATE -->`, and/or `//start-shorthand .* //end-shorthand` instructions.
  - Always remove `<!-- UPATE -->`, and/or `//start-shorthand .* //end-shorthand` instructions when done.
    - Do not edit anything else in file other than this.
- If using an example file, then there may be some additional instructions marked with `<!-- NOTE -->`.
- If using an example file, use the semantics of file, but new data accordingly.
  - Always remove `<!-- NOTE -->` instructions when done.
    - Do not edit anything else in file other than this.
- If detailed prompt instructions, then follow accordingly.

## Prompt Requirements

- The text ${openPrompt} at the very start of the prompt.
- Parent file, example file, or detailed prompt instructions.
  - At least one of these is required, else throe **prompt Error**.
  - All three can also be true.

## Example Use

### User Prompt

```bash
[user]
> Create a new file <FILE_PATH>.
```

### Prompt Back with Prompt Error

#### *prompt error instance*

```bash
[agent] 
> Did you mean to prepend the prompt with "${openMarker}", and include a parent file, example file, or more detailed instructions?
[user]
> ${openMarker} - Create a new file <FILE_PATH> using <example_file>.
```

## Variables

- openPrompt = "UPDATE RECURSE CREATE NEW FILES"
- shorthand
  - start = `// start-shorthand`
  - end = `// end-shorthand`
- updateComment = `<!-- UPDATE .* -->`
  - **NOTE** - above `.*` is regex for all data after `UPDATE`.
- exampleFile = file passed as prompt variable, attached as context, or included in prompt that will be used in regards to HTML semantics, replacing the `innerHTML` or `innerText` with data accordinlgy.
  - **WILL NOT** have `shorthand` or `updateComment`(s), if **NOT** also parent file.
  - **WILL HAVE** `shorthand` or `updateComment`(s), if **ALSO** parent file.
- parentFile = file passed as prompt variable, attached as context, or included in prompt that **WILL HAVE** `shorthand` and/or `updateComment`(s), and may reference an `exampleFile`.
  - **Will NOT** be used in regards to HTML semantics if **NOT** also example file.
  - **Will BE** used in regards to HTML semantics if **ALSO** example file.  
- actionOptions:

```json
 {
  "create": "Create new files",
  "edit": "Edit files",
  "both": "Create file(s) if file(s) do not exist, and edit if file(s) exists."
 }
```

- action = actionOptions.create `// this is default if not set in prompt`
- page = page(s) to edit or create
  - If left blank, use best after analyzing prompt data.

### Run Goal

export edit-site-recurse-create-new-files