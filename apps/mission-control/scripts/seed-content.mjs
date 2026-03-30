#!/usr/bin/env node
/**
 * Seed Content Studio with real agent-generated content.
 * Uses Saga (research/strategy) and Bragi (content creation) from the Social squad.
 */

const BASE = 'http://localhost:3000';

async function callAgent(agentId, message) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId, message }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Agent ${agentId} failed: ${data.error}`);
  return data.response;
}

async function savePipeline(pipeline) {
  const res = await fetch(`${BASE}/api/content/pipelines`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pipeline),
  });
  return res.json();
}

async function saveDraft(draft) {
  const res = await fetch(`${BASE}/api/content/drafts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(draft),
  });
  return res.json();
}

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('  Content Studio — Agent Seed');
  console.log('═══════════════════════════════════════════');
  console.log('');

  // ─── Step 1: Saga researches topics ────────────────────────
  console.log('🔮 Saga: researching trending topics...');
  const research = await callAgent('saga',
    'Research 3 trending topics about AI agents and autonomous systems for LinkedIn and Twitter posts. For each topic: title, one-line hook, target audience. Numbered 1-3. Be concise.'
  );
  console.log('   ✅ Research done');
  console.log('');

  // ─── Step 2: Bragi creates content ─────────────────────────
  const topics = [
    {
      topic: 'AI Agent Platforms — The Future of Development',
      liPrompt: 'Write a LinkedIn post about how AI agent platforms like ClawHalla are changing how developers build autonomous systems. Include a strong hook, 3 key insights, and a CTA. Max 2000 chars. Return ONLY the post text.',
      twPrompt: 'Write a Twitter/X post about AI agent squads working together autonomously. Strong hook, max 280 chars. Return ONLY the tweet text.',
    },
    {
      topic: 'Open Source AI Agents — Why Freedom Wins',
      liPrompt: 'Write a LinkedIn post about why open source AI agent frameworks will win over proprietary solutions. Mention developer freedom, customization, and community innovation. Max 2000 chars. Return ONLY the post text.',
      twPrompt: 'Write a Twitter/X post about the future of developer tools with AI agents. Provocative and concise. Max 280 chars. Return ONLY the tweet text.',
    },
  ];

  const contentResults = [];

  for (let i = 0; i < topics.length; i++) {
    const t = topics[i];
    console.log(`🎭 Bragi: writing campaign ${i + 1} — "${t.topic}"...`);

    const [liText, twText] = await Promise.all([
      callAgent('bragi', t.liPrompt),
      callAgent('bragi', t.twPrompt),
    ]);

    console.log(`   ✅ LinkedIn: ${liText.length} chars`);
    console.log(`   ✅ Twitter: ${twText.length} chars`);

    contentResults.push({ ...t, liText, twText });
  }

  console.log('');
  console.log('🎭 Bragi: generating hashtags...');
  const [htagsLi, htagsTw] = await Promise.all([
    callAgent('bragi', 'Suggest 5 LinkedIn hashtags for posts about AI agents and autonomous development platforms. Return ONLY hashtags space-separated on one line.'),
    callAgent('bragi', 'Suggest 2 Twitter hashtags for AI agent automation. Return ONLY hashtags space-separated on one line.'),
  ]);
  const liHashtags = htagsLi.split('\n')[0].trim();
  const twHashtags = htagsTw.split('\n')[0].trim();
  console.log(`   ✅ LinkedIn: ${liHashtags}`);
  console.log(`   ✅ Twitter: ${twHashtags}`);
  console.log('');

  // ─── Step 3: Save pipelines ────────────────────────────────
  console.log('📦 Saving pipelines...');

  // Pipeline 1 — at editorial review gate (step 5)
  const pipe1 = await savePipeline({
    id: 'pipe_seed_01',
    platform: 'linkedin,twitter',
    topic: contentResults[0].topic,
    status: 'active',
    currentStep: 5,
    steps: [
      { id: 'research', label: 'Research & Strategy', agent: 'saga', agentEmoji: '🔮', description: 'Scan trends, news, competitors', status: 'done', output: research.slice(0, 500) },
      { id: 'topics', label: 'Topic Selection', agent: 'human', agentEmoji: '👤', description: 'Choose topic', status: 'done', isGate: true, selectedOption: contentResults[0].topic },
      { id: 'draft', label: 'Write Variants', agent: 'bragi', agentEmoji: '🎭', description: 'Generate platform-specific copy', status: 'done', output: `Generated 2 variants: LinkedIn (${contentResults[0].liText.length} chars), Twitter (${contentResults[0].twText.length} chars)` },
      { id: 'media', label: 'Generate Visuals', agent: 'bragi', agentEmoji: '🎭', description: 'Create image prompts', status: 'done', output: 'Visual descriptions generated for both platforms' },
      { id: 'hashtags', label: 'Hashtags & SEO', agent: 'bragi', agentEmoji: '🎭', description: 'Optimize hashtags', status: 'done', output: `LinkedIn: ${liHashtags}\nTwitter: ${twHashtags}` },
      { id: 'review', label: 'Editorial Review', agent: 'human', agentEmoji: '👤', description: 'Review all variants, edit, and approve', status: 'gate', isGate: true },
      { id: 'schedule', label: 'Schedule / Publish', agent: 'saga', agentEmoji: '🔮', description: 'Set timing and cross-publish', status: 'pending' },
      { id: 'report', label: 'Report', agent: 'saga', agentEmoji: '🔮', description: 'Log campaign and track performance', status: 'pending' },
    ],
    finalText: JSON.stringify({
      linkedin: { platform: 'linkedin', text: contentResults[0].liText, hashtags: liHashtags, status: 'draft' },
      twitter: { platform: 'twitter', text: contentResults[0].twText, hashtags: twHashtags, status: 'draft' },
    }),
    finalHashtags: `${liHashtags}|${twHashtags}`,
  });
  console.log(`   ✅ Pipeline 1: ${pipe1.id} — at editorial review`);

  // Pipeline 2 — at media step (step 3)
  const pipe2 = await savePipeline({
    id: 'pipe_seed_02',
    platform: 'linkedin,twitter',
    topic: contentResults[1].topic,
    status: 'active',
    currentStep: 3,
    steps: [
      { id: 'research', label: 'Research & Strategy', agent: 'saga', agentEmoji: '🔮', description: 'Scan trends', status: 'done', output: 'Research completed by Saga' },
      { id: 'topics', label: 'Topic Selection', agent: 'human', agentEmoji: '👤', description: 'Choose topic', status: 'done', isGate: true, selectedOption: contentResults[1].topic },
      { id: 'draft', label: 'Write Variants', agent: 'bragi', agentEmoji: '🎭', description: 'Generate copy', status: 'done', output: `Generated 2 variants` },
      { id: 'media', label: 'Generate Visuals', agent: 'bragi', agentEmoji: '🎭', description: 'Image prompts', status: 'pending' },
      { id: 'hashtags', label: 'Hashtags & SEO', agent: 'bragi', agentEmoji: '🎭', description: 'Optimize hashtags', status: 'pending' },
      { id: 'review', label: 'Editorial Review', agent: 'human', agentEmoji: '👤', description: 'Review', status: 'pending', isGate: true },
      { id: 'schedule', label: 'Schedule / Publish', agent: 'saga', agentEmoji: '🔮', description: 'Set timing', status: 'pending' },
      { id: 'report', label: 'Report', agent: 'saga', agentEmoji: '🔮', description: 'Log campaign', status: 'pending' },
    ],
    finalText: JSON.stringify({
      linkedin: { platform: 'linkedin', text: contentResults[1].liText, hashtags: liHashtags, status: 'draft' },
      twitter: { platform: 'twitter', text: contentResults[1].twText, hashtags: twHashtags, status: 'draft' },
    }),
    finalHashtags: `${liHashtags}|${twHashtags}`,
  });
  console.log(`   ✅ Pipeline 2: ${pipe2.id} — at media generation`);
  console.log('');

  // ─── Step 4: Save drafts ───────────────────────────────────
  console.log('💾 Saving drafts...');

  const schedDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  schedDate.setHours(14, 0, 0, 0);

  const drafts = [
    { id: 'draft_seed_li_01', platform: 'linkedin', text: contentResults[0].liText, hashtags: liHashtags, status: 'draft', agentId: 'bragi', pipelineId: 'pipe_seed_01' },
    { id: 'draft_seed_tw_01', platform: 'twitter', text: contentResults[0].twText, hashtags: twHashtags, status: 'draft', agentId: 'bragi', pipelineId: 'pipe_seed_01' },
    { id: 'draft_seed_li_02', platform: 'linkedin', text: contentResults[1].liText, hashtags: liHashtags, status: 'scheduled', scheduledFor: schedDate.toISOString(), agentId: 'bragi', pipelineId: 'pipe_seed_02' },
    { id: 'draft_seed_tw_02', platform: 'twitter', text: contentResults[1].twText, hashtags: twHashtags, status: 'draft', agentId: 'bragi' },
  ];

  for (const d of drafts) {
    const result = await saveDraft(d);
    const statusLabel = d.scheduledFor ? `scheduled ${schedDate.toLocaleDateString()}` : d.status;
    console.log(`   ✅ ${d.platform.padEnd(8)} — ${statusLabel} (${d.text.length} chars)`);
  }

  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('✅ Content Studio seeded!');
  console.log('');
  console.log('  📋 2 Pipelines');
  console.log('     • Campaign 1 — waiting editorial review (gate)');
  console.log('     • Campaign 2 — at media generation step');
  console.log('');
  console.log('  📝 4 Drafts');
  console.log('     • 2 LinkedIn (1 draft, 1 scheduled)');
  console.log('     • 2 Twitter (drafts)');
  console.log('');
  console.log('  🤖 All content generated by real agents');
  console.log('     • 🔮 Saga — research & strategy');
  console.log('     • 🎭 Bragi — writing & hashtags');
  console.log('═══════════════════════════════════════════');
}

main().catch(err => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
