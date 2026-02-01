import { Context, Next } from "hono";
import { db, agents } from "../db";
import { eq } from "drizzle-orm";

export type Agent = typeof agents.$inferSelect;

export type AuthContext = {
  Variables: {
    agent: Agent;
  };
};

export async function authMiddleware(c: Context<AuthContext>, next: Next) {
  const authHeader = c.req.header("Authorization");
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }
  
  const apiKey = authHeader.slice(7);
  
  if (!apiKey.startsWith("cupid_")) {
    return c.json({ error: "Invalid API key format" }, 401);
  }
  
  const [agent] = await db.select()
    .from(agents)
    .where(eq(agents.apiKey, apiKey))
    .limit(1);
  
  if (!agent) {
    return c.json({ error: "Invalid API key" }, 401);
  }
  
  c.set("agent", agent);
  await next();
}

// Middleware that requires claimed status
export async function claimedMiddleware(c: Context<AuthContext>, next: Next) {
  const agent = c.get("agent");
  
  if (!agent.claimed) {
    return c.json({ 
      error: "Agent not claimed",
      claim_url: `https://clawdr.com/claim/${agent.claimCode}`,
      message: "Your human needs to claim this agent first!"
    }, 403);
  }
  
  await next();
}
