// A small, safe Markdown subset. It only produces plain data (no HTML strings), and React escapes everything when rendering,
// so post text can never inject markup or script. Supports paragraphs, fenced code blocks, inline code, bold, italics,
// headings (#, ##, ###), bullet lists and http(s) links.

function inline(text) {
  const out = [];
  let rest = String(text);
  const rules = [
    { re: /`([^`\n]+)`/, make: (m) => ({ t: "code", v: m[1] }) },
    { re: /\*\*([^*\n]+)\*\*/, make: (m) => ({ t: "strong", v: m[1] }) },
    { re: /(^|[^*])\*([^*\n]+)\*(?!\*)/, make: (m) => ({ t: "em", v: m[2] }), prefix: (m) => m[1] },
    { re: /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/, make: (m) => ({ t: "link", v: m[1], href: m[2] }) },
    { re: /(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/, make: (m) => ({ t: "link", v: m[1], href: m[1] }) },
  ];
  while (rest) {
    let best = null;
    for (const rule of rules) {
      const m = rule.re.exec(rest);
      if (m && (best === null || m.index < best.m.index)) best = { rule, m };
    }
    if (!best) { out.push({ t: "text", v: rest }); break; }
    const { rule, m } = best;
    const lead = rule.prefix ? rule.prefix(m) : "";
    if (m.index + lead.length > 0) out.push({ t: "text", v: rest.slice(0, m.index) + lead });
    out.push(rule.make(m));
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

function parseMarkdown(text) {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let para = [];
  let list = null;
  const flush = () => {
    if (para.length) blocks.push({ type: "p", inline: inline(para.join(" ")) });
    para = [];
    if (list) blocks.push({ type: "ul", items: list.map(inline) });
    list = null;
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const fence = line.match(/^```\s*([\w+#.-]*)\s*$/);
    if (fence) {
      flush();
      const code = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) { code.push(lines[i]); i += 1; }
      blocks.push({ type: "code", lang: fence[1] || "", text: code.join("\n") });
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) { flush(); blocks.push({ type: "h", level: heading[1].length, inline: inline(heading[2]) }); continue; }
    const item = line.match(/^\s*[-*]\s+(.+)$/);
    if (item) {
      if (para.length) { blocks.push({ type: "p", inline: inline(para.join(" ")) }); para = []; }
      list = [...(list || []), item[1]];
      continue;
    }
    if (!line.trim()) { flush(); continue; }
    if (list) { blocks.push({ type: "ul", items: list.map(inline) }); list = null; }
    para.push(line.trim());
  }
  flush();
  return blocks;
}

export { parseMarkdown, inline };
