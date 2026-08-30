# Use React and TanStack Router for the manager web application

The manager web application will be a Vite-built React single-page application using TanStack Router and TanStack Query, rather than Next.js or TanStack Start. The manager interface does not require search-engine rendering, and keeping it client-side creates a clear boundary: the web and mobile clients both consume the authoritative Elysia REST API, while TanStack Router provides type-safe navigation and route state without coupling domain operations to a full-stack web framework.
