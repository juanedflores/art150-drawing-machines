// Walkthrough mode: steps through every exhibit full-screen for the display
// outside the classroom. For each project: the finished drawing for a few
// seconds, then the clip of the machine making it, then any other photos.
// At the end it scrolls down to the footer and fades in the gallery's URL.
//
// Start it with the "Walkthrough" button, or open the page with
// ?walkthrough in the URL (add &loop to repeat forever, e.g. on a kiosk).
// Keys while it runs: Esc exits, ← / → previous / next project,
// Space pauses.
//
// Uses EXHIBITS, sources(), pad() and SOURCE_LABEL from index.html.

(function () {
  // seconds on screen
  const TIME = {
    drawing: 4.5, // the finished drawing, before its clip plays
    photo: 3.5, // each other photo
    maxClip: 16, // safety cap on a clip
    end: 30, // the closing card, before looping
  };
  const URL_TEXT = "juanedflores.github.io/art150-drawing-machines";

  const params = new URLSearchParams(location.search);
  const LOOP = params.has("loop");

  // ---------- markup ----------

  document.body.insertAdjacentHTML(
    "beforeend",
    `<button class="wt-start" type="button">&#9654; Walkthrough</button>
     <div class="wt" hidden>
       <div class="wt-media">
         <div class="wt-frame"><div class="wt-mat"><div class="wt-layer"></div><div class="wt-layer"></div></div></div>
         <p class="wt-caption"></p>
       </div>
       <aside class="wt-info"><div class="wt-label"></div></aside>
       <div class="wt-progress"><i></i></div>
     </div>
     <div class="wt-veil"></div>
     <div class="wt-end" hidden>
       <img src="qr.svg" alt="QR code for ${URL_TEXT}">
       <div>
         <p class="k">Visit this gallery</p>
         <p class="url">${URL_TEXT}</p>
         <p class="sub">Scan the code or type the address to explore every drawing machine.</p>
       </div>
     </div>
     <div class="wt-hint">Esc to exit &nbsp;·&nbsp; &larr; &rarr; skip &nbsp;·&nbsp; Space to pause</div>`,
  );
  const startBtn = document.querySelector(".wt-start");
  const stage = document.querySelector(".wt");
  const layers = [...stage.querySelectorAll(".wt-layer")];
  const caption = stage.querySelector(".wt-caption");
  const info = stage.querySelector(".wt-info");
  const label = stage.querySelector(".wt-label");
  const bar = stage.querySelector(".wt-progress i");
  const endCard = document.querySelector(".wt-end");
  const veil = document.querySelector(".wt-veil");
  const hint = document.querySelector(".wt-hint");

  // ---------- timing that can be cancelled and paused ----------

  let run = 0; // bumped to cancel whatever is in progress
  let paused = false;
  let jump = null; // +1 / -1 when the operator skips
  let clip = null; // the video currently playing

  const alive = (token) => token === run && jump === null;

  function wait(seconds, token) {
    return new Promise((resolve) => {
      let elapsed = 0;
      let last = performance.now();
      (function tick(now) {
        if (!alive(token)) return resolve(false);
        if (!paused) elapsed += now - last;
        last = now;
        if (elapsed >= seconds * 1000) return resolve(true);
        requestAnimationFrame(tick);
      })(last);
    });
  }

  // ---------- one project's sequence ----------

  function plan(ex, i) {
    const n = pad(i + 1);
    const source = (s) => (s.from === "student" ? "student photo" : "from the class video");
    const [still, ...moreDrawings] = sources(ex, "drawing", n);
    const steps = [
      { src: still.src, caption: "The drawing", time: TIME.drawing },
      { src: still.process, video: true, caption: "Watch the machine make it" },
    ];
    moreDrawings.forEach((s) => steps.push({ src: s.src, caption: `The drawing · ${source(s)}`, time: TIME.photo }));
    sources(ex, "machine", n).forEach((s) => steps.push({ src: s.src, caption: `The machine · ${source(s)}`, time: TIME.photo }));
    sources(ex, "card", n).forEach((s) => steps.push({ src: s.src, caption: `The instruction card · ${source(s)}`, time: TIME.photo }));
    return steps;
  }

  function labelHTML(ex, i) {
    const list = (items) => items.map((s) => `<li>${s}</li>`).join("");
    return `<p class="wt-no">No. ${pad(i + 1)} <span style="opacity:.6">of ${EXHIBITS.length}</span></p>
      <h2 class="wt-title">${ex.title}</h2>
      <h3>${ex.stepsLabel || "Instructions"}</h3>
      <ol>${list(ex.steps)}</ol>
      ${ex.limitations ? `<h3>Limitations</h3><ul>${list(ex.limitations)}</ul>` : ""}
      ${ex.note ? `<p class="wt-note">${ex.note}</p>` : ""}`;
  }

  // load into the hidden layer, then slide it in over the current one
  let front = 0;
  async function present(step, token) {
    const back = layers[1 - front];
    const el = document.createElement(step.video ? "video" : "img");
    el.src = step.src;
    if (step.video) {
      el.muted = true;
      el.playsInline = true;
      el.preload = "auto";
      await Promise.race([
        new Promise((r) => el.addEventListener("canplaythrough", r, { once: true })),
        wait(4, token),
      ]);
    } else {
      await el.decode().catch(() => {});
    }
    if (!alive(token)) return false;
    back.replaceChildren(el);
    back.classList.remove("out");
    layers[front].classList.replace("in", "out");
    // force a style flush so the slide-in transition runs
    void back.offsetWidth;
    back.classList.add("in");
    front = 1 - front;
    caption.style.opacity = 0;
    setTimeout(() => {
      caption.textContent = step.caption;
      caption.style.opacity = 1;
    }, 250);

    if (!step.video) return wait(step.time, token);
    // play the clip through once (it ends on the finished drawing)
    clip = el;
    el.play().catch(() => {});
    const done = await Promise.race([
      new Promise((r) => el.addEventListener("ended", () => r(true), { once: true })),
      wait(TIME.maxClip, token),
    ]);
    clip = null;
    return done && alive(token);
  }

  // preload the next project's pictures while this one plays
  function warm(i) {
    const ex = EXHIBITS[i];
    if (!ex) return;
    plan(ex, i).forEach((s) => {
      if (!s.video) new Image().src = s.src;
    });
  }

  async function showExhibit(i, token) {
    const ex = EXHIBITS[i];
    info.classList.add("fading");
    await wait(0.5, token);
    label.innerHTML = labelHTML(ex, i);
    info.classList.remove("fading");
    bar.style.width = `${((i + 1) / EXHIBITS.length) * 100}%`;
    warm(i + 1);
    for (const step of plan(ex, i)) {
      if (!(await present(step, token))) return;
    }
  }

  // ---------- the whole tour ----------

  async function tour() {
    const token = ++run;
    paused = false;
    document.body.classList.add("wt-on");
    // the tour ends on the page itself, so have every picture ready by then
    document.querySelectorAll('#gallery img[loading="lazy"]').forEach((img) => (img.loading = "eager"));
    veil.classList.remove("on");
    endCard.classList.remove("on");
    endCard.hidden = true;
    stage.hidden = false;
    void stage.offsetWidth;
    stage.classList.add("on");
    flashHint();

    let i = 0;
    while (i < EXHIBITS.length) {
      jump = null;
      await showExhibit(i, token);
      if (token !== run) return;
      if (jump !== null) {
        i = Math.max(0, Math.min(EXHIBITS.length - 1, i + jump));
        continue;
      }
      i++;
    }
    jump = null;
    await finale(token);
  }

  async function finale(token) {
    // reveal the page at the last project, then glide down to the footer
    const last = document.getElementById(`no-${pad(EXHIBITS.length)}`);
    if (last) last.scrollIntoView({ behavior: "instant", block: "start" });
    stage.classList.remove("on");
    await wait(0.8, token);
    stage.hidden = true;
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
    await wait(2.2, token);
    if (token !== run) return;
    endCard.hidden = false;
    void endCard.offsetWidth;
    veil.classList.add("on");
    endCard.classList.add("on");
    if (!LOOP) return;
    await wait(TIME.end, token);
    if (token !== run) return;
    endCard.classList.remove("on");
    veil.classList.remove("on");
    await wait(1.4, token);
    window.scrollTo({ top: 0, behavior: "instant" });
    if (token === run) tour();
  }

  function exit() {
    run++;
    paused = false;
    if (clip) clip.pause();
    stage.classList.remove("on");
    stage.hidden = true;
    endCard.classList.remove("on");
    endCard.hidden = true;
    veil.classList.remove("on");
    document.body.classList.remove("wt-on");
    layers.forEach((l) => {
      l.className = "wt-layer";
      l.replaceChildren();
    });
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  // ---------- controls ----------

  let hintTimer;
  function flashHint() {
    hint.classList.add("on");
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => hint.classList.remove("on"), 2500);
  }

  startBtn.addEventListener("click", () => {
    document.documentElement.requestFullscreen?.().catch(() => {});
    tour();
  });

  document.addEventListener("keydown", (e) => {
    if (!document.body.classList.contains("wt-on")) return;
    if (e.key === "Escape") exit();
    else if (e.key === "ArrowRight" && !stage.hidden) jump = 1;
    else if (e.key === "ArrowLeft" && !stage.hidden) jump = -1;
    else if (e.key === " ") {
      e.preventDefault();
      paused = !paused;
      if (clip) paused ? clip.pause() : clip.play().catch(() => {});
    } else return;
    flashHint();
  });
  document.addEventListener("mousemove", () => {
    if (document.body.classList.contains("wt-on")) flashHint();
  });
  // leaving fullscreen with the browser's own Esc also ends the tour
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && document.body.classList.contains("wt-on") && !LOOP) exit();
  });

  if (params.has("walkthrough")) tour();
})();
