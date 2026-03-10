# kf-wf-utils

Simple utilities split into modules and bundled for use in Webflow or other pages.

## Overview
- Source modules live in `src/modules` (small, focused JS modules).
- The project uses Vite for bundling.
- The build produces a minified bundle `bundle.min.js` which is published to a Webflow site footer Custom Code.
  - In the future, this should be added as a JavaScript external script.

## Build (Vite) and use
- Install dependencies:
    - `npm install`
- Build the bundle:
    - `npm run build`
    - (Hint: You can run `npx vite` but you will just get a hello world HTML file. Maybe we can use this for testing later.)
- After building, check the `dist/` for the produced JS file. Copy the contents into the area inside Webflow site footer Custom Code.
- As an IIFE, the bundle will execute immediately when the page loads.

## Adding a New Module

1. **Create the module file** in `src/modules/yourModuleName.js`.
   - Export a single object with a `name` string and a `fn` function.
   - `fn` contains all initialization logic; no need to listen for `DOMContentLoaded` — the queue handles that.
   - Example shape:
     ```js
     export const yourModuleName = {
         name: "yourModuleName",
         fn: () => {
             // DOM manipulation here
         }
     };
     ```

2. **Register it in `src/tasks-and-queue.js`**:
   - Add an import at the top with the other module imports.
   - Add the exported object to the `.push(...)` call near the bottom, with a short comment describing its purpose.

3. **Rebuild** with `npm run build` and deploy the updated `dist/` bundle.

> See `src/blank queue item.js` for a minimal copy-paste template.

## HTML Backups
- Some HTML content has been backed up in `/html` for reference, but it is largely deprecated.