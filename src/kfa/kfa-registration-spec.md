# KFA Registration Module — Implementation Spec
`kfa-registration.js`

---

## 1. Overview & JSDoc block

```js
/**
 * @module kfa-registration
 * @description
 *   Handles the KF Advance unified registration form (freemium + subscription).
 *   Manages a two-step API sequence: POST /verifyemail → POST /register.
 *   A radio toggle sets the registration Context ("freemium" | "subscription");
 *   all other fields and validation are shared.
 *
 * @usage
 *   Drop script after the form markup. No external dependencies required.
 *   Expects a single <form id="kfaRegForm"> with the field IDs listed in DOM_IDS.
 *
 * @window-config  (all optional, read at init)
 *   window.KFA_DRY_RUN {boolean} — When true, skips all API calls after
 *     validation passes. Logs payload to console. Default: true (safe for staging).
 *     Set to false only when the API team has allowlisted the current origin.
 *
 * @security
 *   - register endpoint requires withCredentials: true (cross-origin cookie).
 *     The serving origin must be allowlisted by the API team before register
 *     calls will succeed. verifyemail does NOT require withCredentials and
 *     can be tested independently on any origin.
 *   - PartnerKey is a non-secret routing key, not an auth token. It is
 *     intentionally embedded in client-side code per the API team's design.
 *   - All user-facing messages are plain strings. No innerHTML interpolation
 *     of API response data; RedirectUrl is only used as a navigation target.
 */
```

---

## 2. Constants

