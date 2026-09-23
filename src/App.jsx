import { useEffect, useMemo, useRef, useState } from "react";
import {
  AppShell, AuthProvider, AuthScreen, Avatar, Badge, Empty, ErrorNote, Field, Loading, Stat, ToastProvider,
  ago, api, useApi, useAsync, useAuth, useHashRoute, useToast,
} from "./kit.jsx";
import { parseMarkdown } from "./markdown.js";
import { TEMPLATES, buildSrcDoc } from "./sandbox.js";

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </ToastProvider>
  );
}

function Gate() {
  const { user } = useAuth();
  if (user === undefined) return <Loading />;
  if (!user) {
    return (
      <AuthScreen
        title="DevHub"
        tagline="Ask, answer and build together."
        points={["Questions and answers with voting and reputation", "A live HTML, CSS and JavaScript playground", "Share, fork and like playgrounds", "Code runs in a locked-down sandbox"]}
      />
    );
  }
  return <Router />;
}

const tierKind = { Expert: "danger", Trusted: "warn", Contributor: "accent", Newcomer: "" };

function Router() {
  const { path, go } = useHashRoute("/");
  const inbox = useApi("/notifications", { poll: 20000 });
  const post = path.match(/^\/post\/([a-f0-9]{24})$/);
  const play = path.match(/^\/play\/(new|[a-f0-9]{24})$/);
  const profile = path.match(/^\/user\/([a-f0-9]{24})$/);
  const unread = inbox.data ? inbox.data.unread : 0;
  const nav = [{ to: "/", label: "Questions" }, { to: "/ask", label: "Ask" }, { to: "/play", label: "Playground" }, { to: "/leaderboard", label: "Leaderboard" }, { to: "/inbox", label: `Inbox${unread ? ` (${unread})` : ""}` }];
  return (
    <AppShell brand="DevHub" mark="D" nav={nav} path={play ? "/play" : path} go={go}>
      {path === "/" && <Feed />}
      {path === "/ask" && <Ask go={go} />}
      {post && <PostPage id={post[1]} go={go} />}
      {path === "/play" && <PlayList />}
      {play && <Playground key={play[1]} id={play[1]} go={go} />}
      {path === "/leaderboard" && <Leaderboard />}
      {profile && <Profile id={profile[1]} />}
      {path === "/inbox" && <Inbox inbox={inbox} />}
    </AppShell>
  );
}

/* ---------- safe markdown rendering ---------- */
function Inline({ parts }) {
  return parts.map((p, i) => {
    if (p.t === "code") return <code key={i} className="ic">{p.v}</code>;
    if (p.t === "strong") return <b key={i}>{p.v}</b>;
    if (p.t === "em") return <em key={i}>{p.v}</em>;
    if (p.t === "link") return <a key={i} href={p.href} target="_blank" rel="noopener noreferrer nofollow">{p.v}</a>;
    return <span key={i}>{p.v}</span>;
  });
}

function Markdown({ text }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return (
    <div className="md">
      {blocks.map((b, i) => {
        if (b.type === "code") return <pre key={i}><code>{b.text}</code>{b.lang && <span className="lang">{b.lang}</span>}</pre>;
        if (b.type === "ul") return <ul key={i}>{b.items.map((it, j) => <li key={j}><Inline parts={it} /></li>)}</ul>;
        if (b.type === "h") { const H = `h${b.level + 1}`; return <H key={i}><Inline parts={b.inline} /></H>; }
        return <p key={i}><Inline parts={b.inline} /></p>;
      })}
    </div>
  );
}

const TagList = ({ tags, onTag }) => <span className="row wrap" style={{ gap: "0.3rem" }}>{tags.map((t) => <button key={t} className="tag" onClick={() => onTag && onTag(t)}>{t}</button>)}</span>;

