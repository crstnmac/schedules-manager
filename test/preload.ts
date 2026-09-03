process.env.NODE_ENV ??= "test";
process.env.DATABASE_URL ??=
	"postgresql://postgres:postgres@127.0.0.1:54322/postgres";
process.env.DATABASE_POOL_MAX ??= "5";
process.env.CORS_ORIGIN ??= "http://localhost:3001";
process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.APP_URL ??= "http://localhost:3001";
process.env.ZEPTOMAIL_TOKEN ??= "Zoho-enczapikey test-token";
process.env.ZEPTOMAIL_FROM_ADDRESS ??= "noreply@example.com";
process.env.ZEPTOMAIL_FROM_NAME ??= "jooling";
process.env.ZEPTOMAIL_API_URL ??= "https://api.zeptomail.in/v1.1/email";
