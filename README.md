# DevHub: developer community with a live code playground

A place for developers to ask and answer questions and to write, run, share and fork small HTML, CSS and JavaScript demos in the browser.

**Stack:** React 19 + Vite, Node.js serverless functions on Vercel, MongoDB Atlas (with a full-text index), JWT sessions in HttpOnly cookies, bcrypt. The Markdown renderer and code editor are written from scratch (no libraries).

## Community
- **Questions and answers** with tags, full-text search (MongoDB text index, ranked by relevance), and newest, top and unanswered views
- **Voting and reputation**: an upvote is worth +5 on a question and +10 on an answer, a downvote -2, and an accepted answer +15. Reputation never drops below 1 and maps to tiers (Newcomer, Contributor, Trusted, Expert)
- **Accepted answers**: only the asker can accept; switching the accepted answer moves the reputation, and accepting twice pays once
- **Comments** on questions and answers, an **inbox** for answers, accepted answers and comments, profiles and a leaderboard
- Votes are one row per user and target, replaced atomically, so six simultaneous upvotes from one person count exactly once

## Live playground
- Three panels (HTML, CSS, JS), **auto-run** on change or manual run, a **console** panel showing `console.log`, warnings, errors and uncaught exceptions, and starter templates
- **Save, share and fork**: playgrounds can be private or public; forking copies the code into your account; likes and fork counts are tracked; questions can embed a playground

### How the sandbox keeps you safe
Running other people's code is the risky part, so it is locked down in layers:
1. The preview is an `<iframe sandbox="allow-scripts">` **without** `allow-same-origin`, so the code runs in an opaque origin: it cannot read this site's cookies, storage or DOM, or call its API as you.
2. A **Content-Security-Policy** inside the document (`default-src 'none'`) blocks every network request: `fetch`, XHR, WebSockets, frames and remote images.
3. User code and CSS cannot break out of their tags: closing-tag sequences (`</script`, `</`) are escaped when the document is built.
4. Console output travels to the page via `postMessage`, and the page only accepts messages from that iframe's window.

These are unit tested and were also verified in a real browser: reading `document.cookie`, `parent.document` and `localStorage` all throw `SecurityError`, `fetch` fails and a remote image is blocked, while `console` output and uncaught errors still reach the console panel.

Post text is rendered by a small Markdown parser that returns plain data (paragraphs, code fences, inline code, bold, italic, lists, headings, http(s) links). It never builds HTML strings and React escapes everything, so `<script>` in a post is shown as text and `javascript:` links are never created.

## API
One serverless function (`api/index.js`, reached through a `vercel.json` rewrite) routes every request. The database is pre-filled with demo questions, answers, people and playgrounds.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/signup`, `/auth/login`, `/auth/logout`, `GET /auth/me` |
| Q&A | `GET/POST /posts`, `GET/PATCH/DELETE /posts/:id`, `POST /posts/:id/answers`, `PATCH/DELETE /answers/:id`, `POST /answers/:id/accept`, `POST /comments`, `DELETE /comments/:id`, `GET /tags` |
| Engagement | `POST /vote`, `GET /users/:id`, `GET /leaderboard`, `GET /notifications`, `POST /notifications/read` |
| Playground | `GET/POST /playgrounds`, `GET /playgrounds/mine`, `GET/PUT/DELETE /playgrounds/:id`, `POST /playgrounds/:id/fork`, `POST /playgrounds/:id/like` |

## Run it locally
```bash
npm install
npm run build
```
The API needs a `MONGODB_URI` environment variable and Vercel's function runtime, so run `vercel dev` (or deploy to Vercel and add `MONGODB_URI`). Data goes to the `dev_community` database.

This is a public demo database: please do not post real personal details or secrets.
