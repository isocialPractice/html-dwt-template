// quoteOfTheDay
// Select a random object from quotes.json, and parse quote and source to webpage.
// Note 1: This script runs in the browser, so every construct here assumes a standard DOM API is available once the page loads.

const QUOTE_CONTAINER_ID = "quoteOfTheDay";
const QUOTE_TEXT_ID = "quoteOfTheDayQuote";
const QUOTE_SOURCE_ID = "quoteOfTheDaySource";
const QUOTE_DATA_PATH = "/data/quotes.json";
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

const ensureQuoteElements = () => {
  // Note 5: Query the DOM up front so the rest of the function can focus on validation and fallbacks rather than lookup logic.
  let container = document.getElementById(QUOTE_CONTAINER_ID);
  let quoteEl = document.getElementById(QUOTE_TEXT_ID);
  let sourceEl = document.getElementById(QUOTE_SOURCE_ID);

  if (!container || !quoteEl || !sourceEl) {
    // Note 6: Some legacy templates may lack the quote container, so the script defensively injects a minimal wrapper when needed.
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
  // Note 7: Returning a structured object keeps related nodes bundled, simplifying later function signatures that consume them.
};

const fetchQuotes = async () => {
  // Note 8: Early return keeps the happy path fast—if the cache is filled we never touch the network again during this page view.
  if (quotesCache) {
    return quotesCache;
  }

  let response = await fetch(QUOTE_DATA_PATH, { cache: "no-store" });
  // Note 9: Using `cache: "no-store"` bypasses HTTP caches so that fresh data is always returned, which is useful when editors frequently update the JSON file.
  if (!response.ok) {
    throw new Error(`Unable to fetch quotes: ${response.status} ${response.statusText}`);
  }

  let data = await response.json();
  // Note 10: Runtime validation is important because static type checks are unavailable in plain JavaScript—this guard stops execution on malformed data.
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("Quotes data is empty or not an array.");
  }

  quotesCache = data;
  return data;
  // Note 11: Storing the successful result means later calls reuse the same array instance, so mutation elsewhere would affect all consumers—avoid modifying it in-place.
};

const pickRandomQuote = (quotes) => quotes[Math.floor(Math.random() * quotes.length)];
// Note 12: `Math.random()` is sufficient for UI randomness; cryptographic randomness would require `crypto.getRandomValues` but is unnecessary here.

const updateQuoteMarkup = (elements, quoteEntry) => {
  // Note 13: Trimming prevents stray whitespace from the JSON file affecting layout, especially when the data contains line breaks or leading spaces.
  let quoteText = typeof quoteEntry.quote === "string" ? quoteEntry.quote.trim() : "";
  let authorText = typeof quoteEntry.author === "string" ? quoteEntry.author.trim() : "";

  elements.quoteEl.textContent = quoteText;
  elements.sourceEl.textContent = authorText ? ` - ${authorText}` : "";
  // Note 14: Using textContent protects against HTML injection because the quotes originate from content editors rather than trusted markup builders.
};

const initQuoteOfTheDay = async () => {
  // Note 15: Guard clauses keep asynchronous code tidy—exiting early avoids awaiting network calls when the DOM is missing required regions.
  let elements = ensureQuoteElements();
  if (!elements) {
    return;
  }

  try {
    // Note 16: Fetching and rendering are separated for testability; this call chain can be reused if the widget needs manual refresh functionality later.
    let quotes = await fetchQuotes();
    let quoteEntry = pickRandomQuote(quotes);
    updateQuoteMarkup(elements, quoteEntry);
  } catch (error) {
    console.error("[quoteOfTheDay] Failed to render quote:", error);
    // Note 17: Logging the error instead of swallowing it helps QA teams diagnose CDN issues or malformed JSON without breaking the page render.
  }
};

if (document.readyState === "loading") {
  // Note 18: Waiting for `DOMContentLoaded` ensures the footer exists even when this script is loaded in the `<head>` section.
  document.addEventListener("DOMContentLoaded", initQuoteOfTheDay);
} else {
  initQuoteOfTheDay();
  // Note 19: When the script is deferred or loaded at the bottom, the DOM is already ready, so we immediately initialize without adding an extra listener.
}
