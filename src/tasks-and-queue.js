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
import {updateFooterYear} from "./modules/updateFooterYear";
import {observeFsPageCount} from "./modules/observeFsPageCount";
import {preventHashNavigation} from "./modules/preventHashNavigation";
import {articleVisibility} from "./modules/articleVisibility";

/* Queue all tasks (safe to run before or after the readyQueue loader) */

// --- Lightweight debug logger (jQuery.migrateWarnings-style) ------------------
// Goal: a tiny global place to stash messages without lots of plumbing.
//
// Usage anywhere:
//   (window.__readyQueue = window.__readyQueue || []).log("Something happened", {any: "data"})
//   (window.__readyQueue = window.__readyQueue || []).warn("Heads up", {any: "data"})
//   window.__readyQueue.logs  // inspect
//
// Optional: also print to console
//   window.__KF_READY_QUEUE_LOG_TO_CONSOLE = true
(function (w) {
    const key = "__readyQueue";
    const rq = (w[key] = w[key] || []);

    // In array-mode, attach a tiny logger + store logs on the object.
    if (Array.isArray(rq)) {
        rq.logs = Array.isArray(rq.logs) ? rq.logs : [];

        const shouldPrint = () => !!w.__KF_READY_QUEUE_LOG_TO_CONSOLE;

        const pushEntry = (level, args) => {
            const lvl = level === "warn" ? "warn" : "info";
            rq.logs.push({
                ts: Date.now(),
                level: lvl,
                args: Array.from(args)
            });
            if (shouldPrint()) {
                try {
                    const fn = lvl === "warn" ? console.warn : console.log;
                    fn.call(console, "[readyQueue]", ...args);
                } catch {
                    // no-op
                }
            }
        };

        if (typeof rq.info !== "function") rq.info = (...args) => pushEntry("info", args);
        if (typeof rq.warn !== "function") rq.warn = (...args) => pushEntry("warn", args);

        // Back-compat / convenience: log() == info()
        if (typeof rq.log !== "function") rq.log = (...args) => pushEntry("info", args);

        if (typeof rq.clearLogs !== "function") rq.clearLogs = () => {
            rq.logs.length = 0;
        };
    }
})(window);

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
                .replace(/[\u0000-\u001F\u007F]/g, "")
                .replace(/<[^>]*>/g, "")
                .trim()
                .slice(0, 200);

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

    observeFsPageCount,

    kfMktoMetaFields,
    kfMktoGenericFormLoader,
    kfPluralTextToggle,

    // Article template visibility toggles
    articleVisibility,

    // Prevent hash URLs while maintaining scroll navigation
    preventHashNavigation
    /* End Pushing to Queue */
);

/*=====================================================================*/

/**
 * readyQueue: post-DOM-ready task runner with duplicate-name safety
 */
(function (w, d) {
    const READY_QUEUE_KEY = "__readyQueue";

    // If something logged before init, capture it and migrate into the API.
    const earlyContainer = w[READY_QUEUE_KEY];
    const early = Array.isArray(earlyContainer) ? earlyContainer.slice() : [];
    const earlyLogs = Array.isArray(earlyContainer?.logs) ? earlyContainer.logs.slice() : [];

    const q = [];
    const registered = new Set();
    let draining = false;
    let ready = d.readyState !== "loading";

    // Optional debug toggle: set `window.__KF_READY_QUEUE_DEBUG = true` for verbose logs
    const DEBUG = !!w.__KF_READY_QUEUE_DEBUG;
    const dbg = (...a) => DEBUG && console.log("[readyQueue]", ...a);
    const warn = (...a) => console.warn("[readyQueue]", ...a);
    const error = (...a) => console.error("[readyQueue]", ...a);

    // --- Lightweight logs store (like jQuery.migrateWarnings) -----------------
    const logs = [];
    const shouldPrint = () => !!w.__KF_READY_QUEUE_LOG_TO_CONSOLE;

    function pushLog(level, args) {
        const lvl = level === "warn" ? "warn" : "info";
        logs.push({
            ts: Date.now(),
            level: lvl,
            args: Array.from(args || [])
        });
        if (shouldPrint()) {
            try {
                const fn = lvl === "warn" ? console.warn : console.log;
                fn.call(console, "[readyQueue]", ...(args || []));
            } catch {
                // no-op
            }
        }
    }

    // Better thenable check (covers Promises and thenables)
    function isThenable(x) {
        return x != null && (typeof x === "object" || typeof x === "function") && typeof x.then === "function";
    }

    // Normalize tasks: function or { fn, name }
    function normalize(task) {
        if (typeof task === "function") return {fn: task, name: task.name || ""};
        if (task && typeof task.fn === "function") return {fn: task.fn, name: task.name || task.fn.name || ""};
        warn("Ignored invalid task:", task);
        return null;
    }

    function ensureNameOrWarn(t) {
        if (!t.name) {
            warn("Task has no name; duplicate protection cannot apply. Provide a { name, fn } or a named function.");
        }
    }

    function register(t) {
        if (t.name) {
            if (registered.has(t.name)) {
                warn(`Skipping duplicate task name "${t.name}".`);
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
        dbg("Running tasks");
        while (q.length) {
            const {fn, name} = q.shift();
            try {
                const out = fn();
                if (isThenable(out)) await out;
            } catch (err) {
                error(name ? `Error in "${name}":` : "Task error:", err);
                // store as a log entry (info by default)
                pushLog("info", [name ? `Task error: ${name}` : "Task error", err]);
            }
        }
        draining = false;
    }

    function push(...tasks) {
        const flat = tasks.flat ? tasks.flat(Infinity) : tasks.reduce((acc, t) => acc.concat(t), []);
        for (const task of flat) {
            const t = normalize(task);
            if (!t) continue;
            register(t);
        }
        if (ready) {
            Promise.resolve().then(() => drain()).catch((err) => error("Drain failed:", err));
        }
    }

    if (!ready) {
        d.addEventListener("DOMContentLoaded", () => {
            ready = true;
            Promise.resolve().then(() => drain()).catch((err) => error("Drain failed:", err));
        }, {once: true});
    }

    w[READY_QUEUE_KEY] = {
        push,
        drain,

        // logs (migrateWarnings-style)
        logs,
        info: (...args) => pushLog("info", args),
        warn: (...args) => pushLog("warn", args),
        log: (...args) => pushLog("info", args),
        clearLogs: () => {
            logs.length = 0;
        },

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

    // Replay early logs
    if (earlyLogs.length) {
        for (const e of earlyLogs) {
            if (!e) continue;
            pushLog(e.level || "info", e.args || []);
        }
    }

    // Process any early tasks that were pushed to the array before loader executed
    for (const t of early) push(t);
    if (ready) Promise.resolve().then(() => drain()).catch((err) => error("Drain failed:", err));
})(window, document);
