/**
 * Adds a task to the `__readyQueue` to observe and update the max page count
 * for specific pagination DOM elements.
 */
export const observeFsPageCount = {
    name: "observeFsPageCount",
    fn: () => {
        // Select all pagination counters
        const targets = document.querySelectorAll('[data-kf-fs-page-count="true"]');

        // If zero, nothing to do
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

        /**
         * Updates the max page state by:
         * 1. Displaying the sibling max-page container.
         * 2. Setting the max pages value based on the content of the target element.
         */
        const updateMaxPageState = () => {
            // 1. Show the sibling max-page container if it exists.
            const container = target.parentElement?.querySelector('[data-kf-fs-max-page-container="true"]');
            if (container) {
                container.style.display = "block";
            }

            // 2. Set the max pages value in the associated element.
            const maxPageEl = target.parentElement?.querySelector('[data-kf-fs-max-pages]');
            if (maxPageEl) {
                const text = target.textContent || ""; // Get the text content of the target element.
                const matches = text.match(/\d+/g); // Extract all integers from the text.
                if (matches?.length) {
                    const lastInt = matches[matches.length - 1]; // Use the last integer as the max page count.
                    maxPageEl.setAttribute("data-kf-fs-max-pages", lastInt); // Update the attribute.
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
            childList: false
        });
    }
};