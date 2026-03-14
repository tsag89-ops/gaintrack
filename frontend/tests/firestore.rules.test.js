const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require('@firebase/rules-unit-testing');

const PROJECT_ID = 'gaintrack-firestore-rules-test';
const OWNER_UID = 'owner-user';
const OTHER_UID = 'other-user';
const rulesPath = path.resolve(__dirname, '..', 'firestore.rules');
const rules = fs.readFileSync(rulesPath, 'utf8');

let testEnv;

test.before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules,
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

test.after(async () => {
  await testEnv.cleanup();
});

test.afterEach(async () => {
  await testEnv.clearFirestore();
});

test('owner can create users/{uid} doc without isPro', async () => {
  const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore();
  const ownerDocRef = ownerDb.collection('users').doc(OWNER_UID);

  await assertSucceeds(
    ownerDocRef.set({
      email: 'owner@example.com',
      createdAt: '2026-03-14T00:00:00Z',
    })
  );
});

test('owner cannot create users/{uid} doc with isPro', async () => {
  const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore();
  const ownerDocRef = ownerDb.collection('users').doc(OWNER_UID);

  await assertFails(
    ownerDocRef.set({
      email: 'owner@example.com',
      isPro: true,
    })
  );
});

test('owner cannot update isPro field after create', async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context
      .firestore()
      .collection('users')
      .doc(OWNER_UID)
      .set({ email: 'owner@example.com', isPro: false });
  });

  const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore();
  const ownerDocRef = ownerDb.collection('users').doc(OWNER_UID);

  await assertFails(ownerDocRef.update({ isPro: true }));
});

test('cross-user read is denied for users path', async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context
      .firestore()
      .collection('users')
      .doc(OWNER_UID)
      .set({ email: 'owner@example.com' });
  });

  const otherDb = testEnv.authenticatedContext(OTHER_UID).firestore();
  const ownerDocRef = otherDb.collection('users').doc(OWNER_UID);

  await assertFails(ownerDocRef.get());
});

test('cross-user write is denied for legacy Users path', async () => {
  const otherDb = testEnv.authenticatedContext(OTHER_UID).firestore();
  const legacyOwnerDocRef = otherDb.collection('Users').doc(OWNER_UID);

  await assertFails(legacyOwnerDocRef.set({ notes: 'attempted overwrite' }));
});

test('unauthenticated access denied by default rules', async () => {
  const anonDb = testEnv.unauthenticatedContext().firestore();
  const docRef = anonDb.collection('users').doc(OWNER_UID);

  await assertFails(docRef.get());
  await assertFails(docRef.set({ email: 'anon@example.com' }));
  assert.equal(true, true);
});
