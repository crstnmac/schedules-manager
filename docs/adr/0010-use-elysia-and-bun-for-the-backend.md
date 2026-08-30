# Use Elysia and Bun for the backend

The backend will be a single Elysia application running on Bun, organized as a capability-based modular monolith and backed by PostgreSQL. Elysia keeps the small team's development model simple while providing runtime validation and OpenAPI generation; both the React manager app and Expo employee app consume its REST contract, and additional services, queues, or infrastructure will be introduced only in response to demonstrated operational need.
