// Loaded only by the CLI test subprocess; never enables real bank or push calls.
require('./setup.cjs');
const { prisma } = require('../dist/lib/prisma.js');
const summary = require('../dist/services/notifications/daily-summary.js');
const push = require('../dist/services/push.js');
prisma.pushSubscription.findMany = async () => [{ id: 'test', endpoint: 'secret-endpoint', auth: 'secret-auth', p256dh: 'secret-key', lastAttemptDate: null, lastSentDate: null }];
prisma.pushSubscription.updateMany = async () => ({ count: 1 });
prisma.$disconnect = async () => { process.stdout.write('test-database-closed\n'); };
summary.buildDailySummary = async () => ({ title: 'Pennywise', body: 'secret-payload', url: '/', tag: 'test' });
push.sendPush = async () => process.env.PUSH_TEST_FAIL === '1' ? 'uncertain' : 'sent';
