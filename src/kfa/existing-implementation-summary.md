# KF Advance Registration — Existing Implementation Summary

_Synthesized from `KF_Advance_Registration_Flows.docx` and the reference frontend implementation._

---

## Purpose

Registration flow for KF Advance supporting two account tiers: **Freemium** (free) and **Subscription** (paid). Both tiers share the same form fields and two-step API sequence. The tier is passed as a `Context` value in the register payload.

---

## API Sequence

### Step 1 — Verify Email
`POST https://api.kfadvance.com/v1/account/verifyemail`

No auth credentials required. Checks whether the email is already in the system before attempting registration.

**Request:**
```json
{
  "UserName": "<email>",
  "PartnerKey": "SVOoQJaeX0eLboUOU0wSoQtt",
  "Context": "registration"
}
```

**Response codes and behavior:**

| Code | Meaning | Action |
|------|---------|--------|
| `EMAIL_NOTFOUND` | Email is new — proceed | Call `/register` |
| `EMAIL_FOUND` | Account already exists | Redirect to login via `RedirectUrl` |
| `PARTNER_EMAIL_FOUND` | Email associated with a partner account | Redirect to partner site via `RedirectUrl` |
| anything else | Unexpected error | Show generic error message |

---

### Step 2 — Register
`POST https://api.kfadvance.com/v1/account/register`

Requires `credentials: include` (cross-origin cookie). **The serving origin must be allowlisted by the API team before this call will succeed.** Verify email can be tested independently on any origin.

**Request:**
```json
{
  "UserName": "<email>",
  "PartnerKey": "SVOoQJaeX0eLboUOU0wSoQtt",
  "FirstName": "<first-name>",
  "LastName": "<last-name>",
  "Password": "<password>",
  "ConfirmPassword": "<password>",
  "LanguageCode": "en-US",
  "marketing": true,
  "privacy": true,
  "Referer": "Referer Value",
  "workflow": null,
  "source": "Registration-KornFerry",
  "Href": "",
  "Context": "freemium" | "subscription"
}
```

**Notes on static fields:**
- `PartnerKey` — hardcoded routing key, same for both tiers
- `ConfirmPassword` — mirrors `Password`; no separate confirm input exists in the form
- `Referer` — hardcoded literal string `"Referer Value"` in reference; not wired to `document.referrer`
- `Href` — always empty string
- `workflow` — always `null`
- `source` — always `"Registration-KornFerry"`

**Successful response:**
```json
{
  "UserKey": "<system-generated-id>",
  "FirstName": "...",
  "LastName": "...",
  "RedirectUrl": "https://client.kfadvance.com/services?product=freemium|subscription"
}
```

On success, `RedirectUrl` is opened to complete auto-login and land the user on their product destination.

---

## Redirect Behavior

After verify (email exists) or after register (success), the client opens `RedirectUrl` to complete the login handshake:

- **Freemium:** `https://client.kfadvance.com/services?product=freemium` — lands on app home
- **Subscription:** `https://client.kfadvance.com/services?product=subscription` — lands on FastSpring account

**Safari handling:** Safari blocks `window.open()` inside `setTimeout` (non-gesture context). On Safari the reference uses `window.location.href` instead, with a 1500ms delay. All other browsers use `window.open(..., "_blank")` with a 1000ms delay.

---

## Form Structure

Two separate forms in the reference (`#freeForm`, `#premiumForm`), both with identical fields. The only payload difference is `Context`. Both existed as modal overlays triggered by links on the page or a `?account=free|premium` query param.

**Fields (identical across both forms):**
- First Name, Last Name
- Email Address
- Password (single input; `ConfirmPassword` mirrors it in payload)
- Privacy Policy checkbox (required)
- Marketing emails checkbox (optional)

**No confirm password field** — the API has a `ConfirmPassword` field but the form never exposed a second input; the same value is sent twice.

---

## Validation

All validation is client-side only. Server-side password rules may be stricter — confirmed for integration testing.

| Field | Rule |
|-------|------|
| First / Last Name | No special characters or underscores (`/\W|_/g`) |
| Email | Pattern: `/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/` |
| Password | Min 8 chars + `/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/` |
| Privacy checkbox | Required — blocks submit if unchecked |
| Marketing checkbox | Optional |

Password UI uses an HTML `<meter>` element: `0` = empty, `2` = failing, `4` = passing. Submit button stays disabled until all required fields pass.

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| `EMAIL_FOUND` | Redirect to login with friendly message |
| `PARTNER_EMAIL_FOUND` | Redirect to partner URL with friendly message |
| Verify — unexpected code | Show generic error, allow retry |
| Verify — network failure | Show network error message, allow retry |
| Register — network/API failure | Show network error message _(reference silently swallowed this; fixed in new implementation)_ |
| Missing `RedirectUrl` on success | Show generic error _(not handled in reference)_ |

Error messages auto-clear after 5 seconds. In the reference, the form also reset on error — the new implementation intentionally does not reset on error so the user can correct and retry.

---

## GTM Tracking

Pushes to `window.dataLayer` on every meaningful outcome:

```js
{
  event: "event",
  category: "event",
  type: "user",
  action: "register-success" | "register-error",
  route: "ga",
  label: "KornFerry",
  source: "<regType>",   // e.g. "marketing-freemium-registration"
  itemKey: "<UserKey>"   // null on failure
}
```

---

## Environment / Deployment

- **Production API:** `https://api.kfadvance.com`
- **Dev API:** `https://api.kfadvance-dev.com` — present in reference code but not used in new implementation
- **Environment switching** in reference was hostname-based (`indexOf("prod")` or `indexOf("kfadvance.com")`); not carried forward

---

## Open Items

| # | Item | Owner |
|---|------|-------|
| A | Confirm fallback URL for `PARTNER_EMAIL_FOUND` redirect | Client |
| B | API team must allowlist Webflow staging origin for `register` (`withCredentials`) | Client / API team |
| C | Test whether server rejects passwords that pass the client-side regex | Dev — test once `DRY_RUN=false` |
| D | Confirm `PARTNER_EMAIL_FOUND` redirect message copy is still current | Client |
| E | Confirm GTM dataLayer shape matches active tag configuration | Client |
