# Use Supabase for PostgreSQL and authentication

Supabase will provide the managed PostgreSQL database and user authentication, while the Elysia application remains the authoritative API for all scheduling data and operations. Using one provider for standard PostgreSQL and identity keeps the initial system simple and portable; React and Expo clients authenticate with Supabase but access Workplace data through Elysia, which enforces Employment-based authorization and executes Drizzle-managed transactions.
