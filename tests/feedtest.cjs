// Runs the SHIPPED feed/handle functions against a fake Firestore that
// enforces read-before-write and supports orderBy/limit/startAfter.
const fs = require("fs");
const R = require("path").join(__dirname, "..") + "/";
const F = fs.readFileSync(R + "lib/feed.js", "utf8").replace(/\r\n/g, "\n");
const H = fs.readFileSync(R + "lib/handles.js", "utf8").replace(/\r\n/g, "\n");
let bad = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) bad++; };

function grab(src, sig) {
  const i = src.indexOf(sig);
  let j = src.indexOf("(", i), p = 0;
  for (; j < src.length; j++) { if (src[j] === "(") p++; else if (src[j] === ")") { p--; if (!p) break; } }
  let d = 0, st = false;
  for (; j < src.length; j++) { if (src[j] === "{") { d++; st = true; } else if (src[j] === "}") { d--; if (st && !d) return src.slice(i, j + 1); } }
}
const fn = (src, sig) => grab(src, sig).replace(/^export\s+/, "");

function fakeDb(seed = {}) {
  const store = new Map(Object.entries(seed));
  const ref = (c, d) => ({ _p: c + "/" + d, _c: c, _id: d });
  const rows = (c) => [...store.entries()]
    .filter(([k]) => k.startsWith(c + "/"))
    .map(([k, v]) => ({ id: k.slice(c.length + 1), data: () => ({ ...v }), exists: true, _v: v }));

  function query(c, st = {}) {
    return {
      orderBy: (f, dir) => query(c, { ...st, by: f, dir }),
      limit: (n) => query(c, { ...st, lim: n }),
      startAfter: (v) => query(c, { ...st, after: v }),
      where: (f, _op, v) => query(c, { ...st, where: [f, v] }),
      get: async () => {
        let list = rows(c);
        if (st.where) list = list.filter((r) => r._v[st.where[0]] === st.where[1]);
        if (st.by) list.sort((a, b) => (st.dir === "desc" ? b._v[st.by] - a._v[st.by] : a._v[st.by] - b._v[st.by]));
        if (st.after !== undefined) list = list.filter((r) => (st.dir === "desc" ? r._v[st.by] < st.after : r._v[st.by] > st.after));
        if (st.lim) list = list.slice(0, st.lim);
        return { docs: list, empty: list.length === 0 };
      },
    };
  }

  const db = {
    _store: store,
    collection: (c) => ({
      ...query(c),
      doc: (d) => {
        const r = ref(c, d || "auto" + Math.random().toString(36).slice(2, 8));
        // Direct (non-transactional) writes, which setHidden uses.
        r.update = async (patch) => store.set(r._p, { ...(store.get(r._p) || {}), ...patch });
        r.set = async (patch, o) => store.set(r._p, o?.merge ? { ...(store.get(r._p) || {}), ...patch } : { ...patch });
        r.get = async () => ({ exists: store.has(r._p), id: r._id, data: () => ({ ...store.get(r._p) }) });
        return r;
      },
    }),
    getAll: async (...refs) => refs.map((r) => ({
      id: r._id, exists: store.has(r._p), data: () => ({ ...store.get(r._p) }),
    })),
    runTransaction: async (f) => {
      const w = []; let wrote = false;
      const tx = {
        get: async (r) => {
          if (wrote) throw new Error("READ AFTER WRITE");
          return { exists: store.has(r._p), data: () => ({ ...store.get(r._p) }) };
        },
        set: (r, p, o) => { wrote = true; w.push([r._p, p, o?.merge ? "merge" : "set"]); },
        update: (r, p) => { wrote = true; w.push([r._p, p, "merge"]); },
        delete: (r) => { wrote = true; w.push([r._p, null, "del"]); },
      };
      const out = await f(tx);
      for (const [p, patch, mode] of w) {
        if (mode === "del") store.delete(p);
        else store.set(p, mode === "set" ? { ...patch } : { ...(store.get(p) || {}), ...patch });
      }
      return out;
    },
  };
  return db;
}

