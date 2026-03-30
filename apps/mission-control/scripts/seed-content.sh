#!/bin/bash
# Seed Content Studio with real agent-generated content
# Uses Saga (research) and Bragi (content creation) from the Social squad

BASE="http://localhost:3000"
NOW_MS=$(date +%s%3N)

echo "🔮 Calling Saga for content research..."
RESEARCH=$(curl -s -X POST "$BASE/api/chat" \
  -H 'Content-Type: application/json' \
  -d '{"agentId":"saga","message":"Research 3 trending topics about AI agents and autonomous systems for LinkedIn and Twitter posts. For each topic give: topic title, one-line hook, and target audience. Format as numbered list 1-3. Be concise."}')

RESEARCH_TEXT=$(echo "$RESEARCH" | jq -r '.response // "No response"')
echo "✅ Saga research done"
echo ""

echo "🎭 Calling Bragi for LinkedIn post #1 — AI Agent Platforms..."
LI_POST1=$(curl -s -X POST "$BASE/api/chat" \
  -H 'Content-Type: application/json' \
  -d '{"agentId":"bragi","message":"Write a LinkedIn post about how AI agent platforms like ClawHalla are changing how developers build autonomous systems. Include a hook, 3 key insights, and a CTA. Max 2000 chars. Return ONLY the post text."}')
LI_TEXT1=$(echo "$LI_POST1" | jq -r '.response // "No response"')
echo "✅ LinkedIn post #1 done"

echo "🎭 Calling Bragi for Twitter post #1..."
TW_POST1=$(curl -s -X POST "$BASE/api/chat" \
  -H 'Content-Type: application/json' \
  -d '{"agentId":"bragi","message":"Write a Twitter/X post about AI agent squads working together autonomously. Strong hook, max 280 chars. Return ONLY the tweet text."}')
TW_TEXT1=$(echo "$TW_POST1" | jq -r '.response // "No response"')
echo "✅ Twitter post #1 done"

echo "🎭 Calling Bragi for LinkedIn post #2 — Open Source AI..."
LI_POST2=$(curl -s -X POST "$BASE/api/chat" \
  -H 'Content-Type: application/json' \
  -d '{"agentId":"bragi","message":"Write a LinkedIn post about why open source AI agent frameworks will win over proprietary solutions. Mention developer freedom, customization, and community. Max 2000 chars. Return ONLY the post text."}')
LI_TEXT2=$(echo "$LI_POST2" | jq -r '.response // "No response"')
echo "✅ LinkedIn post #2 done"

echo "🎭 Calling Bragi for Twitter post #2..."
TW_POST2=$(curl -s -X POST "$BASE/api/chat" \
  -H 'Content-Type: application/json' \
  -d '{"agentId":"bragi","message":"Write a Twitter/X post about the future of developer tools with AI agents. Provocative and concise. Max 280 chars. Return ONLY the tweet text."}')
TW_TEXT2=$(echo "$TW_POST2" | jq -r '.response // "No response"')
echo "✅ Twitter post #2 done"

echo ""
echo "🎭 Calling Bragi for hashtag suggestions..."
HASHTAGS_LI=$(curl -s -X POST "$BASE/api/chat" \
  -H 'Content-Type: application/json' \
  -d '{"agentId":"bragi","message":"Suggest 5 LinkedIn hashtags for posts about AI agents and autonomous development platforms. Return ONLY hashtags space-separated on one line."}')
HTAGS_LI=$(echo "$HASHTAGS_LI" | jq -r '.response // "#AIAgents #DevTools"' | head -1)

HASHTAGS_TW=$(curl -s -X POST "$BASE/api/chat" \
  -H 'Content-Type: application/json' \
  -d '{"agentId":"bragi","message":"Suggest 2 Twitter hashtags for posts about AI agent automation. Return ONLY hashtags space-separated on one line."}')
HTAGS_TW=$(echo "$HASHTAGS_TW" | jq -r '.response // "#AIAgents #Automation"' | head -1)
echo "✅ Hashtags done"

echo ""
echo "📦 Saving Pipeline #1 — AI Agent Platforms campaign..."

