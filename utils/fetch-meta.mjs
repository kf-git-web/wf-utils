/**
 * fetch-meta.mjs
 * Bulk-fetches a list of URLs and prints filtered <meta> tag attributes.
 *
 * Applies the same filter used in the browser console:
 *   exclude meta tags whose outerHTML contains any of the ignored strings.
 *
 * Usage:
 *   node utils/fetch-meta.mjs
 *   node utils/fetch-meta.mjs --json          (output as JSON)
 *   node utils/fetch-meta.mjs --concurrency 3 (default: 3)
 */

// ── URLs ──────────────────────────────────────────────────────────────────────
const URLS = [
    "https://www.kornferry.com/insights/briefings-magazine/briefings-issue-72-flipbook"
    // "https://www.kornferry.com/insights/briefings-magazine/issue-72",
    // "https://www.kornferry.com/insights/briefings-magazine/issue-72/the-advantage-of-enterprise-resilience",
    // "https://www.kornferry.com/insights/briefings-magazine/issue-72/uks-magical-ride-to-ai-superpower",
    // "https://www.kornferry.com/insights/briefings-magazine/issue-72/ai-skills-are-important-up-to-a-point",
    // "https://www.kornferry.com/insights/briefings-magazine/issue-72/always-the-hire-never-the-fire",
    // "https://www.kornferry.com/insights/briefings-magazine/issue-72/ai-and-iq-can-leaders-have-it-all",
    // "https://www.kornferry.com/insights/briefings-magazine/issue-72/outsmarting-ai",
    // "https://www.kornferry.com/insights/briefings-magazine/issue-72/a-change-of-diet-a-case-of-indigestion",
    // "https://www.kornferry.com/insights/briefings-magazine/issue-72/beat-the-odds",
];

// ── Config ────────────────────────────────────────────────────────────────────
const IGNORED = [
    "twitter", "og", "viewport", "lang", "tags", "article-date",
    "template", "robots", "image", "thumbnail", "open-redirect-in-new-tab",
    "keywords", "utf-8", "description",
];

const DEFAULTS = {
    concurrency: 3,
    retries: 3,
    baseDelayMs: 500,   // doubles each retry + jitter
    timeoutMs: 15_000,
};

// ── CLI flags ─────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const AS_JSON = argv.includes("--json");
const concurrency = (() => {
    const i = argv.indexOf("--concurrency");
    return i !== -1 ? parseInt(argv[i + 1], 10) || DEFAULTS.concurrency : DEFAULTS.concurrency;
})();

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Sleep for `ms` milliseconds. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Exponential backoff with ±20% jitter. */
function backoffMs(attempt, base = DEFAULTS.baseDelayMs) {
    const exp = base * Math.pow(2, attempt);
    const jitter = exp * 0.2 * (Math.random() * 2 - 1);
    return Math.round(exp + jitter);
}

/**
 * Fetch a URL with timeout, retrying on network errors or 5xx responses.
 * Returns the response text, or throws after all retries are exhausted.
 */
async function fetchWithRetry(url, { retries = DEFAULTS.retries, timeoutMs = DEFAULTS.timeoutMs } = {}) {
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(url, {
                signal: controller.signal,
                headers: { "User-Agent": "Mozilla/5.0 (compatible; kf-meta-fetcher/1.0)" },
            });
            clearTimeout(timer);
            if (res.ok) return await res.text();
            // Retry on server errors; surface client errors immediately.
            if (res.status < 500) throw new Error(`HTTP ${res.status}`);
            lastErr = new Error(`HTTP ${res.status}`);
        } catch (err) {
            clearTimeout(timer);
            lastErr = err;
        }
        if (attempt < retries) {
            const delay = backoffMs(attempt);
            console.error(`  [retry ${attempt + 1}/${retries}] ${url} — ${lastErr.message} — waiting ${delay}ms`);
            await sleep(delay);
        }
    }
    throw lastErr;
}

/**
 * Parse all <meta> tags from an HTML string and return their outerHTML strings.
 * Meta tags are void elements, so a simple regex is reliable here.
 */
function extractMetaTags(html) {
    const matches = [];
    const re = /<meta\b[^>]*\/?>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        matches.push(m[0]);
    }
    return matches;
}

/**
 * Apply the same filter used in the browser console:
 * keep only meta tags whose outerHTML does NOT contain any ignored string.
 */
function filterMetaTags(tags) {
    return tags.filter((outerHTML) => {
        const lower = outerHTML.toLowerCase();
        return !IGNORED.some((s) => lower.includes(s));
    });
}

/**
 * Parse name/property/content attributes from a meta tag's outerHTML into an object.
 */
function parseAttrs(outerHTML) {
    const attrs = {};
    const re = /(\w[\w-]*)=["']([^"']*)["']/g;
    let m;
    while ((m = re.exec(outerHTML)) !== null) {
        attrs[m[1]] = m[2];
    }
    return attrs;
}

// ── Pool executor ─────────────────────────────────────────────────────────────

/**
 * Run `tasks` (array of async functions) with a max `poolSize` concurrency.
 * Returns results in the same order as `tasks`.
 */
async function pool(tasks, poolSize) {
    const results = new Array(tasks.length);
    let index = 0;

    async function worker() {
        while (index < tasks.length) {
            const i = index++;
            results[i] = await tasks[i]();
        }
    }

    await Promise.all(Array.from({ length: poolSize }, worker));
    return results;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function processUrl(url) {
    try {
        const html = await fetchWithRetry(url);
        const allTags = extractMetaTags(html);
        const kept = filterMetaTags(allTags);
        return { url, tags: kept.map(parseAttrs), raw: kept };
    } catch (err) {
        return { url, error: err.message };
    }
}

async function main() {
    console.error(`Fetching ${URLS.length} URLs (concurrency=${concurrency})...\n`);

    const tasks = URLS.map((url) => () => processUrl(url));
    const results = await pool(tasks, concurrency);

    if (AS_JSON) {
        console.log(JSON.stringify(results, null, 2));
        return;
    }

    for (const { url, tags, raw, error } of results) {
        console.log(`\n${"─".repeat(80)}`);
        console.log(`URL: ${url}`);
        if (error) {
            console.log(`  ERROR: ${error}`);
            continue;
        }
        if (!tags.length) {
            console.log("  (no matching meta tags)");
            continue;
        }
        for (const attrs of tags) {
            const parts = Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join("  ");
            console.log(`  <meta ${parts}>`);
        }
    }
    console.log(`\n${"─".repeat(80)}`);
}

main().catch((err) => {
    console.error("Fatal:", err);
    process.exitCode = 1;
});
