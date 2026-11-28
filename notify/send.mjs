/* Sends today's hype notification (from schedule.json) to every member who turned notifications on.
   Runs daily from .github/workflows/notify.yml. The Firebase service-account key comes from the
   FIREBASE_SA repository secret and is never stored in the repo.
   Usage: node notify/send.mjs            → today's message, if there is one
          node notify/send.mjs --test     → a test message right now
          node notify/send.mjs --date 2026-12-08 → that day's message (for checking) */
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

const args = process.argv.slice(2);
const test = args.includes('--test');
const dateArg = args.includes('--date') ? args[args.indexOf('--date') + 1] : null;
const today = dateArg || new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());

const schedule = JSON.parse(readFileSync(new URL('./schedule.json', import.meta.url), 'utf8'));
const msg = test
  ? {title: 'تجربة 🇮🇹', body: '{name}، إذا وصلك هالإشعار يعني كل شي جاهز ✈️'}
  : schedule.messages.find(m => m.date === today);
if (!msg) { console.log(`No message for ${today}.`); process.exit(0); }

if (!process.env.FIREBASE_SA) { console.error('FIREBASE_SA secret is missing.'); process.exit(1); }
initializeApp({credential: cert(JSON.parse(process.env.FIREBASE_SA))});
const fs = getFirestore();
const fcm = getMessaging();

const snap = await fs.collection('members').get();
let sent = 0, failed = 0;
for (const d of snap.docs) {
  const m = d.data();
  const tokens = Array.isArray(m.fcm) ? m.fcm : [];
  if (!m.notify || !tokens.length) continue;
  const name = String(m.name || '').trim() || 'يا حلوة';
  const data = {title: msg.title.replaceAll('{name}', name), body: msg.body.replaceAll('{name}', name), url: './', tag: 'hype-' + (test ? 'test' : today)};
  const res = await fcm.sendEachForMulticast({tokens, data, webpush: {headers: {Urgency: 'high', TTL: '86400'}}});
  const dead = [];
  res.responses.forEach((r, i) => {
    if (r.success) sent++;
    else { failed++; const c = r.error && r.error.code; if (c === 'messaging/registration-token-not-registered' || c === 'messaging/invalid-registration-token') dead.push(tokens[i]); }
  });
  if (dead.length) await d.ref.update({fcm: FieldValue.arrayRemove(...dead)});
}
console.log(`${test ? 'Test' : today}: sent ${sent}, failed ${failed}.`);
