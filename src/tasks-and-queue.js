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
import {kfVideoBackgrounds} from "./modules/bg-video";
import {fontSizeReducer} from "./modules/fontSizeReducer";
import {t2HeaderPerspectiveReveal} from "./modules/perspectiveReveal";

/* Queue all tasks (safe to run before or after the readyQueue loader) */

// Shared helper (used by both the pre-init logger shim and the post-init API)
const readClampedInt = (value, def, min, max) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return def;
    const i = Math.floor(n);
    if (i < min) return def;
    return Math.min(i, max);
};

// Shared logger helpers (keeps the log-entry shape consistent and avoids duplicated code)
const createReadyQueueLogHelpers = (w) => {
    // Safety limits (can be overridden globally, but clamped)
    const MAX_LOGS = readClampedInt(w.__KF_READY_QUEUE_MAX_LOGS, 200, 1, 2000);
    const MAX_ARGS = readClampedInt(w.__KF_READY_QUEUE_MAX_ARGS, 6, 1, 25);
    const MAX_STR = readClampedInt(w.__KF_READY_QUEUE_MAX_STR, 500, 1, 5000);

    const clampArgs = (argsLike) => {
        const arr = Array.isArray(argsLike) ? argsLike : Array.from(argsLike || []);
        return arr.slice(0, MAX_ARGS).map((x) => (typeof x === "string" ? x.slice(0, MAX_STR) : x));
    };

    const capLogs = (logs) => {
        if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS);
    };

    const shouldPrint = () => !!w.__KF_READY_QUEUE_LOG_TO_CONSOLE;

    const pushTo = (logs, level, input) => {
        const lvl = level === "warn" ? "warn" : "info";
        const tsNow = Date.now();

        let entryLevel = lvl;
        let entryTs = tsNow;
        let entryArgs;

        // Object entry form: { level?, ts?, args? } or { message, data }
        if (input && typeof input === "object" && !Array.isArray(input) && ("args" in input || "message" in input)) {
            entryLevel = input.level === "warn" ? "warn" : lvl;
            entryTs = typeof input.ts === "number" ? input.ts : tsNow;
            entryArgs = "args" in input
                ? clampArgs(Array.isArray(input.args) ? input.args : [input.args])
                : clampArgs([input.message, input.data].filter((v) => v !== undefined));
        } else {
            entryArgs = clampArgs(input);
        }

        logs.push({ts: entryTs, level: entryLevel, args: entryArgs});
        capLogs(logs);

        if (shouldPrint()) {
            try {
                const fn = entryLevel === "warn" ? console.warn : console.log;
                fn.call(console, "[readyQueue]", ...entryArgs);
            } catch {
                // no-op
            }
        }
    };

    return {
        clampArgs,
        capLogs,
        shouldPrint,
        pushTo,
        normalizeLogEntry: (level, input) => {
            // normalize into canonical entry + return it; useful for the pre-init shim
            const tmp = [];
            pushTo(tmp, level, input);
            return tmp[0];
        }
    };
};

