const { ObjectId } = require("mongodb");
const { createApp, bad, forbidden, notFound, conflict, oid, clean, str, oneOf, created } = require("./http");
const { addAuthRoutes } = require("./authRoutes");

const asId = (v) => new ObjectId(String(v));
const MAX_FILE = 60000;

const app = createApp({
  app: "dev-community",
  dbName: "dev_community",
  setup: async (db) => {
    await db.collection("posts").createIndex({ title: "text", body: "text", tags: "text" });
    await db.collection("posts").createIndex({ createdAt: -1 });
    await db.collection("posts").createIndex({ tags: 1 });
    await db.collection("votes").createIndex({ userId: 1, targetType: 1, targetId: 1 }, { unique: true });
    await db.collection("answers").createIndex({ postId: 1 });
    await db.collection("comments").createIndex({ targetType: 1, targetId: 1 });
    await db.collection("playgrounds").createIndex({ ownerId: 1, updatedAt: -1 });
    await db.collection("playgrounds").createIndex({ isPublic: 1, updatedAt: -1 });
    await db.collection("notifications").createIndex({ userId: 1, at: -1 });
    await seed(db);
  },
});
addAuthRoutes(app, { extra: () => ({ reputation: 1 }) });
const users = (db) => db.collection("users");

/* ---------- reputation ---------- */
const REP = { question: 5, answer: 10, downvote: -2, accepted: 15 };
const upRep = (type) => (type === "answer" ? REP.answer : REP.question);
const repFor = (type, value) => (value > 0 ? upRep(type) : value < 0 ? REP.downvote : 0);
const tier = (rep) => (rep >= 500 ? "Expert" : rep >= 200 ? "Trusted" : rep >= 50 ? "Contributor" : "Newcomer");
async function addRep(db, userId, delta) {
  if (!delta) return;
  await users(db).updateOne({ _id: asId(userId) }, { $inc: { reputation: delta } });
  await users(db).updateOne({ _id: asId(userId), reputation: { $lt: 1 } }, { $set: { reputation: 1 } });
}
async function notify(db, userId, type, text, link) {
  await db.collection("notifications").insertOne({ userId: String(userId), type, text, link, read: false, at: new Date() });
}

