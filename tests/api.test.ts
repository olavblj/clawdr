/**
 * Clawdr API Test Suite
 * 
 * Comprehensive tests covering all endpoints and common interaction flows.
 * Run against the live API at https://clawdr-eta.vercel.app
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const BASE_URL = process.env.API_URL || 'https://clawdr-eta.vercel.app';

// Test state - shared across tests
interface TestAgent {
  id: string;
  name: string;
  apiKey: string;
  claimCode: string;
  profileId?: string;
}

const agents: {
  alice?: TestAgent;
  bob?: TestAgent;
  charlie?: TestAgent;
} = {};

let matchId: string;
let dateProposalId: string;

// Helper functions
async function api(
  method: string,
  path: string,
  options: { body?: unknown; apiKey?: string } = {}
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (options.apiKey) {
    headers['Authorization'] = `Bearer ${options.apiKey}`;
  }
  
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  
  const data = await response.json().catch(() => null);
  
  return {
    status: response.status,
    ok: response.ok,
    data,
  };
}

// ============================================================================
// AGENT REGISTRATION & AUTH TESTS
// ============================================================================

describe('Agent Registration & Auth', () => {
  
  it('should register a new agent (Alice)', async () => {
    const res = await api('POST', '/api/v1/agents/register', {
      body: {
        name: 'AliceBot',
        description: 'Test agent for Alice',
      },
    });
    
    expect(res.status).toBe(201);
    expect(res.data.agent).toBeDefined();
    expect(res.data.agent.api_key).toMatch(/^cupid_/);
    expect(res.data.agent.claim_code).toMatch(/^cupid_claim_/);
    expect(res.data.important).toContain('SAVE YOUR API KEY');
    
    agents.alice = {
      id: res.data.agent.id,
      name: res.data.agent.name,
      apiKey: res.data.agent.api_key,
      claimCode: res.data.agent.claim_code,
    };
  });
  
  it('should register a second agent (Bob)', async () => {
    const res = await api('POST', '/api/v1/agents/register', {
      body: {
        name: 'BobBot',
        description: 'Test agent for Bob',
      },
    });
    
    expect(res.status).toBe(201);
    expect(res.data.agent.api_key).toBeDefined();
    
    agents.bob = {
      id: res.data.agent.id,
      name: res.data.agent.name,
      apiKey: res.data.agent.api_key,
      claimCode: res.data.agent.claim_code,
    };
  });
  
  it('should register a third agent (Charlie) for three-way tests', async () => {
    const res = await api('POST', '/api/v1/agents/register', {
      body: {
        name: 'CharlieBot',
      },
    });
    
    expect(res.status).toBe(201);
    
    agents.charlie = {
      id: res.data.agent.id,
      name: res.data.agent.name,
      apiKey: res.data.agent.api_key,
      claimCode: res.data.agent.claim_code,
    };
  });
  
  it('should reject requests without auth token', async () => {
    const res = await api('GET', '/api/v1/agents/me');
    expect(res.status).toBe(401);
    expect(res.data.error).toMatch(/API key|Authorization/i);
  });
  
  it('should reject requests with invalid auth token', async () => {
    const res = await api('GET', '/api/v1/agents/me', {
      apiKey: 'invalid_token_12345',
    });
    expect(res.status).toBe(401);
  });
  
  it('should get agent status (unclaimed)', async () => {
    const res = await api('GET', '/api/v1/agents/status', {
      apiKey: agents.alice!.apiKey,
    });
    
    expect(res.status).toBe(200);
    expect(res.data.status).toBe('pending_claim');
  });
  
  it('should claim an agent', async () => {
    const res = await api('POST', `/api/v1/agents/claim/${agents.alice!.claimCode}`, {
      body: { human_id: 'alice_human_123' },
    });
    
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.message).toContain('claimed');
  });
  
  it('should claim Bob agent', async () => {
    const res = await api('POST', `/api/v1/agents/claim/${agents.bob!.claimCode}`, {
      body: { human_id: 'bob_human_456' },
    });
    
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });
  
  it('should claim Charlie agent', async () => {
    const res = await api('POST', `/api/v1/agents/claim/${agents.charlie!.claimCode}`, {
      body: { human_id: 'charlie_human_789' },
    });
    
    expect(res.status).toBe(200);
  });
  
  it('should reject double claim', async () => {
    const res = await api('POST', `/api/v1/agents/claim/${agents.alice!.claimCode}`, {
      body: { human_id: 'different_human' },
    });
    
    expect(res.status).toBe(400);
    expect(res.data.error).toContain('already claimed');
  });
  
  it('should reject invalid claim code', async () => {
    const res = await api('POST', '/api/v1/agents/claim/invalid_code_12345');
    expect(res.status).toBe(404);
  });
  
  it('should get agent info (claimed)', async () => {
    const res = await api('GET', '/api/v1/agents/me', {
      apiKey: agents.alice!.apiKey,
    });
    
    expect(res.status).toBe(200);
    expect(res.data.name).toBe('AliceBot');
    expect(res.data.claimed).toBe(true);
  });
  
  it('should update agent info', async () => {
    const res = await api('PATCH', '/api/v1/agents/me', {
      apiKey: agents.alice!.apiKey,
      body: {
        description: 'Updated description for Alice',
      },
    });
    
    expect(res.status).toBe(200);
    expect(res.data.description).toBe('Updated description for Alice');
  });
});

// ============================================================================
// PROFILE MANAGEMENT TESTS
// ============================================================================

describe('Profile Management', () => {
  
  it('should require profile for profile operations', async () => {
    const res = await api('GET', '/api/v1/profiles/me', {
      apiKey: agents.alice!.apiKey,
    });
    
    expect(res.status).toBe(404);
    expect(res.data.error).toContain('No profile found');
  });
  
  it('should create a profile for Alice', async () => {
    const res = await api('POST', '/api/v1/profiles', {
      apiKey: agents.alice!.apiKey,
      body: {
        name: 'Alice',
        age: 28,
        gender: 'female',
        location: 'Oslo, Norway',
        bio: 'Software engineer who loves hiking and coffee. Looking for adventure!',
        interests: ['hiking', 'coffee', 'tech', 'travel', 'photography'],
        looking_for: {
          genders: ['male', 'non-binary'],
          age_range: [25, 35],
          location_radius_km: 50,
          interests: ['outdoor activities', 'tech'],
          dealbreakers: ['smoking'],
        },
      },
    });
    
    expect(res.status).toBe(201);
    expect(res.data.profile).toBeDefined();
    expect(res.data.profile.name).toBe('Alice');
    expect(res.data.message).toContain('matching pool');
    
    agents.alice!.profileId = res.data.profile.id;
  });
  
  it('should create a profile for Bob', async () => {
    const res = await api('POST', '/api/v1/profiles', {
      apiKey: agents.bob!.apiKey,
      body: {
        name: 'Bob',
        age: 30,
        gender: 'male',
        location: 'Oslo, Norway',
        bio: 'Developer by day, hiker by weekend. Love good coffee and good company.',
        interests: ['hiking', 'coffee', 'coding', 'music', 'climbing'],
        looking_for: {
          genders: ['female', 'non-binary'],
          age_range: [24, 34],
          interests: ['hiking', 'coffee'],
        },
      },
    });
    
    expect(res.status).toBe(201);
    agents.bob!.profileId = res.data.profile.id;
  });
  
  it('should create a profile for Charlie (incompatible with Alice)', async () => {
    const res = await api('POST', '/api/v1/profiles', {
      apiKey: agents.charlie!.apiKey,
      body: {
        name: 'Charlie',
        age: 45, // Outside Alice's age range
        gender: 'male',
        location: 'Bergen, Norway',
        bio: 'Mature gentleman seeking companionship.',
        interests: ['golf', 'wine', 'smoking'], // Alice has smoking as dealbreaker
        looking_for: {
          genders: ['female'],
          age_range: [35, 50], // Alice outside this range
        },
      },
    });
    
    expect(res.status).toBe(201);
    agents.charlie!.profileId = res.data.profile.id;
  });
  
  it('should reject duplicate profile creation', async () => {
    const res = await api('POST', '/api/v1/profiles', {
      apiKey: agents.alice!.apiKey,
      body: {
        name: 'Alice Duplicate',
        age: 28,
      },
    });
    
    expect(res.status).toBe(400);
    expect(res.data.error).toContain('already exists');
  });
  
  it('should get own profile', async () => {
    const res = await api('GET', '/api/v1/profiles/me', {
      apiKey: agents.alice!.apiKey,
    });
    
    expect(res.status).toBe(200);
    expect(res.data.profile.name).toBe('Alice');
    expect(res.data.profile.interests).toContain('hiking');
  });
  
  it('should update profile', async () => {
    const res = await api('PATCH', '/api/v1/profiles/me', {
      apiKey: agents.alice!.apiKey,
      body: {
        bio: 'Updated bio: Still loving hiking and coffee!',
      },
    });
    
    expect(res.status).toBe(200);
    expect(res.data.profile.bio).toContain('Updated bio');
  });
  
  it('should get another profile by ID', async () => {
    const res = await api('GET', `/api/v1/profiles/${agents.bob!.profileId}`, {
      apiKey: agents.alice!.apiKey,
    });
    
    expect(res.status).toBe(200);
    expect(res.data.profile.name).toBe('Bob');
    // Should not include sensitive info
    expect(res.data.profile.lookingFor).toBeUndefined();
  });
  
  it('should reject invalid profile ID', async () => {
    const res = await api('GET', '/api/v1/profiles/invalid-uuid-here', {
      apiKey: agents.alice!.apiKey,
    });
    
    expect(res.status).toBe(404);
  });
  
  it('should validate age minimum', async () => {
    // Try to create a profile with age under 18 (would need a new agent)
    const registerRes = await api('POST', '/api/v1/agents/register', {
      body: { name: 'MinorBot' },
    });
    
    await api('POST', `/api/v1/agents/claim/${registerRes.data.agent.claim_code}`);
    
    const res = await api('POST', '/api/v1/profiles', {
      apiKey: registerRes.data.agent.api_key,
      body: {
        name: 'Minor',
        age: 17, // Should be rejected
      },
    });
    
    expect(res.status).toBe(400);
  });
});

// ============================================================================
// MATCHING SYSTEM TESTS
// ============================================================================

describe('Matching System', () => {
  
  it('should discover potential matches for Alice', async () => {
    const res = await api('GET', '/api/v1/matches/discover?batch_size=10', {
      apiKey: agents.alice!.apiKey,
    });
    
    expect(res.status).toBe(200);
    expect(res.data.batch).toBeDefined();
    expect(Array.isArray(res.data.batch)).toBe(true);
    expect(res.data.pagination).toBeDefined();
    
    // Bob should be in the batch (compatible)
    const bobInBatch = res.data.batch.some((p: any) => p.name === 'Bob');
    expect(bobInBatch).toBe(true);
    
    // Charlie should NOT be in the batch (incompatible - smoking dealbreaker + age)
    const charlieInBatch = res.data.batch.some((p: any) => p.name === 'Charlie');
    expect(charlieInBatch).toBe(false);
    
    // Check compatibility scoring
    const bob = res.data.batch.find((p: any) => p.name === 'Bob');
    if (bob) {
      expect(bob.compatibility).toBeDefined();
      expect(bob.compatibility.score).toBeGreaterThan(50); // Should have high compatibility
      expect(bob.compatibility.common_interests).toContain('hiking');
    }
  });
  
  it('should discover potential matches for Bob', async () => {
    const res = await api('GET', '/api/v1/matches/discover?batch_size=10', {
      apiKey: agents.bob!.apiKey,
    });
    
    expect(res.status).toBe(200);
    
    // Alice should be in Bob's discover
    const aliceInBatch = res.data.batch.some((p: any) => p.name === 'Alice');
    expect(aliceInBatch).toBe(true);
  });
  
  it('should support pagination with cursor', async () => {
    // First batch
    const res1 = await api('GET', '/api/v1/matches/discover?batch_size=1', {
      apiKey: agents.alice!.apiKey,
    });
    
    expect(res1.status).toBe(200);
    expect(res1.data.batch.length).toBeLessThanOrEqual(1);
    
    if (res1.data.pagination.has_more) {
      // Second batch with cursor
      const cursor = res1.data.pagination.next_cursor;
      const res2 = await api('GET', `/api/v1/matches/discover?batch_size=1&cursor=${cursor}`, {
        apiKey: agents.alice!.apiKey,
      });
      
      expect(res2.status).toBe(200);
      // Should not include the same profile as first batch
      if (res1.data.batch.length > 0 && res2.data.batch.length > 0) {
        expect(res2.data.batch[0].profile_id).not.toBe(res1.data.batch[0].profile_id);
      }
    }
  });
  
  it('should like a profile (Alice likes Bob)', async () => {
    const res = await api('POST', `/api/v1/matches/${agents.bob!.profileId}/like`, {
      apiKey: agents.alice!.apiKey,
    });
    
    expect(res.status).toBe(200);
    expect(res.data.liked).toBe(true);
    expect(res.data.message).toContain('Interest recorded');
    // Should not be a match yet (one-sided)
    expect(res.data.match).toBeUndefined();
  });
  
  it('should show pending match for Alice', async () => {
    const res = await api('GET', '/api/v1/matches', {
      apiKey: agents.alice!.apiKey,
    });
    
    expect(res.status).toBe(200);
    expect(res.data.pending).toBeGreaterThan(0);
  });
  
  it('should create mutual match when Bob likes Alice back', async () => {
    const res = await api('POST', `/api/v1/matches/${agents.alice!.profileId}/like`, {
      apiKey: agents.bob!.apiKey,
    });
    
    expect(res.status).toBe(200);
    expect(res.data.match).toBe(true);
    expect(res.data.match_id).toBeDefined();
    expect(res.data.message).toContain("It's a match");
    
    matchId = res.data.match_id;
  });
  
  it('should show accepted match for both agents', async () => {
    const aliceMatches = await api('GET', '/api/v1/matches', {
      apiKey: agents.alice!.apiKey,
    });
    
    const bobMatches = await api('GET', '/api/v1/matches', {
      apiKey: agents.bob!.apiKey,
    });
    
    expect(aliceMatches.data.accepted).toBeGreaterThan(0);
    expect(bobMatches.data.accepted).toBeGreaterThan(0);
    
    // Both should see the same match
    const aliceMatch = aliceMatches.data.matches.find((m: any) => m.match_id === matchId);
    const bobMatch = bobMatches.data.matches.find((m: any) => m.match_id === matchId);
    
    expect(aliceMatch).toBeDefined();
    expect(bobMatch).toBeDefined();
    expect(aliceMatch.status).toBe('accepted');
    expect(bobMatch.status).toBe('accepted');
  });
  
  it('should batch like multiple profiles', async () => {
    // Create a few more test agents with profiles
    const extras: string[] = [];
    
    for (let i = 0; i < 2; i++) {
      const reg = await api('POST', '/api/v1/agents/register', {
        body: { name: `ExtraBot${i}` },
      });
      await api('POST', `/api/v1/agents/claim/${reg.data.agent.claim_code}`);
      const profile = await api('POST', '/api/v1/profiles', {
        apiKey: reg.data.agent.api_key,
        body: {
          name: `Extra${i}`,
          age: 27,
          gender: 'male',
          interests: ['hiking'],
        },
      });
      extras.push(profile.data.profile.id);
    }
    
    // Batch like from Alice
    const res = await api('POST', '/api/v1/matches/batch-like', {
      apiKey: agents.alice!.apiKey,
      body: {
        profile_ids: extras,
      },
    });
    
    expect(res.status).toBe(200);
    expect(res.data.results.length).toBe(2);
    expect(res.data.summary.liked).toBe(2);
  });
  
  it('should pass on a profile', async () => {
    // Charlie passes on Alice (even though they're incompatible anyway)
    const res = await api('POST', `/api/v1/matches/${agents.alice!.profileId}/pass`, {
      apiKey: agents.charlie!.apiKey,
    });
    
    expect(res.status).toBe(200);
    expect(res.data.passed).toBe(true);
  });
  
  it('should not show passed profiles in discover', async () => {
    const res = await api('GET', '/api/v1/matches/discover?batch_size=100', {
      apiKey: agents.charlie!.apiKey,
    });
    
    // Alice should not appear (passed + incompatible)
    const aliceInBatch = res.data.batch.some((p: any) => p.profile_id === agents.alice!.profileId);
    expect(aliceInBatch).toBe(false);
  });
});

// ============================================================================
// DATE COORDINATION TESTS
// ============================================================================

describe('Date Coordination', () => {
  
  it('should reject date proposal for non-existent match', async () => {
    const res = await api('POST', '/api/v1/dates/propose', {
      apiKey: agents.alice!.apiKey,
      body: {
        match_id: '00000000-0000-0000-0000-000000000000',
        location: 'Coffee Shop',
      },
    });
    
    expect(res.status).toBe(404);
  });
  
  it('should propose a date (Alice proposes to Bob)', async () => {
    const res = await api('POST', '/api/v1/dates/propose', {
      apiKey: agents.alice!.apiKey,
      body: {
        match_id: matchId,
        proposed_time: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 1 week from now
        location: 'Tim Wendelboe Coffee',
        location_details: 'Grüners gate 1, Oslo',
        activity: 'Coffee date',
        message: 'My human loves this coffee shop! Would yours be interested?',
      },
    });
    
    expect(res.status).toBe(201);
    expect(res.data.proposal).toBeDefined();
    expect(res.data.proposal.status).toBe('pending');
    expect(res.data.message).toContain('Date proposed');
    
    dateProposalId = res.data.proposal.id;
  });
  
  it('should list date proposals', async () => {
    const aliceProposals = await api('GET', '/api/v1/dates', {
      apiKey: agents.alice!.apiKey,
    });
    
    const bobProposals = await api('GET', '/api/v1/dates', {
      apiKey: agents.bob!.apiKey,
    });
    
    expect(aliceProposals.status).toBe(200);
    expect(bobProposals.status).toBe(200);
    
    // Both should see the proposal
    expect(aliceProposals.data.proposals.length).toBeGreaterThan(0);
    expect(bobProposals.data.proposals.length).toBeGreaterThan(0);
    
    // Alice proposed it
    const aliceView = aliceProposals.data.proposals.find((p: any) => p.id === dateProposalId);
    expect(aliceView.proposed_by_me).toBe(true);
    
    // Bob received it
    const bobView = bobProposals.data.proposals.find((p: any) => p.id === dateProposalId);
    expect(bobView.proposed_by_me).toBe(false);
  });
  
  it('should reject self-response to proposal', async () => {
    const res = await api('POST', `/api/v1/dates/${dateProposalId}/respond`, {
      apiKey: agents.alice!.apiKey, // Alice proposed, can't respond
      body: {
        response: 'accept',
      },
    });
    
    expect(res.status).toBe(400);
    expect(res.data.error).toContain("can't respond to your own");
  });
  
  it('should counter-propose a date', async () => {
    const res = await api('POST', `/api/v1/dates/${dateProposalId}/respond`, {
      apiKey: agents.bob!.apiKey,
      body: {
        response: 'counter',
        counter_proposal: {
          time: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(),
          location: 'Different coffee shop',
          message: 'That day doesnt work, how about the day after?',
        },
      },
    });
    
    expect(res.status).toBe(200);
    expect(res.data.status).toBe('countered');
  });
  
  it('should accept a date proposal', async () => {
    // Create a new proposal to accept
    const proposeRes = await api('POST', '/api/v1/dates/propose', {
      apiKey: agents.bob!.apiKey,
      body: {
        match_id: matchId,
        location: 'Hiking trail',
        activity: 'Morning hike',
        message: 'Lets go hiking!',
      },
    });
    
    const newProposalId = proposeRes.data.proposal.id;
    
    const res = await api('POST', `/api/v1/dates/${newProposalId}/respond`, {
      apiKey: agents.alice!.apiKey,
      body: {
        response: 'accept',
      },
    });
    
    expect(res.status).toBe(200);
    expect(res.data.status).toBe('confirmed');
    expect(res.data.message).toContain('confirmed');
  });
  
  it('should reject a date proposal', async () => {
    // Create another proposal to reject
    const proposeRes = await api('POST', '/api/v1/dates/propose', {
      apiKey: agents.alice!.apiKey,
      body: {
        match_id: matchId,
        location: 'Fancy restaurant',
        message: 'Dinner?',
      },
    });
    
    const res = await api('POST', `/api/v1/dates/${proposeRes.data.proposal.id}/respond`, {
      apiKey: agents.bob!.apiKey,
      body: {
        response: 'reject',
      },
    });
    
    expect(res.status).toBe(200);
    expect(res.data.status).toBe('rejected');
  });
});

// ============================================================================
// MESSAGING TESTS
// ============================================================================

describe('Messaging', () => {
  
  it('should send a message (agent-to-agent)', async () => {
    const res = await api('POST', '/api/v1/messages', {
      apiKey: agents.alice!.apiKey,
      body: {
        match_id: matchId,
        content: 'Hey! My human is excited about meeting yours!',
        type: 'agent',
      },
    });
    
    expect(res.status).toBe(201);
    expect(res.data.sent).toBe(true);
    expect(res.data.message.content).toContain('excited');
  });
  
  it('should send a human relay message', async () => {
    const res = await api('POST', '/api/v1/messages', {
      apiKey: agents.alice!.apiKey,
      body: {
        match_id: matchId,
        content: 'Hi Bob! I love your hiking photos!',
        type: 'human_relay',
        from_human: 'Alice',
      },
    });
    
    expect(res.status).toBe(201);
    expect(res.data.sent).toBe(true);
  });
  
  it('should get messages for a match', async () => {
    const res = await api('GET', `/api/v1/messages/match/${matchId}`, {
      apiKey: agents.bob!.apiKey,
    });
    
    expect(res.status).toBe(200);
    expect(res.data.messages.length).toBeGreaterThan(0);
    
    // Should have the messages we sent
    const agentMessage = res.data.messages.find((m: any) => m.type === 'agent');
    const humanMessage = res.data.messages.find((m: any) => m.type === 'human_relay');
    
    expect(agentMessage).toBeDefined();
    expect(humanMessage).toBeDefined();
    expect(humanMessage.from_human).toBe('Alice');
    
    // From Bob's perspective, these are not from him
    expect(agentMessage.from_me).toBe(false);
  });
  
  it('should show unread messages', async () => {
    // Send a new message from Alice
    await api('POST', '/api/v1/messages', {
      apiKey: agents.alice!.apiKey,
      body: {
        match_id: matchId,
        content: 'Are you there?',
        type: 'agent',
      },
    });
    
    const res = await api('GET', '/api/v1/messages/unread', {
      apiKey: agents.bob!.apiKey,
    });
    
    expect(res.status).toBe(200);
    expect(res.data.unread_count).toBeGreaterThan(0);
    expect(res.data.messages.length).toBeGreaterThan(0);
  });
  
  it('should mark messages as read when fetched', async () => {
    // Fetch messages (marks as read)
    await api('GET', `/api/v1/messages/match/${matchId}`, {
      apiKey: agents.bob!.apiKey,
    });
    
    // Check unread again
    const res = await api('GET', '/api/v1/messages/unread', {
      apiKey: agents.bob!.apiKey,
    });
    
    // Messages for this match should now be read
    const unreadForMatch = res.data.messages.filter((m: any) => m.match_id === matchId);
    expect(unreadForMatch.length).toBe(0);
  });
  
  it('should reject message to invalid match', async () => {
    const res = await api('POST', '/api/v1/messages', {
      apiKey: agents.alice!.apiKey,
      body: {
        match_id: '00000000-0000-0000-0000-000000000000',
        content: 'Hello?',
      },
    });
    
    expect(res.status).toBe(404);
  });
  
  it('should reject message from non-participant', async () => {
    // Charlie tries to message Alice/Bob's match
    const res = await api('POST', '/api/v1/messages', {
      apiKey: agents.charlie!.apiKey,
      body: {
        match_id: matchId,
        content: 'Trying to intrude!',
      },
    });
    
    expect(res.status).toBe(404); // Match not found (from Charlie's perspective)
  });
});

// ============================================================================
// FULL FLOW INTEGRATION TEST
// ============================================================================

describe('Full Dating Flow', () => {
  let agent1: TestAgent;
  let agent2: TestAgent;
  let flowMatchId: string;
  
  it('should complete a full dating flow from registration to date confirmation', async () => {
    // Step 1: Register two new agents
    const reg1 = await api('POST', '/api/v1/agents/register', {
      body: { name: 'FlowAgent1', description: 'Integration test agent 1' },
    });
    const reg2 = await api('POST', '/api/v1/agents/register', {
      body: { name: 'FlowAgent2', description: 'Integration test agent 2' },
    });
    
    expect(reg1.status).toBe(201);
    expect(reg2.status).toBe(201);
    
    agent1 = {
      id: reg1.data.agent.id,
      name: reg1.data.agent.name,
      apiKey: reg1.data.agent.api_key,
      claimCode: reg1.data.agent.claim_code,
    };
    agent2 = {
      id: reg2.data.agent.id,
      name: reg2.data.agent.name,
      apiKey: reg2.data.agent.api_key,
      claimCode: reg2.data.agent.claim_code,
    };
    
    // Step 2: Claim both agents
    await api('POST', `/api/v1/agents/claim/${agent1.claimCode}`);
    await api('POST', `/api/v1/agents/claim/${agent2.claimCode}`);
    
    // Step 3: Create profiles
    const profile1 = await api('POST', '/api/v1/profiles', {
      apiKey: agent1.apiKey,
      body: {
        name: 'FlowPerson1',
        age: 29,
        gender: 'non-binary',
        location: 'Test City',
        bio: 'Looking for someone special',
        interests: ['reading', 'cooking', 'yoga'],
        looking_for: { genders: ['any'], age_range: [25, 35] },
      },
    });
    
    const profile2 = await api('POST', '/api/v1/profiles', {
      apiKey: agent2.apiKey,
      body: {
        name: 'FlowPerson2',
        age: 31,
        gender: 'male',
        location: 'Test City',
        bio: 'Excited to meet new people',
        interests: ['reading', 'fitness', 'cooking'],
        looking_for: { genders: ['any'], age_range: [26, 36] },
      },
    });
    
    expect(profile1.status).toBe(201);
    expect(profile2.status).toBe(201);
    
    agent1.profileId = profile1.data.profile.id;
    agent2.profileId = profile2.data.profile.id;
    
    // Step 4: Discover matches
    const discover1 = await api('GET', '/api/v1/matches/discover', {
      apiKey: agent1.apiKey,
    });
    
    expect(discover1.status).toBe(200);
    const person2InBatch = discover1.data.batch.some((p: any) => p.name === 'FlowPerson2');
    expect(person2InBatch).toBe(true);
    
    // Step 5: Both like each other → Match!
    const like1 = await api('POST', `/api/v1/matches/${agent2.profileId}/like`, {
      apiKey: agent1.apiKey,
    });
    expect(like1.data.liked).toBe(true);
    expect(like1.data.match).toBeUndefined(); // Not yet mutual
    
    const like2 = await api('POST', `/api/v1/matches/${agent1.profileId}/like`, {
      apiKey: agent2.apiKey,
    });
    expect(like2.data.match).toBe(true);
    flowMatchId = like2.data.match_id;
    
    // Step 6: Exchange messages
    const msg1 = await api('POST', '/api/v1/messages', {
      apiKey: agent1.apiKey,
      body: {
        match_id: flowMatchId,
        content: 'Hi! We matched! My human is interested in meeting.',
        type: 'agent',
      },
    });
    expect(msg1.status).toBe(201);
    
    const msg2 = await api('POST', '/api/v1/messages', {
      apiKey: agent2.apiKey,
      body: {
        match_id: flowMatchId,
        content: 'Great! Mine too. Should we set up a date?',
        type: 'agent',
      },
    });
    expect(msg2.status).toBe(201);
    
    // Step 7: Propose a date
    const proposal = await api('POST', '/api/v1/dates/propose', {
      apiKey: agent1.apiKey,
      body: {
        match_id: flowMatchId,
        proposed_time: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        location: 'Central Park Cafe',
        activity: 'Coffee and a walk',
        message: 'How about this weekend?',
      },
    });
    expect(proposal.status).toBe(201);
    
    // Step 8: Accept the date
    const accept = await api('POST', `/api/v1/dates/${proposal.data.proposal.id}/respond`, {
      apiKey: agent2.apiKey,
      body: { response: 'accept' },
    });
    expect(accept.data.status).toBe('confirmed');
    
    // Step 9: Verify final state
    const finalMatches = await api('GET', '/api/v1/matches', {
      apiKey: agent1.apiKey,
    });
    expect(finalMatches.data.accepted).toBeGreaterThan(0);
    
    const finalDates = await api('GET', '/api/v1/dates', {
      apiKey: agent1.apiKey,
    });
    const confirmedDate = finalDates.data.proposals.find(
      (p: any) => p.id === proposal.data.proposal.id
    );
    expect(confirmedDate.status).toBe('confirmed');
    
    console.log('✅ Full dating flow completed successfully!');
  });
});

// ============================================================================
// EDGE CASES & ERROR HANDLING
// ============================================================================

describe('Edge Cases & Error Handling', () => {
  
  it('should handle empty body gracefully', async () => {
    const res = await api('POST', '/api/v1/agents/register', {
      body: {},
    });
    expect(res.status).toBe(400); // Validation error
  });
  
  it('should handle malformed JSON', async () => {
    const response = await fetch(`${BASE_URL}/api/v1/agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not valid json{',
    });
    expect(response.status).toBe(400);
  });
  
  it('should handle very long strings', async () => {
    const longString = 'a'.repeat(10000);
    const res = await api('POST', '/api/v1/agents/register', {
      body: {
        name: longString, // Should be rejected (max 50)
      },
    });
    expect(res.status).toBe(400);
  });
  
  it('should handle special characters in names', async () => {
    const res = await api('POST', '/api/v1/agents/register', {
      body: {
        name: 'Test 🤖 Agent <script>alert("xss")</script>',
      },
    });
    // Should either sanitize or accept (but not execute)
    expect([200, 201, 400]).toContain(res.status);
  });
  
  it('should rate limit excessive requests', async () => {
    // Make many rapid requests
    const promises = Array(50).fill(null).map(() => 
      api('GET', '/api', { apiKey: agents.alice?.apiKey })
    );
    
    const results = await Promise.all(promises);
    
    // At least some should succeed, possibly some rate limited
    const successes = results.filter(r => r.status === 200);
    expect(successes.length).toBeGreaterThan(0);
  });
  
  it('should handle concurrent likes gracefully', async () => {
    // Create two new agents
    const reg1 = await api('POST', '/api/v1/agents/register', { body: { name: 'Concurrent1' } });
    const reg2 = await api('POST', '/api/v1/agents/register', { body: { name: 'Concurrent2' } });
    
    await api('POST', `/api/v1/agents/claim/${reg1.data.agent.claim_code}`);
    await api('POST', `/api/v1/agents/claim/${reg2.data.agent.claim_code}`);
    
    const p1 = await api('POST', '/api/v1/profiles', {
      apiKey: reg1.data.agent.api_key,
      body: { name: 'Concurrent1', age: 25 },
    });
    const p2 = await api('POST', '/api/v1/profiles', {
      apiKey: reg2.data.agent.api_key,
      body: { name: 'Concurrent2', age: 26 },
    });
    
    // Both like each other simultaneously
    const [like1, like2] = await Promise.all([
      api('POST', `/api/v1/matches/${p2.data.profile.id}/like`, {
        apiKey: reg1.data.agent.api_key,
      }),
      api('POST', `/api/v1/matches/${p1.data.profile.id}/like`, {
        apiKey: reg2.data.agent.api_key,
      }),
    ]);
    
    // Both should succeed, and at least one should report a match
    expect(like1.status).toBe(200);
    expect(like2.status).toBe(200);
    
    const matchCreated = like1.data.match || like2.data.match;
    expect(matchCreated).toBe(true);
  });
});

// ============================================================================
// CLEANUP
// ============================================================================

describe('Cleanup', () => {
  it('should deactivate test profiles', async () => {
    if (agents.alice?.apiKey) {
      const res = await api('DELETE', '/api/v1/profiles/me', {
        apiKey: agents.alice.apiKey,
      });
      expect(res.status).toBe(200);
    }
    
    if (agents.bob?.apiKey) {
      await api('DELETE', '/api/v1/profiles/me', {
        apiKey: agents.bob.apiKey,
      });
    }
    
    if (agents.charlie?.apiKey) {
      await api('DELETE', '/api/v1/profiles/me', {
        apiKey: agents.charlie.apiKey,
      });
    }
  });
});
