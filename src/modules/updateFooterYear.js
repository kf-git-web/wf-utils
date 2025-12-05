/**
 * Module that updates the footer year dynamically based on the current year.
 *
 * Call `updateFooterYear.fn()` to initialize:
 *  - Retrieves the current year using `new Date().getFullYear()`.
 *  - Selects all elements with the `data-footer-year` attribute.
 *  - Updates the text content of each selected element to the current year.
 *
 * @namespace updateFooterYear
 * @property {string} name - Module name identifier, `"updateFooterYear"`.
 * @property {function(): void} fn - Initialization function that updates footer year elements.
 */

export const updateFooterYear = {
    name: "updateFooterYear",
    fn: () => {
        const year = String(new Date().getFullYear());
        document.querySelectorAll('[data-footer-year]').forEach(el => {
            el.textContent = year;
        });
    }
}