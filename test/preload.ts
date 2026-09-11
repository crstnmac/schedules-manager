process.env.NODE_ENV ??= "test";
process.env.DATABASE_URL ??=
	"postgresql://postgres:postgres@127.0.0.1:54322/postgres";
process.env.DATABASE_POOL_MAX ??= "5";
process.env.CORS_ORIGIN ??= "http://localhost:3001";
process.env.APP_URL ??= "http://localhost:3001";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
process.env.BETTER_AUTH_SECRET ??=
	"unit-test-secret-that-is-at-least-32-characters";
process.env.ZEPTOMAIL_TOKEN ??= "Zoho-enczapikey test-token";
process.env.ZEPTOMAIL_FROM_ADDRESS ??= "noreply@example.com";
process.env.ZEPTOMAIL_FROM_NAME ??= "jooling";
process.env.ZEPTOMAIL_API_URL ??= "https://api.zeptomail.in/v1.1/email";
process.env.VITE_SERVER_URL ??= "http://localhost:3000";
process.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN ??= "phc_test_token";
process.env.VITE_PUBLIC_POSTHOG_HOST ??= "https://eu.i.posthog.com";
