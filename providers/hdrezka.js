var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// src/hdrezka/index.js
var hdrezka_exports = {};
__export(hdrezka_exports, {
  getStreams: () => getStreams2
});
module.exports = __toCommonJS(hdrezka_exports);

// src/hdrezka/http.js
var BASE_URL = "https://hdrezka.website";
var HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  "Connection": "keep-alive",
  "sec-ch-ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"'
};

var cookieJar = /* @__PURE__ */ new Map();

function jarGet(host) {
  return cookieJar.get(host) || {};
}

function jarSet(host, cookies) {
  if (!cookies || cookies.length === 0) return;
  const existing = jarGet(host);

  for (const pair of cookies) {
    const eq = pair.indexOf("=");
    if (eq < 0) continue;

    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();

    if (value === "") {
      delete existing[name];
    } else {
      existing[name] = value;
    }
  }

  cookieJar.set(host, existing);
}

function jarCookieHeader(host) {
  const cookies = jarGet(host);
  const pairs = Object.entries(cookies).map(([k, v]) => `${k}=${v}`);
  return pairs.length > 0 ? pairs.join("; ") : void 0;
}

function hostFromUrl(url) {
  if (typeof URL !== "undefined") {
    try {
      return new URL(url).host;
    } catch (e) {
      return "";
    }
  }

  const m = String(url).match(/^https?:\/\/([^/:]+)/);
  return m ? m[1] : "";
}

function randomHex(length) {
  let s = "";

  for (let i = 0; i < length; i++) {
    s += Math.floor(Math.random() * 16).toString(16);
  }

  return s;
}

function generateFavs() {
  return [
    randomHex(8),
    randomHex(4),
    randomHex(4),
    randomHex(4),
    randomHex(12)
  ].join("-");
}

function readSetCookies(response) {
  var _a, _b;
  const out = [];
  const list = ((_b = (_a = response.headers).getSetCookie) == null ? void 0 : _b.call(_a)) || [];

  for (const c of list) {
    out.push(c.split(";")[0]);
  }

  if (out.length === 0) {
    const header = response.headers.get("set-cookie");

    if (header) {
      for (const c of header.split(/,(?=[^;]+=[^;]+)/)) {
        out.push(c.split(";")[0]);
      }
    }
  }

  return out;
}

function fetchWithTimeout(url, init, timeoutMs) {
  return __async(this, null, function* () {
    if (
      typeof setTimeout === "undefined" ||
      typeof clearTimeout === "undefined" ||
      typeof AbortController === "undefined"
    ) {
      return yield fetch(url, init);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return yield fetch(
        url,
        __spreadProps(__spreadValues({}, init), { signal: controller.signal })
      );
    } finally {
      clearTimeout(timer);
    }
  });
}

function fetchText(_0) {
  return __async(this, arguments, function* (url, options = {}) {
    const host = hostFromUrl(url);
    const cookieHeader = jarCookieHeader(host);

    const headers = __spreadValues(
      __spreadValues(
        __spreadValues({}, HEADERS),
        cookieHeader ? { Cookie: cookieHeader } : {}
      ),
      options.headers || {}
    );

    const response = yield fetchWithTimeout(
      url,
      __spreadValues({
        headers,
        redirect: options.followRedirects === false ? "manual" : "follow"
      }, options),
      options.timeoutMs || 12e3
    );

    if (host) {
      jarSet(host, readSetCookies(response));
    }

    if (options.expectRedirect && response.status >= 300 && response.status < 400) {
      return response;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
    }

    return yield response.text();
  });
}

function fetchJson(_0) {
  return __async(this, arguments, function* (url, options = {}) {
    const text = yield fetchText(url, options);
    return JSON.parse(text);
  });
}

