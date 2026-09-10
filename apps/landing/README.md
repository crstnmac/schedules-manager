# jooling landing page

Vite + React + TypeScript marketing site. It shares UI primitives with the web app through the `@SchedulesManager/ui` workspace package.

## Run

From the repository root:

    bun install
    bun run dev -F jooling-landing --

Open http://localhost:3002. Build with `bun run build` and preview with `bun run preview`.

Set `VITE_APP_URL` in `.env.local` to your deployed application URL. It defaults to http://localhost:3001 for local development. All get-started and log-in links open that application.

The landing page packages high-resolution WebP captures of the seeded web and mobile product in `apps/landing/public`. The layout adapts to desktop and mobile viewports while respecting reduced-motion preferences.

## Docker

Build from the repository root:

    docker build -f apps/landing/Dockerfile \
      --build-arg VITE_APP_URL=https://app.example.com \
      -t jooling-landing .

Run the non-root image on port 8080:

    docker run --rm -p 8080:8080 jooling-landing

The runtime exposes `/healthz`, serves immutable Vite assets with a one-year cache lifetime, and falls back to `index.html` for client-side routes.

Design inspiration: the spacious typography and product-led storytelling of https://plane.so/ and the focused workflow illustrations of https://rulebase.co/. No customer endorsements or unsupported performance claims are included.
