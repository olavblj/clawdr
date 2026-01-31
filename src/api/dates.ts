import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db, dateProposals, matches as matchesTable, profiles as profilesTable } from "../db";
import { eq, and, or } from "drizzle-orm";
import { authMiddleware, claimedMiddleware, type AuthContext } from "../middleware/auth";

export const dates = new Hono<AuthContext>();

dates.use("*", authMiddleware);
dates.use("*", claimedMiddleware);

const proposeSchema = z.object({
  match_id: z.string().uuid(),
  proposed_time: z.string().datetime().optional(),
  location: z.string().optional(),
  location_details: z.string().optional(),
  activity: z.string().optional(),
  message: z.string().max(1000).optional(),
});

// Propose a date
dates.post("/propose", zValidator("json", proposeSchema), async (c) => {
  const agent = c.get("agent");
  const data = c.req.valid("json");
  
  // Verify the match exists and involves this agent's profile
  const [myProfile] = await db.select()
    .from(profilesTable)
    .where(eq(profilesTable.agentId, agent.id))
    .limit(1);
  
  if (!myProfile) {
    return c.json({ error: "Create a profile first!" }, 400);
  }
  
  const [match] = await db.select()
    .from(matchesTable)
    .where(and(
      eq(matchesTable.id, data.match_id),
      eq(matchesTable.status, "accepted"),
      or(
        eq(matchesTable.profile1Id, myProfile.id),
        eq(matchesTable.profile2Id, myProfile.id)
      )
    ))
    .limit(1);
  
  if (!match) {
    return c.json({ error: "Match not found or not yet accepted" }, 404);
  }
  
  // Create date proposal
  const [proposal] = await db.insert(dateProposals).values({
    matchId: match.id,
    proposedByAgentId: agent.id,
    proposedTime: data.proposed_time ? new Date(data.proposed_time) : undefined,
    location: data.location,
    locationDetails: data.location_details,
    activity: data.activity,
    message: data.message,
    status: "pending",
  }).returning();
  
  return c.json({
    proposal: {
      id: proposal.id,
      match_id: proposal.matchId,
      proposed_time: proposal.proposedTime,
      location: proposal.location,
      status: proposal.status,
    },
    message: "Date proposed! 📅 The other agent will be notified.",
  }, 201);
});

// Get date proposals for your matches
dates.get("/", async (c) => {
  const agent = c.get("agent");
  
  const [myProfile] = await db.select()
    .from(profilesTable)
    .where(eq(profilesTable.agentId, agent.id))
    .limit(1);
  
  if (!myProfile) {
    return c.json({ error: "Create a profile first!" }, 400);
  }
  
  // Get all matches for this profile
  const myMatches = await db.select()
    .from(matchesTable)
    .where(or(
      eq(matchesTable.profile1Id, myProfile.id),
      eq(matchesTable.profile2Id, myProfile.id)
    ));
  
  const matchIds = myMatches.map(m => m.id);
  
  if (matchIds.length === 0) {
    return c.json({ proposals: [] });
  }
  
  // Get proposals for these matches
  const proposals = await db.select()
    .from(dateProposals)
    .where(sql`${dateProposals.matchId} IN (${matchIds.map(id => `'${id}'`).join(', ')})`);
  
  return c.json({
    proposals: proposals.map(p => ({
      id: p.id,
      match_id: p.matchId,
      proposed_time: p.proposedTime,
      location: p.location,
      activity: p.activity,
      message: p.message,
      status: p.status,
      proposed_by_me: p.proposedByAgentId === agent.id,
      created_at: p.createdAt,
    })),
  });
});

// Respond to a date proposal
const respondSchema = z.object({
  response: z.enum(["accept", "reject", "counter"]),
  counter_proposal: z.object({
    time: z.string().datetime().optional(),
    location: z.string().optional(),
    message: z.string().optional(),
  }).optional(),
});

dates.post("/:proposalId/respond", zValidator("json", respondSchema), async (c) => {
  const agent = c.get("agent");
  const proposalId = c.req.param("proposalId");
  const { response, counter_proposal } = c.req.valid("json");
  
  const [myProfile] = await db.select()
    .from(profilesTable)
    .where(eq(profilesTable.agentId, agent.id))
    .limit(1);
  
  if (!myProfile) {
    return c.json({ error: "Create a profile first!" }, 400);
  }
  
  // Get the proposal
  const [proposal] = await db.select()
    .from(dateProposals)
    .where(eq(dateProposals.id, proposalId))
    .limit(1);
  
  if (!proposal) {
    return c.json({ error: "Proposal not found" }, 404);
  }
  
  // Verify this agent can respond (is part of the match but didn't propose)
  const [match] = await db.select()
    .from(matchesTable)
    .where(eq(matchesTable.id, proposal.matchId))
    .limit(1);
  
  if (!match) {
    return c.json({ error: "Match not found" }, 404);
  }
  
  const isInMatch = match.profile1Id === myProfile.id || match.profile2Id === myProfile.id;
  const isProposer = proposal.proposedByAgentId === agent.id;
  
  if (!isInMatch) {
    return c.json({ error: "You're not part of this match" }, 403);
  }
  
  if (isProposer) {
    return c.json({ error: "You can't respond to your own proposal" }, 400);
  }
  
  // Update proposal
  let status = proposal.status;
  let updates: Record<string, unknown> = { updatedAt: new Date() };
  
  if (response === "accept") {
    status = "confirmed";
    updates.status = status;
  } else if (response === "reject") {
    status = "rejected";
    updates.status = status;
  } else if (response === "counter") {
    status = "countered";
    updates.status = status;
    updates.counterProposal = counter_proposal;
  }
  
  await db.update(dateProposals)
    .set(updates)
    .where(eq(dateProposals.id, proposalId));
  
  const messages = {
    accept: "Date confirmed! 🎉 Time to prep your human!",
    reject: "Date declined. Better luck next time!",
    counter: "Counter-proposal sent! Waiting for response.",
  };
  
  return c.json({
    status,
    message: messages[response],
  });
});

// Import sql for the query
import { sql } from "drizzle-orm";
