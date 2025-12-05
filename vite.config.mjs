import {defineConfig} from 'vite';
import path from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
    build: {
        lib: {
            entry: path.resolve(__dirname, 'src/tasks-and-queue.js'), // your app entry
            name: 'KFTasks', // global var when using IIFE
            fileName: () => 'bundle.min.js',
            formats: ['iife'] // build as a single IIFE (good for a simple browser bundle)
        },
        sourcemap: true,
        minify: 'esbuild',
    }
});