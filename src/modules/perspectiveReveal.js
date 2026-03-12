/**
 * Module that wires a per-instance "perspective reveal" toggle inside
 * T2 header sections. For each `[data-t2-header]` wrapper:
 *   - Hides the CONTAINER and CLOSE_BUTTON on init (via inline style display:none).
 *   - Clicking OPEN_BUTTON shows CONTAINER + CLOSE_BUTTON and hides itself.
 *   - Clicking CLOSE_BUTTON reverses that state.
 *
 * All four data attributes must be present on children of the wrapper;
 * if any are missing the instance is skipped and an error is logged.
 *
 * @namespace t2HeaderPerspectiveReveal
 * @property {string} name
 * @property {function(): void} fn
 */
export const t2HeaderPerspectiveReveal = {
    name: "t2HeaderPerspectiveReveal",
    fn: () => {
        // Dataset attribute names — elements carry these with value "true"
        const T2_HEADER  = "t2-header";
        const CONTAINER  = "t2-op-container";
        const OPEN_BUTTON  = "t2-perspective-open";
        const CLOSE_BUTTON = "t2-perspective-close";

        // Find every wrapper instance on the page; bail early if none exist
        const headers = document.querySelectorAll(`[data-${T2_HEADER}]`);
        if (!headers.length) return;

        headers.forEach(header => {
            const container = header.querySelector(`[data-${CONTAINER}]`);
            const openBtn   = header.querySelector(`[data-${OPEN_BUTTON}]`);
            const closeBtn  = header.querySelector(`[data-${CLOSE_BUTTON}]`);

            // All three child targets must be present; log and suppress broken buttons per-instance
            if (!container || !openBtn || !closeBtn) {
                console.warn("[t2HeaderPerspectiveReveal] Missing required child(ren) in:", header, {container, openBtn, closeBtn});
                return;
            }

            // Initial state: panel collapsed, close button hidden
            container.style.display = "none";
            closeBtn.style.display  = "none";
            openBtn.style.display   = "block";

            // Open: reveal panel, swap to close button
            openBtn.addEventListener("click", () => {
                container.style.display = "";
                closeBtn.style.display  = "block";
                openBtn.style.display   = "none";
            });

            // Close: collapse panel, swap back to open button
            closeBtn.addEventListener("click", () => {
                container.style.display = "none";
                closeBtn.style.display  = "none";
                openBtn.style.display   = "block";
            });
        });
    }
};
