// Radio Tiles Theme: upbeat loop synthesized live with Web Audio — no audio files, no licensing.
// Nothing plays until the visitor presses play. The tile heart beats on every kick drum.
(function () {
  "use strict";
  var AudioCtx = window.AudioContext || window.webkitAudioContext;
  var toggles = document.querySelectorAll(".sound-toggle");
  if (!AudioCtx) { toggles.forEach(function (b) { b.hidden = true; }); return; }

  var BPM = 122, STEP = 60 / BPM / 4;            // 16th notes
  // I–V–vi–IV in D major: D, A/C#, Bm, G.
  var CHORDS = [[62, 66, 69], [61, 64, 69], [59, 62, 66], [59, 62, 67]];
  var ROOTS = [38, 45, 47, 43];
  var LEAD = [74, 73, 71, 69, 71, 73, 74, 76, 78, 76, 74, 73, 71, 69, 66, 69];

  var ctx, master, analyser, delay, noise, timer, raf;
  var playing = false, step = 0, loop = 0, nextTime = 0;
  var stage = document.getElementById("beat-stage");
  var bars = stage ? stage.querySelectorAll(".bars rect") : [];
  var floatPill = document.getElementById("np-float");
  var freq = null;

  function mtof(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  function setup(existing) {
    ctx = existing || new AudioCtx();
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master = ctx.createGain(); master.gain.value = 0;
    analyser = ctx.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.7;
    master.connect(comp); comp.connect(analyser); analyser.connect(ctx.destination);
    freq = new Uint8Array(analyser.frequencyBinCount);

    // Dotted-eighth echo for chords and the lead line.
    delay = ctx.createDelay(1); delay.delayTime.value = STEP * 3;
    var fb = ctx.createGain(); fb.gain.value = 0.32;
    var wet = ctx.createGain(); wet.gain.value = 0.22;
    var tone = ctx.createBiquadFilter(); tone.type = "lowpass"; tone.frequency.value = 3200;
    delay.connect(tone); tone.connect(fb); fb.connect(delay); tone.connect(wet); wet.connect(master);

    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    var data = noise.getChannelData(0);
    for (var i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  function env(g, t, peak, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  }

  function kick(t) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(155, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.13);
    env(g, t, 0.95, 0.34);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.4);
    pulseAt(t);
  }

  function noiseHit(t, type, f, q, peak, decay) {
    var s = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; flt.type = type; flt.frequency.value = f; flt.Q.value = q;
    env(g, t, peak, decay);
    s.connect(flt); flt.connect(g); g.connect(master); s.start(t); s.stop(t + decay + 0.05);
  }

  function clap(t) {
    noiseHit(t, "bandpass", 1700, 0.9, 0.42, 0.16);
    noiseHit(t + 0.012, "bandpass", 1500, 0.9, 0.3, 0.12);
  }

  function bass(t, n, dur) {
    var o = ctx.createOscillator(), flt = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = "sawtooth"; o.frequency.value = mtof(n);
    flt.type = "lowpass"; flt.Q.value = 7;
    flt.frequency.setValueAtTime(1100, t); flt.frequency.exponentialRampToValueAtTime(260, t + dur);
    env(g, t, 0.3, dur);
    o.connect(flt); flt.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }

  function stab(t, notes, peak) {
    var flt = ctx.createBiquadFilter(), g = ctx.createGain();
    flt.type = "lowpass"; flt.Q.value = 3;
    flt.frequency.setValueAtTime(2600, t); flt.frequency.exponentialRampToValueAtTime(700, t + 0.28);
    env(g, t, peak, 0.32);
    flt.connect(g); g.connect(master); g.connect(delay);
    notes.forEach(function (n) {
      [-8, 8].forEach(function (cents) {
        var o = ctx.createOscillator();
        o.type = "sawtooth"; o.frequency.value = mtof(n); o.detune.value = cents;
        o.connect(flt); o.start(t); o.stop(t + 0.36);
      });
    });
  }

  function lead(t, n) {
    var o = ctx.createOscillator(), flt = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = "square"; o.frequency.value = mtof(n);
    flt.type = "lowpass"; flt.frequency.value = 2400;
    env(g, t, 0.06, 0.16);
    o.connect(flt); flt.connect(g); g.connect(master); g.connect(delay); o.start(t); o.stop(t + 0.2);
  }

  // One 16th step. A 4-bar loop; the lead line joins from the second loop on for a little lift.
  function schedule(s, t) {
    var bar = Math.floor(s / 16) % 4, st = s % 16;
    if (st % 4 === 0) kick(t);
    if (st === 4 || st === 12) clap(t);
    if (st % 4 === 2) noiseHit(t, "highpass", 7500, 0.7, 0.22, 0.05);
    else if (st % 2 === 1) noiseHit(t, "highpass", 9000, 0.7, 0.07, 0.03);
    if (st % 4 === 2) bass(t, ROOTS[bar], STEP * 1.6);
    if (st === 7 || st === 15) bass(t, ROOTS[bar] + 12, STEP * 0.9);
    if (st === 0 || st === 6 || st === 10) stab(t, CHORDS[bar], st === 0 ? 0.085 : 0.06);
    if (loop > 0 && st % 2 === 0) lead(t, LEAD[(st / 2 + bar * 8) % LEAD.length]);
  }

  function tick() {
    while (nextTime < ctx.currentTime + 0.12) {
      schedule(step, nextTime);
      nextTime += STEP;
      step++;
      if (step % 64 === 0) loop++;
    }
  }

  // Visuals: heart bumps and a ripple leaves it on every kick.
  function pulseAt(t) {
    if (!stage) return;
    var wait = Math.max(0, (t - ctx.currentTime) * 1000);
    setTimeout(function () {
      if (!playing) return;
      stage.classList.remove("kick"); void stage.offsetWidth; stage.classList.add("kick");
      var ring = document.createElement("span");
      ring.className = "ring live";
      stage.appendChild(ring);
      setTimeout(function () { ring.remove(); }, 1300);
    }, wait);
  }

  function drawBars() {
    analyser.getByteFrequencyData(freq);
    var bands = [2, 4, 7, 11, 16, 24];
    for (var i = 0; i < bars.length; i++) {
      var v = freq[bands[i % bands.length]] / 255;
      bars[i].style.transform = "scaleY(" + (0.35 + v * 0.9).toFixed(3) + ")";
    }
    raf = requestAnimationFrame(drawBars);
  }

  function setUI(on) {
    document.body.classList.toggle("music-on", on);
    toggles.forEach(function (b) {
      b.setAttribute("aria-pressed", on ? "true" : "false");
      if (b.classList.contains("sound-nav") || b.closest(".np-float")) b.setAttribute("aria-label", on ? "Pause music" : "Play music");
      var label = b.querySelector(".label");
      if (label) label.textContent = on ? "Pause" : "Play the vibe";
    });
    if (floatPill) floatPill.classList.toggle("show", on);
  }

  function start() {
    if (!ctx) setup();
    ctx.resume();
    playing = true; step = 0; loop = 0; nextTime = ctx.currentTime + 0.08;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 0.5);
    timer = setInterval(tick, 25); tick();
    drawBars();
    setUI(true);
  }

  function stop() {
    playing = false;
    clearInterval(timer); cancelAnimationFrame(raf);
    var now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), now);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    setTimeout(function () { if (!playing) ctx.suspend(); }, 450);
    Array.prototype.forEach.call(bars, function (r) { r.style.transform = ""; });
    if (stage) stage.classList.remove("kick");
    setUI(false);
  }

  toggles.forEach(function (b) {
    b.addEventListener("click", function () { playing ? stop() : start(); });
  });
  // Tapping the heart works too.
  if (stage) {
    stage.setAttribute("role", "button");
    stage.setAttribute("tabindex", "0");
    stage.setAttribute("aria-label", "Play or pause the Radio Tiles theme");
    stage.addEventListener("click", function () { playing ? stop() : start(); });
    stage.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); playing ? stop() : start(); }
    });
  }
  // Pause when the tab goes to the background.
  document.addEventListener("visibilitychange", function () { if (document.hidden && playing) stop(); });
})();
