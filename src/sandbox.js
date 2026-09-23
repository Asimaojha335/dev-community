// Builds the document that runs inside the playground's sandboxed iframe.
// The iframe uses sandbox="allow-scripts" WITHOUT allow-same-origin, so it gets an opaque origin: it cannot read this site's cookies,
// storage or DOM. The Content-Security-Policy below additionally blocks every network request (fetch, XHR, WebSocket, images
// from the internet, frames), so playground code cannot send anything anywhere.

export const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:";

// Console output and errors are forwarded to the parent page with postMessage.
const BRIDGE = `(function () {
  function fmt(v) {
    if (typeof v === 'string') return v;
    if (v instanceof Error) return v.name + ': ' + v.message;
    try { return JSON.stringify(v, function (k, x) { return typeof x === 'function' ? '[Function]' : x; }, 2); } catch (e) { return String(v); }
  }
  function send(level, args) { try { parent.postMessage({ __devhub: true, level: level, text: Array.prototype.map.call(args, fmt).join(' ') }, '*'); } catch (e) {} }
  ['log', 'info', 'warn', 'error', 'debug'].forEach(function (level) {
    var original = console[level];
    console[level] = function () { send(level, arguments); if (original) original.apply(console, arguments); };
  });
  window.addEventListener('error', function (e) { send('error', [e.message + (e.lineno ? ' (line ' + e.lineno + ')' : '')]); });
  window.addEventListener('unhandledrejection', function (e) { send('error', ['Unhandled promise rejection: ' + fmt(e.reason)]); });
})();`;

const safeScript = (code) => String(code || "").replace(/<\/(script)/gi, "<\\/$1");
const safeStyle = (code) => String(code || "").replace(/<\//g, "<\\/");

export function buildSrcDoc({ html = "", css = "", js = "" }) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${safeStyle(css)}</style></head><body>${html}<script>${BRIDGE}</script><script>${safeScript(js)}</script></body></html>`;
}

export const TEMPLATES = {
  blank: { title: "Untitled playground", html: "", css: "", js: "" },
  hello: { title: "Hello, playground", html: "<h1>Hello!</h1>\n<p id=\"out\">Edit the HTML, CSS and JS, and see it run live.</p>", css: "body { font-family: system-ui; padding: 2rem; }\nh1 { color: #d97706; }", js: "console.log('It works');\ndocument.getElementById('out').textContent += ' ✨';" },
  counter: { title: "Counter", html: "<button id=\"b\">0</button>", css: "button { font-size: 2rem; padding: 1rem 2rem; }", js: "let n = 0;\nb.onclick = () => { b.textContent = ++n; console.log(n); };" },
};