// --- Lightweight debug logger (migrateWarnings-style, tolerant writes) --------
// Supports only info + warn.
//
// Canonical stored shape:
//   { ts: number, level: "info"|"warn", args: any[] }
//
// You can write logs in a few ways:
//   __readyQueue.info("msg", {data})
//   __readyQueue.warn("msg", {data})
//   __readyQueue.log("msg", {data})          // alias of info
//   __readyQueue.emit("msg", {data})         // tolerant helper
//   __readyQueue.emit({ level: "warn", args: ["msg", {data}] })
//
// Optional: also print to console
//   window.__KF_READY_QUEUE_LOG_TO_CONSOLE = true
(function (w) {
    const key = "__readyQueue";
    const rq = (w[key] = w[key] || []);

    // In array-mode, attach a tiny logger + store logs on the object.
    if (Array.isArray(rq)) {
        rq.logs = Array.isArray(rq.logs) ? rq.logs : [];

        const helpers = createReadyQueueLogHelpers(w);

        // Normalize writes so logs always remain canonical.
        const normalizeAndPush = (level, input) => {
            const entry = helpers.normalizeLogEntry(level, input);
            rq.logs.push(entry);
            helpers.capLogs(rq.logs);
            return {level: entry.level, args: entry.args};
        };

        const pushEntry = (level, args) => {
            const {level: lvl, args: safeArgs} = normalizeAndPush(level, args);
            if (helpers.shouldPrint()) {
                try {
                    const fn = lvl === "warn" ? console.warn : console.log;
                    fn.call(console, "[readyQueue]", ...safeArgs);
                } catch {
                    // no-op
                }
            }
        };

        if (typeof rq.info !== "function") rq.info = (...args) => pushEntry("info", args);
        if (typeof rq.warn !== "function") rq.warn = (...args) => pushEntry("warn", args);

        // Back-compat / convenience: log() == info()
        if (typeof rq.log !== "function") rq.log = (...args) => pushEntry("info", args);

        // Tolerant ingestion API for external scripts.
        // - emit("msg", {data})
        // - emit({ level: "warn", ts, args: [...] })
        if (typeof rq.emit !== "function") {
            rq.emit = (entryOrMessage, data) => {
                if (entryOrMessage && typeof entryOrMessage === "object" && !Array.isArray(entryOrMessage)) {
                    normalizeAndPush(entryOrMessage.level, entryOrMessage);
                    return;
                }
                // message + optional data
                pushEntry("info", [entryOrMessage, data].filter((v) => v !== undefined));
            };
        }

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
                    // NOTE: allow single pairs like "office=Boston".
                    const looksLikePairs = /=/.test(cleaned);
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
    preventHashNavigation,

    // Vimeo background video initialization
    kfVideoBackgrounds,

    // Wrap font-reduction modifier elements in a .dynamic-reduce span
    fontSizeReducer,

    // T2 header perspective panel toggle
    t2HeaderPerspectiveReveal
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

    // --- Lightweight logs store (migrateWarnings-style, tolerant writes) ------
    const logs = [];
    const helpers = createReadyQueueLogHelpers(w);

    function pushLog(level, input) {
        helpers.pushTo(logs, level, input);
    }

    // Better thenable check (covers Promises and thenables)
    function isThenable(x) {
        return x != null && (typeof x === "object" || typeof x === "function") && typeof x.then === "function";
    }

    // Normalize tasks: function or { fn, name }
    function normalize(task) {
        if (typeof task === "function") return {fn: task, name: task.name || "", priority: typeof task.priority === 'number' && Number.isFinite(task.priority) ? Math.floor(task.priority) : undefined};
        if (task && typeof task.fn === "function") {
            // Accept an optional `priority` field on task objects. Higher numeric priority runs sooner.
            const rawPriority = task.priority;
            const priority = (typeof rawPriority === 'number' && Number.isFinite(rawPriority)) ? Math.floor(rawPriority) : undefined;
            return {fn: task.fn, name: task.name || task.fn.name || "", priority};
        }
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

        // If a numeric priority is supplied, insert the task before lower-priority tasks.
        // Higher numbers mean higher priority (run earlier). Tasks without a priority are treated
        // as priority 0 and run after positive-priority tasks.
        const incomingPriority = (typeof t.priority === 'number' && Number.isFinite(t.priority)) ? Math.floor(t.priority) : 0;
        if (incomingPriority !== 0) {
            let inserted = false;
            for (let i = 0; i < q.length; i++) {
                const existing = q[i];
                const existingPriority = (typeof existing.priority === 'number' && Number.isFinite(existing.priority)) ? Math.floor(existing.priority) : 0;
                if (existingPriority < incomingPriority) {
                    q.splice(i, 0, t);
                    inserted = true;
                    break;
                }
            }
            if (!inserted) q.push(t);
        } else {
            q.push(t);
        }
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
                // store as an info log entry
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

        // Tolerant ingestion API for external scripts.
        // - emit("msg", {data})
        // - emit({ level: "warn", ts, args: [...] })
        emit: (entryOrMessage, data) => {
            if (entryOrMessage && typeof entryOrMessage === "object" && !Array.isArray(entryOrMessage)) {
                pushLog(entryOrMessage.level, entryOrMessage);
                return;
            }
            pushLog("info", [entryOrMessage, data].filter((v) => v !== undefined));
        },

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
            pushLog(e.level || "info", e);
        }
    }

    // Process any early tasks that were pushed to the array before loader executed
    for (const t of early) push(t);
    if (ready) Promise.resolve().then(() => drain()).catch((err) => error("Drain failed:", err));
})(window, document);
