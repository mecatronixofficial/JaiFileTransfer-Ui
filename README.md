# FileFlux — File Transfer Frontend

Complete Next.js 15 frontend wired to your REST API.

## Quick Start

```bash
npm install
cp .env.example .env.local
# Set NEXT_PUBLIC_API_URL=http://your-api-host/api
npm run dev
```

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