```js
const MODULE = "kfa-registration";

// --- API ---
const PARTNER_KEY = "SVOoQJaeX0eLboUOU0wSoQtt";
const API_BASE    = "https://api.kfadvance.com";
const ENDPOINTS = {
  VERIFY:   API_BASE + "/v1/account/verifyemail",
  REGISTER: API_BASE + "/v1/account/register",
};

// --- Fallback URLs (used when API response lacks RedirectUrl) ---
const FALLBACK_LOGIN_URL   = "https://client.kfadvance.com/login";
const FALLBACK_PARTNER_URL = "PLACEHOLDER_PARTNER_REDIRECT_URL"; // TODO: confirm with API team

// --- Payload static fields (confirmed intentional by reference implementation) ---
const STATIC_REFERER = "Referer Value";
const STATIC_SOURCE  = "Registration-KornFerry";
const STATIC_HREF    = "";
const LANGUAGE_CODE  = "en-US";

// --- Timing (ms) — match reference implementation ---
const REDIRECT_DELAY_DEFAULT = 1000;  // before window.open on non-Safari
const REDIRECT_DELAY_SAFARI  = 1500;  // Safari uses location.href; needs longer message dwell
const POPUP_FOCUS_DELAY      = 500;   // delay before focusing new tab & resetting form
const ERROR_DISPLAY_DURATION = 5000;  // error message auto-clears after this

// --- Password validation ---
// Regex mirrors reference implementation. Server-side may enforce additional rules.
// NOTE: test actual server behavior; server may reject passwords this regex accepts.
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_REGEX      = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;
const PASSWORD_SCORE_PASS = 4;
const PASSWORD_SCORE_FAIL = 2;

// --- Meter values (HTML <meter> element) ---
const METER_EMPTY = 0;
const METER_MAX   = 4;

// --- Context values ---
const CONTEXT = {
  FREE:  "freemium",
  PAID:  "subscription",
};

// --- Verify email response codes ---
const EMAIL_CODE = {
  NOT_FOUND:    "EMAIL_NOTFOUND",
  FOUND:        "EMAIL_FOUND",
  PARTNER:      "PARTNER_EMAIL_FOUND",
};

// --- GTM dataLayer event values ---
const TRACKING = {
  SUCCESS_FREE:        "marketing-freemium-registration",
  SUCCESS_PAID:        "marketing-premium-registration",
  ALREADY_REG_FREE:    "marketing-freemium-alreadyRegistered",
  ALREADY_REG_PAID:    "marketing-premium-alreadyRegisterd",  // sic — matches reference
  ERROR_FREE:          "marketing-freemium-registration",
  ERROR_PAID:          "marketing-premium-registration",
  ERROR_FAILURE:       "marketing-freemium-failure",
};

// --- User-facing messages (approved strings from reference implementation) ---
const MSG = {
  REDIRECT_LOGIN:       "This email has already been registered. You are being redirected to login",
  REDIRECT_PARTNER:     "We detected your account is associated with one of our partners. You are now being redirected to the partner site to register.",
  REDIRECT_SUCCESS:     "You have been registered. You are now being redirected to login",
  ERROR_GENERIC:        "There was an error during the registration. Please try again later",
  ERROR_NETWORK:        "We are experiencing difficulties. We apologize for the inconvenience. Please try again at a later time.",
  FIELD_NAME_INVALID:   "No special characters allowed",
  FIELD_EMAIL_VALID:    "Great! Your email looks good",
  FIELD_PW_REQUIREMENT: "Password must be a minimum of 8 characters with at least one upper and lower case letter and a number.",
  FIELD_PRIVACY:        "You must agree to the terms and conditions in the Global Privacy Policy",
};

// --- DOM IDs / selectors ---
// Centralised here so HTML and JS stay in sync without hunting through the module.
const DOM_IDS = {
  FORM:           "kfaRegForm",
  TOGGLE_FREE:    "toggleFree",    // <input type="radio" name="regType" value="free">
  TOGGLE_PAID:    "togglePaid",    // <input type="radio" name="regType" value="paid">
  FIRST_NAME:     "kfaFirstName",
  LAST_NAME:      "kfaLastName",
  EMAIL:          "kfaEmail",
  PASSWORD:       "kfaPassword",
  CONFIRM_PW:     "kfaConfirmPassword",   // see note §4 re: ConfirmPassword
  PW_REVEAL:      "kfaPwReveal",   // <button> or <span> toggle
  CHECKBOX_PRIVACY:   "kfaPrivacy",    // hidden real checkbox
  CHECKBOX_MARKETING: "kfaMarketing",  // hidden real checkbox
  // Custom styled checkbox triggers (visual spans with role="checkbox")
  CUSTOM_PRIVACY:     "kfaPrivacyCustom",
  CUSTOM_MARKETING:   "kfaMarketingCustom",
  SUBMIT_BTN:     "kfaSubmit",
  LOADING_ICON:   "kfaLoading",
  ERROR_DIV:      "kfaError",       // persistent error display element
  STATUS_MSG:     "kfaStatus",      // friendly redirect/status message display
  // Inline field message elements (sibling to their input)
  MSG_NAME:       "kfaMsgName",
  MSG_EMAIL:      "kfaMsgEmail",
  MSG_PASSWORD:   "kfaMsgPassword",
  MSG_PRIVACY:    "kfaMsgPrivacy",
};
```

---

## 3. Module-level state

```js
// Single mutable state object. No external framework; all UI reads from here.
// Reset via resetState().
let _state = {
  context:     CONTEXT.FREE,   // "freemium" | "subscription" — driven by radio toggle
  isSubmitting: false,          // prevents double-submit
  fieldValidity: {              // per-field pass/fail — drives submit button enable
    firstName:  false,
    lastName:   false,
    email:      false,
    password:   false,
    privacy:    false,          // required checkbox
    // marketing: not required — omitted from validity gate
  },
};

function resetState() {
  _state.isSubmitting = false;
  Object.keys(_state.fieldValidity).forEach(k => { _state.fieldValidity[k] = false; });
  // context intentionally NOT reset — preserve user's toggle choice across retry
}
```

---

## 4. Validation class — `Validator`

