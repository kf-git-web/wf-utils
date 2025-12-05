import {kfMetaCapture} from "./modules/kfMetaCapture";
import {ensureMailtoOnEmailLinks} from "./modules/ensureMailtoOnEmailLinks";
import {updateLinkTargetsForDomains} from "./modules/updateLinkTargetsForDomains";
import {wireDialogs} from "./modules/wireDialogs";
import {updateOfficeCardCityState} from "./modules/updateOfficeCardCityState";
import {accordionCloseSiblings} from "./modules/accordion-close-siblings";
import {kfMktoMetaFields} from "./modules/kfMktoMetaFields";
import {applyQueryParamWhitelistedAttrs} from "./modules/applyQueryParamWhitelistedAttrs";
import {kfMktoGenericFormLoader} from "./modules/kfMktoGenericFormLoader";
import {kfPluralTextToggle} from "./modules/kfPluralTextToggle";


/* Queue all tasks (safe to run before or after the readyQueue loader) */

(window.__readyQueue = window.__readyQueue || []).push(
    // Add utils
    {
        name: "setupUtils",
        fn: () => {
            const rq = window.__readyQueue;
            rq.utils = rq.utils || {};

            /**
             * @function sanitize
             * @description
             * Cleans a string input using DOMPurify (if available) or a safe fallback.
             * Removes HTML, scripts, control chars, and trims whitespace.
             * Ensures the result is safe for use in URLs, attributes, or plain text.
             *
             * Behavior:
             * - If DOMPurify is present: strips all tags/attrs via `sanitize(str, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })`.
             * - If DOMPurify is missing: removes control chars, strips HTML via regex, trims, and caps to 200 chars.
             *
             * @param {string} str - Input string to sanitize.
             * @returns {string} Safe, plain, trimmed string.
             */
            const hasPurify = !!window.DOMPurify;
            const purifySanitize = (str) =>
                window.DOMPurify.sanitize(String(str), {
                    ALLOWED_TAGS: [],
                    ALLOWED_ATTR: [],
                    RETURN_TRUSTED_TYPE: false
                }).trim();

            const fallbackSanitize = (str) => String(str || "")
                .replace(/[\u0000-\u001F\u007F]/g, "") // strip control chars
                .replace(/<[^>]*>/g, "")               // strip HTML tags
                .trim()
                .slice(0, 200);                        // cap length defensively

            rq.utils.sanitize = (str) => (hasPurify ? purifySanitize(str) : fallbackSanitize(str));

            /**
             * @function paramsFromRaw
             * @description
             * Parses a raw query-like string (e.g. from a data-* attribute) into a URLSearchParams object.
             * Automatically determines if it looks like key/value pairs (contains "=" or "&").
             * Sanitizes both keys and values via sanitize().
             * Falls back to treating the string as a "q" parameter if no pairs are detected.
             *
             * Example inputs:
             *   "office=Boston&role=Partner" → URLSearchParams("office=Boston&role=Partner")
             *   "executive search" → URLSearchParams("q=executive search")
             *
             * @param {string} raw - Raw data string (possibly unsafe or unstructured).
             * @returns {URLSearchParams} Parsed and sanitized parameters.
             */
            rq.utils.paramsFromRaw = (raw) => {
                const clean = rq.utils.sanitize(raw);
                const params = new URLSearchParams();

                // Detect "key=value" style pairs
                const looksLikePairs = /=/.test(clean) && /[=&]/.test(clean);
                if (looksLikePairs) {
                    clean.split("&").forEach(pair => {
                        if (!pair) return;
                        const [kRaw, vRaw = ""] = pair.split("=");
                        const k = rq.utils.sanitize(kRaw);
                        const v = rq.utils.sanitize(vRaw);
                        // allow only safe alphanumeric/underscore/dash keys
                        if (/^[a-z0-9_-]{1,40}$/i.test(k)) params.set(k, v);
                    });
                } else if (clean) {
                    params.set("q", clean);
                }

                return params;
            };

            /**
             * @function addQueryToDescendantLink
             * @description
             * For each element with a given data-* attribute, find exactly one target <a>
             * (either via a per-element selector, or itself if it's an <a>, or the only
             * descendant <a>), then append sanitized query params to its href.
             *
             * - If the attribute value looks like "key=val&x=y", those pairs are used.
             * - Otherwise, it sets { [param]: "<cleaned value>" }.
             *
             * Options:
             *   attr            {string}  Data attribute to read (e.g., "data-kf-office-query")
             *   param           {string}  Default param key to use when not key/value pairs (e.g., "office")
             *   container       {Element} Optional root to search under (default: document)
             *   targetSelectorAttr {string} Per-element attribute that can specify a link selector (default: "data-kf-target-link")
             *   requireSingle   {boolean} Require exactly one link (default: true)
             *   allowSelfAnchor {boolean} Use element itself if it's an <a> (default: true)
             */
            rq.utils.addQueryToDescendantLink = (opts) => {
                const {
                    attr,
                    param,
                    container = document,
                    targetSelectorAttr = "data-kf-target-link",
                    requireSingle = true,
                    allowSelfAnchor = true
                } = opts || {};

                const sanitize = rq.utils.sanitize || ((s) => String(s || "").trim());

                const nodeLabel = (el) => {
                    if (!(el instanceof Element)) return String(el);
                    const id = el.id ? `#${el.id}` : "";
                    const cls = el.className && typeof el.className === "string"
                        ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".")
                        : "";
                    return `${el.tagName.toLowerCase()}${id}${cls}`;
                };

                const parseParams = (raw) => {
                    const cleaned = sanitize(raw);
                    const params = new URLSearchParams();
                    if (!cleaned) return params;

                    // If it looks like key=value pairs, parse them; else use the provided param key
                    const looksLikePairs = /=/.test(cleaned) && /[=&]/.test(cleaned);
                    if (looksLikePairs) {
                        cleaned.split("&").forEach(pair => {
                            if (!pair) return;
                            const [kRaw, vRaw = ""] = pair.split("=");
                            const k = sanitize(kRaw);
                            const v = sanitize(vRaw);
                            if (/^[a-z0-9_-]{1,40}$/i.test(k)) params.set(k, v);
                        });
                    } else if (param) {
                        params.set(param, cleaned);
                    }
                    return params;
                };

                container.querySelectorAll(`[${attr}]`).forEach(el => {
                    const raw = el.getAttribute(attr);
                    const cleaned = sanitize(raw);

                    if (!cleaned) {
                        console.warn(`[addQueryToDescendantLink] Empty/invalid ${attr} on ${nodeLabel(el)}; skipping.`);
                        return;
                    }

                    // Choose target link(s)
                    const explicitSel = el.getAttribute(targetSelectorAttr);
                    let links;

                    if (explicitSel) {
                        links = Array.from(el.querySelectorAll(explicitSel));
                    } else if (allowSelfAnchor && el.matches("a")) {
                        links = [el];
                    } else {
                        links = Array.from(el.querySelectorAll("a"));
                    }

                    if (!links.length) {
                        console.warn(`[addQueryToDescendantLink] No target <a> for ${nodeLabel(el)} (attr ${attr}); skipping.`);
                        return;
                    }
                    if (requireSingle && links.length > 1) {
                        console.warn(
                            `[addQueryToDescendantLink] Multiple links for ${nodeLabel(el)} (attr ${attr});` +
                            ` add ${targetSelectorAttr} to disambiguate. Skipping.`
                        );
                        return;
                    }

                    const a = links[0];
                    const href = a.getAttribute("href") || "";
                    let url;
                    try {
                        url = new URL(href, window.location.href);
                    } catch {
                        console.warn(`[addQueryToDescendantLink] Invalid href on ${nodeLabel(a)}: "${href}"; skipping.`);
                        return;
                    }

                    const newParams = parseParams(cleaned);
                    for (const [k, v] of newParams.entries()) {
                        url.searchParams.set(k, v);
                    }
                    a.setAttribute("href", url.toString());
                });
            };

        }
    },

    // Capture meta tags
    kfMetaCapture,

    // Add target/_blank + rel to specific domains (jQuery-based)
    updateLinkTargetsForDomains,

    // Add mailto: to links with data-kf-email-href
    ensureMailtoOnEmailLinks,

    // Modal <dialog> wiring
    wireDialogs,

    // Update footer year
    updateFooterYear,

    // Office card city/state comma logic
    updateOfficeCardCityState,

    // Close other accordions of the same data-kf-accordion-type
    accordionCloseSiblings,

    // Update see all consultants button query
    applyQueryParamWhitelistedAttrs,

    // regionTabControl is currently INLINE as a pushed task in the page template for Offices page.
    // It can be rolled back up into the main script bundle as well.
    // Remember! There is name deduping, so it will need to be removed from one location.
    // {
    //     name: "regionTabControl",
    //     fn: () => {
    //         const TAB_MAP = {
    //             "north-america": 1,
    //             "latin-america": 2,
    //             "asia-pacific": 3,
    //             "emea": 4,
    //             "europe-middle-east-africa": 4
    //         };
    //
    //         function getTabIndexFromParam(raw) {
    //             if (!raw) return null;
    //             if (/^\d+$/.test(raw)) {
    //                 const n = parseInt(raw, 10);
    //                 return n >= 1 && n <= 4 ? n : null;
    //             }
    //             const key = raw.toLowerCase().replace(/\s+|_/g, "-");
    //             return TAB_MAP[key] ?? null;
    //         }
    //
    //         // Is this element a clickable tab trigger?
    //         function isTabTrigger(el) {
    //             if (!el || !(el instanceof Element)) return false;
    //             // Anything inside the tab menu is a trigger
    //             if (el.closest(".w-tabs-menu")) return true;
    //             // Or elements that have typical trigger semantics:
    //             return el.matches("a, button, [role='tab'], .w-tab-link");
    //         }
    //
    //         // Find the correct trigger; avoid panes in .w-tab-content
    //         function findTabTrigger(tabId) {
    //             // Prefer elements inside the menu
    //             const inMenu = document.querySelector(`.w-tabs-menu [data-w-tab="${tabId}"]`);
    //             if (inMenu && isTabTrigger(inMenu)) return inMenu;
    //
    //             // Fallback: any clickable element with data-w-tab, not inside tab content
    //             const candidates = Array.from(document.querySelectorAll(`[data-w-tab="${tabId}"]`));
    //             return candidates.find(el => isTabTrigger(el) && !el.closest(".w-tab-content")) || null;
    //         }
    //
    //         function clickEl(el) {
    //             if (!el) return;
    //             if (typeof el.click === "function") el.click();
    //             else el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    //         }
    //
    //         function activateRegionTab(idx) {
    //             if (!idx) return;
    //             const tabId = `tab-${idx}`;
    //             const trigger = findTabTrigger(tabId);
    //             if (!trigger) {
    //                 console.warn(`[regionTabControl] No clickable trigger found for ${tabId}.`);
    //                 return;
    //             }
    //             clickEl(trigger);
    //
    //             // Keep dropdown in sync
    //             const dropDown = document.getElementById("kf-geo-tab-switcher");
    //             if (dropDown) dropDown.value = tabId;
    //         }
    //
    //         function bindRegionDropdown() {
    //             const dropDown = document.getElementById("kf-geo-tab-switcher");
    //             if (!dropDown) return;
    //
    //             const HANDLER_KEY = "__regionTabControlHandler";
    //             if (dropDown[HANDLER_KEY]) dropDown.removeEventListener("change", dropDown[HANDLER_KEY]);
    //
    //             const handler = () => {
    //                 const tabId = dropDown.value; // e.g., "tab-2"
    //                 const trigger = findTabTrigger(tabId);
    //                 if (!trigger) {
    //                     console.warn(`[regionTabControl] Dropdown selected "${tabId}" but no matching trigger.`);
    //                     return;
    //                 }
    //                 clickEl(trigger);
    //             };
    //
    //             dropDown.addEventListener("change", handler);
    //             dropDown[HANDLER_KEY] = handler;
    //         }
    //
    //         function initializeFromUrl() {
    //             const param = new URLSearchParams(window.location.search).get("tab");
    //             const idx = getTabIndexFromParam(param);
    //             if (idx) activateRegionTab(idx);
    //         }
    //
    //         // If Webflow is present, run after it initializes tabs; else run now.
    //         const start = () => {
    //             bindRegionDropdown();
    //             initializeFromUrl();
    //         };
    //         if (window.Webflow && typeof window.Webflow.push === "function") window.Webflow.push(start);
    //         else start();
    //     }
    // }

    kfMktoMetaFields,
    kfMktoGenericFormLoader,
    kfPluralTextToggle
    /* End Pushing to Queue */
);

