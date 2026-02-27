export const kfVideoBackgrounds = {
    name: "kfVideoBackgrounds",
    fn: () => {
        const moduleName = "kfVideoBackgrounds";
        if (!window.Vimeo) {
            console.error(`${moduleName} Vimeo Player SDK (window.Vimeo) not available.`);
            return;
        }

        const sanitize = window.__readyQueue?.utils?.sanitize
            || ((str) => String(str || "")
                .replace(/[\u0000-\u001F\u007F]/g, "")
                .replace(/<[^>]*>/g, "")
                .trim()
                .slice(0, 300));

        function validateVimeoUrl(raw, elDescription) {
            if (!raw || !raw.trim()) return null;

            const sanitized = sanitize(raw);

            let url;
            try { url = new URL(sanitized); }
            catch (_) {
                console.warn(`${moduleName} Malformed: ${elDescription}:`, sanitized);
                return null;
            }

            if (url.hostname !== "player.vimeo.com") {
                console.warn(`${moduleName} Non-Vimeo host ${elDescription}:`, url.hostname);
                return null;
            }

            if (!/^\/video\/\d+$/.test(url.pathname)) {
                console.warn(`${moduleName} Invalid video ID path on ${elDescription}:`, url.pathname);
                return null;
            }

            return sanitized;
        }

        function initPlayer(containerEl, validUrl, label) {
            let player;
            try {
                player = new window.Vimeo.Player(containerEl, {
                    url: validUrl,
                    background: true,
                    autopause: false,
                    responsive: false,
                });
            } catch (err) {
                console.error(`${moduleName} Instantiation failed for ${label}:`, err);
                return;
            }

            containerEl.style.position = "relative";
            containerEl.style.overflow = "hidden";

            Promise.all([player.getVideoWidth(), player.getVideoHeight()])
                .then(function (dimensions) {
                    const w = dimensions[0];
                    const h = dimensions[1];
                    const iframe = player.element;
                    if (iframe) {
                        iframe.style.aspectRatio = `${w} / ${h}`;
                        // iframe.style.width = "120%";
                        // iframe.style.height = "auto";
                        // iframe.style.left = "50%";
                        // iframe.style.transform = "translateX(-50%)";
                    }
                    console.log(`${moduleName} Initialized ${label}: ${w}x${h}`);
                    const wrapper = containerEl.closest('[data-kf-video-backgrounds="true"]');
                    if (wrapper) {
                        setTimeout(function () {
                            wrapper.querySelectorAll(".kf-video-bg-helper").forEach(function (el) {
                                el.classList.remove("kf-video-bg-fade-in");
                            });
                        }, 1500);
                    }
                })
                .catch(function (err) {
                    console.warn(`${moduleName} Failed to get dimensions for ${label}, falling back to 16/9:`, err);
                    const iframe = player.element;
                    if (iframe) {
                        iframe.style.aspectRatio = "16 / 9";
                        // iframe.style.width = "120%";
                        // iframe.style.height = "auto";
                        // iframe.style.left = "50%";
                        // iframe.style.transform = "translateX(-50%)";
                    }
                });
        }

        const wrappers = Array.from(
            document.querySelectorAll('[data-kf-video-backgrounds="true"]')
        );

        wrappers.forEach(function (wrapper, i) {
            const label = `wrapper[${i}]`;

            const desktopEl = wrapper.querySelector("[data-kf-video-bg-desktop]");
            const mobileEl  = wrapper.querySelector("[data-kf-video-bg-mobile]");

            if (desktopEl) {
                const raw = desktopEl.getAttribute("data-kf-video-bg-desktop");
                const url = validateVimeoUrl(raw, `${label} desktop`);
                if (url) initPlayer(desktopEl, url, `${label} desktop`);
            }

            if (mobileEl) {
                const raw = mobileEl.getAttribute("data-kf-video-bg-mobile");
                const url = validateVimeoUrl(raw, `${label} mobile`);
                if (url) initPlayer(mobileEl, url, `${label} mobile`);
            }
        });
    }
};
