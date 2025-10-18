---
description: "Edit files in `/site/` test folder using context of surrounding html and comment starting with `UPDATE`."
applyTo: "**/site/*"
keyData: [ "<!-- UPDATE ", " -->", "UPDATE SITE BASED ON UPDATE COMMENTS" ]
---

# Edit Site Files Based on File Comments

import repeating-edit-file-rules

## Overview

Files in the `/site/` directory include inline comments that describe pending updates. Look for comments that begin with `UPDATE`. Use the instruction text inside those comments, and the surrounding HTML context, to carry out the requested change. For example:

```html
<div class="<!-- UPDATE add class name and update style.css to make composition UX friendly and appealing UI. -->">
	<p><!-- UPDATE add data relevant to page name --></p>
</div>
```

## Rules for Updating Site Files

- Rely only on the guidance provided in comments that start with `UPDATE`.
- Remove each `UPDATE` comment after you have completed the associated change.

### Prompt Requirements

- `fileName` = use JavaScript-style shorthand:

```js
// shorthand
if (fileName == undefined) {
	edit => foreach file in /site/;
} else {
	edit => fileName or fileName, fileName, etc..;
}
```

### Remember

- Remove every comment that starts with `UPDATE`.

## Variables

openPrompt = "UPDATE SITE BASED ON UPDATE COMMENTS"
openMarker = `<!-- UPDATE`
closeMarker = ` -->`
