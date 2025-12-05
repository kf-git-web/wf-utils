import { kfMetaCapture } from "./modules/kfMetaCapture";
import { ensureMailtoOnEmailLinks } from "./modules/ensureMailtoOnEmailLinks";
import { updateLinkTargetsForDomains } from "./modules/updateLinkTargetsForDomains";
import {wireDialogs} from "./modules/wireDialogs";


/*
 * KF ReadyQueue Module: kfMktoMetaFields
 * --------------------------------------------------------
 * Purpose:
 *   Leverage window.kfMeta to populate Marketo form hidden fields.
 *   Mirrors the legacy behavior of reading <meta> tags and calling
 *   form.addHiddenFields(...) for specific keys like:
 *     - "capabilities-interest" -> "capabilitiesInterest"
 *     - "lob-interest"          -> "lOBInterest"
 *
 * Prereqs:
 *   - kfMetaCapture has already run and set window.kfMeta
 *   - MktoForms2 is present on the page (Marketo Forms 2.0)
 *
 * Integration:
 *   (window.__readyQueue = window.__readyQueue || []).push(kfMktoMetaFields);
 *
 * Configuration (optional, set before this module runs):
 *   window.kfMktoMetaFieldsConfig = {
 *     mapping: {
 *       "capabilities-interest": "capabilitiesInterest",
 *       "lob-interest": "lOBInterest"
 *     },
 *     includeEmpty: false,               // skip empty fields if false
 *     requireFormSelector: ".marketoform" // ensures form container is present
 *   }
 */

const kfMktoMetaFields = {
    name: "kfMktoMetaFields",
    fn: () => {
        const DEFAULTS = {
            mapping: {
                "capabilities-interest": "capabilitiesInterest",
                "lob-interest": "lOBInterest"
            },
            includeEmpty: false,
            requireFormSelector: ".mktoForm"
        };

        const config = Object.assign({}, DEFAULTS, window.kfMktoMetaFieldsConfig || {});

        function hasRequiredContainer() {
            if (!config.requireFormSelector) return true;
            try {
                return document.querySelector(config.requireFormSelector) != null;
            } catch {
                return false;
            }
        }

        function normalizeValue(value) {
            if (value == null) return "";
            return String(value);
        }

        function safeAddHiddenFields(form, payload) {
            if (payload && Object.keys(payload).length) {
                try {
                    form.addHiddenFields(payload);
                } catch (error) {
                    console.warn("[kfMktoMetaFields] addHiddenFields failed:", error);
                }
            }
        }

        function buildPayloadFromKfMeta(kfMeta) {
            const payload = {};
            for (const [metaKey, fieldName] of Object.entries(config.mapping)) {
                if (!(metaKey in kfMeta)) continue;
                const value = normalizeValue(kfMeta[metaKey]).trim();
                if (!config.includeEmpty && value === "") continue;
                payload[fieldName] = value;
            }
            return payload;
        }

        if (!window.MktoForms2) {
            console.warn("[kfMktoMetaFields] MktoForms2 not found; skipping.");
            return;
        }

        if (!window.kfMeta || typeof window.kfMeta !== "object") {
            console.warn("[kfMktoMetaFields] window.kfMeta not found; did kfMetaCapture run?");
        }

        window.MktoForms2.whenReady(form => {
            try {
                if (!hasRequiredContainer()) return;
                const meta = window.kfMeta || {};
                const payload = buildPayloadFromKfMeta(meta);
                if (Object.keys(payload).length === 0) return;
                safeAddHiddenFields(form, payload);
            } catch (error) {
                console.warn("[kfMktoMetaFields] Error during population:", error);
            }
        });

        return true;
    }
};

/*
 * KF ReadyQueue + Generic Form Loader
 *
 * Expects containers like:
 *   <div class="kf-mktoform"
 *        data-kf-mktoform="1234"
 *        data-enable-form="true"
 *        data-redirect="false" or "true" (default: false)
 *        data-redirect-url="https://www.kornferry.com/contact" (optional)
 *   </div>
 *
 * Rules:
 * - If a .kf-mktoform already contains a <form> element. i.e., form instantiated already,
 *   do NOT proceed for that container and log a warning.
 * - If data-redirect="true" AND data-redirect-url is provided, redirect there on success.
 *   Otherwise, do NOT redirect (default is to NOT redirect).
 */

