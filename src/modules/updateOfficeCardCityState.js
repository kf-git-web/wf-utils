/**
 * Module that updates the visibility of optional punctuation and spacing
 * in office card city and state elements based on their content and visibility.
 *
 * Call `updateOfficeCardCityState.fn()` to initialize:
 *  - Selects all `<p>` elements with the `data-city-string="true"` attribute.
 *  - For each container:
 *    - Retrieves child elements for city, state, optional comma, and optional space.
 *    - Checks if the city and state elements are visible and have non-empty text.
 *    - Updates the display style of the optional comma and space based on the presence
 *      of both city and state.
 *
 * @namespace updateOfficeCardCityState
 * @property {string} name - Module name identifier, `"updateOfficeCardCityState"`.
 * @property {function(): void} fn - Initialization function that processes city and state elements.
 */

export const updateOfficeCardCityState ={
    name: "updateOfficeCardCityState",
    fn: () => {
        document.querySelectorAll('p[data-city-string="true"]').forEach(container => {
            const city = container.querySelector('[data-kf-office="city"]');
            const state = container.querySelector('[data-kf-office="state"]');
            const comma = container.querySelector('[data-kf-office="optional-comma"]');
            const space = container.querySelector('[data-kf-office="optional-space"]');

            const isVisibleAndHasText = el => el && el.textContent.trim() !== '' && el.offsetParent !== null;

            const hasCity = isVisibleAndHasText(city);
            const hasState = isVisibleAndHasText(state);

            if (comma) {
                if (hasCity && hasState) {
                    comma.style.display = '';
                    if (space) space.style.display = '';
                } else {
                    comma.style.display = 'none';
                    if (space) space.style.display = 'none';
                }
            }
        });
    }
};