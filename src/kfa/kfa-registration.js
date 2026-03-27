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
(function () {

  // ─────────────────────────────────────────────────────────────────────────
  // §2  Constants
  // ─────────────────────────────────────────────────────────────────────────

  var MODULE = "kfa-registration";

  // --- API ---
  var PARTNER_KEY = "SVOoQJaeX0eLboUOU0wSoQtt";
  var API_BASE    = "https://api.kfadvance.com";
  var ENDPOINTS = {
    VERIFY:   API_BASE + "/v1/account/verifyemail",
    REGISTER: API_BASE + "/v1/account/register",
  };

  // --- Fallback URLs ---
  var FALLBACK_LOGIN_URL   = "https://client.kfadvance.com/login";
  var FALLBACK_PARTNER_URL = "PLACEHOLDER_PARTNER_REDIRECT_URL"; // TODO: confirm with API team

  // --- Payload static fields ---
  var STATIC_REFERER = "Referer Value";
  var STATIC_SOURCE  = "Registration-KornFerry";
  var STATIC_HREF    = "";
  var LANGUAGE_CODE  = "en-US";

  // --- Timing (ms) ---
  var REDIRECT_DELAY_DEFAULT = 1000;
  var REDIRECT_DELAY_SAFARI  = 1500;
  var POPUP_FOCUS_DELAY      = 500;
  var ERROR_DISPLAY_DURATION = 5000;

  // --- Password validation ---
  var PASSWORD_MIN_LENGTH = 8;
  var PASSWORD_REGEX      = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;
  var PASSWORD_SCORE_PASS = 4;
  var PASSWORD_SCORE_FAIL = 2;

  // --- Meter values ---
  var METER_EMPTY = 0;
  var METER_MAX   = 4;

  // --- Context values ---
  var CONTEXT = {
    FREE:  "freemium",
    PAID:  "subscription",
  };

  // --- Verify email response codes ---
  var EMAIL_CODE = {
    NOT_FOUND: "EMAIL_NOTFOUND",
    FOUND:     "EMAIL_FOUND",
    PARTNER:   "PARTNER_EMAIL_FOUND",
  };

  // --- GTM dataLayer event values ---
  var TRACKING = {
    SUCCESS_FREE:     "marketing-freemium-registration",
    SUCCESS_PAID:     "marketing-premium-registration",
    ALREADY_REG_FREE: "marketing-freemium-alreadyRegistered",
    ALREADY_REG_PAID: "marketing-premium-alreadyRegisterd",  // sic — matches reference
    ERROR_FREE:       "marketing-freemium-registration",
    ERROR_PAID:       "marketing-premium-registration",
    ERROR_FAILURE:    "marketing-freemium-failure",
  };

  // --- User-facing messages ---
  var MSG = {
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

  // --- DOM IDs ---
  var DOM_IDS = {
    FORM:               "kfaRegForm",
    TOGGLE_FREE:        "toggleFree",
    TOGGLE_PAID:        "togglePaid",
    FIRST_NAME:         "kfaFirstName",
    LAST_NAME:          "kfaLastName",
    EMAIL:              "kfaEmail",
    PASSWORD:           "kfaPassword",
    CONFIRM_PW:         "kfaConfirmPassword",   // no HTML element — mirrored in payload only
    PW_REVEAL:          "kfaPwReveal",
    PW_METER:           "kfaPwMeter",
    CHECKBOX_PRIVACY:   "kfaPrivacy",
    CHECKBOX_MARKETING: "kfaMarketing",
    CUSTOM_PRIVACY:     "kfaPrivacyCustom",
    CUSTOM_MARKETING:   "kfaMarketingCustom",
    SUBMIT_BTN:         "kfaSubmit",
    LOADING_ICON:       "kfaLoading",
    ERROR_DIV:          "kfaError",
    STATUS_MSG:         "kfaStatus",
    MSG_NAME:           "kfaMsgName",
    MSG_EMAIL:          "kfaMsgEmail",
    MSG_PASSWORD:       "kfaMsgPassword",
    MSG_PRIVACY:        "kfaMsgPrivacy",
  };

  // ─────────────────────────────────────────────────────────────────────────
  // §17  DRY_RUN
  // ─────────────────────────────────────────────────────────────────────────

  var DRY_RUN = typeof window.KFA_DRY_RUN === "boolean" ? window.KFA_DRY_RUN : true;

  // ─────────────────────────────────────────────────────────────────────────
  // §3  Module-level state
  // ─────────────────────────────────────────────────────────────────────────

  var _state = {
    context:      CONTEXT.FREE,
    isSubmitting: false,
    fieldValidity: {
      firstName: false,
      lastName:  false,
      email:     false,
      password:  false,
      privacy:   false,
    },
  };

  function resetState() {
    _state.isSubmitting = false;
    Object.keys(_state.fieldValidity).forEach(function (k) {
      _state.fieldValidity[k] = false;
    });
    // context intentionally NOT reset — preserve user's toggle choice across retry
  }

  // ─────────────────────────────────────────────────────────────────────────
  // §4  Validator
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * @class Validator
   * Pure validation helpers. No DOM side-effects.
   */
  function Validator() {}

  Validator.prototype.isValidName = function (value) {
    return !/\W|_/g.test(value);
  };

  Validator.prototype.isValidEmail = function (value) {
    return /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(value);
  };

  Validator.prototype.scorePassword = function (value) {
    if (!value) return METER_EMPTY;
    if (value.length < PASSWORD_MIN_LENGTH) return PASSWORD_SCORE_FAIL;
    return PASSWORD_REGEX.test(value) ? PASSWORD_SCORE_PASS : PASSWORD_SCORE_FAIL;
  };

  Validator.prototype.hasEmptyRequired = function (form) {
    var fields = form.querySelectorAll("[required]");
    for (var i = 0; i < fields.length; i++) {
      var el = fields[i];
      if (el.type === "checkbox") {
        if (!el.checked) return true;
      } else {
        if (!el.value || !el.value.trim()) return true;
      }
    }
    return false;
  };

  var validator = new Validator();

  // ─────────────────────────────────────────────────────────────────────────
  // §5  KfaApi
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * @class KfaApi
   * Wraps fetch calls to the KF Advance API.
   */
  function KfaApi() {}

  KfaApi.prototype.verifyEmail = function (payload) {
    return fetch(ENDPOINTS.VERIFY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(function (res) {
      if (!res.ok) throw new Error(res.status);
      return res.json();
    });
  };

  KfaApi.prototype.register = function (payload) {
    return fetch(ENDPOINTS.REGISTER, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(function (res) {
      if (!res.ok) throw new Error(res.status);
      return res.json();
    });
  };

  var api = new KfaApi();

  // ─────────────────────────────────────────────────────────────────────────
  // §6  Payload builder
  // ─────────────────────────────────────────────────────────────────────────

  function buildPayload(fields) {
    return {
      UserName:        fields.email,
      PartnerKey:      PARTNER_KEY,
      FirstName:       fields.firstName,
      LastName:        fields.lastName,
      Password:        fields.password,
      ConfirmPassword: fields.password,  // intentional duplicate — see spec §4
      LanguageCode:    LANGUAGE_CODE,
      marketing:       fields.marketing,
      privacy:         fields.privacy,
      Referer:         STATIC_REFERER,
      workflow:        null,
      source:          STATIC_SOURCE,
      Href:            STATIC_HREF,
      Context:         _state.context,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // §7  GTM tracking
  // ─────────────────────────────────────────────────────────────────────────

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

  // ─────────────────────────────────────────────────────────────────────────
  // §8  Safari detection
  // ─────────────────────────────────────────────────────────────────────────

  function isSafari() {
    var ua = navigator.userAgent.toLowerCase();
    return ua.indexOf("safari") !== -1 && ua.indexOf("chrome") === -1;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // §10  DOM caching
  // ─────────────────────────────────────────────────────────────────────────

  function getEl(id) {
    try {
      var el = document.getElementById(id);
      if (!el) console.warn("[" + MODULE + "] element #" + id + " not found; skipping");
      return el || null;
    } catch (e) {
      console.warn("[" + MODULE + "] error querying #" + id + ": " + e.message);
      return null;
    }
  }

  var _els = {};

  function cacheElements() {
    Object.keys(DOM_IDS).forEach(function (key) {
      _els[key] = getEl(DOM_IDS[key]);
    });
    return _els.FORM && _els.SUBMIT_BTN && _els.EMAIL && _els.PASSWORD;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // §9  UI helpers
  // ─────────────────────────────────────────────────────────────────────────

  function setSubmitEnabled(bool) {
    if (!_els.SUBMIT_BTN) return;
    _els.SUBMIT_BTN.disabled = !bool;
    _els.SUBMIT_BTN.setAttribute("aria-disabled", String(!bool));
    _els.SUBMIT_BTN.classList.toggle("kfa-isDisabled", !bool);
  }

  function setLoading(bool) {
    if (_els.LOADING_ICON) _els.LOADING_ICON.classList.toggle("kfa-isActive", bool);
    if (_els.SUBMIT_BTN)   _els.SUBMIT_BTN.classList.toggle("kfa-isLoading", bool);
  }

  function showError(message) {
    if (!_els.ERROR_DIV) return;
    _els.ERROR_DIV.textContent = message;
    _els.ERROR_DIV.classList.add("kfa-isVisible");
  }

  function hideError() {
    if (!_els.ERROR_DIV) return;
    _els.ERROR_DIV.classList.remove("kfa-isVisible");
    setTimeout(function () {
      if (_els.ERROR_DIV) _els.ERROR_DIV.textContent = "";
    }, 300);
  }

  function showStatus(message) {
    if (!_els.STATUS_MSG) return;
    _els.STATUS_MSG.textContent = message;
    _els.STATUS_MSG.classList.add("kfa-isVisible");
  }

  function hideStatus() {
    if (!_els.STATUS_MSG) return;
    _els.STATUS_MSG.classList.remove("kfa-isVisible");
  }

  // Maps input element IDs → _state.fieldValidity keys
  var _fieldValidityMap = {};
  // (populated after DOM_IDS is defined — built lazily on first call)
  function _getValidityKey(id) {
    if (!_fieldValidityMap[DOM_IDS.FIRST_NAME]) {
      _fieldValidityMap[DOM_IDS.FIRST_NAME]         = "firstName";
      _fieldValidityMap[DOM_IDS.LAST_NAME]          = "lastName";
      _fieldValidityMap[DOM_IDS.EMAIL]              = "email";
      _fieldValidityMap[DOM_IDS.PASSWORD]           = "password";
      _fieldValidityMap[DOM_IDS.CHECKBOX_PRIVACY]   = "privacy";
    }
    return _fieldValidityMap[id] || null;
  }

  function setFieldState(inputEl, msgEl, isValid, message) {
    if (!inputEl) return;
    inputEl.classList.toggle("kfa-isSuccess", isValid);
    inputEl.classList.toggle("kfa-hasError", !isValid);
    if (msgEl) {
      msgEl.classList.toggle("kfa-isSuccess", isValid);
      msgEl.classList.toggle("kfa-hasError", !isValid);
      msgEl.textContent = message || "";
    }
    var key = _getValidityKey(inputEl.id);
    if (key !== null) {
      _state.fieldValidity[key] = isValid;
    }
    evaluateSubmitState();
  }

  function evaluateSubmitState() {
    var allValid = Object.keys(_state.fieldValidity).every(function (k) {
      return _state.fieldValidity[k];
    });
    setSubmitEnabled(allValid);
  }

  function resetForm() {
    if (_els.FORM) _els.FORM.reset();
    resetState();
    if (_els.PW_METER) _els.PW_METER.value = METER_EMPTY;

    // Strip state classes from custom checkboxes
    [_els.CUSTOM_PRIVACY, _els.CUSTOM_MARKETING].forEach(function (el) {
      if (!el) return;
      el.classList.remove("kfa-isActive", "kfa-isSuccess", "kfa-hasError");
      el.setAttribute("aria-checked", "false");
    });

    // Strip state classes from text inputs
    [_els.FIRST_NAME, _els.LAST_NAME, _els.EMAIL, _els.PASSWORD].forEach(function (el) {
      if (el) el.classList.remove("kfa-isSuccess", "kfa-hasError");
    });

    // Clear inline message elements
    [_els.MSG_NAME, _els.MSG_EMAIL, _els.MSG_PASSWORD, _els.MSG_PRIVACY].forEach(function (el) {
      if (!el) return;
      el.classList.remove("kfa-isSuccess", "kfa-hasError");
      el.textContent = "";
    });

    setSubmitEnabled(false);
    hideError();
    hideStatus();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // §16  readFields
  // ─────────────────────────────────────────────────────────────────────────

  function readFields() {
    return {
      firstName: _els.FIRST_NAME ? _els.FIRST_NAME.value.trim() : "",
      lastName:  _els.LAST_NAME  ? _els.LAST_NAME.value.trim()  : "",
      email:     _els.EMAIL      ? _els.EMAIL.value.trim()       : "",
      password:  _els.PASSWORD   ? _els.PASSWORD.value           : "",
      marketing: _els.CHECKBOX_MARKETING ? _els.CHECKBOX_MARKETING.checked : false,
      privacy:   _els.CHECKBOX_PRIVACY   ? _els.CHECKBOX_PRIVACY.checked   : false,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // §14  handleError
  // ─────────────────────────────────────────────────────────────────────────

  function handleError(message) {
    setLoading(false);
    _state.isSubmitting = false;
    showError(message);
    setTimeout(function () { hideError(); }, ERROR_DISPLAY_DURATION);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // §13  handleRedirect
  // ─────────────────────────────────────────────────────────────────────────

  function handleRedirect(url, message) {
    if (!url) {
      console.warn("[" + MODULE + "] handleRedirect called with no URL");
      handleError(MSG.ERROR_GENERIC);
      return;
    }
    showStatus(message);
    setLoading(true);

    if (isSafari()) {
      setTimeout(function () {
        window.location.href = url;
      }, REDIRECT_DELAY_SAFARI);
    } else {
      setTimeout(function () {
        var tab = window.open(url, "_blank", "noopener,noreferrer");
        setTimeout(function () {
          if (tab) tab.focus();
          setLoading(false);
          hideStatus();
          resetForm();
        }, POPUP_FOCUS_DELAY);
      }, REDIRECT_DELAY_DEFAULT);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // §12  handleRegister
  // ─────────────────────────────────────────────────────────────────────────

  function handleRegister(payload) {
    if (DRY_RUN) {
      console.log("[" + MODULE + "] DRY_RUN enabled — payload logged, registration skipped", payload);
      setLoading(false);
      _state.isSubmitting = false;
      return;
    }

    api.register(payload)
      .then(function (data) {
        regTracking({
          regValue: "register-success",
          regType:  _state.context === CONTEXT.PAID ? TRACKING.SUCCESS_PAID : TRACKING.SUCCESS_FREE,
          userKey:  data.UserKey || null,
        });
        if (!data.RedirectUrl) {
          console.warn("[" + MODULE + "] register succeeded but no RedirectUrl in response");
          handleError(MSG.ERROR_GENERIC);
          return;
        }
        handleRedirect(data.RedirectUrl, MSG.REDIRECT_SUCCESS);
      })
      .catch(function (err) {
        console.warn("[" + MODULE + "] register failed: " + err.message);
        regTracking({
          regValue: "register-error",
          regType:  TRACKING.ERROR_FAILURE,
          userKey:  null,
        });
        handleError(MSG.ERROR_NETWORK);
      });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // §11  handleVerify
  // ─────────────────────────────────────────────────────────────────────────

  function handleVerify(payload) {
    setLoading(true);
    api.verifyEmail({ UserName: payload.UserName, PartnerKey: PARTNER_KEY, Context: "registration" })
      .then(function (data) {
        switch (data.Code) {

          case EMAIL_CODE.NOT_FOUND:
            handleRegister(payload);
            break;

          case EMAIL_CODE.FOUND:
            regTracking({
              regValue: "register-success",
              regType:  _state.context === CONTEXT.PAID ? TRACKING.ALREADY_REG_PAID : TRACKING.ALREADY_REG_FREE,
              userKey:  data.UserKey || null,
            });
            handleRedirect(data.RedirectUrl || FALLBACK_LOGIN_URL, MSG.REDIRECT_LOGIN);
            break;

          case EMAIL_CODE.PARTNER:
            regTracking({
              regValue: "register-success",
              regType:  _state.context === CONTEXT.PAID ? TRACKING.ALREADY_REG_PAID : TRACKING.ALREADY_REG_FREE,
              userKey:  data.UserKey || null,
            });
            handleRedirect(data.RedirectUrl || FALLBACK_PARTNER_URL, MSG.REDIRECT_PARTNER);
            break;

          default:
            regTracking({
              regValue: "register-error",
              regType:  _state.context === CONTEXT.PAID ? TRACKING.ERROR_PAID : TRACKING.ERROR_FREE,
              userKey:  null,
            });
            handleError(MSG.ERROR_GENERIC);
        }
      })
      .catch(function (err) {
        console.warn("[" + MODULE + "] verifyEmail failed: " + err.message);
        regTracking({
          regValue: "register-error",
          regType:  _state.context === CONTEXT.PAID ? TRACKING.ERROR_PAID : TRACKING.ERROR_FREE,
          userKey:  null,
        });
        handleError(MSG.ERROR_NETWORK);
      });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // §15  Event bindings
  // ─────────────────────────────────────────────────────────────────────────

  function bindCustomCheckbox(hiddenInput, customSpan, fieldKey, msgEl) {
    if (!hiddenInput || !customSpan) return;

    function toggle() {
      hiddenInput.checked = !hiddenInput.checked;
      var checked = hiddenInput.checked;
      customSpan.setAttribute("aria-checked", String(checked));
      customSpan.classList.toggle("kfa-isActive", checked);

      if (fieldKey) {
        _state.fieldValidity[fieldKey] = checked;
        if (msgEl) {
          msgEl.textContent = checked ? "" : MSG.FIELD_PRIVACY;
          msgEl.classList.toggle("kfa-hasError", !checked);
          msgEl.classList.toggle("kfa-isSuccess", checked);
        }
        evaluateSubmitState();
      }
    }

    customSpan.addEventListener("click", toggle);
    customSpan.addEventListener("keydown", function (e) {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        toggle();
      }
    });
  }

  function bindEvents() {
    // Form submit
    _els.FORM.addEventListener("submit", function (e) {
      e.preventDefault();
      if (_state.isSubmitting) return;
      if (validator.hasEmptyRequired(_els.FORM)) return;
      _state.isSubmitting = true;
      hideError();
      handleVerify(buildPayload(readFields()));
    });

    // Radio toggle
    [_els.TOGGLE_FREE, _els.TOGGLE_PAID].forEach(function (radio) {
      if (!radio) return;
      radio.addEventListener("change", function () {
        _state.context = radio.value === "paid" ? CONTEXT.PAID : CONTEXT.FREE;
      });
    });

    // First name
    if (_els.FIRST_NAME) {
      _els.FIRST_NAME.addEventListener("input", function () {
        var val = _els.FIRST_NAME.value.trim();
        var isValid = val.length > 0 && validator.isValidName(val);
        setFieldState(
          _els.FIRST_NAME,
          _els.MSG_NAME,
          isValid,
          !isValid && val.length > 0 ? MSG.FIELD_NAME_INVALID : ""
        );
      });
    }

    // Last name
    if (_els.LAST_NAME) {
      _els.LAST_NAME.addEventListener("input", function () {
        var val = _els.LAST_NAME.value.trim();
        var isValid = val.length > 0 && validator.isValidName(val);
        setFieldState(
          _els.LAST_NAME,
          _els.MSG_NAME,
          isValid,
          !isValid && val.length > 0 ? MSG.FIELD_NAME_INVALID : ""
        );
      });
    }

    // Email
    if (_els.EMAIL) {
      _els.EMAIL.addEventListener("input", function () {
        var val = _els.EMAIL.value.trim();
        var isValid = val.length > 0 && validator.isValidEmail(val);
        setFieldState(
          _els.EMAIL,
          _els.MSG_EMAIL,
          isValid,
          isValid ? MSG.FIELD_EMAIL_VALID : ""
        );
      });
    }

    // Password — hint text is pre-populated in #kfaMsgPassword; we only toggle classes
    if (_els.PASSWORD) {
      _els.PASSWORD.addEventListener("input", function () {
        var val = _els.PASSWORD.value;
        var score = validator.scorePassword(val);
        var isValid = score === PASSWORD_SCORE_PASS;
        var hasContent = val.length > 0;

        // Drive input border state directly (avoids textContent side-effect of setFieldState)
        _els.PASSWORD.classList.toggle("kfa-isSuccess", isValid);
        _els.PASSWORD.classList.toggle("kfa-hasError", hasContent && !isValid);

        // Colour the pre-populated hint: red when invalid + has content, neutral otherwise
        if (_els.MSG_PASSWORD) {
          _els.MSG_PASSWORD.classList.toggle("kfa-hasError", hasContent && !isValid);
          _els.MSG_PASSWORD.classList.toggle("kfa-isSuccess", isValid);
        }

        _state.fieldValidity.password = isValid;
        evaluateSubmitState();
      });
    }

    // Password reveal toggle
    if (_els.PW_REVEAL && _els.PASSWORD) {
      function toggleReveal() {
        var isHidden = _els.PASSWORD.type === "password";
        _els.PASSWORD.type = isHidden ? "text" : "password";
        _els.PW_REVEAL.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
        _els.PW_REVEAL.setAttribute("aria-pressed", String(isHidden));
        _els.PW_REVEAL.classList.toggle("kfa-isVisible", isHidden);
      }
      _els.PW_REVEAL.addEventListener("click", toggleReveal);
      _els.PW_REVEAL.addEventListener("keydown", function (e) {
        if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggleReveal(); }
      });
    }

    // Custom checkboxes — privacy tracks validity (no inline message); marketing is optional
    bindCustomCheckbox(_els.CHECKBOX_PRIVACY, _els.CUSTOM_PRIVACY, "privacy", null);
    bindCustomCheckbox(_els.CHECKBOX_MARKETING, _els.CUSTOM_MARKETING, null, null);

    // Catch-all: keep submit state in sync
    _els.FORM.addEventListener("keyup", evaluateSubmitState);
    _els.FORM.addEventListener("click", evaluateSubmitState);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // §18  init
  // ─────────────────────────────────────────────────────────────────────────

  function init() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
      return;
    }

    if (!cacheElements()) {
      console.warn("[" + MODULE + "] critical elements missing; aborting");
      return;
    }

    bindEvents();
    setSubmitEnabled(false);

    console.log("[" + MODULE + "] init complete. DRY_RUN=" + DRY_RUN);
    if (DRY_RUN) {
      console.warn("[" + MODULE + "] DRY_RUN is enabled — register calls will not fire");
    }
  }

  init();

})();
