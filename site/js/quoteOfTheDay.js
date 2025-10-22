// quoteOfTheDay
// Select a random object from quotes.json, and parse quote and source to webpage.
// Note 1: This script runs in the browser, so every construct here assumes a standard DOM API is available once the page loads.

// Team Favorite Quote override
// If an element with id "teamFavQuote" exists and declares a matching profile for this page,
// render its provided quote/author instead of picking a random entry.
// The element supports either data attributes:
/*
  <div id="quoteOfTheDay" class="page-quote">
   <div class="quote-wrapper" id="teamFavQuote">
     ...
   </div>
  </div>
*/
// or a simple text content fallback for quote (author optional via data-author).

const getCurrentPageNameNoExt = () => {
  try {
    const parts = (window.location && window.location.pathname || '').split('/').filter(Boolean);
    const last = parts.length ? parts[parts.length - 1] : '';
    return last.replace(/\.[^.]+$/, '').toLowerCase();
  } catch {
    return '';
  }
};

const getTeamFavOverride = async () => {
  const el = document.getElementById('teamFavQuote');
  // If no override anchor element, continue normal flow
  if (!el) return null;

  const current = getCurrentPageNameNoExt();
  try {
    // Load quotes and find a profile match to the current page
    const quotes = await fetchQuotes();
    const match = quotes.find((entry) =>
      entry && typeof entry.profile === 'string' && entry.profile.trim().toLowerCase() === current
    );
    if (match && typeof match.quote === 'string') {
      return {
        quote: match.quote,
        author: typeof match.author === 'string' ? match.author : ''
      };
    }
  } catch (_e) {
    // Silently fall back to normal behavior on fetch/parse errors
  }
  return null;
};

const QUOTE_CONTAINER_ID = "quoteOfTheDay";
const QUOTE_TEXT_ID = "quoteOfTheDayQuote";
const QUOTE_SOURCE_ID = "quoteOfTheDaySource";
const QUOTE_DATA_PATH = "/data/quotes.json";
const CATEGORY_ATTR = "data-category";
const VALID_CATEGORIES = ["business", "religious", "philosophy"];
// Note 2: Constants give the DOM lookup logic semantic names, making the intent obvious and preventing stray string literals later in the file.

const quoteInsertMarkup = `
  <div id="quoteOfTheDay" class="page-quote">
   <div class="quote-wrapper">
    <div class="foot-quote">
     <span id="quoteOfTheDayQuote" class="foot-quote"></span>
     <span class="foot-quote">
      <span id="quoteOfTheDaySource" class="quote-source"></span>
     </span>
    </div>
   </div>
  </div>
`.trim();
// Note 3: Template literals are ideal for HTML fragments because they keep indentation readable and allow trimming to remove accidental leading whitespace.

let quotesCache = null;
// Note 4: A module-scoped cache avoids redundant network requests when the widget reruns, which is common in single-page apps or navigation transitions.

const getCategoryFilter = () => {
  // Note 5: The embedding template can opt into themed quotes by tagging the script element with a data-category attribute.
  let scriptTag = document.currentScript;

  if (!scriptTag) {
    // Note 6: Fallback for legacy browsers that may not expose document.currentScript once execution continues.
    let potential = Array.from(document.querySelectorAll(`script[src$="quoteOfTheDay.js"]`));
    scriptTag = potential[potential.length - 1] || null;
  }

  if (!scriptTag || !scriptTag.hasAttribute(CATEGORY_ATTR)) {
    return null;
  }

  let requested = scriptTag.getAttribute(CATEGORY_ATTR).trim().toLowerCase();
  return VALID_CATEGORIES.includes(requested) ? requested : null;
};

const ensureQuoteElements = () => {
  // Note 7: Query the DOM up front so the rest of the function can focus on validation and fallbacks rather than lookup logic.
  let container = document.getElementById(QUOTE_CONTAINER_ID);
  let quoteEl = document.getElementById(QUOTE_TEXT_ID);
  let sourceEl = document.getElementById(QUOTE_SOURCE_ID);

  if (!container || !quoteEl || !sourceEl) {
  // Note 8: Some legacy templates may lack the quote container, so the script defensively injects a minimal wrapper when needed.
    var footer = document.querySelector("footer");
    if (!footer) {
      return null;
    }

    footer.insertAdjacentHTML("afterbegin", quoteInsertMarkup);
    container = document.getElementById(QUOTE_CONTAINER_ID);
    quoteEl = document.getElementById(QUOTE_TEXT_ID);
    sourceEl = document.getElementById(QUOTE_SOURCE_ID);
  }

  return container && quoteEl && sourceEl ? { container, quoteEl, sourceEl } : null;
  // Note 9: Returning a structured object keeps related nodes bundled, simplifying later function signatures that consume them.
};