function cleanTags(input) {
  const list = (Array.isArray(input) ? input : String(input || "").split(",")).map((t) => String(t).trim().toLowerCase().replace(/^#/, "")).filter((t) => /^[a-z0-9+#.-]{1,24}$/.test(t));
  return [...new Set(list)].slice(0, 5);
}

/* ---------- seed community content ---------- */
async function seed(db) {
  if (await db.collection("meta").findOne({ _id: "seeded" })) return;
  await db.collection("meta").updateOne({ _id: "seeded" }, { $set: { at: new Date() } }, { upsert: true });
  const now = Date.now();
  const people = [["Priya Nair", 640], ["Arjun Menon", 310], ["Sofia Alvarez", 180], ["Kenji Watanabe", 95], ["Amara Okafor", 40]];
  const ids = [];
  for (const [name, reputation] of people) ids.push(String((await users(db).insertOne({ name, email: `${name.split(" ")[0].toLowerCase()}@demo.devhub.example`, role: "user", reputation, demo: true, createdAt: new Date(now - 90 * 86400000) })).insertedId));
  const Q = [
    ["How do I center a div both vertically and horizontally?", "I have a card inside a page and I want it perfectly centered. What is the modern way to do it?\n\nI tried `margin: auto` but it only centers horizontally.", ["css", "layout"], 4, 41, 0, [["Use flexbox on the parent:\n\n```css\n.parent {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  min-height: 100vh;\n}\n```\n\nOr `display: grid; place-items: center;` which is even shorter.", 1, 24, true]]],
    ["What is the difference between `let`, `const` and `var` in JavaScript?", "I keep seeing all three. When should I use which one, and does it really matter?", ["javascript", "basics"], 0, 33, 0, [["Short version: use `const` by default, `let` when you need to reassign, and avoid `var`.\n\n`var` is function scoped and hoisted, while `let` and `const` are block scoped and live in the temporal dead zone until declared.", 2, 19, true]]],
    ["Why does my React component re-render on every keystroke?", "I have a form with 20 inputs and it feels laggy. Every keystroke re-renders the whole tree. How do I find out why and fix it?", ["react", "performance"], 1, 27, 0, [["First measure. Open the React DevTools profiler and record while typing; it shows which components rendered and why.\n\nCommon fixes: keep state as close to the input as possible, wrap expensive children in `React.memo`, and avoid creating new object props on every render.", 0, 15, false], ["Also consider an uncontrolled form (`useRef` or `FormData`) if you only need the values on submit.", 3, 6, false]]],
    ["Best way to store passwords in a Node.js app?", "I am building a login system. Is it fine to hash with SHA-256 or is there something better?", ["node", "security"], 2, 52, 0, [["Do not use plain SHA-256. Use a slow, salted algorithm designed for passwords: **bcrypt**, scrypt or Argon2.\n\n```js\nconst hash = await bcrypt.hash(password, 10);\nconst ok = await bcrypt.compare(input, hash);\n```", 1, 38, true]]],
    ["MongoDB: how do I count documents per category?", "I have a `products` collection with a `category` field and I want a count for each one.", ["mongodb", "aggregation"], 3, 18, 0, [["Use an aggregation with `$group`:\n\n```js\ndb.products.aggregate([\n  { $group: { _id: \"$category\", count: { $sum: 1 } } },\n  { $sort: { count: -1 } }\n]);\n```", 4, 12, true]]],
    ["How can I make my site responsive without a framework?", "I want a layout that works on phones and desktops using only CSS. Where do I start?", ["css", "responsive"], 4, 14, 0, []],
    ["Should I learn TypeScript before React?", "I know JavaScript reasonably well. Is it better to learn TypeScript first, or add it later?", ["typescript", "react", "career"], 3, 9, 0, []],
  ];
  const posts = [];
  for (let i = 0; i < Q.length; i += 1) {
    const [title, body, tags, author, score, , answers] = Q[i];
    const doc = { type: "question", title, body, tags, authorId: ids[author], authorName: people[author][0], score, views: 40 + i * 37, answerCount: answers.length, acceptedAnswerId: null, createdAt: new Date(now - (i + 1) * 31 * 3600000), updatedAt: new Date(now - (i + 1) * 31 * 3600000) };
    const { insertedId } = await db.collection("posts").insertOne(doc);
    posts.push({ ...doc, _id: insertedId });
    for (const [abody, who, ascore, accepted] of answers) {
      const a = await db.collection("answers").insertOne({ postId: String(insertedId), body: abody, authorId: ids[who], authorName: people[who][0], score: ascore, accepted, createdAt: new Date(now - (i + 1) * 28 * 3600000) });
      if (accepted) await db.collection("posts").updateOne({ _id: insertedId }, { $set: { acceptedAnswerId: String(a.insertedId) } });
    }
  }
  const PG = [
    ["Click counter", "A tiny counter with a button.", "<button id=\"btn\">Clicked 0 times</button>", "body { font-family: system-ui; display: grid; place-items: center; height: 100vh; margin: 0; background: #0f172a; }\nbutton { font-size: 1.3rem; padding: .8rem 1.4rem; border: 0; border-radius: 12px; background: #f59e0b; color: #1c1917; cursor: pointer; }", "let n = 0;\nconst btn = document.getElementById('btn');\nbtn.addEventListener('click', () => {\n  n += 1;\n  btn.textContent = `Clicked ${n} time${n === 1 ? '' : 's'}`;\n  console.log('count is', n);\n});", 42, 0],
    ["Flexbox playground", "Three boxes to experiment with flex properties.", "<div class=\"row\"><div>1</div><div>2</div><div>3</div></div>", ".row { display: flex; gap: 12px; justify-content: space-between; align-items: center; height: 200px; padding: 20px; background: #f1f5f9; }\n.row div { background: #6366f1; color: white; padding: 24px; border-radius: 10px; font: 700 1.4rem system-ui; }", "// try changing justify-content or align-items in the CSS panel\nconsole.log('boxes:', document.querySelectorAll('.row div').length);", 31, 1],
    ["CSS gradient card", "A glassy gradient card with hover lift.", "<div class=\"card\"><h2>Gradient card</h2><p>Hover me</p></div>", "body { margin: 0; height: 100vh; display: grid; place-items: center; background: linear-gradient(135deg, #ec4899, #8b5cf6, #06b6d4); font-family: system-ui; }\n.card { padding: 2rem 3rem; border-radius: 20px; background: rgba(255,255,255,.2); backdrop-filter: blur(10px); color: white; text-align: center; transition: transform .25s; }\n.card:hover { transform: translateY(-8px) scale(1.03); }", "", 55, 2],
    ["Todo list", "Add and complete tasks. No libraries.", "<h3>Todo</h3><form id=\"f\"><input id=\"t\" placeholder=\"New task\"><button>Add</button></form><ul id=\"list\"></ul>", "body { font-family: system-ui; max-width: 340px; margin: 2rem auto; }\nli { cursor: pointer; padding: .3rem 0; }\nli.done { text-decoration: line-through; color: #94a3b8; }", "const list = document.getElementById('list');\ndocument.getElementById('f').addEventListener('submit', (e) => {\n  e.preventDefault();\n  const input = document.getElementById('t');\n  if (!input.value.trim()) return;\n  const li = document.createElement('li');\n  li.textContent = input.value;\n  li.onclick = () => li.classList.toggle('done');\n  list.appendChild(li);\n  input.value = '';\n});", 27, 3],
    ["Canvas bouncing balls", "Animation with requestAnimationFrame.", "<canvas id=\"c\" width=\"420\" height=\"260\"></canvas>", "body { margin: 0; background: #020617; display: grid; place-items: center; height: 100vh; }", "const c = document.getElementById('c').getContext('2d');\nconst balls = Array.from({ length: 12 }, () => ({ x: Math.random() * 420, y: Math.random() * 260, vx: (Math.random() - .5) * 4, vy: (Math.random() - .5) * 4, r: 6 + Math.random() * 8, h: Math.random() * 360 }));\nfunction tick() {\n  c.fillStyle = 'rgba(2,6,23,.25)'; c.fillRect(0, 0, 420, 260);\n  for (const b of balls) {\n    b.x += b.vx; b.y += b.vy;\n    if (b.x < b.r || b.x > 420 - b.r) b.vx *= -1;\n    if (b.y < b.r || b.y > 260 - b.r) b.vy *= -1;\n    c.beginPath(); c.arc(b.x, b.y, b.r, 0, 7); c.fillStyle = `hsl(${b.h},80%,60%)`; c.fill();\n  }\n  requestAnimationFrame(tick);\n}\ntick();", 63, 4],
    ["JSON pretty printer", "Paste JSON and format it. Try invalid JSON too.", "<textarea id=\"i\" rows=\"5\" style=\"width:100%\">{\"name\":\"DevHub\",\"tags\":[\"js\",\"css\"]}</textarea><button id=\"b\">Format</button><pre id=\"o\"></pre>", "body { font-family: system-ui; padding: 1rem; } pre { background: #0f172a; color: #e2e8f0; padding: 1rem; border-radius: 8px; }", "document.getElementById('b').onclick = () => {\n  try {\n    const v = JSON.parse(document.getElementById('i').value);\n    document.getElementById('o').textContent = JSON.stringify(v, null, 2);\n  } catch (e) {\n    console.error('Invalid JSON:', e.message);\n    document.getElementById('o').textContent = 'Invalid JSON';\n  }\n};", 18, 0],
  ];
  await db.collection("playgrounds").insertMany(PG.map(([title, description, html, css, js, likes, who], i) => ({ ownerId: ids[who], ownerName: people[who][0], title, description, html, css, js, tags: [], isPublic: true, likes, forks: i, forkedFrom: null, createdAt: new Date(now - (i + 2) * 24 * 3600000), updatedAt: new Date(now - (i + 1) * 20 * 3600000) })));
}

/* ---------- posts ---------- */
const postView = (p) => ({ ...clean(p), acceptedAnswerId: p.acceptedAnswerId || null });

app.get("/posts", { auth: true }, async ({ db, query }) => {
  const filter = {};
  if (query.tag) filter.tags = String(query.tag).toLowerCase();
  if (query.type) filter.type = oneOf(query.type, ["question", "discussion"], "Type");
  if (query.sort === "unanswered") { filter.answerCount = 0; filter.type = "question"; }
  const q = String(query.q || "").trim();
  let list;
  if (q) {
    list = await db.collection("posts").find({ ...filter, $text: { $search: q } }, { projection: { relevance: { $meta: "textScore" } } }).sort({ relevance: { $meta: "textScore" } }).limit(50).toArray();
  } else {
    const sort = query.sort === "top" ? { score: -1, createdAt: -1 } : { createdAt: -1 };
    list = await db.collection("posts").find(filter).sort(sort).limit(50).toArray();
  }
  return list.map(postView);
});

app.post("/posts", { auth: true }, async ({ db, user, body }) => {
  const type = oneOf(body.type || "question", ["question", "discussion"], "Type");
  const tags = cleanTags(body.tags);
  if (!tags.length) throw bad("Add at least one tag (letters, numbers, + # . -).");
  const doc = {
    type, title: str(body.title, { min: 10, max: 150, label: "Title" }), body: str(body.body, { min: 20, max: 10000, label: "Details" }), tags, authorId: user.id, authorName: user.name,
    score: 0, views: 0, answerCount: 0, acceptedAnswerId: null, playgroundId: body.playgroundId ? String(body.playgroundId) : null, createdAt: new Date(), updatedAt: new Date(),
  };
  const { insertedId } = await db.collection("posts").insertOne(doc);
  return created(postView({ _id: insertedId, ...doc }));
});

async function votesFor(db, user, type, ids) {
  const list = await db.collection("votes").find({ userId: user.id, targetType: type, targetId: { $in: ids } }).toArray();
  return new Map(list.map((v) => [v.targetId, v.value]));
}

app.get("/posts/:id", { auth: true }, async ({ db, user, params }) => {
  const p = await db.collection("posts").findOneAndUpdate({ _id: oid(params.id) }, { $inc: { views: 1 } }, { returnDocument: "after" });
  if (!p) throw notFound("Post not found.");
  const answers = await db.collection("answers").find({ postId: String(p._id) }).toArray();
  answers.sort((a, b) => Number(b.accepted) - Number(a.accepted) || b.score - a.score || a.createdAt - b.createdAt);
  const comments = await db.collection("comments").find({ $or: [{ targetType: "post", targetId: String(p._id) }, { targetType: "answer", targetId: { $in: answers.map((a) => String(a._id)) } }] }).sort({ at: 1 }).toArray();
  const [pv, av] = await Promise.all([votesFor(db, user, "post", [String(p._id)]), votesFor(db, user, "answer", answers.map((a) => String(a._id)))]);
  return {
    ...postView(p), myVote: pv.get(String(p._id)) || 0,
    answers: answers.map((a) => ({ ...clean(a), myVote: av.get(String(a._id)) || 0, comments: comments.filter((c) => c.targetType === "answer" && c.targetId === String(a._id)).map(clean) })),
    comments: comments.filter((c) => c.targetType === "post").map(clean),
  };
});

app.patch("/posts/:id", { auth: true }, async ({ db, user, params, body }) => {
  const p = await db.collection("posts").findOne({ _id: oid(params.id) });
  if (!p) throw notFound("Post not found.");
  if (p.authorId !== user.id) throw forbidden("You can only edit your own posts.");
  const set = { updatedAt: new Date() };
  if (body.title !== undefined) set.title = str(body.title, { min: 10, max: 150, label: "Title" });
  if (body.body !== undefined) set.body = str(body.body, { min: 20, max: 10000, label: "Details" });
  if (body.tags !== undefined) { set.tags = cleanTags(body.tags); if (!set.tags.length) throw bad("Add at least one tag."); }
  await db.collection("posts").updateOne({ _id: p._id }, { $set: set });
  return postView({ ...p, ...set });
});

app.delete("/posts/:id", { auth: true }, async ({ db, user, params }) => {
  const p = await db.collection("posts").findOne({ _id: oid(params.id) });
  if (!p) throw notFound("Post not found.");
  if (p.authorId !== user.id) throw forbidden("You can only delete your own posts.");
  const answers = await db.collection("answers").find({ postId: String(p._id) }).project({ _id: 1 }).toArray();
  await db.collection("answers").deleteMany({ postId: String(p._id) });
  await db.collection("comments").deleteMany({ $or: [{ targetType: "post", targetId: String(p._id) }, { targetType: "answer", targetId: { $in: answers.map((a) => String(a._id)) } }] });
  await db.collection("posts").deleteOne({ _id: p._id });
  return { ok: true };
});

app.get("/tags", { auth: true }, async ({ db }) => (await db.collection("posts").aggregate([{ $unwind: "$tags" }, { $group: { _id: "$tags", count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }, { $limit: 30 }]).toArray()).map((t) => ({ tag: t._id, count: t.count })));

/* ---------- answers and comments ---------- */
app.post("/posts/:id/answers", { auth: true }, async ({ db, user, params, body }) => {
  const p = await db.collection("posts").findOne({ _id: oid(params.id) });
  if (!p) throw notFound("Post not found.");
  const doc = { postId: String(p._id), body: str(body.body, { min: 10, max: 10000, label: "Answer" }), authorId: user.id, authorName: user.name, score: 0, accepted: false, createdAt: new Date() };
  const { insertedId } = await db.collection("answers").insertOne(doc);
  await db.collection("posts").updateOne({ _id: p._id }, { $inc: { answerCount: 1 } });
  if (p.authorId !== user.id) await notify(db, p.authorId, "answer", `${user.name} answered "${p.title.slice(0, 60)}"`, `/post/${p._id}`);
  return created(clean({ _id: insertedId, ...doc }));
});

app.patch("/answers/:id", { auth: true }, async ({ db, user, params, body }) => {
  const a = await db.collection("answers").findOne({ _id: oid(params.id) });
  if (!a) throw notFound("Answer not found.");
  if (a.authorId !== user.id) throw forbidden("You can only edit your own answers.");
  const text = str(body.body, { min: 10, max: 10000, label: "Answer" });
  await db.collection("answers").updateOne({ _id: a._id }, { $set: { body: text, editedAt: new Date() } });
  return clean({ ...a, body: text });
});

app.delete("/answers/:id", { auth: true }, async ({ db, user, params }) => {
  const a = await db.collection("answers").findOne({ _id: oid(params.id) });
  if (!a) throw notFound("Answer not found.");
  if (a.authorId !== user.id) throw forbidden("You can only delete your own answers.");
  if (a.accepted) await addRep(db, a.authorId, -REP.accepted);
  await db.collection("answers").deleteOne({ _id: a._id });
  await db.collection("comments").deleteMany({ targetType: "answer", targetId: String(a._id) });
  await db.collection("posts").updateOne({ _id: asId(a.postId) }, { $inc: { answerCount: -1 }, ...(a.accepted ? { $set: { acceptedAnswerId: null } } : {}) });
  return { ok: true };
});

app.post("/answers/:id/accept", { auth: true }, async ({ db, user, params }) => {
  const a = await db.collection("answers").findOne({ _id: oid(params.id) });
  if (!a) throw notFound("Answer not found.");
  const p = await db.collection("posts").findOne({ _id: asId(a.postId) });
  if (p.authorId !== user.id) throw forbidden("Only the person who asked can accept an answer.");
  if (p.type !== "question") throw bad("Only questions have accepted answers.");
  if (a.accepted) return { ok: true };
  // claim the question atomically so two clicks cannot both hand out reputation
  const claimed = await db.collection("posts").findOneAndUpdate({ _id: p._id, acceptedAnswerId: p.acceptedAnswerId || null }, { $set: { acceptedAnswerId: String(a._id) } }, { returnDocument: "before" });
  if (!claimed) throw conflict("The accepted answer just changed. Refresh and try again.");
  if (p.acceptedAnswerId) {
    const prev = await db.collection("answers").findOne({ _id: asId(p.acceptedAnswerId) });
    if (prev) {
      await db.collection("answers").updateOne({ _id: prev._id }, { $set: { accepted: false } });
      if (prev.authorId !== p.authorId) await addRep(db, prev.authorId, -REP.accepted);
    }
  }
  await db.collection("answers").updateOne({ _id: a._id }, { $set: { accepted: true } });
  if (a.authorId !== user.id) {
    await addRep(db, a.authorId, REP.accepted);
    await notify(db, a.authorId, "accepted", `Your answer to "${p.title.slice(0, 60)}" was accepted (+${REP.accepted} reputation)`, `/post/${p._id}`);
  }
  return { ok: true };
});

app.post("/comments", { auth: true }, async ({ db, user, body }) => {
  const type = oneOf(body.targetType, ["post", "answer"], "Target");
  const target = await db.collection(type === "post" ? "posts" : "answers").findOne({ _id: oid(body.targetId) });
  if (!target) throw notFound("That post no longer exists.");
  const doc = { targetType: type, targetId: String(target._id), body: str(body.body, { min: 2, max: 500, label: "Comment" }), authorId: user.id, authorName: user.name, at: new Date() };
  const { insertedId } = await db.collection("comments").insertOne(doc);
  if (target.authorId !== user.id) await notify(db, target.authorId, "comment", `${user.name} commented: "${doc.body.slice(0, 60)}"`, `/post/${type === "post" ? target._id : target.postId}`);
  return created(clean({ _id: insertedId, ...doc }));
});

app.delete("/comments/:id", { auth: true }, async ({ db, user, params }) => {
  const r = await db.collection("comments").deleteOne({ _id: oid(params.id), authorId: user.id });
  if (!r.deletedCount) throw notFound("Comment not found.");
  return { ok: true };
});

/* ---------- votes ---------- */
app.post("/vote", { auth: true }, async ({ db, user, body }) => {
  const type = oneOf(body.targetType, ["post", "answer"], "Target");
  const value = oneOf(Number(body.value), [-1, 0, 1], "Vote");
  const col = db.collection(type === "post" ? "posts" : "answers");
  const target = await col.findOne({ _id: oid(body.targetId) });
  if (!target) throw notFound("That post no longer exists.");
  if (target.authorId === user.id) throw bad("You cannot vote on your own post.");
  const key = { userId: user.id, targetType: type, targetId: String(target._id) };
  let before;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      // the previous vote is read and replaced in one atomic step, so simultaneous requests never double count
      before = await db.collection("votes").findOneAndUpdate(key, { $set: { value, at: new Date() } }, { upsert: true, returnDocument: "before" });
      break;
    } catch (e) {
      if (e.code !== 11000 || attempt === 1) throw e;
    }
  }
  const prev = before ? before.value : 0;
  const delta = value - prev;
  if (delta) {
    await col.updateOne({ _id: target._id }, { $inc: { score: delta } });
    const kind = type === "answer" ? "answer" : "question";
    await addRep(db, target.authorId, repFor(kind, value) - repFor(kind, prev));
  }
  const fresh = await col.findOne({ _id: target._id });
  return { score: fresh.score, myVote: value };
});

/* ---------- people ---------- */
app.get("/users/:id", { auth: true }, async ({ db, params }) => {
  const u = await users(db).findOne({ _id: oid(params.id) });
  if (!u) throw notFound("User not found.");
  const id = String(u._id);
  const [posts, answers, accepted, tags] = await Promise.all([
    db.collection("posts").find({ authorId: id }).sort({ createdAt: -1 }).limit(10).toArray(), db.collection("answers").countDocuments({ authorId: id }), db.collection("answers").countDocuments({ authorId: id, accepted: true }),
    db.collection("posts").aggregate([{ $match: { authorId: id } }, { $unwind: "$tags" }, { $group: { _id: "$tags", count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 5 }]).toArray(),
  ]);
  const totalPosts = await db.collection("posts").countDocuments({ authorId: id });
  return { id, name: u.name, reputation: u.reputation || 1, tier: tier(u.reputation || 1), joined: u.createdAt, postCount: totalPosts, answerCount: answers, acceptedCount: accepted, topTags: tags.map((t) => ({ tag: t._id, count: t.count })), recent: posts.map(postView) };
});

app.get("/leaderboard", { auth: true }, async ({ db }) => (await users(db).find({}).sort({ reputation: -1 }).limit(10).toArray()).map((u) => ({ id: String(u._id), name: u.name, reputation: u.reputation || 1, tier: tier(u.reputation || 1) })));

app.get("/notifications", { auth: true }, async ({ db, user }) => {
  const list = await db.collection("notifications").find({ userId: user.id }).sort({ at: -1 }).limit(30).toArray();
  return { unread: list.filter((n) => !n.read).length, items: list.map(clean) };
});

app.post("/notifications/read", { auth: true }, async ({ db, user }) => {
  await db.collection("notifications").updateMany({ userId: user.id, read: false }, { $set: { read: true } });
  return { ok: true };
});

/* ---------- playgrounds ---------- */
function pgFields(b, existing = {}) {
  const file = (k) => (b[k] === undefined ? existing[k] || "" : String(b[k]).slice(0, MAX_FILE));
  for (const k of ["html", "css", "js"]) if (b[k] !== undefined && String(b[k]).length > MAX_FILE) throw bad(`The ${k.toUpperCase()} panel is limited to ${MAX_FILE.toLocaleString()} characters.`);
  return {
    title: b.title === undefined ? existing.title || "Untitled playground" : str(b.title, { min: 1, max: 80, label: "Title" }), description: b.description === undefined ? existing.description || "" : str(b.description, { max: 200 }),
    html: file("html"), css: file("css"), js: file("js"), tags: b.tags === undefined ? existing.tags || [] : cleanTags(b.tags), isPublic: b.isPublic === undefined ? existing.isPublic !== false : Boolean(b.isPublic),
  };
}
const pgView = (p, uid) => ({ ...clean(p), mine: p.ownerId === uid });

app.get("/playgrounds", { auth: true }, async ({ db, user, query }) => {
  const filter = { isPublic: true };
  const q = String(query.q || "").trim();
  if (q) filter.$or = ["title", "description"].map((f) => ({ [f]: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } }));
  const sort = query.sort === "popular" ? { likes: -1, updatedAt: -1 } : { updatedAt: -1 };
  return (await db.collection("playgrounds").find(filter).sort(sort).limit(40).toArray()).map((p) => ({ ...pgView(p, user.id), html: undefined, css: undefined, js: undefined }));
});

app.get("/playgrounds/mine", { auth: true }, async ({ db, user }) => (await db.collection("playgrounds").find({ ownerId: user.id }).sort({ updatedAt: -1 }).toArray()).map((p) => ({ ...pgView(p, user.id), html: undefined, css: undefined, js: undefined })));

app.post("/playgrounds", { auth: true }, async ({ db, user, body }) => {
  if ((await db.collection("playgrounds").countDocuments({ ownerId: user.id })) >= 50) throw bad("You can keep up to 50 playgrounds. Delete some to make room.");
  const doc = { ownerId: user.id, ownerName: user.name, ...pgFields(body), likes: 0, forks: 0, forkedFrom: null, createdAt: new Date(), updatedAt: new Date() };
  const { insertedId } = await db.collection("playgrounds").insertOne(doc);
  return created(pgView({ _id: insertedId, ...doc }, user.id));
});

async function loadPg(db, id, user, { own = false } = {}) {
  const p = await db.collection("playgrounds").findOne({ _id: oid(id) });
  if (!p || (!p.isPublic && p.ownerId !== user.id)) throw notFound("Playground not found.");
  if (own && p.ownerId !== user.id) throw forbidden("Only the owner can change this playground.");
  return p;
}

app.get("/playgrounds/:id", { auth: true }, async ({ db, user, params }) => {
  const p = await loadPg(db, params.id, user);
  const liked = await db.collection("votes").findOne({ userId: user.id, targetType: "playground", targetId: String(p._id) });
  return { ...pgView(p, user.id), liked: Boolean(liked && liked.value === 1) };
});

app.put("/playgrounds/:id", { auth: true }, async ({ db, user, params, body }) => {
  const p = await loadPg(db, params.id, user, { own: true });
  const set = { ...pgFields(body, p), updatedAt: new Date() };
  await db.collection("playgrounds").updateOne({ _id: p._id }, { $set: set });
  return pgView({ ...p, ...set }, user.id);
});

app.delete("/playgrounds/:id", { auth: true }, async ({ db, user, params }) => {
  const p = await loadPg(db, params.id, user, { own: true });
  await db.collection("playgrounds").deleteOne({ _id: p._id });
  await db.collection("votes").deleteMany({ targetType: "playground", targetId: String(p._id) });
  return { ok: true };
});

app.post("/playgrounds/:id/fork", { auth: true }, async ({ db, user, params }) => {
  const p = await loadPg(db, params.id, user);
  if ((await db.collection("playgrounds").countDocuments({ ownerId: user.id })) >= 50) throw bad("You can keep up to 50 playgrounds.");
  const copy = { ownerId: user.id, ownerName: user.name, title: `${p.title} (fork)`.slice(0, 80), description: p.description, html: p.html, css: p.css, js: p.js, tags: p.tags, isPublic: false, likes: 0, forks: 0, forkedFrom: String(p._id), forkedFromTitle: p.title, createdAt: new Date(), updatedAt: new Date() };
  const { insertedId } = await db.collection("playgrounds").insertOne(copy);
  await db.collection("playgrounds").updateOne({ _id: p._id }, { $inc: { forks: 1 } });
  return created(pgView({ _id: insertedId, ...copy }, user.id));
});

app.post("/playgrounds/:id/like", { auth: true }, async ({ db, user, params }) => {
  const p = await loadPg(db, params.id, user);
  if (p.ownerId === user.id) throw bad("You cannot like your own playground.");
  const key = { userId: user.id, targetType: "playground", targetId: String(p._id) };
  const existing = await db.collection("votes").findOne(key);
  if (existing && existing.value === 1) {
    await db.collection("votes").deleteOne(key);
    await db.collection("playgrounds").updateOne({ _id: p._id }, { $inc: { likes: -1 } });
    return { liked: false };
  }
  try {
    await db.collection("votes").insertOne({ ...key, value: 1, at: new Date() });
  } catch (e) {
    if (e.code === 11000) return { liked: true };
    throw e;
  }
  await db.collection("playgrounds").updateOne({ _id: p._id }, { $inc: { likes: 1 } });
  return { liked: true };
});

module.exports = app;
