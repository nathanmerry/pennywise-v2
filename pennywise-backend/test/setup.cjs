// Tests must never use local .env credentials or a live bank/database.
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/test';
process.env.TRUELAYER_CLIENT_ID = 'test';
process.env.TRUELAYER_CLIENT_SECRET = 'test';
process.env.TRUELAYER_AUTH_URL = 'https://bank.example.test';
process.env.TRUELAYER_API_URL = 'https://bank.example.test';
process.env.LOG_LEVEL = 'fatal';
