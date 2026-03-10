/**
 * Module that wraps the innerHTML of elements with font-reduction modifier classes
 * in a child <span class="dynamic-reduce">, allowing percentage-based font-size to
 * resolve against the parent's computed value.
 *
 * Target classes: reduce-fs-percent-90, -80, -70, -60, -50
 *
 * Call `fontSizeReducer.fn()` to initialize:
 *  - Queries all elements matching any target class.
 *  - Moves child nodes into a <span class="dynamic-reduce"> if not already wrapped.
 *  - Skips elements whose sole element child is already .dynamic-reduce.
 *
 * @namespace fontSizeReducer
 * @property {string} name - Module name identifier, `"fontSizeReducer"`.
 * @property {function(): void} fn - Initialization function.
 */

const CLASSES = [
    'reduce-fs-percent-90',
    'reduce-fs-percent-80',
    'reduce-fs-percent-70',
    'reduce-fs-percent-60',
    'reduce-fs-percent-50',
    'reduce-fs-percent-40'
];

export const fontSizeReducer = {
    name: "fontSizeReducer",
    fn: () => {
        const selector = CLASSES.map(c => `.${c}`).join(', ');
        document.querySelectorAll(selector).forEach(el => {
            if (
                el.children.length === 1 &&
                el.children[0].classList.contains('dynamic-reduce')
            ) return;

            const span = document.createElement('span');
            span.className = 'dynamic-reduce';
            span.append(...el.childNodes);
            el.appendChild(span);
        });
    }
};