```js
/**
 * @class Validator
 * @description Pure validation helpers. No DOM side-effects.
 */
class Validator {
  /**
   * @param {string} value
   * @returns {boolean} true if no special characters or underscores
   */
  isValidName(value) { /* /\W|_/g.test(value) === false */ }

  /**
   * @param {string} value
   * @returns {boolean} true if matches email pattern
   */
  isValidEmail(value) { /* /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(value) */ }

  /**
   * @param {string} value
   * @returns {number} METER_EMPTY | PASSWORD_SCORE_FAIL | PASSWORD_SCORE_PASS
   * @description
   *   Returns METER_EMPTY (0) for empty string.
   *   For length < PASSWORD_MIN_LENGTH: returns PASSWORD_SCORE_FAIL regardless of content.
   *   For length >= PASSWORD_MIN_LENGTH: tests PASSWORD_REGEX.
   *     Pass → PASSWORD_SCORE_PASS (4), Fail → PASSWORD_SCORE_FAIL (2).
   *   NOTE: server-side validation may be stricter. Mark for integration testing.
   */
  scorePassword(value) { /* ... */ }

  /**
   * @param {HTMLFormElement} form
   * @returns {boolean} true if any required field is empty or required checkbox is unchecked
   */
  hasEmptyRequired(form) { /* mirrors reference requiredTest() logic */ }
}
```

**Note on ConfirmPassword:** The reference sends `ConfirmPassword: o.value` — identical to `Password`. The form has no separate confirm field; the API accepts the duplicate. We match this: one password input, `ConfirmPassword` mirrors `Password` in the payload. Calling out explicitly because the HTML spec might suggest adding a second input — don't.

---

## 5. API class — `KfaApi`

```js
/**
 * @class KfaApi
 * @description Wraps fetch calls to the KF Advance API.
 *   Returns Promise resolving to parsed JSON response body.
 *   Rejects on network error or non-2xx status.
 *
 * @note verifyemail: no withCredentials needed.
 *       register: requires credentials: "include". Origin must be allowlisted
 *       by API team before register calls succeed. Gate with DRY_RUN.
 */
class KfaApi {
  /**
   * @param {Object} payload — { UserName, PartnerKey, Context }
   * @returns {Promise<Object>} — { Code, RedirectUrl }
   */
  verifyEmail(payload) {
    // fetch(ENDPOINTS.VERIFY, { method: "POST", headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify(payload) })
    //   .then(res => { if (!res.ok) throw new Error(res.status); return res.json(); })
  }

  /**
   * @param {Object} payload — full register payload (see §6)
   * @returns {Promise<Object>} — { UserKey, RedirectUrl, ... }
   */
  register(payload) {
    // fetch(ENDPOINTS.REGISTER, { method: "POST", credentials: "include",
    //   headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
    //   .then(res => { if (!res.ok) throw new Error(res.status); return res.json(); })
  }
}
```

---

## 6. Payload builder

```js
/**
 * @param {Object} fields — { firstName, lastName, email, password, marketing, privacy }
 * @returns {Object} complete register payload
 * @description
 *   PartnerKey is injected here (not in the form). Context comes from _state.context.
 *   Referer, source, Href, workflow are static per confirmed reference behavior.
 */
function buildPayload(fields) {
  return {
    UserName:        fields.email,
    PartnerKey:      PARTNER_KEY,
    FirstName:       fields.firstName,
    LastName:        fields.lastName,
    Password:        fields.password,
    ConfirmPassword: fields.password,  // intentional duplicate — see §4 note
    LanguageCode:    LANGUAGE_CODE,
    marketing:       fields.marketing, // boolean
    privacy:         fields.privacy,   // boolean
    Referer:         STATIC_REFERER,
    workflow:        null,
    source:          STATIC_SOURCE,
    Href:            STATIC_HREF,
    Context:         _state.context,
  };
}
```

---

## 7. GTM tracking helper

```js
/**
 * @param {{ regValue: string, regType: string, userKey: string|null }} opts
 * @description Pushes to window.dataLayer if present. Safe no-op if GTM not loaded.
 */
function regTracking(opts) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event:    "event",
    category: "event",
    type:     "user",
    action:   opts.regValue,
    route:    "ga",
    label:    "KornFerry",
    source:   opts.regType,
    itemKey:  opts.userKey || null,
  });
}
```

---

## 8. Safari detection

