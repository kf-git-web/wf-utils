// src/modules/ensureMailtoOnEmailLinks.js
// Task: ensureMailtoOnEmailLinks
// Purpose: Ensure anchors with data-kf-email-href have a mailto: href

/**
 * ensureMailtoOnEmailLinks
 *
 * ReadyQueue task object responsible for ensuring anchor elements that are
 * marked with the `data-kf-email-href` attribute have a proper `mailto:`
 * link in their `href` attribute.
 *
 * Behavior:
 * - Scans the document for `a[data-kf-email-href]` elements.
 * - Reads the element's `href` attribute and, if it exists and does not
 *   already start with the `mailto:` scheme, prefixes it with `mailto:`.
 *
 * Notes:
 * - It intentionally does not attempt to validate email address syntax;
 *   it only ensures the `mailto:` scheme is present when an `href` value
 *   appears to be an email address.
 * - Errors thrown during DOM access will bubble to the ready-queue's
 *   error handling (do not swallow errors here unless task-specific logging
 *   is desired).
 *
 * @example
 * // HTML: <a data-kf-email-href href="jane@example.com">Email</a>
 * // After running the task: href => "mailto:jane@example.com"
 *
 * @type {{name: string, fn: function(): void}}
 */
export const ensureMailtoOnEmailLinks = {
    name: "ensureMailtoOnEmailLinks",
    fn: () => {
        document.querySelectorAll('a[data-kf-email-href]').forEach(anchor => {
            const email = anchor.getAttribute('href');
            if (email && !email.startsWith('mailto:')) {
                anchor.setAttribute('href', 'mailto:' + email);
            }
        });
    }
};