# Build pipeline steps JSON
STEPS1=$(cat <<'STEPJSON'
[
  {"id":"research","label":"Research & Strategy","agent":"saga","agentEmoji":"🔮","description":"Scan trends","status":"done","output":"Research completed by Saga"},
  {"id":"topics","label":"Topic Selection","agent":"human","agentEmoji":"👤","description":"Choose topic","status":"done","isGate":true,"selectedOption":"AI Agent Platforms — How squads of AI agents are changing development"},
  {"id":"draft","label":"Write Variants","agent":"bragi","agentEmoji":"🎭","description":"Generate copy","status":"done","output":"Generated 2 platform variants"},
  {"id":"media","label":"Generate Visuals","agent":"bragi","agentEmoji":"🎭","description":"Image prompts","status":"done","output":"Visual descriptions generated"},
  {"id":"hashtags","label":"Hashtags & SEO","agent":"bragi","agentEmoji":"🎭","description":"Optimize hashtags","status":"done","output":"Hashtags optimized"},
  {"id":"review","label":"Editorial Review","agent":"human","agentEmoji":"👤","description":"Review and approve","status":"gate","isGate":true},
  {"id":"schedule","label":"Schedule / Publish","agent":"saga","agentEmoji":"🔮","description":"Set timing","status":"pending"},
  {"id":"report","label":"Report","agent":"saga","agentEmoji":"🔮","description":"Log campaign","status":"pending"}
]
STEPJSON
)

# Escape the content for JSON
LI_TEXT1_ESC=$(echo "$LI_TEXT1" | jq -Rs '.')
TW_TEXT1_ESC=$(echo "$TW_TEXT1" | jq -Rs '.')
HTAGS_LI_ESC=$(echo "$HTAGS_LI" | jq -Rs '.' | sed 's/^"//;s/"$//')
HTAGS_TW_ESC=$(echo "$HTAGS_TW" | jq -Rs '.' | sed 's/^"//;s/"$//')

VARIANTS1=$(jq -n \
  --argjson li_text "$LI_TEXT1_ESC" \
  --argjson tw_text "$TW_TEXT1_ESC" \
  --arg li_htags "$HTAGS_LI_ESC" \
  --arg tw_htags "$HTAGS_TW_ESC" \
  '{
    "linkedin": {"platform":"linkedin","text":$li_text,"hashtags":$li_htags,"status":"draft"},
    "twitter": {"platform":"twitter","text":$tw_text,"hashtags":$tw_htags,"status":"draft"}
  }')

curl -s -X POST "$BASE/api/content/pipelines" \
  -H 'Content-Type: application/json' \
  -d "$(jq -n \
    --arg id "pipe_seed_agents_01" \
    --arg platform "linkedin,twitter" \
    --arg topic "AI Agent Platforms — The Future of Development" \
    --arg status "active" \
    --argjson currentStep 5 \
    --argjson steps "$STEPS1" \
    --arg finalText "$VARIANTS1" \
    --arg finalHashtags "$HTAGS_LI_ESC|$HTAGS_TW_ESC" \
    '{id:$id, platform:$platform, topic:$topic, status:$status, currentStep:$currentStep, steps:$steps, finalText:$finalText, finalHashtags:$finalHashtags}')" | jq .

echo ""
echo "📦 Saving Pipeline #2 — Open Source AI campaign..."

STEPS2=$(cat <<'STEPJSON'
[
  {"id":"research","label":"Research & Strategy","agent":"saga","agentEmoji":"🔮","description":"Scan trends","status":"done","output":"Research completed"},
  {"id":"topics","label":"Topic Selection","agent":"human","agentEmoji":"👤","description":"Choose topic","status":"done","isGate":true,"selectedOption":"Open Source AI Agents — Why freedom wins"},
  {"id":"draft","label":"Write Variants","agent":"bragi","agentEmoji":"🎭","description":"Generate copy","status":"done","output":"Generated 2 platform variants"},
  {"id":"media","label":"Generate Visuals","agent":"bragi","agentEmoji":"🎭","description":"Image prompts","status":"pending"},
  {"id":"hashtags","label":"Hashtags & SEO","agent":"bragi","agentEmoji":"🎭","description":"Optimize hashtags","status":"pending"},
  {"id":"review","label":"Editorial Review","agent":"human","agentEmoji":"👤","description":"Review","status":"pending","isGate":true},
  {"id":"schedule","label":"Schedule / Publish","agent":"saga","agentEmoji":"🔮","description":"Set timing","status":"pending"},
  {"id":"report","label":"Report","agent":"saga","agentEmoji":"🔮","description":"Log campaign","status":"pending"}
]
STEPJSON
)

LI_TEXT2_ESC=$(echo "$LI_TEXT2" | jq -Rs '.')
TW_TEXT2_ESC=$(echo "$TW_TEXT2" | jq -Rs '.')

VARIANTS2=$(jq -n \
  --argjson li_text "$LI_TEXT2_ESC" \
  --argjson tw_text "$TW_TEXT2_ESC" \
  --arg li_htags "$HTAGS_LI_ESC" \
  --arg tw_htags "$HTAGS_TW_ESC" \
  '{
    "linkedin": {"platform":"linkedin","text":$li_text,"hashtags":$li_htags,"status":"draft"},
    "twitter": {"platform":"twitter","text":$tw_text,"hashtags":$tw_htags,"status":"draft"}
  }')

