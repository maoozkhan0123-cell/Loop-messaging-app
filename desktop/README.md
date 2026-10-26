# BySync Desktop

The desktop application is a secure Electron shell for the production BySync web app.

## Development

Run `npm run desktop`. It opens `https://loop-messaging-app-silk.vercel.app` by default.

To point the shell at a different deployment, set `LOOP_APP_URL` before starting Electron.

## Windows installer

Run `npm run desktop:build`. Installers are written to `desktop-dist/`.

The app requires an internet connection because authentication, messages, files, projects, and realtime data are provided by Supabase and the deployed Next.js application.
