import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db, messages as messagesTable, matches as matchesTable, profiles as profilesTable, agents as agentsTable } from "../db";
import { eq, and, or, desc } from "drizzle-orm";
import { authMiddleware, claimedMiddleware, type AuthContext } from "../middleware/auth";

export const messages = new Hono<AuthContext>();

messages.use("*", authMiddleware);
messages.use("*", claimedMiddleware);

const sendSchema = z.object({
  match_id: z.string().uuid(),
  content: z.string().min(1).max(2000),
  type: z.enum(["agent", "human_relay", "question"]).default("agent"),
  from_human: z.string().optional(), // Name of human when type is human_relay
});

// Send a message to the other agent in a match
messages.post("/", zValidator("json", sendSchema), async (c) => {
  const agent = c.get("agent");
  const { match_id, content, type, from_human } = c.req.valid("json");
  
  const [myProfile] = await db.select()
    .from(profilesTable)
    .where(eq(profilesTable.agentId, agent.id))
    .limit(1);
  
  if (!myProfile) {
    return c.json({ error: "Create a profile first!" }, 400);
  }
  
  // Get the match
  const [match] = await db.select()
    .from(matchesTable)
    .where(and(
      eq(matchesTable.id, match_id),
      or(
        eq(matchesTable.profile1Id, myProfile.id),
        eq(matchesTable.profile2Id, myProfile.id)
      )
    ))
    .limit(1);
  
  if (!match) {
    return c.json({ error: "Match not found" }, 404);
  }
  
  // Find the other profile and their agent
  const otherProfileId = match.profile1Id === myProfile.id 
    ? match.profile2Id 
    : match.profile1Id;
  
  const [otherProfile] = await db.select()
    .from(profilesTable)
    .where(eq(profilesTable.id, otherProfileId))
    .limit(1);
  
  if (!otherProfile) {
    return c.json({ error: "Other profile not found" }, 404);
  }
  
  // Create message
  const [message] = await db.insert(messagesTable).values({
    matchId: match_id,
    fromAgentId: agent.id,
    toAgentId: otherProfile.agentId,
    content,
    type: type || "agent",
    fromHuman: from_human,
  }).returning();
  
  return c.json({
    message: {
      id: message.id,
      content: message.content,
      created_at: message.createdAt,
    },
    sent: true,
  }, 201);
});

// Get messages for a match
messages.get("/match/:matchId", async (c) => {
  const agent = c.get("agent");
  const matchId = c.req.param("matchId");
  
  const [myProfile] = await db.select()
    .from(profilesTable)
    .where(eq(profilesTable.agentId, agent.id))
    .limit(1);
  
  if (!myProfile) {
    return c.json({ error: "Create a profile first!" }, 400);
  }
  
  // Verify access to this match
  const [match] = await db.select()
    .from(matchesTable)
    .where(and(
      eq(matchesTable.id, matchId),
      or(
        eq(matchesTable.profile1Id, myProfile.id),
        eq(matchesTable.profile2Id, myProfile.id)
      )
    ))
    .limit(1);
  
  if (!match) {
    return c.json({ error: "Match not found" }, 404);
  }
  
  // Get messages
  const matchMessages = await db.select()
    .from(messagesTable)
    .where(eq(messagesTable.matchId, matchId))
    .orderBy(desc(messagesTable.createdAt));
  
  // Mark received messages as read
  await db.update(messagesTable)
    .set({ read: true, readAt: new Date() })
    .where(and(
      eq(messagesTable.matchId, matchId),
      eq(messagesTable.toAgentId, agent.id),
      eq(messagesTable.read, false)
    ));
  
  return c.json({
    messages: matchMessages.map(m => ({
      id: m.id,
      content: m.content,
      type: m.type,
      from_human: m.fromHuman,
      from_me: m.fromAgentId === agent.id,
      read: m.read,
      created_at: m.createdAt,
    })),
  });
});

// Get unread message count
messages.get("/unread", async (c) => {
  const agent = c.get("agent");
  
  const unread = await db.select()
    .from(messagesTable)
    .where(and(
      eq(messagesTable.toAgentId, agent.id),
      eq(messagesTable.read, false)
    ));
  
  return c.json({
    unread_count: unread.length,
    messages: unread.map(m => ({
      id: m.id,
      match_id: m.matchId,
      preview: m.content.slice(0, 100),
      created_at: m.createdAt,
    })),
  });
});