```js
/**
 * @returns {boolean} true if browser is Safari (non-Chrome)
 * @description
 *   Safari blocks window.open() inside setTimeout (non-gesture context).
 *   When true, use window.location.href for redirect instead.
 */
function isSafari() {
  const ua = navigator.userAgent.toLowerCase();
  return ua.indexOf("safari") !== -1 && ua.indexOf("chrome") === -1;
}
```

---

## 9. UI helpers

These all operate on the cached DOM refs (§10). No re-querying inside loops.

```
setSubmitEnabled(bool)
  — toggles disabled attr, aria-disabled, -isDisabled class on submit button

setLoading(bool)
  — toggles -isActive on loading-icon, -isLoading on submit button

showError(message)
  — sets innerText (NOT innerHTML) on ERROR_DIV, adds -isVisible class
  — clears any prior content first (reuse on retry)

hideError()
  — removes -isVisible from ERROR_DIV, clears text after transition

showStatus(message)
  — sets innerText on STATUS_MSG, adds -isVisible

hideStatus()
  — removes -isVisible from STATUS_MSG

setFieldState(inputEl, msgEl, isValid, successMsg)
  — adds/removes -isSuccess / -hasError on inputEl and msgEl
  — sets msgEl.textContent to successMsg when valid, error string when invalid
  — drives _state.fieldValidity update → calls evaluateSubmitState()

resetForm()
  — calls form.reset()
  — calls resetState()
  — resets meter to METER_EMPTY
  — strips all -isSuccess / -hasError / -isActive from custom checkboxes
  — calls setSubmitEnabled(false)
  — calls hideError(), hideStatus()

evaluateSubmitState()
  — reads _state.fieldValidity; if all keys true → setSubmitEnabled(true)
  — else setSubmitEnabled(false)
```

---

## 10. DOM caching & safe query helper

```js
/**
 * @param {string} id
 * @returns {Element|null}
 * @description Wraps getElementById in try/catch. Warns and returns null on failure.
 */
function getEl(id) {
  try {
    const el = document.getElementById(id);
    if (!el) console.warn("[" + MODULE + "] element #" + id + " not found; skipping");
    return el || null;
  } catch (e) {
    console.warn("[" + MODULE + "] error querying #" + id + ": " + e.message);
    return null;
  }
}

// All DOM refs resolved once at init, stored in _els.
// If a critical element is null, init() warns and exits early.
let _els = {};

function cacheElements() {
  Object.keys(DOM_IDS).forEach(key => {
    _els[key] = getEl(DOM_IDS[key]);
  });
  // Critical elements — abort if missing
  return _els.FORM && _els.SUBMIT_BTN && _els.EMAIL && _els.PASSWORD;
}
```

---

## 11. Flow: `handleVerify(payload)`

```
setLoading(true)
→ api.verifyEmail({ UserName: payload.UserName, PartnerKey: PARTNER_KEY, Context: "registration" })
  .then(data => {
    switch (data.Code) {

      case EMAIL_CODE.NOT_FOUND:
        → handleRegister(payload)             // proceed to step 2
        break;

      case EMAIL_CODE.FOUND:
        regTracking({ regValue: "register-success",
                      regType: TRACKING.ALREADY_REG_FREE|PAID,  // based on _state.context
                      userKey: data.UserKey || null })
        → handleRedirect(data.RedirectUrl || FALLBACK_LOGIN_URL, MSG.REDIRECT_LOGIN)
        break;

      case EMAIL_CODE.PARTNER:
        regTracking({ regValue: "register-success",
                      regType: TRACKING.ALREADY_REG_FREE|PAID,
                      userKey: data.UserKey || null })
        → handleRedirect(data.RedirectUrl || FALLBACK_PARTNER_URL, MSG.REDIRECT_PARTNER)
        break;

      default:
        regTracking({ regValue: "register-error",
                      regType: TRACKING.ERROR_FREE|PAID,
                      userKey: null })
        → handleError(MSG.ERROR_GENERIC)
    }
  })
  .catch(err => {
    console.warn("[kfa-registration] verifyEmail failed: " + err.message)
    regTracking({ regValue: "register-error", regType: TRACKING.ERROR_FREE|PAID, userKey: null })
    → handleError(MSG.ERROR_NETWORK)
  })
```

