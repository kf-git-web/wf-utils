// separate from modules for now
(() => {
    const DELIMITER = "|";
    const OVERWRITE_EXISTING = false;

    const normalize = s => (s || "").replace(/\s+/g, " ").trim();

    const setMeta = (name, value) => {
        if (!name || !value) return;
        const head = document.head;
        let meta = head.querySelector(`meta[name="${CSS.escape(name)}"]`);
        if (meta) {
            const existing = meta.getAttribute("content") || "";
            if (!OVERWRITE_EXISTING && existing.trim() !== "") {
                console.log(`[MetaTags] Skipping ${name} (already has content: "${existing}")`);
                return;
            }
        } else {
            meta = document.createElement("meta");
            meta.setAttribute("name", name);
            head.appendChild(meta);
            console.log(`[MetaTags] Created new <meta name="${name}">`);
        }
        meta.setAttribute("content", value);
        console.log(`[MetaTags] Updated <meta name="${name}"> → "${value}"`);
    };

    const run = () => {
        const root = document.getElementById("meta-tags");
        if (!root) {
            console.log("[MetaTags] #meta-tags not found. Script exiting.");
            return;
        }

        console.log("[MetaTags] Found #meta-tags, scanning…");

        const sections = root.querySelectorAll(':scope div[id^="meta-"]');

        const idCounts = {};
        sections.forEach(s => { idCounts[s.id] = (idCounts[s.id] || 0) + 1; });
        Object.entries(idCounts).forEach(([id, count]) => {
            if (count > 1) console.warn(`[MetaTags] Duplicate section ID detected: "${id}" appears ${count} times`);
        });

        sections.forEach(section => {
            const sectionId = section.id || "(no id)";

            // meta-date is a special case for static pages that use the Meta Generator component
            // use the plain text content of the div directly
            if (section.id === "meta-date") {
                const dateContent = normalize(section.textContent);
                if (dateContent) setMeta("date", dateContent);
                else console.log(`[MetaTags] #meta-date found but has no content`);
                return;
            }

            if (section.querySelector(".w-dyn-empty")) {
                console.log(`[MetaTags] Skipping ${sectionId} (empty dataset)`);
                return;
            }

            const values = Array.from(section.querySelectorAll(".w-embed"))
                .map(el => normalize(el.textContent))
                .filter(Boolean);

            if (!values.length) {
                console.log(`[MetaTags] No .w-embed values found for ${sectionId}`);
                return;
            }

            const content = Array.from(new Set(values)).join(DELIMITER);
            const name = normalize(section.getAttribute("data-meta-name") || section.id.replace(/^meta-/, ""));
            if (!name) {
                console.log(`[MetaTags] Could not determine meta name for ${sectionId}`);
                return;
            }

            console.log(`[MetaTags] ${sectionId} → ${name} = "${content}"`);
            setMeta(name, content);
        });
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", run);
    } else {
        run();
    }
})();