/* ---------- feed ---------- */
function Feed() {
  const [sort, setSort] = useState("new");
  const [tag, setTag] = useState("");
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const params = `sort=${sort}${tag ? `&tag=${encodeURIComponent(tag)}` : ""}${term ? `&q=${encodeURIComponent(term)}` : ""}`;
  const { data, loading, error, reload } = useApi(`/posts?${params}`);
  const tags = useApi("/tags");
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Questions</h1><p>{tag ? `Tagged "${tag}"` : "Everything the community is asking"}</p></div><a className="btn" href="#/ask">Ask a question</a></div>
      <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1fr) 220px", alignItems: "start" }}>
        <div className="stack-sm">
          <form className="row wrap" onSubmit={(e) => { e.preventDefault(); setTerm(q); }}>
            <input className="input" style={{ maxWidth: 320 }} placeholder="Search questions" value={q} onChange={(e) => setQ(e.target.value)} /><button className="btn ghost">Search</button>
            {(term || tag) && <button type="button" className="btn ghost" onClick={() => { setQ(""); setTerm(""); setTag(""); }}>Clear</button>}
            <div className="tabs" style={{ margin: 0, marginLeft: "auto" }}>{[["new", "Newest"], ["top", "Top"], ["unanswered", "Unanswered"]].map(([k, l]) => <button key={k} className={sort === k ? "active" : ""} onClick={() => setSort(k)}>{l}</button>)}</div>
          </form>
          {loading && <Loading />}
          {error && <ErrorNote message={error} onRetry={reload} />}
          {data && data.length === 0 && <Empty title="Nothing found">Try other words, or ask the first question.</Empty>}
          {(data || []).map((p) => (
            <div key={p.id} className="card row" style={{ alignItems: "flex-start" }}>
              <div className="stats"><b>{p.score}</b><span>votes</span><b className={p.acceptedAnswerId ? "ok" : ""}>{p.answerCount}</b><span>answers</span></div>
              <div className="grow stack-sm"><a href={`#/post/${p.id}`} style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--text)" }}>{p.title}</a>
                <div className="muted small" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.body}</div>
                <div className="row between wrap"><TagList tags={p.tags} onTag={setTag} /><span className="small muted">{p.authorName} · {ago(p.createdAt)} · {p.views} views</span></div></div>
            </div>
          ))}
        </div>
        <div className="card stack-sm"><b>Popular tags</b>{(tags.data || []).slice(0, 14).map((t) => <button key={t.tag} className={`tag${tag === t.tag ? " on" : ""}`} onClick={() => setTag(tag === t.tag ? "" : t.tag)}>{t.tag} <span className="muted">× {t.count}</span></button>)}</div>
      </div>
    </div>
  );
}

function Ask({ go }) {
  const [f, setF] = useState({ title: "", body: "", tags: "", type: "question" });
  const { busy, run } = useAsync();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="stack" style={{ maxWidth: 780 }}>
      <div className="page-head"><div><h1>Ask the community</h1><p>Be specific and show what you tried. Markdown and code fences are supported.</p></div></div>
      <form className="card stack-sm" onSubmit={async (e) => { e.preventDefault(); const p = await run(() => api("/posts", { method: "POST", body: f }), "Question posted"); if (p) go(`/post/${p.id}`); }}>
        <Field label="Title"><input className="input" value={f.title} onChange={set("title")} placeholder="e.g. How do I debounce a search input in React?" /></Field>
        <Field label="Details"><textarea className="input" style={{ minHeight: 180, fontFamily: "var(--mono)" }} value={f.body} onChange={set("body")} placeholder={"Explain the problem.\n\n```js\n// include your code\n```"} /></Field>
        <Field label="Tags (up to 5, comma separated)"><input className="input" value={f.tags} onChange={set("tags")} placeholder="javascript, react" /></Field>
        {f.body && <div><span className="muted small">Preview</span><div className="card flat"><Markdown text={f.body} /></div></div>}
        <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn" disabled={busy}>Post question</button></div>
      </form>
    </div>
  );
}

/* ---------- post page ---------- */
function Vote({ score, mine, disabled, onVote }) {
  return (
    <div className="vote"><button className={mine === 1 ? "on" : ""} disabled={disabled} aria-label="Upvote" onClick={() => onVote(mine === 1 ? 0 : 1)}>▲</button><b>{score}</b><button className={mine === -1 ? "on" : ""} disabled={disabled} aria-label="Downvote" onClick={() => onVote(mine === -1 ? 0 : -1)}>▼</button></div>
  );
}

