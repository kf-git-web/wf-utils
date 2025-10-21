import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { minify } from "terser";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- Config (can be overridden via CLI) ----
const SRC_DIR = path.resolve(__dirname, "src");
const DIST_DIR = path.resolve(__dirname, "dist");
const DEFAULT_OUT = path.resolve(DIST_DIR, "bundle.min.js");

// CLI: node minify.mjs [outFile] [--sourcemap]
const argv = process.argv.slice(2);
const OUT_FILE = path.resolve(DIST_DIR, argv[0] || path.relative(DIST_DIR, DEFAULT_OUT));
const WITH_SOURCEMAP = argv.includes("--sourcemap");

// ---- Helpers ----
async function ensureDir(dir) {
    await fs.mkdir(dir, { recursive: true });
}

function isCodeFile(fp) {
    const ext = path.extname(fp).toLowerCase();
    return (ext === ".js" || ext === ".mjs");
}

function orderKey(fp) {
    // Prefer numeric prefix (e.g., "00_loader.js") to control ordering; then alphabetical.
    const base = path.basename(fp).toLowerCase();
    const m = base.match(/^(\d+)[-_]/); // capture leading number
    const num = m ? String(m[1]).padStart(6, "0") : "999999";
    // Use folder depth to keep parents first, then by numeric prefix + filename
    const depth = fp.split(path.sep).length;
    return `${String(depth).padStart(3, "0")}_${num}_${base}`;
}

async function walk(dir, acc = []) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
        // skip hidden files/dirs like .DS_Store
        if (e.name.startsWith(".")) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
            await walk(full, acc);
        } else if (isCodeFile(full)) {
            acc.push(full);
        }
    }
    return acc;
}

async function readAll(files) {
    const parts = [];
    for (const fp of files) {
        const code = await fs.readFile(fp, "utf8");
        // strip any shebangs just in case
        const cleaned = code.replace(/^#!.*\n/, "");
        parts.push(`\n// ----- ${path.relative(SRC_DIR, fp)} -----\n${cleaned}\n`);
    }
    return parts.join("\n");
}

// ---- Main ----
async function run() {
    try {
        const files = await walk(SRC_DIR);
        if (files.length === 0) {
            throw new Error(`No .js/.mjs files found in ${SRC_DIR}`);
        }

        // deterministic ordering
        files.sort((a, b) => (orderKey(a) < orderKey(b) ? -1 : orderKey(a) > orderKey(b) ? 1 : 0));

        await ensureDir(DIST_DIR);

        const bundle = await readAll(files);

        const terserOpts = {
            compress: true,
            mangle: true,
            format: { comments: false },
            sourceMap: WITH_SOURCEMAP
                ? { filename: path.basename(OUT_FILE), url: path.basename(OUT_FILE) + ".map" }
                : false,
            // If you need to keep function/class names for debugging:
            // mangle: { keep_fnames: true }, compress: { keep_fnames: true }
            ecma: 2020,
            module: false, // set to true if your code is ESM-only and you want Terser to assume modules
        };

        const result = await minify(bundle, terserOpts);
        if (!result.code) throw new Error("Terser produced no output.");

        await fs.writeFile(OUT_FILE, result.code, "utf8");
        if (WITH_SOURCEMAP && result.map) {
            await fs.writeFile(OUT_FILE + ".map", result.map, "utf8");
        }

        console.log(`✅ Minified ${files.length} files -> ${OUT_FILE} (${result.code.length} bytes)`);
        if (WITH_SOURCEMAP) console.log(`🗺  Source map -> ${OUT_FILE}.map`);
    } catch (err) {
        console.error("❌ Minification failed:", err.message);
        process.exitCode = 1;
    }
}

run();
