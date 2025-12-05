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
export const kfMktoGenericFormLoader = {
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