function PostPage({ id, go }) {
  const { user } = useAuth();
  const { data, loading, error, reload } = useApi(`/posts/${id}`);
  const [answer, setAnswer] = useState("");
  const { busy, run } = useAsync();
  const toast = useToast();
  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} />;
  const mine = data.authorId === user.id;
  const vote = async (type, target, value) => { try { await api("/vote", { method: "POST", body: { targetType: type, targetId: target, value } }); reload(true); } catch (e) { toast(e.message, "error"); } };
  const accept = async (a) => { await run(() => api(`/answers/${a.id}/accept`, { method: "POST" }), "Answer accepted"); reload(true); };
  const del = async () => { if (window.confirm("Delete this post and its answers?")) { await run(() => api(`/posts/${id}`, { method: "DELETE" }), "Deleted"); go("/"); } };
  return (
    <div className="stack">
      <div className="page-head"><div><h1>{data.title}</h1><p>Asked {ago(data.createdAt)} · {data.views} views</p></div>{mine && <button className="btn ghost" onClick={del}>Delete</button>}</div>
      <div className="card row" style={{ alignItems: "flex-start" }}>
        <Vote score={data.score} mine={data.myVote} disabled={mine} onVote={(v) => vote("post", id, v)} />
        <div className="grow stack-sm"><Markdown text={data.body} />{data.playgroundId && <EmbeddedPlayground id={data.playgroundId} />}<TagList tags={data.tags} />
          <div className="row between small muted"><span /><span>{data.authorName}</span></div>
          <Comments items={data.comments} targetType="post" targetId={id} onDone={() => reload(true)} /></div>
      </div>
      <h2 style={{ marginBottom: 0 }}>{data.answers.length} answer{data.answers.length === 1 ? "" : "s"}</h2>
      {data.answers.map((a) => (
        <div key={a.id} className={`card row${a.accepted ? " accepted" : ""}`} style={{ alignItems: "flex-start" }}>
          <div className="stack-sm" style={{ justifyItems: "center" }}><Vote score={a.score} mine={a.myVote} disabled={a.authorId === user.id} onVote={(v) => vote("answer", a.id, v)} />
            {a.accepted && <span title="Accepted answer" style={{ color: "var(--ok)", fontSize: "1.4rem" }}>✔</span>}
            {mine && !a.accepted && data.type === "question" && <button className="btn ghost sm" onClick={() => accept(a)} disabled={busy}>Accept</button>}</div>
          <div className="grow stack-sm"><Markdown text={a.body} /><div className="row between small muted"><span /><span><a href={`#/user/${a.authorId}`}>{a.authorName}</a> · {ago(a.createdAt)}</span></div>
            <Comments items={a.comments} targetType="answer" targetId={a.id} onDone={() => reload(true)} /></div>
        </div>
      ))}
      <form className="card stack-sm" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api(`/posts/${id}/answers`, { method: "POST", body: { body: answer } }), "Answer posted")) { setAnswer(""); reload(true); } }}>
        <h3 style={{ margin: 0 }}>Your answer</h3>
        <textarea className="input" style={{ minHeight: 140, fontFamily: "var(--mono)" }} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Share what you know. Markdown and code fences work here too." />
        {answer && <div className="card flat"><Markdown text={answer} /></div>}
        <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn" disabled={busy}>Post answer</button></div>
      </form>
    </div>
  );
}

