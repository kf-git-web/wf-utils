/**
 * @module preventHashNavigation
 * @description
 * Prevents hash (#) URLs from being added to the browser history while still
 * allowing smooth scroll navigation to anchor targets.
 *
 * Usage:
 * Add data-kf-prevent-hash="true" to an <a> tag with an href="#target",
 * or to a parent element that contains an <a> tag as an immediate child.
 *
 * Examples:
 * <a href="#section-1" data-kf-prevent-hash="true">Go to Section 1</a>
 * <div data-kf-prevent-hash="true"><a href="#section-2">Go to Section 2</a></div>
 */

export const preventHashNavigation = {
    name: "preventHashNavigation",
    fn: () => {
        document.querySelectorAll('[data-kf-prevent-hash="true"]').forEach(element => {
            // Determine the anchor element to attach the listener to
            let anchorElement;

            if (element.tagName === 'A') {
                // Element is already an anchor
                anchorElement = element;
            } else {
                // Find immediate child anchor (direct descendant only)
                anchorElement = element.querySelector(':scope > a');
            }

            // Only proceed if we found an anchor element
            if (!anchorElement) return;

            // Skip if already processed (prevents duplicate event listeners)
            if (anchorElement.dataset.preventHashProcessed === 'true') return;

            // Get the original href
            const originalHref = anchorElement.getAttribute('href');

            // Only handle hash links
            if (!originalHref || !originalHref.startsWith('#')) return;

            // Mark as processed
            anchorElement.dataset.preventHashProcessed = 'true';

            // Store href in data attribute and remove actual href to prevent browser behavior
            anchorElement.dataset.preventHashTarget = originalHref;
            anchorElement.removeAttribute('href');

            // Add cursor pointer style since removing href removes pointer cursor
            anchorElement.style.cursor = 'pointer';

            anchorElement.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const targetId = anchorElement.dataset.preventHashTarget.slice(1);
                const targetElement = document.getElementById(targetId);

                if (targetElement) {
                    // Smooth scroll to target
                    targetElement.scrollIntoView({ behavior: 'smooth' });

                    // Update focus for accessibility without changing URL
                    targetElement.focus({ preventScroll: true });
                }
            });
        });
    }
};

