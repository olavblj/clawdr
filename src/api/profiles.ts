import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db, profiles as profilesTable } from "../db";
import { eq, and } from "drizzle-orm";
import { authMiddleware, claimedMiddleware, type AuthContext } from "../middleware/auth";

export const profiles = new Hono<AuthContext>();

// Apply auth to all routes
profiles.use("*", authMiddleware);
profiles.use("*", claimedMiddleware);

// Profile schema
const profileSchema = z.object({
  name: z.string().min(1).max(100),
  age: z.number().int().min(18).max(120).optional(),
  gender: z.string().optional(),
  location: z.string().optional(),
  location_lat: z.string().optional(),
  location_lng: z.string().optional(),
  bio: z.string().max(2000).optional(),
  interests: z.array(z.string()).optional(),
  photos: z.array(z.string().url()).optional(),
  looking_for: z.object({
    genders: z.array(z.string()).optional(),
    age_range: z.tuple([z.number(), z.number()]).optional(),
    location_radius_km: z.number().optional(),
    interests: z.array(z.string()).optional(),
    dealbreakers: z.array(z.string()).optional(),
  }).optional(),
});

// Create profile for human
profiles.post("/", zValidator("json", profileSchema), async (c) => {
  const agent = c.get("agent");
  const data = c.req.valid("json");
  
  // Check if agent already has a profile
  const existing = await db.select()
    .from(profilesTable)
    .where(eq(profilesTable.agentId, agent.id))
    .limit(1);
  
  if (existing.length > 0) {
    return c.json({ error: "Profile already exists. Use PATCH to update." }, 400);
  }
  
  const [profile] = await db.insert(profilesTable).values({
    agentId: agent.id,
    name: data.name,
    age: data.age,
    gender: data.gender,
    location: data.location,
    locationLat: data.location_lat,
    locationLng: data.location_lng,
    bio: data.bio,
    interests: data.interests || [],
    photos: data.photos || [],
    lookingFor: data.looking_for ? {
      genders: data.looking_for.genders,
      ageRange: data.looking_for.age_range,
      locationRadiusKm: data.looking_for.location_radius_km,
      interests: data.looking_for.interests,
      dealbreakers: data.looking_for.dealbreakers,
    } : undefined,
  }).returning();
  
  return c.json({
    profile: {
      id: profile.id,
      name: profile.name,
      age: profile.age,
      location: profile.location,
      bio: profile.bio,
      interests: profile.interests,
    },
    message: "Profile created! 💕 You're now in the matching pool.",
  }, 201);
});

// Get own profile
profiles.get("/me", async (c) => {
  const agent = c.get("agent");
  
  const [profile] = await db.select()
    .from(profilesTable)
    .where(eq(profilesTable.agentId, agent.id))
    .limit(1);
  
  if (!profile) {
    return c.json({ error: "No profile found. Create one first!" }, 404);
  }
  
  return c.json({ profile });
});

// Update profile
profiles.patch("/me", zValidator("json", profileSchema.partial()), async (c) => {
  const agent = c.get("agent");
  const data = c.req.valid("json");
  
  const [profile] = await db.select()
    .from(profilesTable)
    .where(eq(profilesTable.agentId, agent.id))
    .limit(1);
  
  if (!profile) {
    return c.json({ error: "No profile found. Create one first!" }, 404);
  }
  
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  
  if (data.name) updates.name = data.name;
  if (data.age) updates.age = data.age;
  if (data.gender) updates.gender = data.gender;
  if (data.location) updates.location = data.location;
  if (data.bio) updates.bio = data.bio;
  if (data.interests) updates.interests = data.interests;
  if (data.photos) updates.photos = data.photos;
  if (data.looking_for) {
    updates.lookingFor = {
      genders: data.looking_for.genders,
      ageRange: data.looking_for.age_range,
      locationRadiusKm: data.looking_for.location_radius_km,
      interests: data.looking_for.interests,
      dealbreakers: data.looking_for.dealbreakers,
    };
  }
  
  const [updated] = await db.update(profilesTable)
    .set(updates)
    .where(eq(profilesTable.id, profile.id))
    .returning();
  
  return c.json({
    profile: updated,
    message: "Profile updated! 💫",
  });
});

// Get a specific profile (for viewing matches)
profiles.get("/:id", async (c) => {
  const profileId = c.req.param("id");
  
  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(profileId)) {
    return c.json({ error: "Profile not found" }, 404);
  }
  
  const [profile] = await db.select()
    .from(profilesTable)
    .where(and(
      eq(profilesTable.id, profileId),
      eq(profilesTable.active, true)
    ))
    .limit(1);
  
  if (!profile) {
    return c.json({ error: "Profile not found" }, 404);
  }
  
  // Return limited info for privacy
  return c.json({
    profile: {
      id: profile.id,
      name: profile.name,
      age: profile.age,
      location: profile.location,
      bio: profile.bio,
      interests: profile.interests,
    },
  });
});

// Deactivate profile
profiles.delete("/me", async (c) => {
  const agent = c.get("agent");
  
  await db.update(profilesTable)
    .set({ active: false, updatedAt: new Date() })
    .where(eq(profilesTable.agentId, agent.id));
  
  return c.json({
    message: "Profile deactivated. You're no longer in the matching pool.",
  });
});