function Comments({ items, targetType, targetId, onDone }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const { user } = useAuth();
  const toast = useToast();
  const submit = async (e) => { e.preventDefault(); try { await api("/comments", { method: "POST", body: { targetType, targetId, body: text } }); setText(""); setOpen(false); onDone(); } catch (err) { toast(err.message, "error"); } };
  return (
    <div className="stack-sm" style={{ borderTop: "1px solid var(--border)", paddingTop: "0.5rem" }}>
      {items.map((c) => <div key={c.id} className="small"><Inline parts={[{ t: "text", v: c.body }]} /> <span className="muted">· {c.authorName} {ago(c.at)}</span>{c.authorId === user.id && <button className="link" onClick={async () => { await api(`/comments/${c.id}`, { method: "DELETE" }); onDone(); }}>delete</button>}</div>)}
      {open ? <form className="row" onSubmit={submit}><input className="input" autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment" /><button className="btn ghost sm">Add</button></form> : <button className="link" onClick={() => setOpen(true)}>Add a comment</button>}
    </div>
  );
}

/* ---------- playground ---------- */
function Preview({ files, running, onConsole }) {
  const ref = useRef(null);
  const srcDoc = useMemo(() => buildSrcDoc(files), [files]);
  const docKey = useMemo(() => { let h = 5381; for (let i = 0; i < srcDoc.length; i += 1) h = ((h << 5) + h + srcDoc.charCodeAt(i)) | 0; return `${srcDoc.length}-${h}`; }, [srcDoc]);
  useEffect(() => {
    const onMsg = (e) => { if (ref.current && e.source === ref.current.contentWindow && e.data && e.data.__devhub) onConsole({ level: e.data.level, text: String(e.data.text).slice(0, 2000) }); };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [onConsole]);
  // sandbox without allow-same-origin: the code inside cannot touch this site's cookies, storage or DOM
  // a new key mounts a fresh iframe for every document, which avoids dropped navigations when the code changes quickly
  return <iframe key={docKey} ref={ref} title="Playground preview" sandbox="allow-scripts" srcDoc={running ? srcDoc : ""} className="preview-frame" />;
}

function EmbeddedPlayground({ id }) {
  const { data } = useApi(`/playgrounds/${id}`);
  const [logs, setLogs] = useState([]);
  if (!data) return null;
  return (
    <div className="card flat stack-sm"><div className="row between"><b>{data.title}</b><a href={`#/play/${data.id}`}>Open in playground</a></div>
      <Preview files={data} running onConsole={(l) => setLogs((x) => [...x.slice(-50), l])} />
      {logs.length > 0 && <div className="console small mono">{logs.map((l, i) => <div key={i} className={l.level}>{l.text}</div>)}</div>}</div>
  );
}

function PlayList() {
  const [sort, setSort] = useState("recent");
  const [tab, setTab] = useState("public");
  const [q, setQ] = useState("");
  const pub = useApi(`/playgrounds?sort=${sort}${q ? `&q=${encodeURIComponent(q)}` : ""}`, { skip: tab !== "public" });
  const mine = useApi("/playgrounds/mine", { skip: tab !== "mine" });
  const list = tab === "public" ? pub : mine;
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Playground</h1><p>Write HTML, CSS and JavaScript and see it run instantly.</p></div><a className="btn" href="#/play/new">+ New playground</a></div>
      <div className="row wrap"><div className="tabs" style={{ margin: 0 }}><button className={tab === "public" ? "active" : ""} onClick={() => setTab("public")}>Community</button><button className={tab === "mine" ? "active" : ""} onClick={() => setTab("mine")}>Mine</button></div>
        {tab === "public" && <><input className="input" style={{ maxWidth: 240 }} placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} /><select className="input" style={{ width: "auto" }} value={sort} onChange={(e) => setSort(e.target.value)}><option value="recent">Recent</option><option value="popular">Most liked</option></select></>}</div>
      {list.loading && <Loading />}
      {list.error && <ErrorNote message={list.error} onRetry={list.reload} />}
      {list.data && list.data.length === 0 && <Empty title="Nothing here yet"><a className="btn" href="#/play/new">Create one</a></Empty>}
      <div className="auto-grid">{(list.data || []).map((p) => (
        <a key={p.id} href={`#/play/${p.id}`} className="card hover stack-sm" style={{ color: "inherit", textDecoration: "none" }}>
          <div className="row between"><b>{p.title}</b>{!p.isPublic && <Badge>private</Badge>}</div>
          <div className="muted small">{p.description || "No description"}</div>
          <div className="row between small muted"><span>{p.ownerName}</span><span>♥ {p.likes} · ⑂ {p.forks}</span></div>
          {p.forkedFromTitle && <span className="small muted">Forked from {p.forkedFromTitle}</span>}
        </a>
      ))}</div>
    </div>
  );
}

