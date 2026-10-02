from pathlib import Path
text = Path('/mnt/data/hdrezka.js').read_text()

# 1 search dedupe
text = text.replace(
'''    const baseQueries = [
      originalTitle,
      title
    ].filter(Boolean);''',
'''    const baseQueries = [
      ...new Set([originalTitle, title].filter(Boolean))
    ];'''
)

# 2 replace isAllowedTranslator function
start = text.index('function isAllowedTranslator(name) {')
end = text.index('function normalizeForCompare(str) {', start)
new_allowed = r'''function isAllowedTranslator(name) {
  const lower = normalizeForCompare(name);

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

  if (blocked.some((kw) => lower.includes(kw))) return false;

  // Original / English
  if (
    lower.includes("\u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B") ||
    lower.includes("original") ||
    lower.includes("\u0430\u043D\u0433\u043B\u0438\u0439\u0441\u043A") ||
    lower.includes("english") ||
    lower === "en"
  ) {
    return true;
  }

  // German is intentionally allowed.
  if (
    lower.includes("\u043D\u0435\u043C\u0435\u0446\u043A") ||
    lower.includes("german") ||
    lower.includes("deutsch") ||
    lower === "de"
  ) {
    return true;
  }

  // Russian/Cyrillic-labelled translators.
  if (/[\u0400-\u04FF]/.test(name)) return true;

  // Common Russian dubbing groups with Latin names.
  const knownRussian = /* @__PURE__ */ new Set([
    "ddv",
    "lostfilm",
    "newstudio",
    "amedia",
    "ideafilm",
    "novafilm",
    "topfilm",
    "hdrezka studio",
    "tvshows",
    "dub",
    "coldfilm",
    "baibako",
    "jaskier",
    "alexfilm",
    "red head sound",
    "kubik v kube",
    "ultradox"
  ]);

  return knownRussian.has(lower);
}
'''
text = text[:start] + new_allowed + text[end:]

# 3 replace translator setup block
old = '''    let translators = extractTranslators(html).filter((t) => isAllowedTranslator(t.name));
    if (translators.length === 0 && defaultTranslatorId) {
      translators = [{ id: defaultTranslatorId, name: "\\u0414\\u0443\\u0431\\u043B\\u044F\\u0436" }];
    }
    if (translators.length === 0) throw new Error("STAGE3_NO_TRANSLATOR");'''
new = '''    const translatorById = /* @__PURE__ */ new Map();
    for (const t of extractTranslators(html)) {
      if (!translatorById.has(t.id)) {
        translatorById.set(t.id, t);
      }
    }

    let translators = [...translatorById.values()].filter((t) => isAllowedTranslator(t.name));

    if (translators.length === 0 && defaultTranslatorId) {
      translators = [{ id: defaultTranslatorId, name: "\\u0414\\u0443\\u0431\\u043B\\u044F\\u0436" }];
    }

    if (translators.length === 0) throw new Error("STAGE3_NO_TRANSLATOR");

    translators.sort((a, b) => {
      const ao = isOriginalTranslator(a);
      const bo = isOriginalTranslator(b);
      if (ao !== bo) return ao ? -1 : 1;
      return 0;
    });'''
if old not in text:
    print("translator setup old not found")
else:
    text = text.replace(old,new,1)

# 4 replace rows block from const rows... through before parseQualityValue
start = text.index('    const rows = yield Promise.all(translators.map')
end = text.index('function parseQualityValue(q) {', start)
new_rows = r'''    const rows = yield Promise.all(translators.map((translator, translatorIndex) => __async(this, null, function* () {
      let cdn;
      try {
        cdn = yield postForm("/ajax/get_cdn_series/", __spreadProps(__spreadValues({}, baseForm), {
          translator_id: translator.id,
          favs
        }));
      } catch (e) {
        console.error(`[HDRezka] CDN failed for translator ${translator.name}: ${e.message}`);
        return [];
      }

      // premium_content=1 returns a short HDRezka Premium advert instead of the real stream.
      if (cdn.premium_content != null && Number(cdn.premium_content) > 0) {
        console.log(`[HDRezka] skipping premium translator: ${translator.name}`);
        return [];
      }

      if (!cdn.success || !cdn.url) return [];

      const streams = deobfuscateStreams(cdn.url);
      const subs = parseSubtitles(cdn.subtitle);
      const cleanSubs = subs.map((s) => ({
        id: s.url,
        language: s.language,
        lang: s.language,
        label: s.language,
        url: s.url,
        type: "vtt",
        hasCorsRestrictions: false
      }));

      const translatorRows = [];
      for (const s of streams) {
        if (!s.url || s.url === "null" || s.url.includes(":hls:")) continue;

        const quality = s.quality.replace(/<[^>]+>/g, "").trim();
        if (/\bultra\b|\bprem\b/i.test(quality)) continue;

        const original = isOriginalTranslator(translator);
        const translatorLabel = original ? "Original" : translator.name;

        const dedupeKey = `${translator.id}|${quality}`;
        if (seenKeys.has(dedupeKey)) continue;
        seenKeys.add(dedupeKey);

        translatorRows.push({
          name: translatorLabel,
          title: formatStreamTitle(
            title,
            year,
            mediaType,
            season,
            episode,
            `${quality} \xB7 ${translatorLabel}`
          ),
          url: s.url,
          quality,
          _original: original,
          _translatorIndex: translatorIndex,
          headers: {
            Referer: pageUrl,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          },
          subtitles: cleanSubs.length > 0 ? cleanSubs : void 0,
          type: "mp4"
        });
      }

      return translatorRows;
    })));

    for (const rowList of rows) out.push(...rowList);

    // Translator first, quality second. Original is translator group #1.
    out.sort((a, b) => {
      if (a._original !== b._original) {
        return a._original ? -1 : 1;
      }

      if (a._translatorIndex !== b._translatorIndex) {
        return a._translatorIndex - b._translatorIndex;
      }

      return parseQualityValue(b.quality) - parseQualityValue(a.quality);
    });

    for (const s of out) {
      delete s._original;
      delete s._translatorIndex;
    }

    return out;
  });
}
'''
text = text[:start] + new_rows + text[end:]

Path('/mnt/data/hdrezka-final.js').write_text(text)
print(len(text), text.count('\n'))
