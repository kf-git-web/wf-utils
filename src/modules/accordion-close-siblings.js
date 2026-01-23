import {cssEscape} from "./domUtils";

/**
 * Module that ensures only one `<details>` element with the same accordion type
 * remains open at a time. When a `<details>` element is opened, its siblings
 * with the same `data-kf-accordion-type` attribute are closed.
 *
 * Call `accordionCloseSiblings.fn()` to initialize:
 *  - Registers a `toggle` event listener on the document.
 *  - Listens for `<details>` elements with the `data-kf-accordion-type` attribute.
 *  - When a `<details>` element is opened:
 *    - Finds all sibling `<details>` elements with the same `data-kf-accordion-type`.
 *    - Closes the sibling `<details>` elements by triggering their `click` event
 *      on the `<summary>` element or directly setting `open` to `false`.
 *
 * @namespace accordionCloseSiblings
 * @property {string} name - Module name identifier, `"accordionCloseSiblings"`.
 * @property {function(): void} fn - Initialization function that attaches the event listener.
 */

export const accordionCloseSiblings = {
    name: "accordionCloseSiblings",
    fn: () => {
        // Only register once per page load (task name dedupe covers us)
        const esc = cssEscape;
        document.addEventListener('toggle', (e) => {
            const d = e.target;
            if (!(d instanceof HTMLDetailsElement)) return;
            if (!d.hasAttribute('data-kf-accordion-type')) return;
            if (!d.open) return; // only when it just opened

            const type = d.getAttribute('data-kf-accordion-type') || '';
            const selector = `details[data-kf-accordion-type="${esc(type)}"]`;

            document.querySelectorAll(selector).forEach(other => {
                if (other === d || !other.open) return;

                other.setAttribute('role', 'unset');

                const summary = other.querySelector('summary');
                if (summary && typeof summary.click === 'function') {
                    summary.click();
                } else {
                    other.open = false;
                }
            });
        }, true);
    }
};