function Playground({ id, go }) {
  const isNew = id === "new";
  const loaded = useApi(`/playgrounds/${id}`, { skip: isNew });
  const [f, setF] = useState(null);
  const [files, setFiles] = useState({ html: "", css: "", js: "" });
  const [logs, setLogs] = useState([]);
  const [auto, setAuto] = useState(true);
  const [tab, setTab] = useState("html");
  const { busy, run } = useAsync();
  const toast = useToast();
  const timer = useRef(null);

  useEffect(() => {
    if (isNew) { const t = TEMPLATES.hello; setF({ ...t, description: "", isPublic: false, mine: true }); setFiles({ html: t.html, css: t.css, js: t.js }); }
    else if (loaded.data) { const d = loaded.data; setF(d); setFiles({ html: d.html, css: d.css, js: d.js }); }
  }, [isNew, loaded.data]);

  const [live, setLive] = useState(files);
  useEffect(() => {
    if (!auto || files === live) return undefined;
    timer.current = setTimeout(() => { setLogs([]); setLive(files); }, 450);
    return () => clearTimeout(timer.current);
  }, [files, auto, live]);
  useEffect(() => { if (f && !live.html && !live.css && !live.js) setLive(files); }, [f]); // eslint-disable-line react-hooks/exhaustive-deps
  const onConsole = useMemo(() => (l) => setLogs((x) => [...x.slice(-199), l]), []);

  if (!f || (!isNew && loaded.loading)) return <Loading />;
  if (loaded.error) return <ErrorNote message={loaded.error} />;
  const mine = isNew || f.mine;
  const setFile = (k, v) => setFiles((x) => ({ ...x, [k]: v }));
  const save = async () => {
    const body = { title: f.title, description: f.description, isPublic: f.isPublic, ...files };
    if (isNew) { const p = await run(() => api("/playgrounds", { method: "POST", body }), "Saved"); if (p) go(`/play/${p.id}`); }
    else await run(() => api(`/playgrounds/${id}`, { method: "PUT", body }), "Saved");
  };
  const fork = async () => { const p = await run(() => api(`/playgrounds/${id}/fork`, { method: "POST" }), "Forked to your account"); if (p) go(`/play/${p.id}`); };
  const like = async () => { const r = await run(() => api(`/playgrounds/${id}/like`, { method: "POST" })); if (r) loaded.reload(true); };
  const del = async () => { if (window.confirm("Delete this playground?")) { await run(() => api(`/playgrounds/${id}`, { method: "DELETE" }), "Deleted"); go("/play"); } };
  const onTab = (e) => { if (e.key === "Tab") { e.preventDefault(); const t = e.target; const s = t.selectionStart; setFile(tab, `${t.value.slice(0, s)}  ${t.value.slice(t.selectionEnd)}`); requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = s + 2; }); } };
  return (
    <div className="stack">
      <div className="page-head"><div><h1>{isNew ? "New playground" : f.title}</h1><p>{f.forkedFromTitle ? `Forked from ${f.forkedFromTitle}. ` : ""}{f.ownerName ? `By ${f.ownerName}. ` : ""}Code runs in a sandbox with no network access.</p></div>
        <div className="row wrap">{mine ? <button className="btn" disabled={busy} onClick={save}>Save</button> : <button className="btn" disabled={busy} onClick={fork}>Fork to edit</button>}
          {!isNew && !mine && <button className="btn ghost" onClick={like}>{f.liked ? "♥ Liked" : "♡ Like"} ({f.likes})</button>}
          {!isNew && mine && <><button className="btn ghost" onClick={fork}>Fork</button><button className="btn ghost" onClick={del}>Delete</button></>}
          {!isNew && f.isPublic && <button className="btn ghost" onClick={() => { navigator.clipboard && navigator.clipboard.writeText(window.location.href); toast("Link copied"); }}>Share</button>}</div></div>
      {mine && (
        <div className="row wrap"><input className="input" style={{ maxWidth: 260 }} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} aria-label="Title" /><input className="input" style={{ maxWidth: 320 }} placeholder="Short description" value={f.description || ""} onChange={(e) => setF({ ...f, description: e.target.value })} />
          <label className="row small"><input type="checkbox" checked={f.isPublic} onChange={(e) => setF({ ...f, isPublic: e.target.checked })} /> Public</label>
          {isNew && <select className="input" style={{ width: "auto" }} defaultValue="hello" onChange={(e) => { const t = TEMPLATES[e.target.value]; setF({ ...f, title: t.title }); setFiles({ html: t.html, css: t.css, js: t.js }); }} aria-label="Template"><option value="hello">Template: Hello</option><option value="counter">Template: Counter</option><option value="blank">Template: Blank</option></select>}</div>
      )}
      <div className="play-grid">
        <div className="card stack-sm">
          <div className="row between"><div className="tabs" style={{ margin: 0 }}>{["html", "css", "js"].map((k) => <button key={k} className={tab === k ? "active" : ""} onClick={() => setTab(k)}>{k.toUpperCase()}</button>)}</div>
            <span className="row small"><label className="row"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto-run</label>{!auto && <button className="btn sm" onClick={() => { setLogs([]); setLive(files); }}>Run</button>}</span></div>
          <textarea className="code" spellCheck="false" value={files[tab]} readOnly={!mine} onChange={(e) => setFile(tab, e.target.value)} onKeyDown={onTab} aria-label={`${tab.toUpperCase()} code`} />
        </div>
        <div className="stack-sm">
          <div className="card stack-sm"><b>Result</b><Preview files={live} running onConsole={onConsole} /></div>
          <div className="card stack-sm"><div className="row between"><b>Console</b><button className="link" onClick={() => setLogs([])}>clear</button></div>
            <div className="console small mono">{logs.length === 0 ? <span className="muted">console.log output appears here</span> : logs.map((l, i) => <div key={i} className={l.level}>{l.text}</div>)}</div></div>
        </div>
      </div>
    </div>
  );
}

