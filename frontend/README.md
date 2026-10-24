# Research Search frontend

Next.js (App Router) + MUI UI for asking research questions and reading cited, streamed answers.

## Run

The backend must be running on http://localhost:8000.

```
npm install
npm run dev      # http://localhost:3000
npm test
npm run build
```

Routes: `/` landing, `/chat` workspace (sessions, projects, settings). `/ask` and `/saved` redirect to `/chat`.

Set `NEXT_PUBLIC_API_BASE` (see `.env.example`; read at build time, so rebuild after changing it) to point at a different backend; default `http://localhost:8000`. The backend must list the frontend origin in `CORS_ORIGINS`. Production: `npm run build && npm start`.
