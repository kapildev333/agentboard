// The web tile's capture proxy (P3-D2): GET or HEAD /preview/<key>/<encodeURIComponent(target url)>.
// - Mounted behind the server's own checks (Host, Origin, token or session), then <key> = previewKey(launch
//   secret) must match; the key is not the secret and opens nothing but this proxy.
// - The target is http on localhost, 127.0.0.1 or ::1 only. A redirect is never followed: back to loopback
//   it is rewritten through the proxy, anywhere else it is 403.
// - The target sees Accept, Accept-Language and User-Agent only: never Cookie or Authorization.
// - HTML gets <base href="<target origin>/"> and one script after <head> that posts console, error and
//   fetch/XHR summaries to the board; every other body streams through byte for byte.
// - Every response carries a CSP (connect-src the target only, framed only by the board, sandboxed so the
//   page never runs as the board's origin), no-store and nosniff; the target's Set-Cookie is dropped.
import { createHash, timingSafeEqual } from "node:crypto";
import http from "node:http";

export const previewKey = (secret: string) => createHash("sha256").update(secret).digest("hex").slice(0, 32);

const FORWARD = ["accept", "accept-language", "user-agent"];
const LOOPBACK = ["localhost", "127.0.0.1", "[::1]"];

const decode = (s: string) => { try { return decodeURIComponent(s); } catch { return ""; } };

// Plain http on a loopback host, with no credentials to turn into an Authorization header.
function loopback(raw: string, base?: URL): URL | null {
  try {
    const u = new URL(raw, base);
    return u.protocol === "http:" && LOOPBACK.includes(u.hostname) && !u.username && !u.password ? u : null;
  } catch { return null; }
}

export function previewHandler(key: string) {
  return (req: http.IncomingMessage, res: http.ServerResponse): void => {
    if (req.method !== "GET" && req.method !== "HEAD") return void res.writeHead(405, { allow: "GET, HEAD" }).end();
    const m = /^\/preview\/([^/]*)\/(.*)$/s.exec(req.url ?? "");
    const given = Buffer.from(m?.[1] ?? ""), want = Buffer.from(key);
    if (given.length !== want.length || !timingSafeEqual(given, want)) return void res.writeHead(404).end();
    const target = loopback(decode(m?.[2] ?? ""));
    if (!target) return void res.writeHead(403).end();
    const board = `http://${req.headers.host}`;
    const headers = Object.fromEntries(FORWARD.filter((h) => req.headers[h] !== undefined).map((h) => [h, req.headers[h]!]));
    const out = http.request({ host: target.hostname.replace(/^\[|\]$/g, ""), port: target.port || 80, path: target.pathname + target.search, method: req.method, headers }, (up) => {
      const location = up.headers.location;
      if (location) {
        const next = loopback(location, target);
        if (!next) return void (up.resume(), res.writeHead(403).end());
        res.setHeader("location", `/preview/${key}/${encodeURIComponent(next.href)}`);
      }
      const type = up.headers["content-type"];
      const html = req.method === "GET" && /^text\/html\b/i.test(type ?? "") && !up.headers["content-encoding"];
      // Two policies are both enforced, so the target's own can only tighten ours. The sandbox (as the web
      // tile's iframe has it) keeps the page off the board's origin even when it is opened on its own.
      const own = `connect-src ${target.origin} ws://${target.host}; frame-ancestors ${board}; sandbox allow-scripts allow-forms`;
      const theirs = up.headers["content-security-policy"];
      res.setHeader("content-security-policy", theirs ? [own, theirs] : own);
      res.setHeader("cache-control", "no-store");
      res.setHeader("x-content-type-options", "nosniff");
      if (type) res.setHeader("content-type", type);
      if (!html) {
        for (const h of ["content-length", "content-encoding"]) if (up.headers[h]) res.setHeader(h, up.headers[h]);
        res.writeHead(up.statusCode ?? 502);
        return void up.pipe(res);
      }
      // ponytail: html is buffered to inject; stream it if dev pages ever get large
      const chunks: Buffer[] = [];
      up.on("data", (c: Buffer) => chunks.push(c));
      up.on("end", () => res.writeHead(up.statusCode ?? 502).end(inject(Buffer.concat(chunks).toString("utf8"), target.origin, board)));
      up.on("error", () => res.destroy());
    });
    out.on("error", () => { if (!res.headersSent) res.writeHead(502).end(); else res.destroy(); });
    out.end();
  };
}

function inject(html: string, origin: string, board: string): string {
  const tags = `<base href="${origin}/"><script>${CAPTURE.replace("BOARD", JSON.stringify(board).replace(/</g, "\\u003c"))}</script>`;
  const head = /<head\b[^>]*>/i.exec(html);
  return head ? html.slice(0, head.index + head[0].length) + tags + html.slice(head.index + head[0].length) : tags + html;
}

// Runs first in the page; no "<" anywhere so it cannot close its own tag.
const CAPTURE = `(()=>{const o=BOARD,P=(m)=>{try{parent.postMessage(m,o)}catch(e){}},
S=(v)=>{try{return typeof v=="string"?v:v instanceof Error?v.stack||String(v):JSON.stringify(v)}catch(e){return String(v)}},
N=(method,url,status,t)=>P({agentboard:"network",method:String(method).toUpperCase(),url:String(url),status:status,ms:Math.round(performance.now()-t)});
for(const l of ["log","info","warn","error","debug"]){const f=console[l];console[l]=function(...a){P({agentboard:"console",level:l,text:a.map(S).join(" ")});return f.apply(this,a)}}
addEventListener("error",(e)=>P({agentboard:"console",level:"error",text:e.error?S(e.error):String(e.message)}));
addEventListener("unhandledrejection",(e)=>P({agentboard:"console",level:"error",text:"Unhandled rejection: "+S(e.reason)}));
const F=window.fetch;if(F)window.fetch=function(i,n){const t=performance.now(),m=(n&&n.method)||(i&&i.method)||"GET",u=(i&&i.url)||i;
return F.apply(this,arguments).then((r)=>{N(m,u,r.status,t);return r},(e)=>{N(m,u,0,t);throw e})};
const X=XMLHttpRequest.prototype,O=X.open,D=X.send;X.open=function(m,u){this.__ab=[m,u];return O.apply(this,arguments)};
X.send=function(){const a=this.__ab,t=performance.now();if(a)this.addEventListener("loadend",()=>N(a[0],a[1],this.status,t));return D.apply(this,arguments)};})();`;
