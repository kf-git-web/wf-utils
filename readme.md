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

## HTML Backups
- Some HTML content has been backed up in `/html` for reference, but it is largely deprecated.