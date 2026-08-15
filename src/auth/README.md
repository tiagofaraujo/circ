# Authentication implementation

CIRC uses Firebase Authentication through the Firebase compat web SDK loaded in `public/index.html`.

The application supports:

- Google sign-in
- Email/password sign-in
- Account creation
- Password reset
- Email verification
- Local session persistence
- PT/EN authentication interface

The Firebase client configuration is read from `REACT_APP_FIREBASE_*` build variables. Until those values are present, `firebaseConfigured` is false and authentication controls remain disabled rather than presenting a false login flow.
