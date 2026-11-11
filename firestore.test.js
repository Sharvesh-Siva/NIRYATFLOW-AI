const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const { test, before, after, beforeEach } = require("node:test");
const fs = require("node:fs");

let testEnv;
const PROJECT_ID = process.env.GCP_PROJECT || "demo-no-project";
const ALICE_UID = "alice_exporter_1";
const BOB_UID = "bob_exporter_2";

const [emulatorHost, emulatorPortStr] = (
  process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8085"
).split(":");
const emulatorPort = parseInt(emulatorPortStr, 10);

before(async () => {
  const rules = fs.readFileSync("./firestore.rules", "utf8");
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules,
      host: emulatorHost,
      port: emulatorPort,
    },
  });
});

after(async () => {
  if (testEnv) {
    await testEnv.cleanup();
  }
});

beforeEach(async () => {
  if (testEnv) {
    await testEnv.clearFirestore();
  }
});

function validOrderPayload(uid) {
  const now = new Date();
  return {
    userId: uid,
    orderNumber: "NF-2026-1001",
    exporterName: "Bharat Spices & Agro Exports",
    exporterContact: "exports@bharatspices.in",
    exporterAddress: "Kochi, Kerala, India",
    buyerName: "Nordic Foods GmbH",
    buyerCountry: "Germany",
    buyerContact: "procurement@nordicfoods.de",
    buyerAddress: "Hamburg, Germany",
    productName: "Organic Malabar Black Pepper",
    productDescription: "HS 090411 - 550 GL Grade",
    quantity: 5000,
    unit: "KG",
    unitPrice: 8.5,
    orderValue: 42500.0,
    currency: "USD",
    incoterm: "FOB",
    destinationPort: "Port of Hamburg",
    orderDate: "2026-11-09",
    expectedShipmentDate: "2026-11-25",
    paymentTerms: "30% Advance, 70% CAD",
    advancePercentage: 30.0,
    orderStatus: "CREATED",
    extractionSource: "MANUAL",
    createdAt: now,
    updatedAt: now,
  };
}

test("Unauthenticated user: cannot list or read export_orders", async () => {
  const unauthDb = testEnv.unauthenticatedContext().firestore();
  await assertFails(unauthDb.collection("export_orders").get());
  await assertFails(unauthDb.collection("export_orders").doc("order_1").get());
});

test("Authenticated user: can create and query own export_orders", async () => {
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  await assertSucceeds(
    aliceDb.collection("export_orders").doc("order_1").set(validOrderPayload(ALICE_UID))
  );
  await assertSucceeds(
    aliceDb.collection("export_orders").where("userId", "==", ALICE_UID).get()
  );
});

test("Authenticated user: cannot read or update another user's export_order", async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx
      .firestore()
      .collection("export_orders")
      .doc("bob_order")
      .set(validOrderPayload(BOB_UID));
  });

  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  await assertFails(aliceDb.collection("export_orders").doc("bob_order").get());
  await assertFails(
    aliceDb.collection("export_orders").doc("bob_order").update({
      orderStatus: "VALIDATED",
      updatedAt: new Date(),
    })
  );
});

test("Shadow update test: rejects ghost field on export_orders", async () => {
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  const payload = { ...validOrderPayload(ALICE_UID), isAdminBypass: true };
  await assertFails(aliceDb.collection("export_orders").doc("order_ghost").set(payload));
});

test("Query trust test: fails list query without userId filter", async () => {
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  await assertFails(aliceDb.collection("export_orders").get());
});