---

## 12. Flow: `handleRegister(payload)`

```
// DRY_RUN gate — check before any API call
if (DRY_RUN) {
  console.log("[kfa-registration] DRY_RUN enabled — payload logged, registration skipped", payload)
  setLoading(false)
  return
}

api.register(payload)
  .then(data => {
    regTracking({ regValue: "register-success",
                  regType: TRACKING.SUCCESS_FREE|PAID,   // based on _state.context
                  userKey: data.UserKey || null })
    → handleRedirect(data.RedirectUrl, MSG.REDIRECT_SUCCESS)
                              // NOTE: no fallback here — missing RedirectUrl is an error
  })
  .catch(err => {
    // FIX: reference implementation silently swallowed this. We surface it.
    console.warn("[kfa-registration] register failed: " + err.message)
    regTracking({ regValue: "register-error",
                  regType: TRACKING.ERROR_FAILURE,
                  userKey: null })
    → handleError(MSG.ERROR_NETWORK)
  })
```

**Missing RedirectUrl on success:** If `data.RedirectUrl` is absent after a successful register, call `handleError(MSG.ERROR_GENERIC)` rather than navigating to `undefined`. Log a warn.

---

## 13. Flow: `handleRedirect(url, message)`

```
if (!url) {
  console.warn("[kfa-registration] handleRedirect called with no URL")
  → handleError(MSG.ERROR_GENERIC)
  return
}

showStatus(message)
setLoading(true)

if (isSafari()) {
  // Safari blocks window.open in setTimeout; use same-tab navigation
  setTimeout(() => { window.location.href = url }, REDIRECT_DELAY_SAFARI)
} else {
  setTimeout(() => {
    const tab = window.open(url, "_blank", "noopener,noreferrer")
    setTimeout(() => {
      if (tab) tab.focus()
      setLoading(false)
      hideStatus()
      resetForm()
    }, POPUP_FOCUS_DELAY)
  }, REDIRECT_DELAY_DEFAULT)
}
```

---

## 14. Flow: `handleError(message)`

```
setLoading(false)
_state.isSubmitting = false
showError(message)                     // reuses ERROR_DIV, overwrites prior message

setTimeout(() => {
  hideError()
  // Form is NOT reset on error — user should be able to correct and retry
  // submit button re-enable is governed by evaluateSubmitState()
}, ERROR_DISPLAY_DURATION)
```

---

## 15. Event bindings

```
Form submit
  e.preventDefault()
  if (_state.isSubmitting) return      // guard against double-submit
  run final required-field check (Validator.hasEmptyRequired)
  if invalid → return (button should already be disabled; belt-and-suspenders)
  _state.isSubmitting = true
  hideError()
  → handleVerify(buildPayload(readFields()))

Radio toggle (both inputs)
  "change" → _state.context = CONTEXT.FREE | PAID

Field inputs (firstName, lastName, email, password)
  "input" → run relevant Validator method → setFieldState()

Password reveal toggle
  "click" → toggle input.type "password" / "text"
           → toggle -isVisible on reveal button

Custom checkbox clicks (privacy, marketing)
  "click" → toggle hidden input .checked
           → toggle aria-checked, -isActive on custom span
           → for privacy: update _state.fieldValidity.privacy → evaluateSubmitState()

Form keyup + click (catch-all)
  → evaluateSubmitState()    // ensures button state stays in sync
```

---

## 16. `readFields()` helper

```js
/**
 * @returns {Object} raw field values from DOM
 */
function readFields() {
  return {
    firstName: _els.FIRST_NAME.value.trim(),
    lastName:  _els.LAST_NAME.value.trim(),
    email:     _els.EMAIL.value.trim(),
    password:  _els.PASSWORD.value,
    marketing: _els.CHECKBOX_MARKETING.checked,
    privacy:   _els.CHECKBOX_PRIVACY.checked,
  };
}
```

---

