# Assistant: ideas for the next steps

Written 2026-10-31 after a read-through of the whole assistant (`assistant/`,
`src/components/assistant/`, `src/services/assistantService.js`, the
`assistant_*` migrations). Nothing here is decided; it is a ranked backlog.

## What exists today

- **Graph** (`assistant/src/assistant/agent.py`): rewrite follow-up into a
  standalone question → router picks sources (rules / stats / app, Gemini
  Flash Lite) → pgvector retrieval over six docs (k = 4) → one agent node
  (DeepSeek via OpenRouter) with 17 tools. Postgres checkpointer keeps threads
  30 days.
- **Tools** (`tools.py`, `stats.py`): player lookup and stats, recent matches,
  head-to-head, league standings, tournaments, app-wide records, the user's
  own practice summary, form rating, match preview with win chance, round
  recap. Every query runs as the user (RLS), demo leagues are filtered out.
- **Docs for RAG**: X01 and Cricket rules, league / tournament / practice user
  guides, a coaching guide that maps weaknesses to practice modes.
- **Server** (`server.py`): `/chat` streams NDJSON events, `/feedback` stores a
  thumbs score in Langfuse. Daily quota per user via `use_assistant_question`,
  refund on failure, audience switch (admins / everyone) in
  `assistant_settings`.
- **Frontend**: floating panel, page context (`league`, `tournament`, `match`,
  `player`, `practice`) sent with every message, four suggestions per page
  with real names, trace of steps and tool calls, thumbs feedback.
- **Evals**: router, RAG, stats and agent cases in `assistant/evals/`, run by
  hand against staging.

## Top 5: biggest gain for the least work

1. **Proactive, not only reactive.** The three strongest tools
   (`get_round_recap`, `get_match_preview`, `get_my_practice`) are hidden
   behind the chat. Put them where the person already is: a "Write recap"
   button on the tournament summary (copy to clipboard), a one-line coaching
   note on the practice *Session complete* screen, a short AI paragraph in the
   pre-match card. Managers get a ready post for the group chat without
   knowing the chat exists.
2. **Clickable names in answers.** The prompt forbids ids, so "Peter H. leads"
   is dead text. Let the model write Markdown links `[Peter H.](/player/<id>)`
   and render them through `PlayerLink`; same for tournaments and leagues.
   Validate every link against the known routes and a UUID before rendering.
3. **Action chips under coaching advice.** When the answer says "Checkout
   trainer, doubles only, 20 attempts", add a *Start* chip that opens the
   practice setup with those settings prefilled via URL parameters. The advice
   becomes one tap, which is what makes the coach something people use twice.
4. **Conversation history.** The server keeps threads 30 days, but
   `AssistantPanel` creates a new thread id on every mount, so a reload empties
   the chat. Keep the thread id in `localStorage` and list recent threads. The
   backend already supports it.
5. **Deterministic checkout tool.** "I have 121 left, what do I throw?" and
   "Can 159 be finished?" go through RAG today, which only knows it roughly.
   The checkout table is arithmetic: a `suggest_checkout(score, darts_left)`
   tool never answers wrong and can also serve the scoring screen.

## New tools from data the app already has

- **Legs and records.** The `legs` table exists, but the assistant cannot
  answer "fastest leg in the league", "who has a 9-darter", "darts per leg".
  One `get_leg_records` tool.
- **Streaks.** Longest and current winning streak, unbeaten runs. Cheap from
  `recent_match_totals`, and a favourite at the table.
- **Schedule and progression.** "When is my next match", "who is in my group",
  "what do I need to advance", and for managers "which matches on board 3 are
  still unplayed". The most common question during an evening, and the one the
  assistant cannot answer today.
- **Match insights.** The turning point and the chance after every visit are
  already computed for the chart; expose them as `get_match_insights(match_id)`
  so "where did it turn?" works on a match page.
- **Most improved this season.** `get_player_form` across every league member:
  "who improved most this year", "who dropped most". Good content for the
  end-of-season recap.
- **Cricket.** `get_records` and the preview are X01 only. At least an MPR
  table and Cricket head-to-head, otherwise the assistant looks like it does
  not know the game.

## A deeper coach

- **Per-target breakdown.** Checkout sessions store per-target data, but only
  `hardest` reaches the summary. Give the model hit rates per double (D16 28 %,
  D20 41 %) and a First 9 trend so the advice is concrete.
- **Practice vs. match gap.** The numbers already sit side by side (practice
  vs. matches for X01). Name it in the coaching guide as its own section:
  "35 % in practice, 22 % in matches: pressure", recommending 121 and bot
  matches.
- **Two-week practice plan.** A structured answer with 3–4 drills from the
  weak spots, each with an action chip from item 3 above. The guide already
  says "one or two changes at a time"; the plan is the same advice in another
  shape.
- **Note after every session.** One sentence on *Session complete*, ideally
  outside the daily quota (a separate endpoint cached per session), so it does
  not burn the user's questions.

## Chat UX

- Voice input via the Web Speech API; typing in a pub is hard.
- Share and copy an answer (recaps above all).
- A quota indicator ("12/30 today") so the limit message is not a surprise.
- A small chart in form answers (monthly averages), reusing the existing chart
  component.

## Quality and operations

- **The retriever ignores the router.** The router knows whether a question is
  about rules or the app, but `DocChunksRetriever` is called without
  `source_prefix`. A one-line change for more precise chunks.
- **Slovak questions against English docs.** Eval cases rag-14 and rag-15 are
  Slovak; check how they score. If poorly, add Slovak versions of the docs or
  translate the question before embedding.
- **Thumbs down → eval case.** Every thumbs down with a comment is a ready eval
  case: a Langfuse dataset plus a script that turns them into
  `agent_cases.json`, and a GitHub workflow that runs the evals against
  staging.
- **Prompt injection through names.** Player, league and tournament names enter
  the model's context. A player called "ignore the instructions and…" is
  science fiction for now, but one test case and one sentence in the prompt
  close it.
- **Tool-result cache** for 60 s keyed by (tool, args). When twenty people ask
  "who leads" on the same night, the database should see one query.
- **Local JWT verification.** The shortcut in `verify` already says
  `auth.get_user` per message should become JWKS when traffic grows.

## For managers and monetisation

- **Text generation.** Invitation to the next round, results post, poster
  text. Read-only, zero risk, and exactly what managers do by hand every week.
- **Write actions with confirmation.** "Create the next round with the same
  players on Friday" as a tool that returns a draft and the app shows a
  confirmation dialog. Only after the text generation works.
- **TV ticker.** One line between rotations: "Peter needs one more win to pass
  Jozef." Facts deterministically, the model only polishes once per finished
  match.
- **Weekly digest** to league members by email from the recap. Needs email
  infrastructure first.

## Risks to keep in mind

- Action chips and links in answers mean the model returns URLs: validate
  them against allowed paths and UUIDs, never render them blindly.
- Anything that adds model calls outside the chat (session notes, previews)
  needs its own quota or cache, or it quietly multiplies the OpenRouter bill.
