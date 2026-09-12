# Eat-doudou

An interactive LED signal playground built with React, TypeScript, and Vite. The app uses the browser camera to detect red and green LED signals and guide a tiny character home.

## Local development

Requirements: Node.js 20.19 or newer.

```bash
npm install
npm run dev
```

## Production build

```bash
npm ci
npm run build
```

The production output is written to `dist`.

## Deploy on Vercel

Import this repository in Vercel. The included `vercel.json` uses `npm run build` and publishes `dist`. Camera access works on Vercel because deployments use HTTPS.

On first use, allow camera permission, then click the LED in the camera preview to select the detection area.
