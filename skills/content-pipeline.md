# Skill: Content Pipeline

The Content Pipeline is a multi-stage workflow for creating and publishing content across platforms.

## Board: Content Pipeline

Columns: **Ideas** -> **Researching** -> **Writing** -> **Review** -> **Published**

Each card represents a piece of content (post, article, thread) that moves through these stages.

## Roles

- **Saga** (squad lead) — strategy, topic research, scheduling, community monitoring
- **Bragi** (creator) — writing, editing, adapting content per platform
- **Claw** (orchestrator) — delegates, reviews, requests human approval

## Flow

```
1. IDEA        — Saga researches trends, suggests topics, creates card in "Ideas"
2. RESEARCH    — Saga/Bragi research the topic, move card to "Researching"
3. WRITE       — Bragi drafts content, adapts for target platform, moves to "Writing"
4. REVIEW      — Content goes to "Review", Claw requests human approval
5. PUBLISH     — After approval, content is published, card moves to "Published"
```

## Publishing via MC API

### LinkedIn (direct API)
```
POST /api/linkedin {
  "text": "Post text here (max 3000 chars)",
  "url": "https://article-link.com",        // optional — generates preview card
  "imageUrl": "https://image-url.com/img.jpg" // optional — uploads and attaches image
}

// Response: { ok: true, postId: "...", urn: "urn:li:ugcPost:..." }
```

Check connection: `GET /api/linkedin` — returns profile info if token is valid.

**Required Vault secrets:**
- `LINKEDIN_ACCESS_TOKEN` — OAuth token (scopes: w_member_social, openid, profile)
- `LINKEDIN_PERSON_URN` — e.g. `urn:li:person:YOUR_ID` (optional, auto-detected)

### Generic content publish
```
POST /api/content/publish {
  "platform": "linkedin",       // linkedin, twitter, blog, newsletter
  "content": "Post text here...",
  "mediaUrl": null,              // optional image/video URL
  "agentId": "bragi"
}
```

Available platforms: `GET /api/content/platforms`

## Requesting Approval

Before publishing, always request human approval:

```
POST /api/approvals {
  type: "content_publish",
  title: "LinkedIn: ClawHalla v0.2 announcement",
  details: "Full post text...\n\nPlatform: LinkedIn\nScheduled: now",
  agentId: "bragi"
}
```

The human can approve via:
- MC Dashboard (Approvals page)
- Telegram inline buttons (if configured)

## Telegram Integration

If Telegram is configured, approvals appear as inline buttons in the bot chat.
Media (images, documents) can be sent to the Telegram bot and attached to content.

## Content Guidelines

- Adapt tone per platform (LinkedIn = professional, Twitter = concise, Blog = detailed)
- Include relevant hashtags for social posts
- All external posts require human approval — never auto-publish
- Track performance in card comments after publishing
- Create content in the user's preferred language (check USER.md)

## Creating Drafts (for agents)

Agents that cannot make HTTP calls to MC can create drafts by writing a `.md` file
to their workspace's `drafts/` directory. The MC file watcher will detect the file
and create a draft in the content pipeline automatically.

**File location:** `drafts/<platform>-YYYY-MM-DD-<topic>.md`

For squad agents, write to: `squads/<squad>/drafts/<platform>-YYYY-MM-DD-<topic>.md`

**File format:**
```markdown
---
platform: linkedin
title: Short title for the draft
agent: bragi
status: review
scheduledAt: 2026-03-31T09:00:00Z
---

Post content here...

#hashtag1 #hashtag2
```

**Frontmatter fields:**
| Field | Required | Description |
|-------|----------|-------------|
| `platform` | Yes | Target platform: `linkedin`, `twitter`, `instagram`, `blog`, `newsletter` |
| `title` | No | Short title (auto-derived from first line if missing) |
| `agent` | No | Agent ID that wrote the draft (auto-detected from path if missing) |
| `status` | No | Draft status: `draft`, `review`, `approved` (defaults to `draft`) |
| `scheduledAt` | No | ISO 8601 date for scheduled publishing |

**What happens automatically:**
1. MC detects the file via chokidar file watcher
2. Frontmatter is parsed for metadata, body is extracted as content
3. Hashtags are extracted from the last line (if it starts with `#`)
4. A draft is created/updated in the content_drafts DB table
5. A board card is created/updated on the Content Pipeline board
6. An activity log entry is recorded
7. The Content page refreshes in real-time via SSE

**Stable IDs:** The filename (without `.md`) is used as the draft ID prefix
(`draft_file_<filename>`). Updating the same file updates the existing draft
instead of creating a duplicate.

## Creating a Post (step by step)

1. Saga creates a card in "Ideas" with topic and target platform
2. Bragi picks up the card, researches, drafts content
3. Bragi moves card to "Writing" with the draft in the card description
4. Bragi moves card to "Review" when ready
5. Claw reviews and creates an approval request
6. Human approves (MC or Telegram)
7. Content is published via `/api/content/publish`
8. Card moves to "Published" with the publication link
