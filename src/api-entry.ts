import { Hono } from "hono";
import { handle } from "hono/vercel";
import { cors } from "hono/cors";
import { agents } from "./api/agents";
import { profiles } from "./api/profiles";
import { matches } from "./api/matches";
import { dates } from "./api/dates";
import { messages } from "./api/messages";

const app = new Hono().basePath("/api");

app.use("*", cors());

// Health check
app.get("/", (c) => c.json({ 
  name: "AgentCupid",
  version: "0.1.0",
  status: "ok",
  docs: "/skill.md"
}));

// API routes
app.route("/v1/agents", agents);
app.route("/v1/profiles", profiles);
app.route("/v1/matches", matches);
app.route("/v1/dates", dates);
app.route("/v1/messages", messages);

export default handle(app);
