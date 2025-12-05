/**
 * Module that wires `<dialog>` elements to their show and close buttons and enables
 * click-outside-to-close behavior.
 *
 * Call `wireDialogs.fn()` to initialize:
 *  - selects all `<dialog>` elements (returns early if none)
 *  - finds show buttons immediately following each dialog (`dialog + button`)
 *  - finds close buttons inside each dialog (`dialog button`)
 *  - attaches click handlers to show (`dialog.showModal()`) and close (`dialog.close()`)
 *  - closes a dialog when the user clicks outside its bounding rect
 *
 * @namespace wireDialogs
 * @property {string} name - Module name identifier, `"wireDialogs"`.
 * @property {function(): void} fn - Initialization function that attaches event listeners.
 * @exports wireDialogs
 */

// Logan's note: I can't quite remember where this is used in the project. Need to come back and write details.

export const wireDialogs = {
    name: "wireDialogs",
    fn: () => {
        const dialogs = document.querySelectorAll("dialog");
        if (!dialogs.length) return;

        const showButtons = document.querySelectorAll("dialog + button");
        const closeButtons = document.querySelectorAll("dialog button");

        dialogs.forEach((dialog, index) => {
            const showBtn = showButtons[index];
            const closeBtn = closeButtons[index];

            if (showBtn) {
                showBtn.addEventListener("click", () => dialog.showModal(), {once: false});
            }
            if (closeBtn) {
                closeBtn.addEventListener("click", () => dialog.close(), {once: false});
            }

            // Click outside to close
            dialog.addEventListener("click", (e) => {
                const r = dialog.getBoundingClientRect();
                if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) {
                    dialog.close();
                }
            });
        });
    }
}