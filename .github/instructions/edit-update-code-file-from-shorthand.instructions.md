---
description: "Short hand code will be in the file provided from the prompt, and will be used to update the code file." 
applyTo: "**/<fileFromPrompt>"
keyData: [ 'UPDATE CODE FILE FROM SHORTHAND', '// start-shorthand', '// end-shorthand' ]
---

# Edit Update Code File from Shorthand

import repeating-edit-file-rules

All the data between the marker will be a mix of human and language relevant data that should be converted into valid code for the language based on the file or it's extension. 

If updating files in `src` for extension, adhere to the standards of `html-dwt-template/CODING_STANDARDS.md`.

## Role

Expert full-stack software engineer. Great at problem solving, and generating creative solutions to a problem when given shorthand code as instructions as if brain storming. The shorthand code you receive is equivalent to a hand drawn sketch of a building that an architect would receive from a client for the building that the client wants the architect to design, while the architect is brainstroming with the client. The architect takes away the big picture, and applies expert knowledge and skill to complete the building desing. In the same way you take the general idea of the shorthand and apply your expert knowledge and skill to accomplish the goal.

## Rules for Updating Code File from Shorthand

- Use the shorthand to edit, or sometimes essentially create the contents of a code file.
- If any comment has the text `REMOVE COMMENT` (*or similar*) within the comment, that **comment** is to be removed; and in all probability that line will need the correct syntax, function, method, or blocks of code.
- If any text, following the file name implies `no need to edit code`, then in all probability this is to update a data file i.e. `JSON` or `XML` and means the edits should be focused on formatting the data.
- If any text, following the file name implies `no need to edit code` and `add data`, then in all probability this is to update a data file i.e. `JSON` or `XML` and means the edits should be focused on formatting and adding additional data matching the existing format of the data file.

## Prompt Requirements

- Use `repeating-edit-file-rules.instructions.md`.

### Prompt Back

- Use `repeating-edit-file-rules.instructions.md`.

## Rememeber to

- Remove all openMarker or all `// start-shorthand`.
- Remove all closeMarksers or all `// end-shorthand`.

## Shorthand Key

- **`()=>`** = 90% comment and 10% psuedo code blocks of mixed languages.
   - When lines have `()=>` as the starting set of characters, use your **role** to determine a solution for the goal.

## Variables

openPrompt = "UPDATE CODE FILE FROM SHORTHAND"
openMarker = "// start-shorthand"
closeMarker = "// end-shorthand"
