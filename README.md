# FileFlux — File Transfer Frontend

Complete Next.js 15 frontend wired to your REST API.

## Quick Start

```bash
npm install
npm run dev
```

The app uses environment-specific files from the project root:

- `.env.development` is loaded by `npm run dev` and points to the local backend at `http://localhost:5000`.
- `.env.production` is loaded by `npm run build` and `npm start`. Set `NEXT_PUBLIC_BACKEND_URL` to the deployed backend origin before building.
- `NEXT_PUBLIC_API_URL` remains `/api/v1`, so browser requests use the Next.js rewrite proxy.

Do not put secrets in `NEXT_PUBLIC_*` variables because Next.js includes them in the browser bundle. Environment files are ignored by Git; configure the same values in your deployment platform as needed.

## Pages

| Route | Description |
|---|---|
| /login | Auth: login, OTP verify, forgot/reset password |
| /dashboard | Stats, recent files, activity |
| /files | File manager (grid/list, upload, bulk ops, share) |
| /folders | Folder browser with breadcrumb navigation |
| /shared | Files shared with you |
| /search | Real-time file search |
| /trash | Trash with restore / permanent delete |
| /settings | Profile, password, notifications, security |
| /transactions | Activity log |
| /notifications | All notifications |
| /admin | Admin overview (admin role only) |
| /admin/users | User management + quota |
| /admin/storage | Storage report |

## All 40+ API endpoints are wired in src/lib/api.ts
