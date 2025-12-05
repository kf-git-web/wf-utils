// src/modules/updateLinkTargetsForDomains.js
// Task: updateLinkTargetsForDomains
// Purpose: Add target="_blank" and rel="noopener noreferrer" to links matching configured domains

/**
 * updateLinkTargetsForDomains
 *
 * ReadyQueue task that finds anchor elements whose host matches a configured
 * domain list and updates their target/rel attributes to open in a new tab
 * safely (noopener noreferrer). This implementation uses jQuery when present
 * (keeps parity with the original code base).
 *
 * Behavior:
 * - If window.jQuery is not available, the task logs a warning and returns.
 * - Skips anchors that have certain href schemes (mailto:, tel:, #, javascript:, data:).
 * - Respects an element-level skip attribute configured in the task.
 */
export const updateLinkTargetsForDomains = {
    name: "updateLinkTargetsForDomains",
    fn: () => {
        const $ = window.jQuery;
        if (!$) {
            console.warn("[updateLinkTargetsForDomains] jQuery not found; skipping.");
            return;
        }

        // ---- Configuration ----
        const config = {
            matchDomains: ["google.com", "*.google.com"],
            ignoreSelectors: [".w-nav", "[data-no-link-scan]", ".korn-ferry-mast-library--cc-footer"],
            skipAttr: "data-skip-link-update"
        };

        const hasSkipAttr = (el) => $(el).attr(config.skipAttr) === "true";

        const isInsideIgnoredContainer = (el) =>
            config.ignoreSelectors.some(sel => el.closest(sel).length);

        const isProcessableHref = (href) => {
            if (!href) return false;
            const lower = href.trim().toLowerCase();
            return !(
                lower.startsWith("#") ||
                lower.startsWith("javascript:") ||
                lower.startsWith("mailto:") ||
                lower.startsWith("tel:") ||
                lower.startsWith("data:")
            );
        };

        const makeDomainMatcher = (patterns) => {
            const normalized = patterns
                .map(p => (p || "").trim().toLowerCase())
                .filter(Boolean)
                .map(p => p.startsWith("*.") ? {type: "wildcard", value: p.slice(2)} : {type: "exact", value: p});

            return (host) => {
                if (!host) return false;
                const h = host.toLowerCase();
                if (normalized.some(n => n.type === "exact" && n.value === h)) return true;
                for (const n of normalized) {
                    if (n.type !== "wildcard") continue;
                    if (h.length > n.value.length && h.endsWith("." + n.value)) return true;
                }
                return false;
            };
        };

        const matchesDomain = makeDomainMatcher(config.matchDomains);

        const ensureRelTokens = (el, tokens) => {
            const current = ($(el).attr("rel") || "").split(/\s+/).filter(Boolean);
            const set = new Set(current);
            tokens.forEach(t => set.add(t));
            $(el).attr("rel", Array.from(set).join(" "));
        };

        const processLinks = () => {
            $("a[href]").each(function () {
                const a = this;
                if (hasSkipAttr(a)) return;
                if (isInsideIgnoredContainer($(a))) return;

                const href = $(a).attr("href");
                if (!isProcessableHref(href)) return;

                let host = "";
                try {
                    host = new URL(href, window.location.href).hostname;
                } catch {
                    return;
                }

                if (!matchesDomain(host)) return;

                $(a).attr("target", "_blank");
                ensureRelTokens(a, ["noopener", "noreferrer"]);
            });
        };

        // Run once on readyQueue drain
        processLinks();
    }
};

