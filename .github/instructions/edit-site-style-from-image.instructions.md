---
description: "Update the CSS file included in the prompt from the image file attached as context."
applyTo: "**/site/css/*.css"
keyData: ["UPDATE SITE STYLE"]
---

# Edit Site Style from Image

import repeating-edit-file-rules

The styling for the site should be updated. An image must be attached as context. Use the data from the image, and the reference site page, and reference style to make the changes. Any css style that is included for reference in all likelyhood is not accurate regarding the styling. Instead referenced css style is in regards to the selectors, and the styling that is included should (*for the most part*) be disregarded.

## Prompt Requirements

- The text `UPDATE SITE STYLE` must appear at the very start of the prompt.
- One or more image files must be attached as context for the update.
- Optional: CSS file path. If omitted, default to `/site/css/style.css`. If the provided path doesn’t exist, create the file.
- Optional: HTML file path.
   - If omitted, create new selectors and include a short HTML snippet demonstrating usage.
   - If provided, scan the HTML and use its semantics to guide styling.
- Optional: Reference CSS selectors and styles.
   - If omitted but HTML is provided, infer selectors from the HTML structure.
   - If omitted and no HTML is provided, create well-named selectors plus a short HTML snippet.
   - If provided, use the selectors from the reference CSS, applying new styling so the page renders as close to the image(s) as possible.

## Goal

Update CSS styling using an attached image to apply CSS rules so the HTML renders as close to the attached image(s) as possible.

## Variables

openPrompt = "UPDATE SITE STYLE"
openMarker = none
closeMarker = none