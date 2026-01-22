/**
 * articleVisibility
 *
 * Generic visibility toggles for article-like templates.
 *
 * Default behavior (matches the provided snippet):
 * - If BOTH "no consultants" and "no experts" flags exist, hide the authors list.
 * - If "no related capabilities" flag exists, hide the capabilities list.
 * - If key takeaways container + renderer exist, show container only when renderer has text.
 *
 * Markup defaults (prefixed):
 *   .kf-vis-no-consultants
 *   .kf-vis-no-experts
 *   .kf-vis-no-caps
 *   .kf-vis-authors-list
 *   .kf-vis-caps-list
 *   .kf-vis-key-takeaways-container
 *   .kf-vis-key-takeaways-renderer
 *
 * Customization:
 * - Change prefix with: data-kf-vis-prefix=".my-prefix-" on <html> or <body>
 * - Or override each selector individually via data-kf-vis-* attributes.
 */
export const articleVisibility = {
    name: "articleVisibility",
    fn: () => {
        const root = document.documentElement;

        // Minimal logger: uses __readyQueue.log if available, otherwise no-ops.
        const rq = window.__readyQueue;
        const rqLog = (rq && typeof rq.log === "function") ? rq.log.bind(rq) : null;
        const log = (event, data) => {
            if (!rqLog) return;
            rqLog(this.name + event, data || {});
        };

        const readOverride = (attr) => {
            const v = root.getAttribute(attr) || document.body?.getAttribute(attr);
            return (v || "").trim() || null;
        };

        const selectorPrefix = readOverride("data-kf-vis-prefix") || ".kf-vis-";

        const sel = {
            noConsultantsFlag: readOverride("data-kf-vis-no-consultants") || `${selectorPrefix}no-consultants`,
            noExpertsFlag: readOverride("data-kf-vis-no-experts") || `${selectorPrefix}no-experts`,
            noRelatedCapsFlag: readOverride("data-kf-vis-no-caps") || `${selectorPrefix}no-caps`,
            authorsList: readOverride("data-kf-vis-authors-list") || `${selectorPrefix}authors-list`,
            capsList: readOverride("data-kf-vis-caps-list") || `${selectorPrefix}caps-list`,
            keyTakeawaysContainer: readOverride("data-kf-vis-key-takeaways-container") || `${selectorPrefix}key-takeaways-container`,
            keyTakeawaysRenderer: readOverride("data-kf-vis-key-takeaways-renderer") || `${selectorPrefix}key-takeaways-renderer`,
        };

        const q = (s) => {
            if (!s) return null;
            try {
                return document.querySelector(s);
            } catch (e) {
                console.warn("[articleVisibility] Invalid selector:", s, e);
                log("invalidSelector", {selector: s});
                return null;
            }
        };

        const elementHasText = (element) => {
            if (!element) return false;
            const txt = element.textContent;
            return typeof txt === "string" && txt.trim().length > 0;
        };

        const setHidden = (el, hidden) => {
            if (!(el instanceof HTMLElement)) return false;
            const next = !!hidden;
            const prev = !!el.hidden;
            if (prev === next) return false;

            el.hidden = next;
            if (next) el.setAttribute("aria-hidden", "true");
            else el.removeAttribute("aria-hidden");
            return true;
        };

        const els = {
            noConsultantsFlag: q(sel.noConsultantsFlag),
            noExpertsFlag: q(sel.noExpertsFlag),
            noRelatedCapsFlag: q(sel.noRelatedCapsFlag),
            authorsList: q(sel.authorsList),
            capsList: q(sel.capsList),
            keyTakeawaysContainer: q(sel.keyTakeawaysContainer),
            keyTakeawaysRenderer: q(sel.keyTakeawaysRenderer),
        };

        // 1) Hide authors list if both "no consultant" and "no expert" flags exist.
        if (els.noConsultantsFlag && els.noExpertsFlag) {
            const changed = setHidden(els.authorsList, true);
            if (changed) {
                log("hide", {
                    target: "authorsList",
                    reason: "noConsultantsFlag && noExpertsFlag",
                    selector: sel.authorsList
                });
            }
        }

        // 2) Hide related capabilities list if "no caps" flag exists.
        if (els.noRelatedCapsFlag) {
            const changed = setHidden(els.capsList, true);
            if (changed) {
                log("hide", {
                    target: "capsList",
                    reason: "noRelatedCapsFlag",
                    selector: sel.capsList
                });
            }
        }

        // 3) Toggle key takeaways container based on renderer text.
        if (els.keyTakeawaysContainer && els.keyTakeawaysRenderer) {
            const hasText = elementHasText(els.keyTakeawaysRenderer);
            const changed = setHidden(els.keyTakeawaysContainer, !hasText);
            if (changed) {
                log(hasText ? "show" : "hide", {
                    target: "keyTakeawaysContainer",
                    reason: hasText ? "renderer has text" : "renderer empty",
                    selector: sel.keyTakeawaysContainer
                });
            }
        }
    }
};