const mkHandles = (db) => new Function("getAdminDb",
  fn(H, "export function handleShape") + "\n" +
  "const SHAPE = /^[a-z0-9_]{3,20}$/;\n" +
  "const RESERVED = new Set(" + JSON.stringify([...
    (H.match(/const RESERVED = new Set\(\[([\s\S]*?)\]\)/)[1].match(/"([a-z0-9]+)"/g) || []).map(s => s.replace(/"/g, ""))
  ]) + ");\n" +
  fn(H, "export async function claimHandle") + "\n" +
  fn(H, "export async function handlesFor") + "\n" +
  "return { handleShape, claimHandle, handlesFor };"
)(() => db);

(async () => {
  console.log("\n1. HANDLE SHAPE");
  const { handleShape } = mkHandles(fakeDb());
  ok(handleShape("Bannr_1").handle === "bannr_1", "lowercased, so case-confusable names cannot coexist");
  ok(handleShape("@dave").handle === "dave", "a leading @ is stripped");
  ok(handleShape("ab").ok === false, "too short refused");
  ok(handleShape("a".repeat(21)).ok === false, "too long refused");
  ok(handleShape("bad name").ok === false, "spaces refused");
  ok(handleShape("bad-name").ok === false, "hyphens refused");
  ok(handleShape("12345").ok === false, "digits-only refused (reads as an ID)");
  ok(handleShape("bannr").ok === false, "our own name is reserved");
  ok(handleShape("dexscreener").ok === false, "so is the platform we publish to");
  ok(handleShape("admin").ok === false && handleShape("feed").ok === false, "authority and route names reserved");

  console.log("\n2. CLAIMING");
  {
    const db = fakeDb({ "users/a": { credits: 1 }, "users/b": { credits: 1 } });
    const { claimHandle } = mkHandles(db);
    ok((await claimHandle("a", "dave")).ok === true, "first claim succeeds");
    ok(db._store.get("handles/dave").accountId === "a", "handle points at the account");
    ok(db._store.get("users/a").handle === "dave", "and the account knows its handle");
    const steal = await claimHandle("b", "dave");
    ok(steal.ok === false, "a second account CANNOT take it");
    ok(!/a\b/.test(steal.error || ""), "and is not told who holds it");
    ok((await claimHandle("a", "dave")).ok === true, "re-claiming your own is a no-op, not an error");
    await claimHandle("a", "davey");
    ok(!db._store.has("handles/dave"), "changing releases the old name rather than squatting it");
    ok((await claimHandle("b", "dave")).ok === true, "which someone else can then take");
  }

  console.log("\n3. THE FEED READS");
  const mkFeed = (db) => new Function("getAdminDb", "handlesFor",
    "const PAGE = 4;\n" +
    fn(F, "export async function listPosts") + "\n" +
    fn(F, "async function likedByViewer") + "\n" +
    "return { listPosts };"
  )(() => db, async () => ({}));
  {
    const seed = {};
    for (let i = 1; i <= 10; i++) seed["posts/p" + i] = { accountId: "a", ts: i * 1000, hidden: false, likes: 0, src: "x" };
    const { listPosts } = mkFeed(fakeDb(seed));
    const page = await listPosts({});
    ok(page.posts.length === 4, "one page is PAGE long (got " + page.posts.length + ")");
    ok(page.posts[0].ts === 10000, "newest first");
    const next = await listPosts({ before: page.cursor });
    ok(next.posts[0].ts < page.posts[3].ts, "the next page continues where the last ended");
    ok(!next.posts.some((p) => page.posts.some((q) => q.id === p.id)), "no post appears on two pages");
  }
  {
    // The bug this design avoids: taking the cursor from the last
    // VISIBLE post re-reads every hidden row after it, forever.
    const seed = { "posts/keep": { accountId: "a", ts: 9999, hidden: false, likes: 0, src: "x" } };
    for (let i = 1; i <= 7; i++) seed["posts/h" + i] = { accountId: "a", ts: 1000 + i, hidden: true, likes: 0, src: "x" };
    const { listPosts } = mkFeed(fakeDb(seed));
    const page = await listPosts({});
    ok(page.posts.length === 1, "hidden posts are not shown");
    ok(page.cursor < 1008 && page.cursor > 0, "the cursor comes from the RAW read, past the hidden rows (got " + page.cursor + ")");
    const next = await listPosts({ before: page.cursor });
    ok(next.posts.length === 0, "so paging on does not loop over them again");
  }

  console.log("\n4. LIKES");
  {
    const db = fakeDb({ "posts/p1": { likes: 3, accountId: "z" } });
    const toggleLike = new Function("getAdminDb", fn(F, "export async function toggleLike") + "\nreturn toggleLike;")(() => db);
    let r = await toggleLike("me", "p1");
    ok(r.liked === true && r.likes === 4, "liking increments");
    ok(db._store.has("likes/p1_me"), "and records who");
    r = await toggleLike("me", "p1");
    ok(r.liked === false && r.likes === 3, "liking again unlikes");
    ok(!db._store.has("likes/p1_me"), "and removes the row");
    await toggleLike("me", "p1"); await toggleLike("me", "p1"); await toggleLike("me", "p1");
    ok(db._store.get("posts/p1").likes === 4, "count and row never disagree after repeated taps");
    ok((await toggleLike("me", "gone")).ok === false, "a missing post fails cleanly");
  }

  console.log("\n5. REPORTS");
  {
    const db = fakeDb({ "posts/p1": { reports: 0, hidden: false } });
    const reportPost = new Function("getAdminDb", "AUTOHIDE_REPORTS", "str",
      fn(F, "export async function reportPost") + "\nreturn reportPost;")(
      () => db, 5, (v, n) => String(v ?? "").trim().slice(0, n));
    await reportPost("u1", "p1", "spam");
    ok(db._store.get("posts/p1").reports === 1, "counted");
    const again = await reportPost("u1", "p1");
    ok(again.already === true && db._store.get("posts/p1").reports === 1, "reporting twice is not two reports");
    for (const u of ["u2", "u3", "u4"]) await reportPost(u, "p1");
    ok(db._store.get("posts/p1").hidden === false, "four reports is not enough to hide");
    await reportPost("u5", "p1");
    ok(db._store.get("posts/p1").hidden === true, "the fifth auto-hides");
    ok(db._store.get("posts/p1").autoHidden === true, "and marks it as automatic, not a human decision");
  }
  {
    const db = fakeDb({ "posts/p1": { reports: 6, hidden: true, autoHidden: true } });
    const setHidden = new Function("getAdminDb", fn(F, "export async function setHidden") + "\nreturn setHidden;")(() => db);
    await setHidden("p1", false);
    const p = db._store.get("posts/p1");
    ok(p.hidden === false && p.reports === 0 && p.autoHidden === false,
       "restoring clears the reports, so the same group cannot instantly re-hide it");
  }

  console.log("\n6. PUBLISHING IS NEVER IMPLICIT");
  const routes = fs.readFileSync(R + "app/api/feed/route.js", "utf8");
  ok(/export async function POST[\s\S]{0,200}requireUser/.test(routes), "posting requires a session");
  ok(F.includes('return { ok: false, error: "Pick a handle first.", code: "no_handle" }'), "and a handle");
  ok(F.includes("POSTS_PER_DAY"), "and is capped per day");
  ok(F.includes('where("sig", "==", sig)'), "and deduped");
  const gen = fs.readFileSync(R + "app/api/generate/route.js", "utf8");
  const dl = fs.readFileSync(R + "app/create/page.jsx", "utf8");
  ok(!gen.includes("collection(\"posts\")"), "generating never writes to the feed");
  ok(!/download[\s\S]{0,900}\/api\/feed/.test(dl), "downloading never posts to the feed");

  console.log(bad ? "\n" + bad + " FAILED\n" : "\nall green\n");
  process.exit(bad ? 1 : 0);
})();
