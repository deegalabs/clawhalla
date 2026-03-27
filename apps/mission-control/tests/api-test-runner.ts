#!/usr/bin/env -S npx tsx
/**
 * ClawHalla Mission Control — API Test Suite
 *
 * Run: npx tsx tests/api-test-runner.ts
 * Requires: MC running at http://localhost:3000 (or set MC_URL env)
 *
 * Tests all new API endpoints: boards, cards, comments, vault, agent, squads, onboarding.
 */

const BASE = process.env.MC_URL || 'http://localhost:3000';
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || 'test-token-for-api-tests';

let passed = 0;
let failed = 0;
let skipped = 0;
const errors: string[] = [];

// ---- Helpers ----

async function req(
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<{ status: number; data: any }> {
  const opts: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE}${path}`, opts);
  let data: any;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

function agentHeaders(agentId: string) {
  return {
    Authorization: `Bearer ${GATEWAY_TOKEN}`,
    'X-Agent-Id': agentId,
  };
}

function gatewayHeaders() {
  return {
    Authorization: `Bearer ${GATEWAY_TOKEN}`,
  };
}

function internalHeaders() {
  return {
    'X-MC-Internal': GATEWAY_TOKEN,
  };
}

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`${name}: ${msg}`);
    console.log(`  ❌ ${name} — ${msg}`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ---- Test Suites ----

async function testHealth() {
  console.log('\n📋 Health');
  await test('GET /api/health returns ok', async () => {
    const { status, data } = await req('GET', '/api/health');
    assertEqual(status, 200, 'status');
    assert(data.status === 'ok' || data.ok === true, 'should be ok');
  });
}

async function testSettings() {
  console.log('\n⚙️ Settings');

  await test('POST /api/settings saves a value', async () => {
    const { status } = await req('POST', '/api/settings', { key: 'test_key', value: 'test_value' });
    assertEqual(status, 200, 'status');
  });

  await test('GET /api/settings reads the value', async () => {
    const { data } = await req('GET', '/api/settings?key=test_key');
    assertEqual(data.value, 'test_value', 'value');
  });

  // Set gateway_token for auth tests
  await test('Set gateway_token for auth tests', async () => {
    const { status } = await req('POST', '/api/settings', { key: 'gateway_token', value: GATEWAY_TOKEN });
    assertEqual(status, 200, 'status');
  });
}

async function testBoardsEngine() {
  console.log('\n📊 Boards Engine');

  let boardId = '';
  let cardId = '';

  // Templates
  await test('GET /api/boards/templates returns templates', async () => {
    const { status, data } = await req('GET', '/api/boards/templates');
    assertEqual(status, 200, 'status');
    assert(Array.isArray(data), 'should be array');
    assert(data.length >= 6, 'should have at least 6 templates');
    assert(data.some((t: any) => t.id === 'kanban'), 'should have kanban template');
  });

  // Create board
  await test('POST /api/boards creates a board', async () => {
    const { status, data } = await req('POST', '/api/boards', {
      name: 'Test Board',
      type: 'kanban',
      columns: [
        { id: 'todo', name: 'To Do', color: '#3b82f6' },
        { id: 'doing', name: 'Doing', color: '#f59e0b' },
        { id: 'done', name: 'Done', color: '#22c55e' },
      ],
    });
    assertEqual(status, 201, 'status');
    assert(data.id, 'should have id');
    boardId = data.id;
  });

  // List boards
  await test('GET /api/boards lists boards', async () => {
    const { status, data } = await req('GET', '/api/boards');
    assertEqual(status, 200, 'status');
    assert(Array.isArray(data), 'should be array');
    assert(data.some((b: any) => b.id === boardId), 'should contain created board');
  });

  // Get board
  await test('GET /api/boards/:id returns board with cards', async () => {
    const { status, data } = await req('GET', `/api/boards/${boardId}`);
    assertEqual(status, 200, 'status');
    assertEqual(data.name, 'Test Board', 'name');
    assert(Array.isArray(data.columns), 'columns should be parsed array');
    assert(Array.isArray(data.cards), 'should have cards array');
  });

  // Update board
  await test('PATCH /api/boards/:id updates board', async () => {
    const { status, data } = await req('PATCH', `/api/boards/${boardId}`, { name: 'Updated Board' });
    assertEqual(status, 200, 'status');
    assert(data.ok, 'should be ok');
  });

  // Create card
  await test('POST /api/boards/:id/cards creates a card', async () => {
    const { status, data } = await req('POST', `/api/boards/${boardId}/cards`, {
      title: 'Test Card',
      description: 'A test card',
      priority: 'high',
      assignee: 'thor',
    });
    assertEqual(status, 201, 'status');
    assert(data.id, 'should have id');
    cardId = data.id;
  });

  // List cards
  await test('GET /api/boards/:id/cards lists cards', async () => {
    const { status, data } = await req('GET', `/api/boards/${boardId}/cards`);
    assertEqual(status, 200, 'status');
    assert(data.some((c: any) => c.id === cardId), 'should contain created card');
  });

  // Filter cards by assignee
  await test('GET /api/boards/:id/cards?assignee=thor filters', async () => {
    const { data } = await req('GET', `/api/boards/${boardId}/cards?assignee=thor`);
    assert(data.every((c: any) => c.assignee === 'thor'), 'all cards should be assigned to thor');
  });

  // Get card with history
  await test('GET /api/boards/:id/cards/:cardId returns card with history', async () => {
    const { status, data } = await req('GET', `/api/boards/${boardId}/cards/${cardId}`);
    assertEqual(status, 200, 'status');
    assertEqual(data.title, 'Test Card', 'title');
    assert(Array.isArray(data.history), 'should have history');
    assert(data.history.length >= 1, 'should have at least 1 history entry (created)');
  });

  // Move card
  await test('PATCH /api/boards/:id/cards/:cardId moves card', async () => {
    const { status } = await req('PATCH', `/api/boards/${boardId}/cards/${cardId}`, {
      column: 'doing',
      by: 'thor',
    });
    assertEqual(status, 200, 'status');
  });

  // Verify move recorded in history
  await test('Card history records the move', async () => {
    const { data } = await req('GET', `/api/boards/${boardId}/cards/${cardId}`);
    const moveHistory = data.history.find((h: any) => h.action === 'moved');
    assert(moveHistory, 'should have moved history entry');
    assertEqual(moveHistory.fromValue, 'todo', 'from todo');
    assertEqual(moveHistory.toValue, 'doing', 'to doing');
  });

  // Add comment
  await test('POST /api/boards/:id/cards/:cardId/comments adds comment', async () => {
    const { status, data } = await req('POST', `/api/boards/${boardId}/cards/${cardId}/comments`, {
      content: 'Working on this now',
      author: 'thor',
    });
    assertEqual(status, 201, 'status');
    assert(data.id, 'should have id');
  });

  // List comments
  await test('GET /api/boards/:id/cards/:cardId/comments lists comments', async () => {
    const { status, data } = await req('GET', `/api/boards/${boardId}/cards/${cardId}/comments`);
    assertEqual(status, 200, 'status');
    assert(data.length >= 1, 'should have at least 1 comment');
    assertEqual(data[0].content, 'Working on this now', 'content');
  });

  // Move to done — auto-complete
  await test('Moving to done sets completedAt', async () => {
    await req('PATCH', `/api/boards/${boardId}/cards/${cardId}`, { column: 'done', by: 'thor' });
    const { data } = await req('GET', `/api/boards/${boardId}/cards/${cardId}`);
    assert(data.completedAt, 'completedAt should be set');
  });

  // Archive card
  await test('DELETE /api/boards/:id/cards/:cardId archives card', async () => {
    const { status, data } = await req('DELETE', `/api/boards/${boardId}/cards/${cardId}`);
    assertEqual(status, 200, 'status');
    assertEqual(data.action, 'archived', 'should be archived');
  });

  // Board not found
  await test('GET /api/boards/nonexistent returns 404', async () => {
    const { status } = await req('GET', '/api/boards/nonexistent');
    assertEqual(status, 404, 'status');
  });

  // Card not found
  await test('GET /api/boards/:id/cards/nonexistent returns 404', async () => {
    const { status } = await req('GET', `/api/boards/${boardId}/cards/nonexistent`);
    assertEqual(status, 404, 'status');
  });

  // Validation: missing title
  await test('POST /api/boards/:id/cards without title returns 400', async () => {
    const { status } = await req('POST', `/api/boards/${boardId}/cards`, { description: 'no title' });
    assertEqual(status, 400, 'status');
  });

  // Validation: missing board name
  await test('POST /api/boards without name returns 400', async () => {
    const { status } = await req('POST', '/api/boards', { type: 'kanban' });
    assertEqual(status, 400, 'status');
  });

  // Archive board
  await test('DELETE /api/boards/:id archives board', async () => {
    const { status, data } = await req('DELETE', `/api/boards/${boardId}`);
    assertEqual(status, 200, 'status');
    assertEqual(data.action, 'archived', 'should be archived');
  });
}

async function testVaultAndAuth() {
  console.log('\n🔒 Vault & Auth');

  // Vault POST without auth should fail
  await test('POST /api/vault without auth returns 401', async () => {
    const { status } = await req('POST', '/api/vault', { name: 'TEST_SECRET', value: 'secret123' });
    assertEqual(status, 401, 'status');
  });

  // Vault POST with internal token should work
  await test('POST /api/vault with internal token succeeds', async () => {
    const { status, data } = await req(
      'POST', '/api/vault',
      { name: 'TEST_SECRET', value: 'secret123', description: 'test', category: 'test' },
      internalHeaders(),
    );
    assertEqual(status, 200, 'status');
    assert(data.ok, 'should be ok');
  });

  // Vault GET lists secrets (no values)
  await test('GET /api/vault lists secrets without values', async () => {
    const { data } = await req('GET', '/api/vault');
    assert(data.ok, 'should be ok');
    const secret = data.secrets.find((s: any) => s.name === 'TEST_SECRET');
    assert(secret, 'should find TEST_SECRET');
    assert(!('value' in secret), 'should not expose value');
    assert(!('encryptedValue' in secret), 'should not expose encrypted value');
  });

  // Vault reveal with gateway auth
  await test('POST /api/vault/reveal with gateway auth returns full value', async () => {
    const { status, data } = await req(
      'POST', '/api/vault/reveal',
      { name: 'TEST_SECRET', full: true },
      gatewayHeaders(),
    );
    assertEqual(status, 200, 'status');
    assertEqual(data.value, 'secret123', 'should return full value');
    assertEqual(data.masked, false, 'should not be masked');
  });

  // Vault reveal with agent auth returns masked
  await test('POST /api/vault/reveal with agent auth returns masked', async () => {
    const { data } = await req(
      'POST', '/api/vault/reveal',
      { name: 'TEST_SECRET' },
      agentHeaders('thor'),
    );
    assert(data.masked, 'should be masked for agents');
    assert(data.value.includes('...'), 'should contain ...');
  });

  // Vault credentials — gateway only
  await test('GET /api/vault/credentials with agent returns 403', async () => {
    const { status } = await req('GET', '/api/vault/credentials?provider=test', undefined, agentHeaders('thor'));
    assertEqual(status, 403, 'agents should be blocked');
  });

  // Vault inject
  await test('POST /api/vault/inject resolves $SECRET_NAME', async () => {
    const { data } = await req(
      'POST', '/api/vault/inject',
      { text: 'Use $TEST_SECRET to authenticate' },
      gatewayHeaders(),
    );
    assert(data.ok, 'should be ok');
    assert(data.text.includes('secret123'), 'should resolve the secret');
    assert(data.injected.includes('TEST_SECRET'), 'should list injected');
  });

  // Vault inject with unknown secret
  await test('POST /api/vault/inject with unknown secret lists it as failed', async () => {
    const { data } = await req(
      'POST', '/api/vault/inject',
      { text: 'Use $NONEXISTENT_KEY here' },
      gatewayHeaders(),
    );
    assert(data.failed.includes('NONEXISTENT_KEY'), 'should be in failed list');
  });

  // Vault DELETE with auth
  await test('DELETE /api/vault with auth succeeds', async () => {
    const { status, data } = await req('DELETE', '/api/vault?name=TEST_SECRET', undefined, internalHeaders());
    assertEqual(status, 200, 'status');
    assert(data.ok, 'should be ok');
  });

  // Vault DELETE without auth fails
  await test('DELETE /api/vault without auth returns 401', async () => {
    const { status } = await req('DELETE', '/api/vault?name=TEST_SECRET');
    assertEqual(status, 401, 'status');
  });

  // Invalid token
  await test('Bearer with wrong token returns 401', async () => {
    const { status } = await req('POST', '/api/vault', { name: 'x', value: 'y' }, {
      Authorization: 'Bearer wrong-token',
    });
    assertEqual(status, 401, 'status');
  });
}

async function testAgentAPI() {
  console.log('\n🤖 Agent API');

  // Setup: create a board for agents to use
  const { data: boardData } = await req('POST', '/api/boards', {
    name: 'Agent Test Board',
    columns: [
      { id: 'backlog', name: 'Backlog' },
      { id: 'doing', name: 'Doing' },
      { id: 'done', name: 'Done' },
    ],
  });
  const boardId = boardData.id;

  // Agent status without auth fails
  await test('POST /api/agent/status without auth returns 401', async () => {
    const { status } = await req('POST', '/api/agent/status', { status: 'working' }, {
      Authorization: 'Bearer wrong',
    });
    assertEqual(status, 401, 'status');
  });

  // Agent status without X-Agent-Id returns 400
  await test('POST /api/agent/status without X-Agent-Id returns 400', async () => {
    const { status } = await req('POST', '/api/agent/status', { status: 'working' }, gatewayHeaders());
    assertEqual(status, 400, 'status');
  });

  // Agent report status
  await test('POST /api/agent/status with valid auth works', async () => {
    const { status, data } = await req('POST', '/api/agent/status', { status: 'working', details: 'Running tests' }, agentHeaders('thor'));
    assertEqual(status, 200, 'status');
    assert(data.ok, 'should be ok');
    assertEqual(data.status, 'working', 'status');
  });

  // Agent create card
  await test('POST /api/agent/cards creates card', async () => {
    const { status, data } = await req('POST', '/api/agent/cards', {
      boardId,
      title: 'Agent-created task',
      priority: 'high',
    }, agentHeaders('thor'));
    assertEqual(status, 201, 'status');
    assert(data.ok, 'should be ok');
    assert(data.card.id, 'should have card id');
  });

  // Agent get own cards
  await test('GET /api/agent/cards returns assigned cards', async () => {
    const { status, data } = await req('GET', '/api/agent/cards', undefined, agentHeaders('thor'));
    assertEqual(status, 200, 'status');
    assert(data.some((c: any) => c.title === 'Agent-created task'), 'should contain created card');
  });

  // Agent move card
  await test('PATCH /api/agent/cards moves card', async () => {
    const { data: cardsData } = await req('GET', '/api/agent/cards', undefined, agentHeaders('thor'));
    const card = cardsData.find((c: any) => c.title === 'Agent-created task');

    const { status, data } = await req('PATCH', '/api/agent/cards', {
      cardId: card.id,
      column: 'doing',
      progress: 50,
      comment: 'Starting work',
    }, agentHeaders('thor'));
    assertEqual(status, 200, 'status');
    assert(data.ok, 'should be ok');
  });

  // Agent report activity
  await test('POST /api/agent/report logs activity', async () => {
    const { status, data } = await req('POST', '/api/agent/report', {
      action: 'thinking',
      target: 'test task',
      details: 'Analyzing requirements...',
    }, agentHeaders('thor'));
    assertEqual(status, 200, 'status');
    assert(data.ok, 'should be ok');
  });

  // Cleanup
  await req('DELETE', `/api/boards/${boardId}?hard=true`);
}

async function testSquadsAPI() {
  console.log('\n⚔️ Squads');

  // Create squad
  await test('POST /api/squads/create creates personal squad', async () => {
    const { status, data } = await req('POST', '/api/squads/create', {
      squadId: 'personal',
      customizations: { Frigg: { language: 'pt-BR', focus: 'scheduling' } },
    });
    assertEqual(status, 200, 'status');
    assert(data.ok, 'should be ok');
    assert(data.agents.length >= 3, 'should create 3+ agents');
    assert(data.agents.some((a: any) => a.name === 'Claw'), 'should include Claw');
    assert(data.agents.some((a: any) => a.name === 'Frigg'), 'should include Frigg');
    assert(data.boardId === 'board_personal', 'should create default board');
  });

  // Verify board was created
  await test('Default board was created for squad', async () => {
    const { status, data } = await req('GET', '/api/boards/board_personal');
    assertEqual(status, 200, 'status');
    assertEqual(data.name, 'Personal Tasks', 'board name');
    assert(data.columns.length >= 3, 'should have columns');
  });

  // Invalid squad
  await test('POST /api/squads/create with invalid squad returns 400', async () => {
    const { status } = await req('POST', '/api/squads/create', { squadId: 'nonexistent' });
    assertEqual(status, 400, 'status');
  });

  // Create hackathon squad
  await test('POST /api/squads/create creates hackathon squad', async () => {
    const { data } = await req('POST', '/api/squads/create', { squadId: 'hackathon' });
    assert(data.ok, 'should be ok');
    assert(data.agents.some((a: any) => a.name === 'Thor'), 'should include Thor');
    assert(data.agents.some((a: any) => a.name === 'Tyr'), 'should include Tyr');
  });
}

async function testOnboardingAPIs() {
  console.log('\n🚀 Onboarding / Connection');

  // Test LLM — without key should fail
  await test('POST /api/connection/test-llm without key returns error', async () => {
    const { data } = await req('POST', '/api/connection/test-llm', { provider: 'anthropic' });
    assertEqual(data.ok, false, 'should fail without key');
  });

  // Test LLM — unknown provider
  await test('POST /api/connection/test-llm with unknown provider returns 400', async () => {
    const { status } = await req('POST', '/api/connection/test-llm', { provider: 'unknown' });
    assertEqual(status, 400, 'status');
  });

  // Save connection config
  await test('POST /api/connection/save stores config', async () => {
    const { status, data } = await req('POST', '/api/connection/save', {
      provider: 'anthropic',
      channel: 'mc',
      squad: 'personal',
      gatewayToken: GATEWAY_TOKEN,
      connectedAt: new Date().toISOString(),
    });
    assertEqual(status, 200, 'status');
    assert(data.ok, 'should be ok');
  });

  // Verify settings were saved
  await test('Settings were saved correctly', async () => {
    const { data: provider } = await req('GET', '/api/settings?key=llm_provider');
    assertEqual(provider.value, 'anthropic', 'provider');

    const { data: channel } = await req('GET', '/api/settings?key=primary_channel');
    assertEqual(channel.value, 'mc', 'channel');

    const { data: squad } = await req('GET', '/api/settings?key=active_squad');
    assertEqual(squad.value, 'personal', 'squad');

    const { data: onboarding } = await req('GET', '/api/settings?key=onboarding_complete');
    assertEqual(onboarding.value, 'true', 'onboarding_complete');
  });
}

async function testSecurityEndpoints() {
  console.log('\n🛡️ Security — Auth Required Endpoints');

  // Terminal without auth
  await test('POST /api/terminal without auth returns 401', async () => {
    const { status } = await req('POST', '/api/terminal', { command: 'echo test' });
    assertEqual(status, 401, 'status');
  });

  // Dispatch without auth
  await test('POST /api/dispatch without auth returns 401', async () => {
    const { status } = await req('POST', '/api/dispatch', { taskId: 'test' });
    assertEqual(status, 401, 'status');
  });

  // Terminal with auth works
  await test('POST /api/terminal with auth executes command', async () => {
    const { status, data } = await req('POST', '/api/terminal', { command: 'echo hello' }, internalHeaders());
    assertEqual(status, 200, 'status');
    assert(data.ok, 'should be ok');
    assert(data.output.includes('hello'), 'should contain output');
  });

  // Terminal blocks dangerous commands
  await test('POST /api/terminal blocks rm -rf /', async () => {
    const { data } = await req('POST', '/api/terminal', { command: 'rm -rf /' }, internalHeaders());
    assertEqual(data.ok, false, 'should be blocked');
  });
}

// ---- Main ----

async function main() {
  console.log(`\n🦞 ClawHalla MC API Test Suite`);
  console.log(`   Target: ${BASE}`);
  console.log(`   Token: ${GATEWAY_TOKEN.slice(0, 8)}...`);
  console.log('─'.repeat(50));

  // Check MC is running
  try {
    await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(3000) });
  } catch {
    console.error(`\n❌ Cannot reach MC at ${BASE}. Is it running?\n`);
    process.exit(1);
  }

  await testHealth();
  await testSettings();
  await testBoardsEngine();
  await testVaultAndAuth();
  await testAgentAPI();
  await testSquadsAPI();
  await testOnboardingAPIs();
  await testSecurityEndpoints();

  // Report
  console.log('\n' + '─'.repeat(50));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);

  if (errors.length > 0) {
    console.log('\n❌ Failures:');
    errors.forEach(e => console.log(`   • ${e}`));
  }

  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