const fetchQuotes = async () => {
  // Note 10: Early return keeps the happy path fast—if the cache is filled we never touch the network again during this page view.
  if (quotesCache) {
    return quotesCache;
  }

  let response = await fetch(QUOTE_DATA_PATH, { cache: "no-store" });
  // Note 11: Using `cache: "no-store"` bypasses HTTP caches so that fresh data is always returned, which is useful when editors frequently update the JSON file.
  if (!response.ok) {
    throw new Error(`Unable to fetch quotes: ${response.status} ${response.statusText}`);
  }

  let data = await response.json();
  // Note 12: Runtime validation is important because static type checks are unavailable in plain JavaScript—this guard stops execution on malformed data.
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("Quotes data is empty or not an array.");
  }

  quotesCache = data;
  return data;
  // Note 13: Storing the successful result means later calls reuse the same array instance, so mutation elsewhere would affect all consumers—avoid modifying it in-place.
};

const pickRandomQuote = (quotes) => quotes[Math.floor(Math.random() * quotes.length)];
// Note 14: `Math.random()` is sufficient for UI randomness; cryptographic randomness would require `crypto.getRandomValues` but is unnecessary here.

const filterQuotesByCategory = (quotes, category) => {
  // Note 15: Category-specific requests return a filtered pool, falling back gracefully when the dataset lacks matches.
  if (!category) {
    return quotes;
  }

  let filtered = quotes.filter((entry) => typeof entry.category === "string" && entry.category.toLowerCase() === category);

  if (filtered.length === 0) {
    console.warn(`[quoteOfTheDay] No quotes found for category "${category}". Using full dataset.`);
    return quotes;
  }

  return filtered;
};

const updateQuoteMarkup = (elements, quoteEntry) => {
  // Note 16: Trimming prevents stray whitespace from the JSON file affecting layout, especially when the data contains line breaks or leading spaces.
  let quoteText = typeof quoteEntry.quote === "string" ? quoteEntry.quote.trim() : "";
  let authorText = typeof quoteEntry.author === "string" ? quoteEntry.author.trim() : "";

  elements.quoteEl.textContent = quoteText;
  elements.sourceEl.textContent = authorText ? ` - ${authorText}` : "";
  // Note 17: Using textContent protects against HTML injection because the quotes originate from content editors rather than trusted markup builders.
};

const initQuoteOfTheDay = async () => {
  // Note 18: Guard clauses keep asynchronous code tidy—exiting early avoids awaiting network calls when the DOM is missing required regions.
  let elements = ensureQuoteElements();
  if (!elements) {
    return;
  }

  // Team favorite override: if present and matches this page, render it and exit early.
  const teamFav = await getTeamFavOverride();
  if (teamFav) {
    updateQuoteMarkup(elements, teamFav);
    return;
  }

  let categoryFilter = getCategoryFilter();

  try {
    // Note 19: Fetching and rendering are separated for testability; this call chain can be reused if the widget needs manual refresh functionality later.
    let quotes = await fetchQuotes();
    let candidatePool = filterQuotesByCategory(quotes, categoryFilter);
    let quoteEntry = pickRandomQuote(candidatePool);
    updateQuoteMarkup(elements, quoteEntry);
  } catch (error) {
    console.error("[quoteOfTheDay] Failed to render quote:", error);
    // Note 20: Logging the error instead of swallowing it helps QA teams diagnose CDN issues or malformed JSON without breaking the page render.
  }
};

if (document.readyState === "loading") {
  // Note 21: Waiting for `DOMContentLoaded` ensures the footer exists even when this script is loaded in the `<head>` section.
  document.addEventListener("DOMContentLoaded", initQuoteOfTheDay);
} else {
  initQuoteOfTheDay();
  // Note 22: When the script is deferred or loaded at the bottom, the DOM is already ready, so we immediately initialize without adding an extra listener.
}
