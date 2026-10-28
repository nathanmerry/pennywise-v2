import 'dotenv/config';
import { prisma } from '../lib/prisma.js';
import { runDailyNotifications } from '../services/notifications/daily-notifications.js';

async function main() {
  try {
    const counts = await runDailyNotifications(new Date());
    console.log(JSON.stringify({ event: 'daily-notifications', ...counts }));
    if (counts.failed > 0) process.exitCode = 1;
  } catch {
    console.error('Daily notifications failed. Check database connectivity and server configuration.');
    process.exitCode = 1;
  } finally {
    try { await prisma.$disconnect(); }
    catch { console.error('Could not close notification database connection.'); process.exitCode = 1; }
  }
}
void main();