const kfMktoGenericFormLoader = {
    name: "kfMktoGenericFormLoader",
    fn: () => {
        const containers = document.querySelectorAll(".kf-mktoform");
        if (!containers.length) {
            console.debug("[mktoform] No .kf-mktoform containers found; nothing to do.");
            return;
        }

        // --- configuration (hardcoded Marketo details) ---
        const MUNCHKIN = "251-OLR-958";
        const INSTANCE = "//discover.kornferry.com";

        // --- helpers ---
        const parseBool = (v) => typeof v === "string" && v.toLowerCase() === "true";

        function isAllowedRedirect(url) {
            try {
                const u = new URL(url, window.location.origin);
                // allow only http/https
                if (!/^https?:$/.test(u.protocol)) return false;

                // optional: restrict to Korn Ferry domains
                const allowedDomains = ["kornferry.com", "www.kornferry.com"];
                if (!allowedDomains.some((d) => u.hostname === d || u.hostname.endsWith("." + d))) {
                    console.warn("[mktoform] Redirect URL not in allowed domain list:", u.hostname);
                    return false;
                }

                return true;
            } catch {
                return false;
            }
        }

        // --- main logic ---
        containers.forEach((container) => {
            const enabled = container.getAttribute("data-enable-form");
            if (!parseBool(enabled)) {
                console.debug("[mktoform] data-enable-form is not true; skipping this container.", container);
                return;
            }

            if (container.__kfMktoInit) {
                console.debug("[mktoform] already initialized; skipping.", container);
                return;
            }

            const preExistingForm = container.querySelector("form");
            if (preExistingForm) {
                console.warn("[mktoform] Container already has a <form>; not instantiating Mkto form.", container);
                return;
            }

            const formIdAttr = container.getAttribute("data-kf-mktoform");
            const formId = formIdAttr && String(formIdAttr).trim();
            if (!formId || !/^\d+$/.test(formId)) {
                console.error("[mktoform] data-kf-mktoform missing or not an integer.", container);
                return;
            }

            container.__kfMktoInit = true;
            const targetFormId = "mktoForm_" + formId;

            // Create a target <form> so Mkto renders where we want
            const mount = document.createElement("form");
            mount.id = targetFormId;
            mount.setAttribute("data-kf-generated", "true");
            container.appendChild(mount);

            // Redirect flags
            const redirectFlag = parseBool(container.getAttribute("data-redirect") || "false");
            const redirectUrl = (container.getAttribute("data-redirect-url") || "").trim();

            function wireHooks(form) {
                try {
                    form.onValidate(function (isValid) {
                        console.debug("[mktoform] onValidate valid=%o", isValid);
                    });

                    form.onSuccess(function () {
                        if (redirectFlag && redirectUrl && isAllowedRedirect(redirectUrl)) {
                            console.info("[mktoform] onSuccess -> redirecting to", redirectUrl);
                            window.location.assign(redirectUrl);
                            return false; // prevent Mkto default thank-you
                        }

                        console.info("[mktoform] onSuccess -> no redirect; allowing default Mkto thank-you.");
                        return true; // allow inline Marketo thank-you behavior
                    });

                    const formElem = form.getFormElem()[0];

                    // remove the first <style> tag that Mkto injects (if present)
                    const styleTag = formElem.querySelector("style");
                    if (styleTag) styleTag.remove();

                    // restyle submit button if present (button or input)
                    const submitBtn =
                        formElem.querySelector('button[type="submit"]') ||
                        formElem.querySelector('input[type="submit"]');
                    if (submitBtn) submitBtn.classList.add("btn");

                    container.__kfMkto = {
                        form,
                        dump() {
                            console.log("[mktoform] values", form.vals());
                        },
                        set(obj) {
                            form.setValues(obj);
                        },
                        submit() {
                            form.submit();
                        },
                    };

                    console.log("[mktoform] Form wired and ready (#%s).", formId);
                } catch (e) {
                    console.error("[mktoform] wiring hooks failed", e);
                }
            }

            function loadForm() {
                if (!window.MktoForms2) {
                    console.error("[mktoform] MktoForms2 not found. Ensure Marketo Forms2 is preloaded.");
                    return;
                }

                try {
                    window.MktoForms2.loadForm(INSTANCE, MUNCHKIN, Number(formId), function (form) {
                        wireHooks(form);
                    });
                } catch (e) {
                    console.error("[mktoform] loadForm threw", e);
                }
            }

            loadForm();
        });
    },
};

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

