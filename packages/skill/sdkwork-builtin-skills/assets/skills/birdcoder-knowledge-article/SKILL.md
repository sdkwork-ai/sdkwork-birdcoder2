---
name: birdcoder-knowledge-article
description: Use when the user asks to write, draft, save, or update an article in the SDKWork Knowledge Base — resolve the target knowledge space, draft the Markdown article, write it with sdkwork_knowledge_write on the signed-in account, and report the document or wiki concept it created.
---

# Write an article in the Knowledge Base

## When to use

Use this skill when the user asks to write an article, draft, blog post, wiki page, release note, or knowledge-base entry, and when a later workflow needs the article stored before it is published elsewhere.

Do not use it for:

- publishing to a media platform — use `birdcoder-content-publish`;
- writing files into the project — use the filesystem tools;
- reading a knowledge base only to answer a question — the retrieval surface already does that;
- inventing a knowledge space, a document id, or a wiki concept that does not exist.

## Inputs

- The article topic, audience, and any source material the user supplied.
- The target knowledge space: a space id the user names, or the choice the user makes when asked.
- The article title (at most 64 characters) and the body the user wants stored.
- The document form: an ingested Markdown document (`create_article`) or a wiki concept page (`upsert_concept`).
- A signed-in BirdCoder client. Writing uses the IAM session this app is already signed in to; no other credential is accepted.

## Workflow

1. **Resolve the target space.** Call `sdkwork_knowledge_write` with `action: list_spaces`.
   - When exactly one space exists, state which one you use.
   - When the user named a space, match it by name or id and use the id verbatim.
   - Otherwise ask which space to write to, offering the listed spaces, and stop until the user answers. Never invent a space id.

2. **Read what is already there when the task builds on an existing article.**
   - `action: list_articles` with the chosen `spaceId` returns the titles and document ids.
   - `action: read_article` with a `documentId` returns the Markdown body, so an update starts from the current text instead of a guess.

3. **Draft the article in Markdown.**
   - One `#` title that matches the stored title, then a short lede, then `##` sections.
   - Put the conclusion or the action the reader must take in the first paragraph.
   - Use concrete facts from the user or the retrieved material; do not pad with generic statements.
   - Keep code, commands, and identifiers verbatim.
   - Keep the title at or below 64 characters.

4. **Choose the write form.**
   - `action: create_article` with `spaceId`, `title`, `markdown`, and optionally `visibility` ingests the Markdown as a new document.
   - `action: upsert_concept` with `spaceId`, `title`, `markdown`, `publishConcept`, and optionally `conceptId` creates or updates a wiki concept page. Pass the existing `conceptId` to update a page in place.
   - An ingested document is immutable content from this tool: a correction is a new document, or move the page to a wiki concept and update that. Do not claim an in-place edit the tool did not make.

5. **Verify the write.** The tool result names the `documentId` or `conceptId` and its state.
   - For a document, call `action: list_articles` again and confirm the title is present, or `action: read_article` with the new id and confirm the body.
   - For a concept, the state reports `published` only when `publishConcept: true` was accepted.
   - When the ingestion is still `queued` or `running`, report that and check again rather than claiming success.

6. **Report the result.** Name the space, the title, the document or concept id, the state, and whether the page is published to the space wiki.

## Rules

- The governing standards are `AGENT_SKILLS_SPEC.md` for skill form, `DOCUMENTATION_SPEC.md` for article structure and prose, `IAM_LOGIN_INTEGRATION_SPEC.md` for the session boundary, and `MEDIA_RESOURCE_SPEC.md` when the article carries images. Do not restate them; follow them.
- **Use the app's existing login.** Writing reuses the IAM session this app is already signed in to. Never request a password, token, second login, space membership, or API key. When signed out, ask the user to sign in through the app's own sign-in surface and retry.
- **Never invent identity.** A space id, document id, concept id, or account id comes from a tool result or from the user, never from a guess.
- **One article per call.** Do not batch unrelated articles into one write.
- **Title and body limits are the platform's.** A title over 64 characters or an empty body is rejected; fix the text rather than truncating silently.
- **Do not copy source material wholesale.** Summarize and cite; the knowledge base is not a mirror of another document.
- **A wiki publish is a visible action inside the space.** Do not set `publishConcept: true` unless the user asked for the page to be published or accepted it when asked.

## Verification

- `sdkwork_knowledge_write` with `action: list_spaces` returned the space that was written to.
- The write result carried a `documentId` or a `conceptId` and a state.
- `action: list_articles` (or `action: read_article` for a document) shows the title, and for a concept the reported state matches the requested publication.
- The reported title is at most 64 characters and matches the article body's `#` heading.

## Output

Report, in the user's language:

- the knowledge space name and id;
- the article title, the document or concept id, and the state;
- whether the page is published to the space wiki or only stored;
- the next step the user may want (share it, publish it to a media platform with `birdcoder-content-publish`, or revise it);
- the stopping stage and message when the write failed, and the one thing to change before retrying.
