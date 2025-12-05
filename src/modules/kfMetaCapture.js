/*
 * KF ReadyQueue Module: kfMetaCapture
 * --------------------------------------------------------
 * Purpose:
 *   Capture sanitized <meta name="..."> tags from <head>
 *   on page hydrate and expose them globally as window.kfMeta
 *
 * Usage:
 *   (window.__readyQueue = window.__readyQueue || []).push({
 *     name: "kfMetaCapture",
 *     fn: kfMetaCapture.fn
 *   });
 *
 * Configuration (optional):
 *   window.kfMetaConfig = {
 *     include: [...],             // exact meta names to include
 *     exclude: [...],             // exact meta names to skip
 *     includePrefixes: [...],     // any meta whose name starts with one of these
 *     includeAllNamed: false,     // include every <meta name="..."> tag
 *     includeEmpty: false,        // include empty values
 *     dedupeArrays: true,         // dedupe multiple same-name tags
 *     trimValues: true,           // trim whitespace
 *     exposeAs: "kfMeta",         // global variable name
 *     dompurifyOptions: {         // optional DOMPurify config override
 *       ALLOWED_TAGS: [],
 *       ALLOWED_ATTR: []
 *     }
 *   }
 *
 * Global Outputs:
 *   window.kfMeta       — object of meta name/value pairs
 *   window.KF.meta.capture() — re-scan helper
 *
 * Dependencies:
 *   - DOMPurify (optional, for sanitization)
 *
 * Security Notes:
 *   - Falls back to a textContent-based sanitizer if DOMPurify missing.
 *   - Rejects invalid meta names via strict regex.
 */

export const kfMetaCapture = {
    name: "kfMetaCapture",
    fn: () => {
        const w = window;
        const d = document;

        const DEFAULT_INCLUDED = [
            "type",
            "categories",
            "topics",
            "consultants",
            "capabilities",
            "industries",
            "region",
            "functions",
            // MOPS
            "model",
            "capabilities-interest",
            "lob-interest"
        ];

        const DEFAULTS = {
            include: DEFAULT_INCLUDED,
            exclude: [],
            includePrefixes: [],
            includeAllNamed: false,
            includeEmpty: false,
            dedupeArrays: true,
            trimValues: true,
            exposeAs: "kfMeta",
            dompurifyOptions: {
                ALLOWED_TAGS: [],
                ALLOWED_ATTR: []
            }
        };

        const NAME_TOKEN_RE = /^[A-Za-z0-9_:.-]+$/;

        function resolveConfig() {
            const user = w.kfMetaConfig || {};
            return Object.assign({}, DEFAULTS, user);
        }

        function sanitizeString(input, cfg) {
            const str = input == null ? "" : String(input);
            if (w.DOMPurify && typeof w.DOMPurify.sanitize === "function") {
                return w.DOMPurify.sanitize(str, cfg.dompurifyOptions || DEFAULTS.dompurifyOptions);
            }
            // fallback: text-only sanitize
            const tmp = d.createElement("span");
            tmp.textContent = str;
            return tmp.textContent || "";
        }

        function sanitizeNameToken(nameRaw, cfg) {
            const name = sanitizeString(nameRaw, cfg).trim();
            if (!NAME_TOKEN_RE.test(name)) return "";
            return name;
        }

        function shouldInclude(name, cfg) {
            if (!name) return false;
            if (cfg.exclude.includes(name)) return false;
            if (cfg.includeAllNamed) return true;
            if (cfg.include.includes(name)) return true;
            return cfg.includePrefixes.some(p => name.startsWith(p));
        }

        function pushValue(target, key, value, dedupe) {
            if (key in target) {
                const curr = target[key];
                if (Array.isArray(curr)) {
                    if (dedupe) {
                        if (!curr.includes(value)) curr.push(value);
                    } else {
                        curr.push(value);
                    }
                } else {
                    target[key] = dedupe
                        ? (curr === value ? [curr] : [curr, value])
                        : [curr, value];
                }
            } else {
                target[key] = value;
            }
        }

        function collectMeta(cfg) {
            const metas = d.head ? d.head.querySelectorAll("meta[name]") : [];
            const out = {};

            metas.forEach(meta => {
                const rawName = meta.getAttribute("name");
                const name = sanitizeNameToken(rawName, cfg);
                if (!shouldInclude(name, cfg)) return;

                let content = meta.getAttribute("content");
                content = sanitizeString(content, cfg);
                if (cfg.trimValues) content = content.trim();
                if (!cfg.includeEmpty && content === "") return;

                pushValue(out, name, content, cfg.dedupeArrays);
            });

            return out;
        }

        function expose(meta, cfg) {
            const key = cfg.exposeAs || "kfMeta";
            w[key] = meta;

            w.KF = w.KF || {};
            w.KF.meta = w.KF.meta || {};
            w.KF.meta.capture = function (customConfig) {
                const merged = Object.assign({}, resolveConfig(), customConfig || {});
                const latest = collectMeta(merged);
                w[merged.exposeAs || "kfMeta"] = latest;
                return latest;
            };
        }

        function hydrate() {
            const cfg = resolveConfig();
            if (!w.DOMPurify && !hydrate._warned) {
                hydrate._warned = true;
                console.warn(
                    "[kfMetaCapture] DOMPurify not detected; using text-only fallback sanitizer."
                );
            }
            const data = collectMeta(cfg);
            expose(data, cfg);
            return data;
        }

        return hydrate();
    }
};