function postForm(_0, _1) {
  return __async(this, arguments, function* (path, fields, options = {}) {
    const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;

    const body = Object.entries(fields)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");

    const host = hostFromUrl(url);
    const cookieHeader = jarCookieHeader(host);

    const response = yield fetchWithTimeout(
      url,
      __spreadValues({
        method: "POST",
        headers: __spreadValues(
          __spreadValues(
            __spreadProps(__spreadValues({}, HEADERS), {
              "Content-Type": "application/x-www-form-urlencoded",
              "X-Requested-With": "XMLHttpRequest"
            }),
            cookieHeader ? { Cookie: cookieHeader } : {}
          ),
          options.headers || {}
        ),
        body,
        redirect: "follow"
      }, options),
      options.timeoutMs || 15e3
    );

    if (host) {
      jarSet(host, readSetCookies(response));
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText} for POST ${url}`);
    }

    return yield response.json();
  });
}

// src/hdrezka/search.js
function searchHdrezka(title, originalTitle, year, mediaType) {
  return __async(this, null, function* () {
    const seenUrls = /* @__PURE__ */ new Set();
    const all = [];

    const baseQueries = [
      ...new Set([originalTitle, title].filter(Boolean))
    ];

    const queries = [];

    for (const q of baseQueries) {
      queries.push(q);
      if (year) queries.push(`${q} ${year}`);
    }

    for (const query of queries) {
      const url = `${BASE_URL}/engine/ajax/search.php?q=${encodeURIComponent(query)}`;
      let html;

      try {
        html = yield fetchText(url, {
          headers: {
            "X-Requested-With": "XMLHttpRequest",
            "Referer": `${BASE_URL}/`
          }
        });
      } catch (e) {
        console.error(`[HDRezka] search failed for "${query}": ${e.message}`);
        continue;
      }

      for (const c of parseSearchHtml(html)) {
        if (!seenUrls.has(c.url)) {
          seenUrls.add(c.url);
          all.push(c);
        }
      }
    }

    return rankCandidates(all, { title, originalTitle, year, mediaType });
  });
}

function parseSearchHtml(html) {
  const candidates = [];
  const re = /<a href="([^"]+)"><span class="enty">([^<]+)<\/span>[^<]*?\(([^)]+)\)/g;
  let m;

  while ((m = re.exec(html)) !== null) {
    const itemUrl = m[1];
    const itemTitle = m[2].trim();
    const itemYearRaw = m[3].trim();

    const yearMatch = itemYearRaw.match(/(\d{4})/);
    const itemYear = yearMatch ? parseInt(yearMatch[1], 10) : null;

    const itemType =
      itemUrl.includes("/series/") || itemUrl.includes("/animation/")
        ? "tv"
        : itemUrl.includes("/films/")
          ? "movie"
          : null;

    const idMatch = itemUrl.match(/\/(\d+)-[^/]+\.html$/);

    candidates.push({
      id: idMatch ? idMatch[1] : null,
      url: itemUrl,
      title: itemTitle,
      year: itemYear,
      type: itemType
    });
  }

  return candidates;
}

function rankCandidates(candidates, { title, originalTitle, year, mediaType }) {
  if (candidates.length === 0) return [];

  const norm = (s) =>
    (s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

  const targetType =
    mediaType === "tv" || mediaType === "anime" ? "tv" : "movie";

  const normalizedTargets = [title, originalTitle]
    .filter(Boolean)
    .map(norm)
    .filter(Boolean);

  const scored = candidates.map((c) => {
    let score = 0;

    if (c.type === targetType) score += 10;
    if (year && c.year === year) score += 50;

    const normalizedTitle = norm(c.title);

    for (const t of normalizedTargets) {
      if (normalizedTitle === t) {
        score += 40;
        break;
      }

      if (normalizedTitle.includes(t) || t.includes(normalizedTitle)) {
        score += 8;
      }
    }

    return { c, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.c);
}

// src/hdrezka/sha256.js
var K = new Uint32Array([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);

function rotr(x, n) {
  return x >>> n | x << 32 - n;
}

function ch(x, y, z) {
  return x & y ^ ~x & z;
}

function maj(x, y, z) {
  return x & y ^ x & z ^ y & z;
}

function ep0(x) {
  return rotr(x, 2) ^ rotr(x, 13) ^ rotr(x, 22);
}

function ep1(x) {
  return rotr(x, 6) ^ rotr(x, 11) ^ rotr(x, 25);
}

function sig0(x) {
  return rotr(x, 7) ^ rotr(x, 18) ^ x >>> 3;
}

function sig1(x) {
  return rotr(x, 17) ^ rotr(x, 19) ^ x >>> 10;
}

function utf8ToBytes(str) {
  const out = [];

  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);

    if (c < 128) {
      out.push(c);
    } else if (c < 2048) {
      out.push(
        192 | c >> 6,
        128 | c & 63
      );
    } else if (c < 55296 || c >= 57344) {
      out.push(
        224 | c >> 12,
        128 | c >> 6 & 63,
        128 | c & 63
      );
    } else {
      c = 65536 + ((c & 1023) << 10 | str.charCodeAt(++i) & 1023);

      out.push(
        240 | c >> 18,
        128 | c >> 12 & 63,
        128 | c >> 6 & 63,
        128 | c & 63
      );
    }
  }

  return new Uint8Array(out);
}

function sha256(message) {
  const msg =
    typeof message === "string"
      ? utf8ToBytes(message)
      : message;

  const len = msg.length * 8;
  const totalBits = len + 65;
  const paddedLen = Math.ceil(totalBits / 512) * 512 / 8;
  const padded = new Uint8Array(paddedLen);

  padded.set(msg);
  padded[msg.length] = 128;

  const view = new DataView(padded.buffer);

  view.setUint32(
    paddedLen - 8,
    Math.floor(len / 4294967296),
    false
  );

  view.setUint32(
    paddedLen - 4,
    len,
    false
  );

  const H = new Int32Array([
    1779033703,
    3144134277,
    1013904242,
    2773480762,
    1359893119,
    2600822924,
    528734635,
    1541459225
  ]);

  const W = new Uint32Array(64);
  const chunk = new Uint8Array(64);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    chunk.set(padded.subarray(offset, offset + 64));

    for (let i = 0; i < 16; i++) {
      W[i] =
        chunk[i * 4] << 24 |
        chunk[i * 4 + 1] << 16 |
        chunk[i * 4 + 2] << 8 |
        chunk[i * 4 + 3];
    }

    for (let i = 16; i < 64; i++) {
      W[i] =
        sig1(W[i - 2]) +
        W[i - 7] +
        sig0(W[i - 15]) +
        W[i - 16] |
        0;
    }

    let a = H[0];
    let b = H[1];
    let c = H[2];
    let d = H[3];
    let e = H[4];
    let f = H[5];
    let g = H[6];
    let h = H[7];

    for (let i = 0; i < 64; i++) {
      const T1 =
        h +
        ep1(e) +
        ch(e, f, g) +
        K[i] +
        W[i] |
        0;

      const T2 =
        ep0(a) +
        maj(a, b, c) |
        0;

      h = g;
      g = f;
      f = e;
      e = d + T1 | 0;
      d = c;
      c = b;
      b = a;
      a = T1 + T2 | 0;
    }

    H[0] = H[0] + a | 0;
    H[1] = H[1] + b | 0;
    H[2] = H[2] + c | 0;
    H[3] = H[3] + d | 0;
    H[4] = H[4] + e | 0;
    H[5] = H[5] + f | 0;
    H[6] = H[6] + g | 0;
    H[7] = H[7] + h | 0;
  }

  const hash = new Uint8Array(32);

  for (let i = 0; i < 8; i++) {
    hash[i * 4] = H[i] >>> 24 & 255;
    hash[i * 4 + 1] = H[i] >>> 16 & 255;
    hash[i * 4 + 2] = H[i] >>> 8 & 255;
    hash[i * 4 + 3] = H[i] & 255;
  }

  return hash;
}

function sha256Hex(message) {
  const bytes = sha256(message);
  let hex = "";

  for (let i = 0; i < bytes.length; i++) {
    const h = bytes[i].toString(16);
    hex += h.length === 1 ? "0" + h : h;
  }

  return hex;
}

// src/hdrezka/anubis.js
var ANUBIS_BASE = "/.within.website/x/cmd/anubis";
var PASS_PATH = `${ANUBIS_BASE}/api/pass-challenge`;

function parseAnubisChallenge(html) {
  const match = html.match(
    /<script id="anubis_challenge" type="application\/json">([\s\S]+?)<\/script>/
  );

  if (!match) return null;

  try {
    const obj = JSON.parse(match[1]);
    return obj.challenge;
  } catch (e) {
    return null;
  }
}

function solveChallenge(challenge) {
  return __async(this, null, function* () {
    const difficulty = challenge.difficulty;
    const target = "0".repeat(difficulty);
    const base = challenge.randomData;
    let nonce = 0;

    while (true) {
      const hash = yield sha256Hex(base + nonce.toString());

      if (hash.startsWith(target)) {
        return {
          id: challenge.id,
          nonce: nonce.toString(),
          response: hash,
          difficulty
        };
      }

      nonce++;
    }
  });
}

function submitChallenge(_0, _1, _2) {
  return __async(
    this,
    arguments,
    function* ({ id, nonce, response, difficulty }, redirUrl, t0) {
      var _a, _b, _c;

      const elapsedTime =
        ((Date.now() - t0) / 1e3).toFixed(3);

      const parts = [
        `id=${encodeURIComponent(id)}`,
        `nonce=${encodeURIComponent(nonce)}`,
        `response=${encodeURIComponent(response)}`,
        `redir=${encodeURIComponent(redirUrl)}`,
        `elapsedTime=${encodeURIComponent(elapsedTime)}`
      ];

      const url =
        `${BASE_URL}${PASS_PATH}?${parts.join("&")}`;

      const host = hostFromUrl(redirUrl);

      const testCookieValue =
        (_a = cookieJar.get(host)) == null
          ? void 0
          : _a["techaro.lol-anubis-cookie-verification"];

      const testCookie =
        testCookieValue
          ? `techaro.lol-anubis-cookie-verification=${testCookieValue}`
          : null;

      const headers = __spreadValues(
        __spreadValues({}, HEADERS),
        testCookie ? { Cookie: testCookie } : {}
      );

      const res = yield fetch(url, {
        method: "GET",
        headers,
        redirect: "manual"
      });

      const setCookies =
        ((_c = (_b = res.headers).getSetCookie) == null
          ? void 0
          : _c.call(_b)) || [];

      if (setCookies.length === 0) {
        const header = res.headers.get("set-cookie");
        if (header) setCookies.push(header);
      }

      const verify =
        setCookies.find((c) => c.includes("anubis-auth="));

      const cookie = verify.split(";")[0];

      jarSet(
        hostFromUrl(redirUrl),
        [cookie]
      );

      return cookie;
    }
  );
}

// src/hdrezka/extractor.js
function fetchPage(url) {
  return __async(this, null, function* () {
    const html = yield fetchText(url);
    const challenge = parseAnubisChallenge(html);

    if (!challenge) return html;

    console.log(
      `[HDRezka] Anubis challenge (difficulty=${challenge.difficulty})`
    );

    const t0 = Date.now();
    const solution = yield solveChallenge(challenge);

    yield submitChallenge(
      solution,
      url,
      t0
    );

    return yield fetchText(url);
  });
}

function extractTranslatorAndId(html, mediaType) {
  const postIdMatch =
    html.match(/<input[^>]*id="post_id"[^>]*value="(\d+)"/) ||
    html.match(/data-id="(\d+)"/);

  const postId =
    postIdMatch
      ? postIdMatch[1]
      : null;

  if (html.includes('data-translator_id="238"')) {
    return {
      postId,
      translatorId: "238"
    };
  }

  const isSeries =
    mediaType === "tv" ||
    mediaType === "anime";

  const fn =
    isSeries
      ? "initCDNSeriesEvents"
      : "initCDNMoviesEvents";

  const re =
    new RegExp(
      `sof\\.tv\\.${fn}\\(\\s*(\\d+)\\s*,\\s*(\\d+)`
    );

  const m =
    html.match(re);

  if (m) {
    return {
      postId: m[1],
      translatorId: m[2]
    };
  }

  const listMatch =
    html.match(/data-translator_id="(\d+)"/);

  if (listMatch) {
    return {
      postId,
      translatorId: listMatch[1]
    };
  }

  return {
    postId,
    translatorId: null
  };
}

function extractTranslators(html) {
  const list = [];

  const re =
    /data-translator_id="(\d+)"[^>]*>([^<]+)/g;

  let m;

  while ((m = re.exec(html)) !== null) {
    list.push({
      id: m[1],
      name: m[2].trim()
    });
  }

  return list;
}

function isAllowedTranslator(name) {
  const lower =
    normalizeForCompare(name);

  const desired = [
    "\u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B",
    "original",
    "\u0430\u043D\u0433\u043B\u0438\u0439\u0441\u043A",
    "english",
    "en"
  ];

  if (
    desired.some(
      (kw) => lower.includes(kw)
    )
  ) {
    return true;
  }

  const blocked = [
    "\u0443\u043A\u0440\u0430\u0438\u043D",
    "\u0443\u043A\u0440\u0430\u0457\u043D",
    "ukrainian",
    "\u0433\u0440\u0443\u0437\u0438\u043D",
    "georgian",
    "\u0431\u0435\u043B\u043E\u0440\u0443\u0441",
    "\u0431\u0456\u043B\u043E\u0440\u0443\u0441",
    "belarusian",
    "\u043A\u0430\u0437\u0430\u0445",
    "kazakh",
    "\u0430\u0440\u043C\u044F\u043D",
    "armenian",
    "\u0430\u0437\u0435\u0440\u0431\u0430\u0439\u0434\u0436\u0430\u043D",
    "azerbaijani",
    "\u043B\u0438\u0442\u043E\u0432\u0441\u043A",
    "\u043B\u0438\u0442\u0432\u0430",
    "lithuanian",
    "\u043B\u0430\u0442\u044B\u0448",
    "latvian",
    "\u044D\u0441\u0442\u043E\u043D",
    "estonian",
    "\u043C\u043E\u043B\u0434\u0430\u0432",
    "moldovan",
    "\u0442\u0430\u0434\u0436\u0438\u043A",
    "tajik",
    "\u043A\u0438\u0440\u0433\u0438\u0437",
    "kyrgyz",
    "\u0443\u0437\u0431\u0435\u043A",
    "uzbek",
    "\u0438\u0441\u043F\u0430\u043D",
    "spanish",
    "\u0444\u0440\u0430\u043D\u0446\u0443\u0437",
    "french",
    "\u0438\u0442\u0430\u043B\u044C\u044F\u043D",
    "italian",
    "\u043F\u043E\u043B\u044C\u0441\u043A",
    "polish",
    "\u0442\u0443\u0440\u0435\u0446\u043A",
    "turkish",
    "\u043A\u0438\u0442\u0430\u0439\u0441\u043A",
    "chinese",
    "\u044F\u043F\u043E\u043D\u0441\u043A",
    "japanese",
    "\u043A\u043E\u0440\u0435\u0439\u0441\u043A",
    "korean"
  ];

  if (
    blocked.some(
      (kw) => lower.includes(kw)
    )
  ) {
    return false;
  }

  if (/[\u0400-\u04FF]/.test(name)) {
    return true;
  }

  const knownRussian =
    /* @__PURE__ */ new Set([
      "ddv",
      "lostfilm",
      "newstudio",
      "amedia",
      "ideafilm",
      "novafilm",
      "topfilm",
      "hdrezka studio"
    ]);

  if (knownRussian.has(lower)) {
    return true;
  }

  // Keep unknown Latin-labelled translators too.
  // German is intentionally NOT blocked.
  return true;
}

function normalizeForCompare(str) {
  return str
    .toLowerCase()
    .replace(
      /[\u0301\u0300\u0306]/g,
      ""
    )
    .replace(
      /[\"'()]/g,
      ""
    )
    .trim();
}

function isOriginalTranslator(translator) {
  const name =
    normalizeForCompare(
      translator && translator.name
        ? translator.name
        : ""
    );

  return (
    String(
      translator &&
      translator.id ||
      ""
    ) === "238" ||
    name.includes("оригинал") ||
    name.includes("original")
  );
}

function deobfuscateStreams(obfuscated) {
  if (!obfuscated) {
    throw new Error(
      "STAGE5_NO_STREAMS empty obfuscated url"
    );
  }

  let decoded = "";

  const looksPlain =
    obfuscated
      .trim()
      .startsWith("[") &&
    obfuscated.includes("]http");

  if (looksPlain) {
    decoded = obfuscated;
  } else {
    let stripped =
      obfuscated
        .replace("#h", "")
        .split("//_//")
        .join("");

    const trashChars = [
      "@",
      "#",
      "!",
      "^",
      "$"
    ];

    const trashSet =
      /* @__PURE__ */ new Set();

    for (let len = 2; len <= 3; len++) {
      const buckets =
        Array.from(
          { length: len },
          () => trashChars
        );

      let combos = [""];

      for (const bucket of buckets) {
        const next = [];

        for (const prefix of combos) {
          for (const c of bucket) {
            next.push(prefix + c);
          }
        }

        combos = next;
      }

      for (const combo of combos) {
        trashSet.add(
          encodeBase64(combo)
        );
      }
    }

    const sortedTrash =
      Array.from(trashSet)
        .sort(
          (a, b) =>
            b.length - a.length
        );

    for (const t of sortedTrash) {
      stripped =
        stripped
          .split(t)
          .join("");
    }

    try {
      decoded =
        decodeBase64Utf8(stripped);
    } catch (e) {
      decoded = stripped;
    }
  }

  const out = [];
  const re =
    /\[([^\]]+)\]([^,]+)/g;

  let m;

  while ((m = re.exec(decoded)) !== null) {
    const quality =
      m[1].trim();

    const url =
      m[2]
        .split(/\s+or\s+/)
        .map((u) => u.trim())
        .find(
          (u) =>
            u.startsWith("http") &&
            !u.includes(":hls:")
        );

    if (url) {
      out.push({
        quality,
        url
      });
    }
  }

  if (out.length === 0) {
    throw new Error(
      `STAGE5_NO_STREAMS raw=${obfuscated.slice(0, 80)} decoded=${decoded.slice(0, 80)}`
    );
  }

  return out;
}

function parseSubtitles(obfuscated) {
  if (!obfuscated) {
    return [];
  }

  let decoded;

  const looksPlain =
    obfuscated
      .trim()
      .startsWith("[") &&
    obfuscated.includes("]http");

  if (looksPlain) {
    decoded = obfuscated;
  } else {
    const stripped =
      obfuscated
        .replace("#h", "")
        .split("//_//")
        .join("");

    try {
      decoded =
        decodeBase64Utf8(stripped);
    } catch (e) {
      decoded = stripped;
    }
  }

  const out = [];

  const re =
    /\[([^\]]+)\](https?:\/\/\S+?)(?=,\[|$)/g;

  let m;

  while ((m = re.exec(decoded)) !== null) {
    out.push({
      language: m[1].trim(),
      url: m[2]
    });
  }

  return out;
}

function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    const resolved =
      yield resolveTmdbId(
        tmdbId,
        mediaType
      );

    tmdbId =
      resolved.id;

    mediaType =
      resolved.mediaType;

    const tmdb =
      resolved.title
        ? resolved
        : yield fetchTmdb(
            tmdbId,
            mediaType
          );

    const title =
      tmdb.title;

    const year =
      tmdb.year;

    if (!title) {
      throw new Error(
        `STAGE1_NO_TITLE (tmdb=${tmdbId})`
      );
    }

    const candidates =
      yield searchHdrezka(
        title,
        tmdb.originalTitle,
        year,
        mediaType
      );

    if (candidates.length === 0) {
      throw new Error(
        `STAGE2_NO_CANDIDATES title=${title}`
      );
    }

    const best =
      candidates[0];

    const pageUrl =
      best.url.startsWith("http")
        ? best.url
        : `${BASE_URL}${best.url.startsWith("/") ? "" : "/"}${best.url}`;

    const html =
      yield fetchPage(pageUrl);

    const {
      postId,
      translatorId:
        defaultTranslatorId
    } =
      extractTranslatorAndId(
        html,
        mediaType
      );

    if (!postId) {
      throw new Error(
        "STAGE3_NO_POST_ID"
      );
    }

    // Deduplicate translator IDs before doing expensive CDN requests.
    const translatorById =
      new Map();

    for (
      const t of
      extractTranslators(html)
    ) {
      if (
        !translatorById.has(t.id)
      ) {
        translatorById.set(
          t.id,
          t
        );
      }
    }

    let translators =
      [...translatorById.values()]
        .filter(
          (t) =>
            isAllowedTranslator(
              t.name
            )
        );

    if (
      translators.length === 0 &&
      defaultTranslatorId
    ) {
      translators = [
        {
          id:
            defaultTranslatorId,
          name:
            "\u0414\u0443\u0431\u043b\u044f\u0436"
        }
      ];
    }

    if (
      translators.length === 0
    ) {
      throw new Error(
        "STAGE3_NO_TRANSLATOR"
      );
    }

    // Original first.
    // Everything else keeps HDRezka's page order.
    translators.sort((a, b) => {
      const ao =
        isOriginalTranslator(a);

      const bo =
        isOriginalTranslator(b);

      if (ao !== bo) {
        return ao ? -1 : 1;
      }

      return 0;
    });

    const favs =
      generateFavs();

    const isTv =
      mediaType === "tv" ||
      mediaType === "anime";

    const baseForm = {
      id: postId,
      action:
        isTv
          ? "get_stream"
          : "get_movie"
    };

    if (isTv) {
      baseForm.season =
        season;

      baseForm.episode =
        episode;
    }

    const out = [];

    const seenKeys =
      /* @__PURE__ */ new Set();

    /*
     * Nuvio's plugin network bridge behaves effectively
     * serially here. Instead of querying every translator,
     * keep going until we have 8 WORKING translator groups.
     *
     * Failed, unavailable and premium-only translators do not
     * count against the limit.
     */
    const MAX_SUCCESSFUL_TRANSLATORS =
      8;

    let successfulTranslatorCount =
      0;

    for (
      let translatorIndex = 0;
      translatorIndex <
      translators.length;
      translatorIndex++
    ) {
      if (
        successfulTranslatorCount >=
        MAX_SUCCESSFUL_TRANSLATORS
      ) {
        break;
      }

      const translator =
        translators[
          translatorIndex
        ];

      let cdn;

      try {
        cdn =
          yield postForm(
            "/ajax/get_cdn_series/",
            __spreadProps(
              __spreadValues(
                {},
                baseForm
              ),
              {
                translator_id:
                  translator.id,
                favs
              }
            )
          );
      } catch (e) {
        console.error(
          `[HDRezka] CDN failed for translator ${translator.name}: ${e.message}`
        );

        continue;
      }

      /*
       * premium_content = 1 returns the short HDRezka Premium
       * promotional clip rather than the actual film/episode.
       */
      if (
        Number(
          cdn.premium_content
        ) > 0
      ) {
        console.log(
          `[HDRezka] skipping premium translator: ${translator.name}`
        );

        continue;
      }

      if (
        !cdn.success ||
        !cdn.url
      ) {
        continue;
      }

      const streams =
        deobfuscateStreams(
          cdn.url
        );

      const subs =
        parseSubtitles(
          cdn.subtitle
        );

      const cleanSubs =
        subs.map((s) => ({
          id: s.url,
          language: s.language,
          lang: s.language,
          label: s.language,
          url: s.url,
          type: "vtt",
          hasCorsRestrictions:
            false
        }));

      const translatorRows =
        [];

      for (const s of streams) {
        if (
          !s.url ||
          s.url === "null" ||
          s.url.includes(":hls:")
        ) {
          continue;
        }

        const quality =
          s.quality
            .replace(
              /<[^>]+>/g,
              ""
            )
            .trim();

        // Keep the old explicit premium/ultra quality-label filter too.
        if (
  /\bultra\b|\bprem\b|\b2160p?\b|\b4k\b|\buhd\b/i.test(quality)
) {
  continue;
}

        const original =
          isOriginalTranslator(
            translator
          );

        const translatorLabel =
          original
            ? "Original"
            : translator.name;

        const dedupeKey =
          `${translator.id}|${quality}`;

        if (
          seenKeys.has(
            dedupeKey
          )
        ) {
          continue;
        }

        seenKeys.add(
          dedupeKey
        );

        translatorRows.push({
          // No redundant "HDRezka" prefix.
          name:
            translatorLabel,

          title:
            formatStreamTitle(
              title,
              year,
              mediaType,
              season,
              episode,
              `${quality} \xB7 ${translatorLabel}`
            ),

          url:
            s.url,

          quality,

          // Internal fields used only for ordering.
          _original:
            original,

          _translatorIndex:
            translatorIndex,

          headers: {
            Referer:
              pageUrl,

            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          },

          subtitles:
            cleanSubs.length > 0
              ? cleanSubs
              : void 0,

          type:
            "mp4"
        });
      }

      if (
        translatorRows.length > 0
      ) {
        successfulTranslatorCount++;

        out.push(
          ...translatorRows
        );
      }
    }

    /*
     * Translator first, quality second:
     *
     * Original 1080
     * Original 720
     * Original 480
     * HDRezka Studio 1080
     * HDRezka Studio 720
     * HDRezka Studio 480
     * TVShows 1080
     * TVShows 720
     * ...
     */
    out.sort((a, b) => {
      if (
        a._original !==
        b._original
      ) {
        return a._original
          ? -1
          : 1;
      }

      if (
        a._translatorIndex !==
        b._translatorIndex
      ) {
        return (
          a._translatorIndex -
          b._translatorIndex
        );
      }

      return (
        parseQualityValue(
          b.quality
        ) -
        parseQualityValue(
          a.quality
        )
      );
    });

    // Remove private ordering metadata before returning to Nuvio.
    for (const s of out) {
      delete s._original;
      delete s._translatorIndex;
    }

    return out;
  });
}

function parseQualityValue(q) {
  const m =
    q.match(/(\d+)/);

  return m
    ? parseInt(
        m[1],
        10
      )
    : 0;
}

function formatStreamTitle(
  title,
  year,
  mediaType,
  season,
  episode,
  quality
) {
  const base =
    `${title}${year ? ` (${year})` : ""} ${quality}`;

  if (
    mediaType === "tv" ||
    mediaType === "anime"
  ) {
    return (
      `${base} S${season}E${episode}`
    );
  }

  return base;
}

function resolveTmdbId(rawId, mediaType) {
  return __async(this, null, function* () {
    const idStr =
      String(rawId).trim();

    if (/^\d+$/.test(idStr)) {
      return {
        id: idStr,
        mediaType
      };
    }

    const imdbMatch =
      idStr.match(/tt\d+/i);

    if (!imdbMatch) {
      throw new Error(
        `Unsupported TMDB/ID format: ${rawId}`
      );
    }

    const imdbId =
      imdbMatch[0];

    const apiKey =
      "439c478a771f35c05022f9feabcca01c";

    const url =
      `https://api.themoviedb.org/3/find/${imdbId}?api_key=${apiKey}&external_source=imdb_id`;

    const data =
      yield fetchJson(url);

    const pick =
      (result, type) => {
        const isTv =
          type === "tv";

        const title =
          isTv
            ? result.name
            : result.title;

        const originalTitle =
          isTv
            ? result.original_name
            : result.original_title;

        const date =
          isTv
            ? result.first_air_date
            : result.release_date;

        return {
          id:
            String(result.id),

          mediaType:
            type,

          title,

          originalTitle:
            originalTitle ||
            title,

          year:
            date
              ? parseInt(
                  date.substring(
                    0,
                    4
                  ),
                  10
                )
              : null
        };
      };

    const preferTv =
      mediaType === "tv" ||
      mediaType === "anime";

    let chosen =
      null;

    if (preferTv) {
      if (
        data.tv_results &&
        data.tv_results.length > 0
      ) {
        chosen =
          pick(
            data.tv_results[0],
            data.tv_results[0].media_type ||
            "tv"
          );
      } else if (
        data.movie_results &&
        data.movie_results.length > 0
      ) {
        chosen =
          pick(
            data.movie_results[0],
            "movie"
          );
      }
    } else {
      if (
        data.movie_results &&
        data.movie_results.length > 0
      ) {
        chosen =
          pick(
            data.movie_results[0],
            "movie"
          );
      } else if (
        data.tv_results &&
        data.tv_results.length > 0
      ) {
        chosen =
          pick(
            data.tv_results[0],
            data.tv_results[0].media_type ||
            "tv"
          );
      }
    }

    if (!chosen) {
      throw new Error(
        `IMDb ${imdbId} not found on TMDB`
      );
    }

    return chosen;
  });
}

function fetchTmdb(tmdbId, mediaType) {
  return __async(this, null, function* () {
    const apiKey =
      "439c478a771f35c05022f9feabcca01c";

    const path =
      mediaType === "tv" ||
      mediaType === "anime"
        ? "tv"
        : "movie";

    const url =
      `https://api.themoviedb.org/3/${path}/${tmdbId}?api_key=${apiKey}`;

    try {
      const data =
        yield fetchJson(url);

      const isTv =
        mediaType === "tv" ||
        mediaType === "anime";

      const title =
        isTv
          ? data.name
          : data.title;

      const originalTitle =
        isTv
          ? data.original_name
          : data.original_title;

      const date =
        isTv
          ? data.first_air_date
          : data.release_date;

      const year =
        date
          ? parseInt(
              date.substring(
                0,
                4
              ),
              10
            )
          : null;

      return {
        title,

        originalTitle:
          originalTitle ||
          title,

        originalLanguage:
          data.original_language ||
          null,

        year
      };
    } catch (e) {
      console.error(
        "[HDRezka] TMDB lookup failed:",
        e.message
      );

      return {
        title: null,
        originalTitle: null,
        originalLanguage: null,
        year: null
      };
    }
  });
}

function encodeBase64(str) {
  if (
    typeof btoa !==
    "undefined"
  ) {
    return btoa(str);
  }

  return Buffer
    .from(
      str,
      "utf-8"
    )
    .toString(
      "base64"
    );
}

function decodeBase64Utf8(str) {
  let bytes;

  if (
    typeof atob !==
    "undefined"
  ) {
    const raw =
      atob(str);

    bytes =
      new Uint8Array(
        raw.length
      );

    for (
      let i = 0;
      i < raw.length;
      i++
    ) {
      bytes[i] =
        raw.charCodeAt(i);
    }
  } else if (
    typeof Buffer !==
    "undefined"
  ) {
    bytes =
      Buffer.from(
        str,
        "base64"
      );
  } else {
    const map =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    const out2 = [];

    let b = 0;
    let bits = 0;

    for (
      let i = 0;
      i < str.length;
      i++
    ) {
      const c =
        str.charAt(i);

      if (c === "=") {
        break;
      }

      const v =
        map.indexOf(c);

      if (v === -1) {
        continue;
      }

      b =
        b << 6 |
        v;

      bits += 6;

      if (bits >= 8) {
        bits -= 8;

        out2.push(
          b >> bits &
          255
        );
      }
    }

    bytes =
      new Uint8Array(
        out2
      );
  }

  if (
    typeof TextDecoder !==
    "undefined"
  ) {
    return new TextDecoder(
      "utf-8"
    ).decode(bytes);
  }

  let out = "";

  for (
    let i = 0;
    i < bytes.length;
    i++
  ) {
    const c =
      bytes[i];

    if (c < 128) {
      out +=
        String.fromCharCode(c);
    } else if (
      (c & 224) === 192
    ) {
      out +=
        String.fromCharCode(
          (c & 31) << 6 |
          bytes[i + 1] & 63
        );

      i += 1;
    } else if (
      (c & 240) === 224
    ) {
      out +=
        String.fromCharCode(
          (c & 15) << 12 |
          (bytes[i + 1] & 63) << 6 |
          bytes[i + 2] & 63
        );

      i += 2;
    } else if (
      (c & 248) === 240
    ) {
      let code =
        (c & 7) << 18 |
        (bytes[i + 1] & 63) << 12 |
        (bytes[i + 2] & 63) << 6 |
        bytes[i + 3] & 63;

      code -= 65536;

      out +=
        String.fromCharCode(
          55296 +
          (code >> 10),

          56320 +
          (code & 1023)
        );

      i += 3;
    }
  }

  return out;
}

// src/hdrezka/index.js
function getStreams2(
  tmdbId,
  mediaType,
  season,
  episode
) {
  return __async(this, null, function* () {
    try {
      console.log(
        `[HDRezka] ${mediaType} ${tmdbId} S${season != null ? season : "-"}E${episode != null ? episode : "-"}`
      );

      const streams =
        yield getStreams(
          tmdbId,
          mediaType,
          season,
          episode
        );

      if (
        streams.length > 0
      ) {
        return streams;
      }

      return [
        {
          name:
            "HDRezka-DIAG",

          title:
            `DIAG tmdb=${tmdbId || "empty"} type=${mediaType || "empty"} S${season != null ? season : "-"}E${episode != null ? episode : "-"}`,

          url:
            "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",

          quality:
            "diagnostic"
        }
      ];
    } catch (error) {
      const msg =
        `${error.message || error}`
          .replace(
            /\s+/g,
            " "
          )
          .trim();

      console.error(
        "[HDRezka] getStreams failed:",
        msg
      );

      if (
  msg.includes("STAGE3_NO_TRANSLATOR")
) {
  return [];
}
      return [
        {
          name:
            `HDRezka-ERR: ${msg.slice(0, 70)}`,

          title:
            `ERR: ${msg}`,

          url:
            "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",

          quality:
            `${mediaType} ${tmdbId} S${season != null ? season : "-"}E${episode != null ? episode : "-"}`
        }
      ];
    }
  });
}