/*=====================================================================*/


/**
 * readyQueue: post-DOM-ready task runner with duplicate-name safety
 * - Accepts early pushes to window.__readyQueue (Array) before this loader runs
 * - Wraps each task in try/catch; awaits async tasks
 * - Skips duplicate names with a warning; anonymous tasks still run (warned)
 *
 * Usage:
 *   (window.__readyQueue = window.__readyQueue || []).push({ name: "decorateNav", fn: () => {...} })
 *   (window.__readyQueue = window.__readyQueue || []).push(function highlightCTAs() { ... })
 *   __readyQueue.push({ name: "setupFooter", fn: async () => {...} })
 */
(function (w, d) {
    const KEY = "__readyQueue";
    const early = w[KEY] || [];   // Any early pushed tasks
    const q = [];                 // Internal queue
    const registered = new Set(); // For dedupe by name
    let draining = false;
    let ready = d.readyState !== "loading";

    // Utility: check if something is a Promise
    function isPromise(x) {
        return !!x && typeof x.then === "function";
    }

    // Normalize input: function or { fn, name }
    function normalize(task) {
        if (typeof task === "function") {
            return {fn: task, name: task.name || ""};
        }
        if (task && typeof task.fn === "function") {
            return {fn: task.fn, name: task.name || task.fn.name || ""};
        }
        console.error("[readyQueue] Ignored invalid task:", task);
        return null;
    }

    function ensureNameOrWarn(t) {
        if (!t.name) {
            console.warn("[readyQueue] Task has no name; duplicate protection cannot apply. Provide a { name, fn } or a named function.");
        }
    }

    function register(t) {
        if (t.name) {
            if (registered.has(t.name)) {
                console.warn(`[readyQueue] Skipping duplicate task name "${t.name}".`);
                return false;
            }
            registered.add(t.name);
        } else {
            ensureNameOrWarn(t);
        }
        q.push(t);
        return true;
    }

    async function drain() {
        if (draining) return;
        draining = true;
        console.log('[KFTasks] Running tasks');
        while (q.length) {
            const {fn, name} = q.shift();
            try {
                const out = fn();
                if (isPromise(out)) await out;
            } catch (err) {
                console.error(name ? `[readyQueue] Error in "${name}":` : "[readyQueue] Task error:", err);
            }
        }
        draining = false;
    }

    function push(...tasks) {
        for (const task of tasks) {
            const t = normalize(task);
            if (!t) continue;
            register(t);
        }
        if (ready) drain();
    }

    if (!ready) {
        d.addEventListener("DOMContentLoaded", () => {
            ready = true;
            drain();
        }, {once: true});
    }

    // Expose API
    w[KEY] = {
        push,                 // Add task (fn or { fn, name })
        drain,                // Force run pending tasks
        has(name) {
            return registered.has(name);
        },
        list() {
            return Array.from(registered);
        },
        get length() {
            return q.length;
        },
        get isReady() {
            return ready;
        }
    };

    // Process any early tasks
    for (let i = 0; i < early.length; i++) push(early[i]);
    if (ready) drain();
})(window, document);
