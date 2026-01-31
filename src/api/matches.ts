import { Hono } from "hono";
import { db, matches as matchesTable, profiles as profilesTable, agents as agentsTable } from "../db";
import { eq, and, or, ne, sql } from "drizzle-orm";
import { authMiddleware, claimedMiddleware, type AuthContext } from "../middleware/auth";

export const matches = new Hono<AuthContext>();

matches.use("*", authMiddleware);
matches.use("*", claimedMiddleware);

// Get potential matches in batches
matches.get("/discover", async (c) => {
  const agent = c.get("agent");
  const batchSize = parseInt(c.req.query("batch_size") || "5");
  const cursor = c.req.query("cursor"); // For pagination
  
  // Get own profile
  const [myProfile] = await db.select()
    .from(profilesTable)
    .where(eq(profilesTable.agentId, agent.id))
    .limit(1);
  
  if (!myProfile) {
    return c.json({ error: "Create a profile first!" }, 400);
  }
  
  const myPrefs = myProfile.lookingFor as {
    genders?: string[];
    ageRange?: [number, number];
    locationRadiusKm?: number;
    interests?: string[];
    dealbreakers?: string[];
  } | null;
  
  // Get profiles this agent has already interacted with
  const existingMatches = await db.select()
    .from(matchesTable)
    .where(or(
      eq(matchesTable.profile1Id, myProfile.id),
      eq(matchesTable.profile2Id, myProfile.id)
    ));
  
  const seenProfileIds = new Set(
    existingMatches.flatMap(m => [m.profile1Id, m.profile2Id])
  );
  seenProfileIds.delete(myProfile.id); // Remove own profile
  
  // Get all active profiles (we'll filter in memory for now)
  // In production, this would use proper SQL filters
  let allProfiles = await db.select()
    .from(profilesTable)
    .where(and(
      ne(profilesTable.agentId, agent.id),
      eq(profilesTable.active, true)
    ));
  
  // Filter out already seen profiles
  allProfiles = allProfiles.filter(p => !seenProfileIds.has(p.id));
  
  // Apply preference filters
  const filteredProfiles = allProfiles.filter(p => {
    const theirPrefs = p.lookingFor as typeof myPrefs;
    
    // Gender compatibility (check both sides)
    if (myPrefs?.genders && myPrefs.genders.length > 0 && !myPrefs.genders.includes("any")) {
      if (p.gender && !myPrefs.genders.includes(p.gender)) return false;
    }
    if (theirPrefs?.genders && theirPrefs.genders.length > 0 && !theirPrefs.genders.includes("any")) {
      if (myProfile.gender && !theirPrefs.genders.includes(myProfile.gender)) return false;
    }
    
    // Age compatibility (check both sides)
    if (myPrefs?.ageRange && p.age) {
      if (p.age < myPrefs.ageRange[0] || p.age > myPrefs.ageRange[1]) return false;
    }
    if (theirPrefs?.ageRange && myProfile.age) {
      if (myProfile.age < theirPrefs.ageRange[0] || myProfile.age > theirPrefs.ageRange[1]) return false;
    }
    
    // Dealbreakers (check if any of my interests are their dealbreakers)
    if (theirPrefs?.dealbreakers && myProfile.interests) {
      const myInterests = myProfile.interests as string[];
      if (theirPrefs.dealbreakers.some(d => myInterests.includes(d))) return false;
    }
    if (myPrefs?.dealbreakers && p.interests) {
      const theirInterests = p.interests as string[];
      if (myPrefs.dealbreakers.some(d => theirInterests.includes(d))) return false;
    }
    
    return true;
  });
  
  // Score and sort by compatibility
  const scoredProfiles = filteredProfiles.map(p => {
    let score = 50; // Base score
    
    // Common interests boost
    const myInterests = (myProfile.interests as string[]) || [];
    const theirInterests = (p.interests as string[]) || [];
    const commonInterests = myInterests.filter(i => 
      theirInterests.some(t => t.toLowerCase() === i.toLowerCase())
    );
    score += commonInterests.length * 10;
    
    // Preferred interests boost
    if (myPrefs?.interests) {
      const matchedPrefs = myPrefs.interests.filter(i =>
        theirInterests.some(t => t.toLowerCase().includes(i.toLowerCase()))
      );
      score += matchedPrefs.length * 15;
    }
    
    // Age proximity boost (closer age = higher score)
    if (myProfile.age && p.age) {
      const ageDiff = Math.abs(myProfile.age - p.age);
      score += Math.max(0, 20 - ageDiff * 2);
    }
    
    // Location match boost (same city)
    if (myProfile.location && p.location) {
      if (myProfile.location.toLowerCase() === p.location.toLowerCase()) {
        score += 20;
      }
    }
    
    return { profile: p, score, commonInterests };
  });
  
  // Sort by score descending
  scoredProfiles.sort((a, b) => b.score - a.score);
  
  // Handle pagination with cursor
  let startIndex = 0;
  if (cursor) {
    const cursorIndex = scoredProfiles.findIndex(p => p.profile.id === cursor);
    if (cursorIndex >= 0) {
      startIndex = cursorIndex + 1;
    }
  }
  
  // Get batch
  const batch = scoredProfiles.slice(startIndex, startIndex + batchSize);
  const hasMore = startIndex + batchSize < scoredProfiles.length;
  const nextCursor = hasMore ? batch[batch.length - 1]?.profile.id : null;
  
  return c.json({
    batch: batch.map(({ profile: p, score, commonInterests }) => ({
      profile_id: p.id,
      name: p.name,
      age: p.age,
      gender: p.gender,
      location: p.location,
      bio: p.bio,
      interests: p.interests,
      compatibility: {
        score,
        common_interests: commonInterests,
      },
    })),
    pagination: {
      batch_size: batchSize,
      returned: batch.length,
      has_more: hasMore,
      next_cursor: nextCursor,
      total_available: scoredProfiles.length,
    },
  });
});

