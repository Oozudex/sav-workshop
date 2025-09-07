# Workshop SAV (React + Vite + Firebase)

A minimal custom app to track bike workshop SAV tickets with Kanban, assignments, and history.

## Quick start
1. Install Node 18+
2. `npm i`
3. Copy `.env.example` to `.env` and fill with your Firebase project config.
4. Enable **Email/Password** auth in Firebase Console.
5. Create a Firestore DB (production or test), then import the rules from `firestore.rules`.
6. Run: `npm run dev`

## Tech
- React + Vite
- TailwindCSS
- Firebase Auth + Firestore + Storage

## Roles
Each user has a document in `users/{uid}` with at least:
```json
{ "displayName": "Mateo", "role": "admin", "isActive": true }
```
Roles: `admin`, `staff`, `mechanic`. Adjust in rules if needed.

## Status flow
`New → Diagnostic → WaitingParts → WaitingCustomer → InProgress → Ready → Closed`

## Notes
- This starter is intentionally small. You can add reporting, exports, SMS/email automations, etc.
- For a production-safe incremental ticket number, use a Cloud Function or a Firestore transaction-only counter document.