curl -s -X POST "$BASE/api/content/pipelines" \
  -H 'Content-Type: application/json' \
  -d "$(jq -n \
    --arg id "pipe_seed_agents_02" \
    --arg platform "linkedin,twitter" \
    --arg topic "Open Source AI Agents — Why Freedom Wins" \
    --arg status "active" \
    --argjson currentStep 3 \
    --argjson steps "$STEPS2" \
    --arg finalText "$VARIANTS2" \
    --arg finalHashtags "$HTAGS_LI_ESC|$HTAGS_TW_ESC" \
    '{id:$id, platform:$platform, topic:$topic, status:$status, currentStep:$currentStep, steps:$steps, finalText:$finalText, finalHashtags:$finalHashtags}')" | jq .

echo ""
echo "💾 Saving drafts..."

# Draft 1 — LinkedIn ready for review
curl -s -X POST "$BASE/api/content/drafts" \
  -H 'Content-Type: application/json' \
  -d "$(jq -n \
    --arg id "draft_seed_li_01" \
    --arg platform "linkedin" \
    --argjson text "$LI_TEXT1_ESC" \
    --arg hashtags "$HTAGS_LI_ESC" \
    --arg status "draft" \
    --arg agentId "bragi" \
    --arg pipelineId "pipe_seed_agents_01" \
    '{id:$id, platform:$platform, text:$text, hashtags:$hashtags, status:$status, agentId:$agentId, pipelineId:$pipelineId}')" | jq .

# Draft 2 — Twitter ready for review
curl -s -X POST "$BASE/api/content/drafts" \
  -H 'Content-Type: application/json' \
  -d "$(jq -n \
    --arg id "draft_seed_tw_01" \
    --arg platform "twitter" \
    --argjson text "$TW_TEXT1_ESC" \
    --arg hashtags "$HTAGS_TW_ESC" \
    --arg status "draft" \
    --arg agentId "bragi" \
    --arg pipelineId "pipe_seed_agents_01" \
    '{id:$id, platform:$platform, text:$text, hashtags:$hashtags, status:$status, agentId:$agentId, pipelineId:$pipelineId}')" | jq .

# Draft 3 — LinkedIn scheduled
SCHED=$(date -u -d "+2 days 14:00" +%Y-%m-%dT%H:%M:%S.000Z 2>/dev/null || date -u -v+2d -v14H -v0M +%Y-%m-%dT%H:%M:%S.000Z 2>/dev/null || echo "2026-04-01T14:00:00.000Z")
curl -s -X POST "$BASE/api/content/drafts" \
  -H 'Content-Type: application/json' \
  -d "$(jq -n \
    --arg id "draft_seed_li_02" \
    --arg platform "linkedin" \
    --argjson text "$LI_TEXT2_ESC" \
    --arg hashtags "$HTAGS_LI_ESC" \
    --arg status "scheduled" \
    --arg scheduledFor "$SCHED" \
    --arg agentId "bragi" \
    --arg pipelineId "pipe_seed_agents_02" \
    '{id:$id, platform:$platform, text:$text, hashtags:$hashtags, status:$status, scheduledFor:$scheduledFor, agentId:$agentId, pipelineId:$pipelineId}')" | jq .

# Draft 4 — Twitter standalone
curl -s -X POST "$BASE/api/content/drafts" \
  -H 'Content-Type: application/json' \
  -d "$(jq -n \
    --arg id "draft_seed_tw_02" \
    --arg platform "twitter" \
    --argjson text "$TW_TEXT2_ESC" \
    --arg hashtags "$HTAGS_TW_ESC" \
    --arg status "draft" \
    --arg agentId "bragi" \
    '{id:$id, platform:$platform, text:$text, hashtags:$hashtags, status:$status, agentId:$agentId}')" | jq .

echo ""
echo "📊 Logging activities..."

# Log activities for the agent work
curl -s -X POST "$BASE/api/chat" \
  -H 'Content-Type: application/json' \
  -d '{"agentId":"saga","message":"Log: I just completed content research for 2 campaigns about AI agents and open source AI. Found trending topics and audience insights for LinkedIn and Twitter."}' > /dev/null

echo ""
echo "═══════════════════════════════════════════"
echo "✅ Content Studio seeded with real agent content!"
echo ""
echo "  📋 2 Pipelines (campaigns)"
echo "     • AI Agent Platforms — at editorial review gate"
echo "     • Open Source AI — at media generation step"
echo ""
echo "  📝 4 Drafts"
echo "     • 2 LinkedIn posts (1 draft, 1 scheduled)"
echo "     • 2 Twitter posts (drafts)"
echo ""
echo "  🤖 Agents used:"
echo "     • 🔮 Saga — research & strategy"
echo "     • 🎭 Bragi — content creation & hashtags"
echo "═══════════════════════════════════════════"