## 17. DRY_RUN constant

```js
/**
 * Staging safety gate. Prevents real account creation until the API team
 * has allowlisted the serving origin for the register endpoint.
 * Set via window.KFA_DRY_RUN before the script runs, or edit here.
 * verifyemail is NOT gated — it can be tested on any origin.
 */
const DRY_RUN = typeof window.KFA_DRY_RUN === "boolean" ? window.KFA_DRY_RUN : true;
```

---

## 18. `init()`

```
DOMContentLoaded guard (or immediate if already loaded)
→ cacheElements()
    if false → console.warn("[kfa-registration] critical elements missing; aborting") + return
→ bindEvents()
→ setSubmitEnabled(false)   // start disabled; evaluateSubmitState() enables on valid input
→ log DRY_RUN status:
    console.log("[kfa-registration] init complete. DRY_RUN=" + DRY_RUN)
    if DRY_RUN: console.warn("[kfa-registration] DRY_RUN is enabled — register calls will not fire")
```

---

## 19. Module shape (IIFE)

```js
(function () {
  // §2 constants
  // §3 state
  // §4 Validator class
  // §5 KfaApi class
  // §6 buildPayload
  // §7 regTracking
  // §8 isSafari
  // §9 UI helpers
  // §10 DOM caching
  // §11 handleVerify
  // §12 handleRegister
  // §13 handleRedirect
  // §14 handleError
  // §15 bindEvents
  // §16 readFields
  // §17 DRY_RUN
  // §18 init
  init();
})();
```

No exports — this is a self-contained Webflow embed script, not a module.

---

## 20. HTML contract (bare-bones form shape)

The script expects exactly this structure. Styling is additive — IDs are the contract.

```html
<form id="kfaRegForm" method="post" action="/" novalidate>

  <!-- Plan toggle -->
  <label><input type="radio" id="toggleFree" name="regType" value="free" checked> Free</label>
  <label><input type="radio" id="togglePaid" name="regType" value="paid"> Premium</label>

  <!-- Name -->
  <input type="text"  id="kfaFirstName" required>
  <input type="text"  id="kfaLastName"  required>
  <span  id="kfaMsgName"></span>

  <!-- Email -->
  <input type="email" id="kfaEmail" required>
  <span  id="kfaMsgEmail"></span>

  <!-- Password (single input — ConfirmPassword mirrors it in payload) -->
  <input type="password" id="kfaPassword" required>
  <span  id="kfaPwReveal"></span>           <!-- reveal toggle target -->
  <meter id="kfaPwMeter" min="0" max="4" value="0"></meter>
  <span  id="kfaMsgPassword"></span>

  <!-- Checkboxes (hidden real inputs + styled spans) -->
  <input type="checkbox" id="kfaPrivacy"         class="kfa-hidden-cb" required>
  <span  id="kfaPrivacyCustom"  role="checkbox" aria-checked="false"></span>
  <span  id="kfaMsgPrivacy"></span>

  <input type="checkbox" id="kfaMarketing"        class="kfa-hidden-cb">
  <span  id="kfaMarketingCustom" role="checkbox" aria-checked="false"></span>

  <!-- Submit -->
  <button type="submit" id="kfaSubmit" disabled aria-disabled="true">Start Advancing</button>
  <span id="kfaLoading"></span>

  <!-- Feedback regions -->
  <div id="kfaError"  role="alert"  aria-live="assertive"></div>
  <div id="kfaStatus" role="status" aria-live="polite"></div>

</form>
```

---

## 21. Open items / pre-build checklist

| # | Item | Owner |
|---|------|-------|
| A | Confirm `FALLBACK_PARTNER_URL` with API team | Client |
| B | Confirm API team will allowlist Webflow staging origin for `register` (withCredentials) | Client / API team |
| C | Integration test: does server reject passwords that pass client regex? | Dev (Logan) — test once DRY_RUN=false |
| D | Confirm `PARTNER_EMAIL_FOUND` redirect message still current | Client |
| E | Confirm GTM dataLayer shape still matches active tag configuration | Client |
