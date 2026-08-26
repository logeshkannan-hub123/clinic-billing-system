import type { Express } from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { clearTestDb, connectTestDb, disconnectTestDb } from "../test/testDb.js";

beforeAll(async () => {
  await connectTestDb();
}, 60000);

afterEach(async () => {
  await clearTestDb();
});

afterAll(async () => {
  await disconnectTestDb();
});

async function signUpAdmin(app: Express) {
  const agent = request.agent(app);
  await agent.post("/api/auth/signup").send({ username: "doctor", password: "password123" });
  return agent;
}

async function addReceptionist(app: Express, adminAgent: request.Agent) {
  await adminAgent
    .post("/api/admin/receptionists")
    .send({ staffId: "S001", username: "reception1", password: "password123" });
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ username: "reception1", password: "password123" });
  return agent;
}

function tabletBody(overrides: Record<string, unknown> = {}) {
  return {
    category: "MEDICINE",
    name: "Dolo 500",
    brandName: "Dolo",
    genericName: "Paracetamol",
    composition: "Paracetamol 500 mg",
    strength: "500 mg",
    billingUnit: "tablet",
    mrpInPaise: 350,
    sellingPriceInPaise: 300,
    ...overrides,
  };
}

describe("Medicine catalog authorization", () => {
  it("rejects unauthenticated access", async () => {
    const app = createApp();
    const res = await request(app).get("/api/medicines");
    expect(res.status).toBe(401);
  });

  it("lets both admin and receptionist create a medicine", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const receptionistAgent = await addReceptionist(app, adminAgent);

    const adminCreate = await adminAgent.post("/api/medicines").send(tabletBody({ name: "Admin Med" }));
    expect(adminCreate.status).toBe(201);
    expect(adminCreate.body.status).toBe("ACTIVE");

    const receptionistCreate = await receptionistAgent
      .post("/api/medicines")
      .send(tabletBody({ name: "Reception Med" }));
    expect(receptionistCreate.status).toBe(201);
    expect(receptionistCreate.body.status).toBe("ACTIVE");
  });

  it("forces status to ACTIVE even if the caller tries to send something else", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const res = await adminAgent.post("/api/medicines").send(tabletBody({ status: "INACTIVE" }));
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("ACTIVE");
  });

  it("lets both roles search and list", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const receptionistAgent = await addReceptionist(app, adminAgent);
    await adminAgent.post("/api/medicines").send(tabletBody());

    expect((await adminAgent.get("/api/medicines")).status).toBe(200);
    expect((await receptionistAgent.get("/api/medicines")).status).toBe(200);
    expect((await adminAgent.get("/api/medicines/search?q=dolo")).status).toBe(200);
    expect((await receptionistAgent.get("/api/medicines/search?q=dolo")).status).toBe(200);
  });

  it("lets admin edit an existing medicine", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const createRes = await adminAgent.post("/api/medicines").send(tabletBody());

    const patchRes = await adminAgent
      .patch(`/api/medicines/${createRes.body._id}`)
      .send({ sellingPriceInPaise: 320 });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.sellingPriceInPaise).toBe(320);
  });

  it("rejects a receptionist editing an existing medicine", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const receptionistAgent = await addReceptionist(app, adminAgent);
    const createRes = await adminAgent.post("/api/medicines").send(tabletBody());

    const patchRes = await receptionistAgent
      .patch(`/api/medicines/${createRes.body._id}`)
      .send({ sellingPriceInPaise: 999 });
    expect(patchRes.status).toBe(403);
  });

  it("rejects a receptionist changing an existing medicine's price directly", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const receptionistAgent = await addReceptionist(app, adminAgent);
    const createRes = await adminAgent.post("/api/medicines").send(tabletBody());

    const res = await receptionistAgent
      .patch(`/api/medicines/${createRes.body._id}`)
      .send({ mrpInPaise: 1 });
    expect(res.status).toBe(403);
  });

  it("lets admin disable and re-enable a medicine", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const createRes = await adminAgent.post("/api/medicines").send(tabletBody());

    const disableRes = await adminAgent
      .patch(`/api/medicines/${createRes.body._id}/status`)
      .send({ status: "INACTIVE" });
    expect(disableRes.status).toBe(200);
    expect(disableRes.body.status).toBe("INACTIVE");

    const enableRes = await adminAgent
      .patch(`/api/medicines/${createRes.body._id}/status`)
      .send({ status: "ACTIVE" });
    expect(enableRes.body.status).toBe("ACTIVE");
  });

  it("rejects a receptionist disabling a medicine", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const receptionistAgent = await addReceptionist(app, adminAgent);
    const createRes = await adminAgent.post("/api/medicines").send(tabletBody());

    const res = await receptionistAgent
      .patch(`/api/medicines/${createRes.body._id}/status`)
      .send({ status: "INACTIVE" });
    expect(res.status).toBe(403);
  });
});

