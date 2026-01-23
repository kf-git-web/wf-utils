/**
 * Small DOM helpers shared across readyQueue modules.
 *
 * Notes:
 * - Keep this file dependency-free.
 * - Be conservative: helpers should fall back safely when APIs aren't available.
 */

/**
 * Escapes a string for safe use in a CSS selector.
 * Falls back to a simple quote-escape when CSS.escape isn't available.
 *
 * @param {string} s
 * @returns {string}
 */
export const cssEscape = (s) => {
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(String(s));
    return String(s).replace(/"/g, '\\"');
};

/**
 * True when an element exists, has non-empty trimmed text, and is visible.
 *
 * @param {Element|null|undefined} el
 * @returns {boolean}
 */
export const isVisibleAndHasText = (el) => {
    if (!el) return false;
    const text = el.textContent;
    if (typeof text !== "string" || text.trim() === "") return false;

    // offsetParent === null is a common visibility heuristic (fails for fixed elements,
    // but matches previous module behavior).
    return /** @type {any} */ (el).offsetParent !== null;
};

/**
 * Returns the first match for selector under root, but returns null if selector is invalid.
 *
 * @param {ParentNode} root
 * @param {string} selector
 * @returns {Element|null}
 */
// Intentionally exported for cross-module safety when dealing with user-provided selectors.
export const safeQuerySelector = (root, selector) => {
    if (!root || !selector) return null;
    try {
        return root.querySelector(selector);
    } catch {
        return null;
    }
};

export default {
    cssEscape,
    isVisibleAndHasText,
    safeQuerySelector
};
