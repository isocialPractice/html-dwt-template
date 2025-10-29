// pageHeader
// Auto populate the headers for the page based onb page name.

 // Global variables.
 const pageHREF = location.href;
 const pagePathName = new RegExp("^/([a-zA-Z]+)/.*\..*$", "gi");
 var pageFolder     = location.pathname.replace(pagePathName, "$1");
 pageFolder         = pageFolder.replace(pageFolder[0], pageFolder[0].toUpperCase());
 
 /*********************************************************************************************
                                          MAIN FUNCTION
 *********************************************************************************************/
 function runPageHeader() {
  try {
   var pageTitle = document.getElementById('pageTitle');
   var teamMemember = document.getElementById('shortTitle');
   if (!pageTitle || !teamMemember) return;

   // Derive page name from current URL (filename without extension)
   var pathname = (window.location && window.location.pathname) || '';
   var segments = pathname.split('/').filter(Boolean);
   var filename = segments.length ? segments[segments.length - 1] : '';
   var base = filename.replace(/\.[^.]+$/, '');

   // Convert from camelCase/PascalCase/slug_or-hyphen to Title Case words
   var spaced = base
     .replace(/[_-]+/g, ' ')              // underscores/hyphens to space
     .replace(/([a-z])([A-Z])/g, '$1 $2') // break camel/Pascal boundaries
     .replace(/\s+/g, ' ')                // collapse whitespace
     .trim();
   var pageName = spaced
     .split(' ')
     .filter(Boolean)
     .map(function(w){ return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); })
     .join(' ');

   // Short name: first word + last initial (e.g., "This Name" -> "This N.")
   var tokens = pageName.split(' ').filter(Boolean);
   var shortName = pageName;
   if (tokens.length >= 2) {
    var first = tokens[0];
    var lastInitial = tokens[tokens.length - 1].charAt(0).toUpperCase() + '.';
    shortName = first + ' ' + lastInitial;
   }

   if (pageTitle.textContent.replaceAll(" ","") == "") pageTitle.textContent = document.title;   
   else pageTitle.textContent = pageName;
   teamMemember.textContent = shortName + ` ${pageFolder} Page`;
  } catch (e) {
    if (typeof console !== 'undefined' && console && console.warn) {
     console.warn('[template] runPageHeader failed:', e);
    }
  }
 }
 
// Run main function.
runPageHeader();