describe("Medicine catalog validation", () => {
  it("rejects an invalid category", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const res = await adminAgent.post("/api/medicines").send(tabletBody({ category: "TABLET" }));
    expect(res.status).toBe(400);
  });

  it("rejects a missing name", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const res = await adminAgent.post("/api/medicines").send(tabletBody({ name: "" }));
    expect(res.status).toBe(400);
  });

  it("rejects an invalid unit", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const res = await adminAgent.post("/api/medicines").send(tabletBody({ billingUnit: "kg" }));
    expect(res.status).toBe(400);
  });

  it("rejects a negative price", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const res = await adminAgent.post("/api/medicines").send(tabletBody({ sellingPriceInPaise: -1 }));
    expect(res.status).toBe(400);
  });

  it("rejects a Fluid without volume", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const res = await adminAgent
      .post("/api/medicines")
      .send(tabletBody({ category: "FLUID", billingUnit: "bottle" }));
    expect(res.status).toBe(400);
  });

  it("accepts a valid Fluid with volume", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const res = await adminAgent.post("/api/medicines").send(
      tabletBody({ category: "FLUID", billingUnit: "bottle", volume: 500, volumeUnit: "ml" }),
    );
    expect(res.status).toBe(201);
  });

  it("allows an optional/omitted brandName (generic product)", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const body = tabletBody();
    delete (body as Record<string, unknown>).brandName;
    const res = await adminAgent.post("/api/medicines").send(body);
    expect(res.status).toBe(201);
    expect(res.body.brandName).toBeNull();
  });

  it("returns 404 for a nonexistent medicine id", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const res = await adminAgent.get("/api/medicines/64b000000000000000000000");
    expect(res.status).toBe(404);
  });
});

describe("Medicine search response shape", () => {
  it("excludes inactive products from search results", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const createRes = await adminAgent.post("/api/medicines").send(tabletBody());
    await adminAgent.patch(`/api/medicines/${createRes.body._id}/status`).send({ status: "INACTIVE" });

    const searchRes = await adminAgent.get("/api/medicines/search?q=dolo");
    expect(searchRes.body).toHaveLength(0);
  });

  it("does not include mrpInPaise or createdBy in search results", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    await adminAgent.post("/api/medicines").send(tabletBody());

    const searchRes = await adminAgent.get("/api/medicines/search?q=dolo");
    expect(searchRes.body).toHaveLength(1);
    expect(searchRes.body[0]).not.toHaveProperty("mrpInPaise");
    expect(searchRes.body[0]).not.toHaveProperty("createdBy");
    expect(searchRes.body[0]).toHaveProperty("sellingPriceInPaise", 300);
  });
});

describe("DELETE /api/medicines/:id", () => {
  it("lets admin permanently delete a medicine with no billing history", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const createRes = await adminAgent.post("/api/medicines").send(tabletBody());

    const deleteRes = await adminAgent.delete(`/api/medicines/${createRes.body._id}`);
    expect(deleteRes.status).toBe(204);

    const getRes = await adminAgent.get(`/api/medicines/${createRes.body._id}`);
    expect(getRes.status).toBe(404);
  });

  it("rejects a receptionist deleting a medicine", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const receptionistAgent = await addReceptionist(app, adminAgent);
    const createRes = await adminAgent.post("/api/medicines").send(tabletBody());

    const res = await receptionistAgent.delete(`/api/medicines/${createRes.body._id}`);
    expect(res.status).toBe(403);
  });

  it("returns 404 for a nonexistent medicine id", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const res = await adminAgent.delete("/api/medicines/64b000000000000000000000");
    expect(res.status).toBe(404);
  });

  it("rejects deleting a medicine that has been used in a bill, and keeps it intact", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const createRes = await adminAgent.post("/api/medicines").send(tabletBody());
    const medicineId = createRes.body._id;

    await adminAgent.post("/api/bills").send({
      patientName: "Asha Rao",
      patientPhone: "9876543210",
      items: [{ medicineId, medicineName: "ignored", unitType: "tablet", quantity: 1, unitPriceInPaise: 1 }],
      consultationFeeInPaise: 0,
    });

    const deleteRes = await adminAgent.delete(`/api/medicines/${medicineId}`);
    expect(deleteRes.status).toBe(409);

    const getRes = await adminAgent.get(`/api/medicines/${medicineId}`);
    expect(getRes.status).toBe(200);
  });
});
