export const applyQueryParamWhitelistedAttrs = {
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
};