/* ---------- people ---------- */
function Leaderboard() {
  const { data, loading, error, reload } = useApi("/leaderboard");
  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Leaderboard</h1><p>Reputation comes from upvotes (+5 questions, +10 answers) and accepted answers (+15).</p></div></div>
      <div className="stack-sm">{data.map((u, i) => <a key={u.id} href={`#/user/${u.id}`} className="card hover row" style={{ color: "inherit", textDecoration: "none" }}><b style={{ width: 28 }}>{i + 1}</b><Avatar name={u.name} /><span className="grow"><b>{u.name}</b></span><Badge kind={tierKind[u.tier]}>{u.tier}</Badge><b>{u.reputation}</b></a>)}</div>
    </div>
  );
}

function Profile({ id }) {
  const { data, loading, error, reload } = useApi(`/users/${id}`);
  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;
  return (
    <div className="stack">
      <div className="page-head"><div className="row"><Avatar name={data.name} /><div><h1 style={{ margin: 0 }}>{data.name}</h1><p>Member since {new Date(data.joined).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</p></div></div><Badge kind={tierKind[data.tier]}>{data.tier}</Badge></div>
      <div className="grid cols-4"><Stat label="Reputation" value={data.reputation} /><Stat label="Posts" value={data.postCount} /><Stat label="Answers" value={data.answerCount} /><Stat label="Accepted" value={data.acceptedCount} /></div>
      {data.topTags.length > 0 && <div className="card row wrap"><b>Top tags</b>{data.topTags.map((t) => <span key={t.tag} className="tag">{t.tag} × {t.count}</span>)}</div>}
      <h2 style={{ marginBottom: 0 }}>Recent posts</h2>
      {data.recent.length === 0 && <p className="muted">No posts yet.</p>}
      {data.recent.map((p) => <a key={p.id} href={`#/post/${p.id}`} className="card hover row" style={{ color: "inherit", textDecoration: "none" }}><span className="grow"><b>{p.title}</b></span><span className="muted small">{p.score} votes · {p.answerCount} answers</span></a>)}
    </div>
  );
}

function Inbox({ inbox }) {
  const { run } = useAsync();
  useEffect(() => { if (inbox.data && inbox.data.unread) { const t = setTimeout(() => run(() => api("/notifications/read", { method: "POST" })).then(() => inbox.reload(true)), 1500); return () => clearTimeout(t); } return undefined; }, [inbox.data]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!inbox.data) return <Loading />;
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Inbox</h1><p>Answers, accepted answers and comments on your posts.</p></div></div>
      {inbox.data.items.length === 0 && <Empty title="Nothing yet">You will be notified when someone answers or comments.</Empty>}
      {inbox.data.items.map((n) => <a key={n.id} href={`#${n.link}`} className="card hover row" style={{ color: "inherit", textDecoration: "none", opacity: n.read ? 0.7 : 1 }}><Badge kind={n.type === "accepted" ? "ok" : "accent"}>{n.type}</Badge><span className="grow">{n.text}</span><span className="muted small">{ago(n.at)}</span></a>)}
    </div>
  );
}
