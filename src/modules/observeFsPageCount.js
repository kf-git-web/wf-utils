/**
 * Adds a task to the `__readyQueue` to observe and update the max page count
 * for specific pagination DOM elements.
 */
export const observeFsPageCount = {
    name: "observeFsPageCount",
    fn: () => {
        // Selector configuration
        const selectors = {
            pageCount: '[data-kf-fs-page-count="true"]',
            maxPageContainer: '[data-kf-fs-max-page-container="true"]',
            maxPages: '[data-kf-fs-max-pages]'
        };

        // Select all pagination counters (entry point). If none, quit silently.
        const targets = document.querySelectorAll(selectors.pageCount);
        if (targets.length === 0) return;

        // If more than one, warn and quit
        if (targets.length > 1) {
            console.warn(
                `[observeFsPageCount] Multiple (${targets.length}) pagination counters found. ` +
                `This task only supports one pagination instance. Aborting.`
            );
            return;
        }

        // Exactly one target
        const target = targets[0];
        const root = target.parentElement || document;

        // At this point we have at least one pageCount element — validate the other selectors exist.
        const missing = [];
        if (!root.querySelector(selectors.maxPageContainer)) missing.push('maxPageContainer');
        if (!root.querySelector(selectors.maxPages)) missing.push('maxPages');
        if (missing.length) {
            console.warn(
                `[observeFsPageCount] Missing required selector(s): ${missing.join(', ')}. ` +
                `This task requires these selectors to be present when a pageCount exists. Aborting.`
            );
            return;
        }

        /**
         * Updates the max page state by:
         * 1. Displaying the sibling max-page container.
         * 2. Setting the max pages value based on the content of the target element.
         */
        const updateMaxPageState = () => {
            // Check for the existence of data-kf-count-modified to avoid infinite loops
            const pageCountEl = root.querySelector(selectors.pageCount);
            if (pageCountEl) {
                const spanCheck = pageCountEl.querySelector('span[data-kf-count-modified="true"]');
                if (spanCheck) {
                    return; // Already modified, skip to avoid infinite loop
                }
            }

            // 1. Show the sibling max-page container if it exists.
            const container = root.querySelector(selectors.maxPageContainer);
            if (container) {
                container.style.display = "flex";
            }

            // 2. Set the page values in associated elements.
            const maxPageEl = root.querySelector(selectors.maxPages);
            if (maxPageEl && pageCountEl) {
                const text = target.textContent || ""; // Get the text content of the target element.
                const matches = text.match(/\d+/g); // Extract all integers from the text.
                if (matches?.length) {
                    maxPageEl.innerText = matches[matches.length - 1];
                    // wrap with a span so that we don't infinitely loop mutations, we check for it
                    pageCountEl.innerHTML = `<span data-kf-count-modified="true">${matches[0]}</span>`;
                }
            }
        };

        // Run the update function once on load in case the content is already present.
        updateMaxPageState();

        // Create a MutationObserver to monitor changes in the target element.
        const observer = new MutationObserver(updateMaxPageState);
        observer.observe(target, {
            characterData: true, // Observe changes to the text content.
            subtree: false,
            childList: false,
            attributes: true,
        });
    }
};