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
export const kfMktoMetaFields = {
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