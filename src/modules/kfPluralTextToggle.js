/*
 * KF ReadyQueue + Plural Text Toggle (defensive version)
 *
 * Behavior:
 * For each element with a non-empty data-kf-plural-elements="<identifier>":
 *   - Finds all elements with data-kf-plural-group="<identifier>".
 *   - If more than one element shares that identifier:
 *       → Shows [data-kf-plural-text] and hides [data-kf-single-text]
 *   - Otherwise:
 *       → Shows [data-kf-single-text] and hides [data-kf-plural-text]
 *
 * All toggling occurs within the parent element of the [data-kf-plural-elements] node.
 * Uses the native "hidden" attribute for visibility control.
 */
export const kfPluralTextToggle = {
    name: "kfPluralTextToggle",
    fn: () => {
        try {
            const ATTR_PLURAL_ELEMENTS = "data-kf-plural-elements";
            const ATTR_PLURAL_GROUP = "data-kf-plural-group";
            const ATTR_SINGLE = "data-kf-single-text";
            const ATTR_PLURAL = "data-kf-plural-text";

            /** Defensive helper utilities */
            const hideEls = (els = []) => {
                if (!Array.isArray(els)) return;
                els.forEach((el) => {
                    if (!(el instanceof HTMLElement)) return;
                    try {
                        el.hidden = true;
                        el.setAttribute("aria-hidden", "true");
                    } catch (err) {
                        console.warn("[kfPluralTextToggle] Failed to hide element:", el, err);
                    }
                });
            };

            const showEls = (els = []) => {
                if (!Array.isArray(els)) return;
                els.forEach((el) => {
                    if (!(el instanceof HTMLElement)) return;
                    try {
                        el.hidden = false;
                        el.removeAttribute("hidden");
                        el.removeAttribute("aria-hidden");
                    } catch (err) {
                        console.warn("[kfPluralTextToggle] Failed to show element:", el, err);
                    }
                });
            };

            /** Select all plural marker elements */
            const pluralMarkers = Array.from(
                document.querySelectorAll(`[${ATTR_PLURAL_ELEMENTS}]`)
            ).filter((el) => (el.getAttribute(ATTR_PLURAL_ELEMENTS) || "").trim() !== "");

            if (pluralMarkers.length === 0) {
                // noop
                return;
            }

            pluralMarkers.forEach((marker) => {
                try {
                    const id = marker.getAttribute(ATTR_PLURAL_ELEMENTS)?.trim();
                    if (!id) return;

                    const parent = marker.parentElement;
                    if (!parent) {
                        console.warn("[kfPluralTextToggle] Marker has no parent:", marker);
                        return;
                    }

                    // Query all elements that belong to this plural group
                    const matchingGroupElements = document.querySelectorAll(
                        `[${ATTR_PLURAL_GROUP}="${id}"]`
                    );

                    const isPlural = matchingGroupElements.length > 1;

                    const singles = Array.from(parent.querySelectorAll(`[${ATTR_SINGLE}]`));
                    const plurals = Array.from(parent.querySelectorAll(`[${ATTR_PLURAL}]`));

                    if (isPlural) {
                        showEls(plurals);
                        hideEls(singles);
                    } else {
                        showEls(singles);
                        hideEls(plurals);
                    }
                } catch (err) {
                    console.error("[kfPluralTextToggle] Error processing marker:", marker, err);
                }
            });
        } catch (outerErr) {
            console.error("[kfPluralTextToggle] Script initialization error:", outerErr);
        }
    }
};