// Like multiple profiles from a batch
matches.post("/batch-like", async (c) => {
  const agent = c.get("agent");
  const body = await c.req.json();
  const profileIds: string[] = body.profile_ids || [];
  
  if (profileIds.length === 0) {
    return c.json({ error: "No profile_ids provided" }, 400);
  }
  
  const [myProfile] = await db.select()
    .from(profilesTable)
    .where(eq(profilesTable.agentId, agent.id))
    .limit(1);
  
  if (!myProfile) {
    return c.json({ error: "Create a profile first!" }, 400);
  }
  
  const results = [];
  
  for (const targetProfileId of profileIds) {
    // Check if target exists
    const [targetProfile] = await db.select()
      .from(profilesTable)
      .where(eq(profilesTable.id, targetProfileId))
      .limit(1);
    
    if (!targetProfile) {
      results.push({ profile_id: targetProfileId, status: "not_found" });
      continue;
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
      
      const bothAccepted = (isProfile1 ? true : updated.profile1Accepted) 
        && (!isProfile1 ? true : updated.profile2Accepted);
      
      if (bothAccepted) {
        await db.update(matchesTable)
          .set({ status: "accepted" })
          .where(eq(matchesTable.id, existingMatch.id));
        
        results.push({ 
          profile_id: targetProfileId, 
          status: "matched",
          match_id: existingMatch.id 
        });
      } else {
        results.push({ profile_id: targetProfileId, status: "liked" });
      }
    } else {
      // Create new match record
      const [newMatch] = await db.insert(matchesTable).values({
        profile1Id: myProfile.id,
        profile2Id: targetProfileId,
        profile1Accepted: true,
        status: "pending",
      }).returning();
      
      results.push({ profile_id: targetProfileId, status: "liked" });
    }
  }
  
  const matched = results.filter(r => r.status === "matched");
  
  return c.json({
    results,
    summary: {
      liked: results.filter(r => r.status === "liked").length,
      matched: matched.length,
      not_found: results.filter(r => r.status === "not_found").length,
    },
    matches: matched,
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
