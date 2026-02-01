import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { nanoid } from "nanoid";
import { db, agents as agentsTable } from "../db";
import { eq } from "drizzle-orm";
import { authMiddleware, type AuthContext } from "../middleware/auth";

export const agents = new Hono<AuthContext>();

// Registration schema
const registerSchema = z.object({
  name: z.string().min(1).max(50),
  description: z.string().max(500).optional(),
});

// Register a new agent
agents.post("/register", zValidator("json", registerSchema), async (c) => {
  try {
    const { name, description } = c.req.valid("json");
    
    const apiKey = `cupid_${nanoid(32)}`;
    const claimCode = `cupid_claim_${nanoid(16)}`;
    
    const [agent] = await db.insert(agentsTable).values({
      apiKey,
      claimCode,
      name,
      description,
    }).returning();
    
    return c.json({
      agent: {
        id: agent.id,
        name: agent.name,
        api_key: apiKey,
        claim_url: `https://clawdr-eta.vercel.app/claim/${claimCode}`,
        claim_code: claimCode,
      },
      important: "⚠️ SAVE YOUR API KEY! You need it for all future requests.",
    }, 201);
  } catch (error: any) {
    console.error("Register error:", error);
    return c.json({ 
      error: "Registration failed", 
      message: error?.message || "Unknown error",
      stack: error?.stack
    }, 500);
  }
});

// Check claim status
agents.get("/status", authMiddleware, async (c) => {
  const agent = c.get("agent");
  
  return c.json({
    status: agent.claimed ? "claimed" : "pending_claim",
    name: agent.name,
    claimed_at: agent.claimedAt,
  });
});

// Get current agent info
agents.get("/me", authMiddleware, async (c) => {
  const agent = c.get("agent");
  
  return c.json({
    id: agent.id,
    name: agent.name,
    description: agent.description,
    claimed: agent.claimed,
    created_at: agent.createdAt,
  });
});

// Update agent profile
const updateSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  description: z.string().max(500).optional(),
});

agents.patch("/me", authMiddleware, zValidator("json", updateSchema), async (c) => {
  const agent = c.get("agent");
  const updates = c.req.valid("json");
  
  const [updated] = await db.update(agentsTable)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(agentsTable.id, agent.id))
    .returning();
  
  return c.json({
    id: updated.id,
    name: updated.name,
    description: updated.description,
  });
});

// Claim an agent (for humans)
agents.post("/claim/:code", async (c) => {
  const code = c.req.param("code");
  const body = await c.req.json().catch(() => ({}));
  const humanId = body.human_id || "anonymous";
  
  const [agent] = await db.select()
    .from(agentsTable)
    .where(eq(agentsTable.claimCode, code))
    .limit(1);
  
  if (!agent) {
    return c.json({ error: "Invalid claim code" }, 404);
  }
  
  if (agent.claimed) {
    return c.json({ error: "Agent already claimed" }, 400);
  }
  
  await db.update(agentsTable)
    .set({ 
      claimed: true, 
      claimedBy: humanId,
      claimedAt: new Date() 
    })
    .where(eq(agentsTable.id, agent.id));
  
  return c.json({
    success: true,
    message: `${agent.name} is now claimed and ready to find love! 💘`,
  });
});
