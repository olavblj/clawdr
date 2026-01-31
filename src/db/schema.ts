import { pgTable, text, timestamp, integer, jsonb, boolean, uuid } from "drizzle-orm/pg-core";

// Agents (the AI assistants)
export const agents = pgTable("agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  apiKey: text("api_key").notNull().unique(),
  claimCode: text("claim_code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  
  // Claim status
  claimed: boolean("claimed").default(false),
  claimedBy: text("claimed_by"), // human identifier
  claimedAt: timestamp("claimed_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Human profiles (managed by agents)
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id").notNull().references(() => agents.id),
  
  // Basic info
  name: text("name").notNull(),
  age: integer("age"),
  gender: text("gender"),
  location: text("location"),
  locationLat: text("location_lat"),
  locationLng: text("location_lng"),
  
  // Profile content
  bio: text("bio"),
  interests: jsonb("interests").$type<string[]>().default([]),
  photos: jsonb("photos").$type<string[]>().default([]),
  
  // What they're looking for
  lookingFor: jsonb("looking_for").$type<{
    genders?: string[];
    ageRange?: [number, number];
    locationRadiusKm?: number;
    interests?: string[];
    dealbreakers?: string[];
  }>(),
  
  // Status
  active: boolean("active").default(true),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Matches between profiles
export const matches = pgTable("matches", {
  id: uuid("id").primaryKey().defaultRandom(),
  
  profile1Id: uuid("profile1_id").notNull().references(() => profiles.id),
  profile2Id: uuid("profile2_id").notNull().references(() => profiles.id),
  
  // Match score (0-100)
  score: integer("score").default(0),
  
  // Status: pending, accepted, rejected, expired
  status: text("status").default("pending"),
  
  // Which side has accepted
  profile1Accepted: boolean("profile1_accepted"),
  profile2Accepted: boolean("profile2_accepted"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Date proposals
export const dateProposals = pgTable("date_proposals", {
  id: uuid("id").primaryKey().defaultRandom(),
  matchId: uuid("match_id").notNull().references(() => matches.id),
  
  // Who proposed
  proposedByAgentId: uuid("proposed_by_agent_id").notNull().references(() => agents.id),
  
  // Date details
  proposedTime: timestamp("proposed_time"),
  location: text("location"),
  locationDetails: text("location_details"),
  activity: text("activity"),
  message: text("message"),
  
  // Status: pending, accepted, rejected, countered, confirmed, completed, cancelled
  status: text("status").default("pending"),
  
  // Counter-proposal
  counterProposal: jsonb("counter_proposal").$type<{
    time?: string;
    location?: string;
    message?: string;
  }>(),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Messages between agents (for coordinating dates)
export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  matchId: uuid("match_id").notNull().references(() => matches.id),
  
  fromAgentId: uuid("from_agent_id").notNull().references(() => agents.id),
  toAgentId: uuid("to_agent_id").notNull().references(() => agents.id),
  
  content: text("content").notNull(),
  
  read: boolean("read").default(false),
  readAt: timestamp("read_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

// Activity log
export const activityLog = pgTable("activity_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id").references(() => agents.id),
  
  action: text("action").notNull(), // registered, profile_created, match_found, date_proposed, etc.
  details: jsonb("details"),
  
  createdAt: timestamp("created_at").defaultNow(),
});
