/* Rizal's Journey to Heroism: navigation, panels, timeline, lightbox, voice reader */
(() => {
  const $ = (s, r = document) => r.querySelector(s),
    $$ = (s, r = document) => [...r.querySelectorAll(s)];
  document.documentElement.classList.add("js");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const chapters = $$(".chapter"),
    ids = chapters.map((c) => c.id);

  /* ---------- Navigation (hash based; anchors work without JS) ---------- */
  chapters.forEach((c, i) => {
    // Previous / Home / Next buttons
    const prev = chapters[i - 1],
      next = chapters[i + 1],
      n = document.createElement("nav");
    n.className = "pn";
    n.setAttribute("aria-label", "Chapter navigation");
    n.innerHTML =
      (prev ? `<a href="#${prev.id}">Previous: ${prev.dataset.title}</a>` : "<span></span>") +
      (c.id !== "home" ? '<a href="#home">Home</a>' : "") +
      (next ? `<a href="#${next.id}">Next: ${next.dataset.title}</a>` : "<span></span>");
    c.appendChild(n);
  });
  function route() {
    stopSpeech();
    let id = location.hash.slice(1);
    if (!ids.includes(id)) id = "home";
    chapters.forEach((c) => (c.hidden = c.id !== id));
    $$("#menu a").forEach((a) =>
      a.hash === "#" + id
        ? a.setAttribute("aria-current", "page")
        : a.removeAttribute("aria-current"),
    );
    $("#where").textContent = $("#" + id).dataset.title;
    $("#menu").classList.remove("open");
    $("#menu-btn").setAttribute("aria-expanded", "false");
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
    const h = $("#" + id + " h2, #" + id + " h1");
    if (h) h.focus({ preventScroll: true });
    progress();
  }
  function progress() {
    const max = document.documentElement.scrollHeight - innerHeight;
    $("#bar").style.width = (max > 0 ? (scrollY / max) * 100 : 0) + "%";
  }
  addEventListener("hashchange", route);
  addEventListener("scroll", progress, { passive: true });
  $("#menu-btn").addEventListener("click", (e) => {
    const o = $("#menu").classList.toggle("open");
    e.currentTarget.setAttribute("aria-expanded", o);
  });

  /* ---------- "Why / How" panels ---------- */
  $$(".why").forEach((b) => {
    const p = document.getElementById(b.getAttribute("aria-controls"));
    const l = document.createElement("button");
    l.textContent = "Listen to this explanation";
    l.addEventListener("click", () => speak($$("dd", p)));
    p.appendChild(l);
    b.addEventListener("click", () => {
      const open = b.getAttribute("aria-expanded") === "true";
      b.setAttribute("aria-expanded", !open);
      p.hidden = open;
      if (open) stopSpeech();
    });
    p.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        b.click();
        b.focus();
      }
    });
  });

  /* ---------- Timeline ---------- */
  $$(".tl button").forEach((b) =>
    b.addEventListener("click", () => {
      $("#tl-out").innerHTML =
        `<strong>${b.textContent}:</strong> ${b.dataset.t} <a href="#${b.dataset.ch}">Go to chapter</a>`;
    }),
  );

  /* ---------- Lightbox (native dialog traps focus and closes on Esc) ---------- */
  const lb = $("#lb");
  $$(".ph-btn").forEach((b) =>
    b.addEventListener("click", () => {
      $("#lb-t").textContent = b.dataset.label;
      $("#lb-c").textContent = b.closest("figure").querySelector("figcaption").textContent;
      const im = b.querySelector("img");
      $("#lb-img").innerHTML = im ? `<img src="${im.src}" alt="${im.alt}">` : "";
      $("#lb-n").textContent = im ? "This Image Is Credited In References." : "No image added yet.";
      lb.showModal();
    }),
  );
  $("#lb-x").addEventListener("click", () => lb.close());
  lb.addEventListener("click", (e) => {
    if (e.target === lb) lb.close();
  });

  $$(".ph-btn").forEach((b) => b.setAttribute("aria-label", "Enlarge image: " + b.dataset.label));

  /* ---------- Voice reader (Web Speech API) ---------- */
  const ss = window.speechSynthesis,
    ok = !!ss && "SpeechSynthesisUtterance" in window;
  const status = $("#v-status");
  let queue = [],
    idx = 0,
    session = 0,
    voices = [];
  const hl =
    window.CSS && CSS.highlights && typeof Highlight !== "undefined" ? new Highlight() : null;
  if (hl) CSS.highlights.set("reading", hl);
  const setStatus = (t) => (status.textContent = "Reader: " + t);
  if (!ok) {
    $$("#voice button, #voice input, #voice select").forEach((x) => (x.disabled = true));
    setStatus("not supported in this browser. You can still read the text.");
  } else {
    const load = () => {
      voices = ss.getVoices();
      const sel = $("#v-voice");
      sel.innerHTML = voices
        .map((v, i) => `<option value="${i}">${v.name} (${v.lang})</option>`)
        .join("");
      const en = voices.findIndex((v) => /^en/i.test(v.lang));
      if (en >= 0) sel.value = en;
    };
    load();
    ss.addEventListener("voiceschanged", load);
  }
  function readable(root) {
    // only the visible story text
    return $$(".story p, .panel dd", root).filter((e) => !e.closest("[hidden]"));
  }
  function clearMarks() {
    if (hl) hl.clear();
    $$(".reading-block").forEach((e) => e.classList.remove("reading-block"));
  }
  function rangeAt(el, a, b) {
    // map character offsets to a DOM Range without altering the markup
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT),
      r = document.createRange();
    let pos = 0,
      s = false,
      n;
    while ((n = w.nextNode())) {
      const len = n.length;
      if (!s && a < pos + len) {
        r.setStart(n, a - pos);
        s = true;
      }
      if (s && b <= pos + len) {
        r.setEnd(n, b - pos);
        return r;
      }
      pos += len;
    }
    return null;
  }
  function keepVisible(el) {
    const r = el.getBoundingClientRect();
    if (r.top < 90 || r.bottom > innerHeight - 110)
      el.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
  }
  function speak(list) {
    if (!ok) return;
    list = list.filter((e) => e.textContent.trim());
    if (!list.length) return;
    stopSpeech();
    queue = list;
    idx = 0;
    run(++session);
  }
  function run(s) {
    if (s !== session) return;
    clearMarks();
    if (idx >= queue.length) return setStatus("stopped");
    const el = queue[idx],
      text = el.textContent,
      u = new SpeechSynthesisUtterance(text);
    u.rate = +$("#v-rate").value;
    const v = voices[+$("#v-voice").value];
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    }
    u.onstart = () => {
      if (s !== session) return;
      setStatus("playing");
      el.classList.add("reading-block");
      keepVisible(el); // block-level fallback
    };
    u.onboundary = (e) => {
      // word-level highlight where the browser provides boundary events
      if (s !== session || !hl || (e.name && e.name !== "word")) return;
      let end = e.charLength ? e.charIndex + e.charLength : text.slice(e.charIndex).search(/\s/);
      if (!e.charLength) end = end < 0 ? text.length : e.charIndex + end;
      const r = rangeAt(el, e.charIndex, end);
      if (r) {
        hl.clear();
        hl.add(r);
      }
    };
    u.onend = () => {
      if (s === session) {
        idx++;
        run(s);
      }
    };
    u.onerror = (e) => {
      if (s === session && !["interrupted", "canceled"].includes(e.error))
        setStatus("error (" + e.error + ")");
    };
    ss.speak(u);
  }
  function stopSpeech() {
    if (!ok) return;
    session++;
    ss.cancel();
    clearMarks();
    setStatus("stopped");
  }
  $("#v-read").addEventListener("click", () => speak(readable($(".chapter:not([hidden])"))));
  $("#v-pause").addEventListener("click", () => {
    if (ok && ss.speaking) {
      ss.pause();
      setStatus("paused");
    }
  });
  $("#v-resume").addEventListener("click", () => {
    if (ok && ss.paused) {
      ss.resume();
      setStatus("playing");
    }
  });
  $("#v-stop").addEventListener("click", stopSpeech);
  $("#v-rate").addEventListener("change", () => {
    if (ok && ss.speaking && !ss.paused) {
      const i = idx;
      speak(queue.slice(i));
    }
  });
  document.addEventListener("dblclick", (e) => {
    // read from a chosen paragraph onward
    const el = e.target.closest(".story p, .panel dd");
    if (!el) return;
    getSelection().removeAllRanges();
    const all = readable(el.closest(".chapter"));
    speak(all.slice(all.indexOf(el)));
  });
  addEventListener("pagehide", stopSpeech);
  route();
})();