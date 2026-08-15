# CIRC Authentication — Production status

## Implemented in the website

- Email + password sign-in
- Google sign-in
- Account registration
- Password reset
- Email verification
- Persistent sessions
- Protected participant routes
- Sign out
- Portuguese / English UI
- Firebase email language follows the selected website language
- Google sign-in uses redirect on touch/mobile screens and popup on desktop

## External production configuration still required

The frontend intentionally disables authentication until all required Firebase web configuration values are present.

Required build variables:

- `REACT_APP_FIREBASE_API_KEY`
- `REACT_APP_FIREBASE_AUTH_DOMAIN`
- `REACT_APP_FIREBASE_PROJECT_ID`
- `REACT_APP_FIREBASE_STORAGE_BUCKET`
- `REACT_APP_FIREBASE_MESSAGING_SENDER_ID`
- `REACT_APP_FIREBASE_APP_ID`

Firebase Authentication providers to enable:

- Email/Password
- Google

Authorized domains to include:

- `circ-coimbra.org`
- `www.circ-coimbra.org` (when DNS/custom domain is active)

Do not store private server credentials in the repository. Firebase web app configuration values are client-side identifiers, but this project reads them from the build environment so production and development remain separated.
