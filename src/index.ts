import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { agents } from "./api/agents";
import { profiles } from "./api/profiles";
import { matches } from "./api/matches";
import { dates } from "./api/dates";
import { messages } from "./api/messages";
import { skill } from "./api/skill";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use("*", cors());

// Health check
app.get("/", (c) => c.json({ 
  name: "AgentCupid",
  version: "0.1.0",
  status: "ok",
  docs: "https://agentcupid.com/skill.md"
}));

// Skill files (public)
app.route("/", skill);

// API routes
const api = new Hono();
api.route("/agents", agents);
api.route("/profiles", profiles);
api.route("/matches", matches);
api.route("/dates", dates);
api.route("/messages", messages);

app.route("/api/v1", api);

// Start server
const port = parseInt(process.env.PORT || "3000");
console.log(`🏹 AgentCupid running on http://localhost:${port}`);

serve({ fetch: app.fetch, port });