const kfPluralTextToggle = {
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
    {
        name: "updateFooterYear",
        fn: () => {
            const year = String(new Date().getFullYear());
            document.querySelectorAll('[data-footer-year]').forEach(el => {
                el.textContent = year;
            });
        }
    },

    // Office card city/state comma logic
    {
        name: "updateOfficeCardCityState",
        fn: () => {
            document.querySelectorAll('p[data-city-string="true"]').forEach(container => {
                const city = container.querySelector('[data-kf-office="city"]');
                const state = container.querySelector('[data-kf-office="state"]');
                const comma = container.querySelector('[data-kf-office="optional-comma"]');
                const space = container.querySelector('[data-kf-office="optional-space"]');

                const isVisibleAndHasText = el => el && el.textContent.trim() !== '' && el.offsetParent !== null;

                const hasCity = isVisibleAndHasText(city);
                const hasState = isVisibleAndHasText(state);

                if (comma) {
                    if (hasCity && hasState) {
                        comma.style.display = '';
                        if (space) space.style.display = '';
                    } else {
                        comma.style.display = 'none';
                        if (space) space.style.display = 'none';
                    }
                }
            });
        }
    },

    // Close other accordions of the same data-kf-accordion-type
    {
        name: "accordionCloseSiblings",
        fn: () => {
            // Only register once per page load (task name dedupe covers us)
            const esc = (s) => (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/"/g, '\\"');
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
    },

    // Update see all consultants button query
    {
        name: "applyQueryParamWhitelistedAttrs",
        fn: () => {
            const rq = window.__readyQueue || {};
            const utils = (rq && rq.utils) || {};
            const addQueryToDescendantLink = utils.addQueryToDescendantLink;

            if (typeof addQueryToDescendantLink !== "function") {
                console.warn("[applyQueryParamWhitelistedAttrs] Missing utils.addQueryToDescendantLink; did setupUtils run?");
                return;
            }

            // Whitelist of attributes and their default param key when not key=value pairs
            const ATTR_MAP = [
                {attr: "data-kf-office-query", param: "office"},
                {attr: "data-kf-region-query", param: "tab"},
                {attr: "data-kf-capabilities-query", param: "insights-capabilities"},
                // add more here as needed
            ];

            ATTR_MAP.forEach(({attr, param}) => {
                addQueryToDescendantLink({attr, param});
            });
        }
    },

    // {
    //     name: "regionTabControl",
    //     fn: () => {
    //         // Parse URL params
    //         function getUrlParameter(name) {
    //             name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
    //             const regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
    //             const results = regex.exec(location.search);
    //             return results === null ? null : decodeURIComponent(results[1].replace(/\+/g, ' '));
    //         }
    //
    //         // Map string-based tabs to their numeric equivalent
    //         const tabMap = {
    //             "north-america": 1,
    //             "latin-america": 2,
    //             "asia-pacific": 3,
    //             "emea": 4,
    //             "europe-middle-east-africa": 4,
    //         };
    //
    //         function activateTab(tabIndex) {
    //             if (tabIndex && tabIndex >= 1 && tabIndex <= 4) {
    //                 const tabId = "tab-" + tabIndex;
    //                 // Trigger tab click
    //                 $('[data-w-tab="' + tabId + '"]').trigger('click');
    //                 // Sync dropdown
    //                 $('#kf-geo-tab-switcher').val(tabId);
    //             }
    //         }
    //
    //         // --- URL param initialization ---
    //         const tabParam = getUrlParameter('tab');
    //         if (tabParam) {
    //             let tabIndex;
    //             if (!isNaN(tabParam)) {
    //                 tabIndex = parseInt(tabParam, 10);
    //             } else {
    //                 const key = tabParam.toLowerCase().replace(/\s+/g, '-').replace(/_/g, '-');
    //                 tabIndex = tabMap[key];
    //             }
    //             activateTab(tabIndex);
    //         }
    //
    //         // --- Dropdown change listener ---
    //         $('#kf-geo-tab-switcher').on('change', function () {
    //             const selectedVal = $(this).val(); // e.g. "tab-2"
    //             $('[data-w-tab="' + selectedVal + '"]').trigger('click');
    //         });
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
