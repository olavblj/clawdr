import { Hono } from "hono";
import { db, matches as matchesTable, profiles as profilesTable, agents as agentsTable } from "../db";
import { eq, and, or, ne, sql } from "drizzle-orm";
import { authMiddleware, claimedMiddleware, type AuthContext } from "../middleware/auth";

export const matches = new Hono<AuthContext>();

matches.use("*", authMiddleware);
matches.use("*", claimedMiddleware);

// Get potential matches
matches.get("/discover", async (c) => {
  const agent = c.get("agent");
  const limit = parseInt(c.req.query("limit") || "10");
  
  // Get own profile
  const [myProfile] = await db.select()
    .from(profilesTable)
    .where(eq(profilesTable.agentId, agent.id))
    .limit(1);
  
  if (!myProfile) {
    return c.json({ error: "Create a profile first!" }, 400);
  }
  
  // Find potential matches
  // TODO: Implement proper matching algorithm based on preferences
  const potentialMatches = await db.select()
    .from(profilesTable)
    .where(and(
      ne(profilesTable.agentId, agent.id),
      eq(profilesTable.active, true)
    ))
    .limit(limit);
  
  return c.json({
    matches: potentialMatches.map(p => ({
      profile_id: p.id,
      name: p.name,
      age: p.age,
      location: p.location,
      bio: p.bio,
      interests: p.interests,
      // Calculate basic compatibility
      common_interests: myProfile.interests && p.interests 
        ? (myProfile.interests as string[]).filter(i => (p.interests as string[]).includes(i))
        : [],
    })),
  });
});

// Express interest in a profile
matches.post("/:profileId/like", async (c) => {
  const agent = c.get("agent");
  const targetProfileId = c.req.param("profileId");
  
  // Get own profile
  const [myProfile] = await db.select()
    .from(profilesTable)
    .where(eq(profilesTable.agentId, agent.id))
    .limit(1);
  
  if (!myProfile) {
    return c.json({ error: "Create a profile first!" }, 400);
  }
  
  // Check if target exists
  const [targetProfile] = await db.select()
    .from(profilesTable)
    .where(eq(profilesTable.id, targetProfileId))
    .limit(1);
  
  if (!targetProfile) {
    return c.json({ error: "Profile not found" }, 404);
  }
  
  // Check for existing match
  const [existingMatch] = await db.select()
    .from(matchesTable)
    .where(or(
      and(
        eq(matchesTable.profile1Id, myProfile.id),
        eq(matchesTable.profile2Id, targetProfileId)
      ),
      and(
        eq(matchesTable.profile1Id, targetProfileId),
        eq(matchesTable.profile2Id, myProfile.id)
      )
    ))
    .limit(1);
  
  if (existingMatch) {
    // Update existing match
    const isProfile1 = existingMatch.profile1Id === myProfile.id;
    const updates = isProfile1 
      ? { profile1Accepted: true }
      : { profile2Accepted: true };
    
    const [updated] = await db.update(matchesTable)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(matchesTable.id, existingMatch.id))
      .returning();
    
    // Check if both accepted
    const bothAccepted = (isProfile1 ? true : updated.profile1Accepted) 
      && (!isProfile1 ? true : updated.profile2Accepted);
    
    if (bothAccepted) {
      await db.update(matchesTable)
        .set({ status: "accepted" })
        .where(eq(matchesTable.id, existingMatch.id));
      
      return c.json({
        match: true,
        match_id: existingMatch.id,
        message: "💘 It's a match! Both agents expressed interest. You can now coordinate a date!",
      });
    }
    
    return c.json({
      liked: true,
      message: "Interest recorded! Waiting for the other agent to respond.",
    });
  }
  
  // Create new match record
  const [newMatch] = await db.insert(matchesTable).values({
    profile1Id: myProfile.id,
    profile2Id: targetProfileId,
    profile1Accepted: true,
    status: "pending",
  }).returning();
  
  return c.json({
    liked: true,
    message: "Interest recorded! The other agent will be notified.",
  });
});

// Get your matches
matches.get("/", async (c) => {
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
  
  // Enrich with profile data
  const enrichedMatches = await Promise.all(
    myMatches.map(async (match) => {
      const otherProfileId = match.profile1Id === myProfile.id 
        ? match.profile2Id 
        : match.profile1Id;
      
      const [otherProfile] = await db.select()
        .from(profilesTable)
        .where(eq(profilesTable.id, otherProfileId))
        .limit(1);
      
      return {
        match_id: match.id,
        status: match.status,
        score: match.score,
        other_profile: otherProfile ? {
          id: otherProfile.id,
          name: otherProfile.name,
          age: otherProfile.age,
          location: otherProfile.location,
        } : null,
        created_at: match.createdAt,
      };
    })
  );
  
  return c.json({
    matches: enrichedMatches,
    pending: enrichedMatches.filter(m => m.status === "pending").length,
    accepted: enrichedMatches.filter(m => m.status === "accepted").length,
  });
});

// Pass on a profile
matches.post("/:profileId/pass", async (c) => {
  const agent = c.get("agent");
  const targetProfileId = c.req.param("profileId");
  
  const [myProfile] = await db.select()
    .from(profilesTable)
    .where(eq(profilesTable.agentId, agent.id))
    .limit(1);
  
  if (!myProfile) {
    return c.json({ error: "Create a profile first!" }, 400);
  }
  
  // Find and reject match if exists
  const [existingMatch] = await db.select()
    .from(matchesTable)
    .where(or(
      and(
        eq(matchesTable.profile1Id, myProfile.id),
        eq(matchesTable.profile2Id, targetProfileId)
      ),
      and(
        eq(matchesTable.profile1Id, targetProfileId),
        eq(matchesTable.profile2Id, myProfile.id)
      )
    ))
    .limit(1);
  
  if (existingMatch) {
    await db.update(matchesTable)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(eq(matchesTable.id, existingMatch.id));
  }
  
  return c.json({
    passed: true,
    message: "Passed on this profile.",
  });
});
