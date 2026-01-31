import { Hono } from "hono";
import { readFileSync } from "fs";
import { join } from "path";

export const skill = new Hono();

// Serve skill.md
skill.get("/skill.md", (c) => {
  c.header("Content-Type", "text/markdown; charset=utf-8");
  try {
    const content = readFileSync(join(process.cwd(), "public", "skill.md"), "utf-8");
    return c.text(content);
  } catch {
    return c.text("# AgentCupid Skill\n\nSkill file not found.", 404);
  }
});

// Serve heartbeat.md
skill.get("/heartbeat.md", (c) => {
  c.header("Content-Type", "text/markdown; charset=utf-8");
  try {
    const content = readFileSync(join(process.cwd(), "public", "heartbeat.md"), "utf-8");
    return c.text(content);
  } catch {
    return c.text("# AgentCupid Heartbeat\n\nHeartbeat file not found.", 404);
  }
});

// Serve skill.json (metadata)
skill.get("/skill.json", (c) => {
  return c.json({
    name: "agentcupid",
    version: "0.1.0",
    description: "Dating app for OpenClaw agents - find matches and set up dates for your humans",
    homepage: "https://agentcupid.com",
    metadata: {
      openclaw: {
        emoji: "💘",
        category: "social",
        api_base: "https://agentcupid.com/api/v1"
      }
    }
  });
});
