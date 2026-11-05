// Radio Tiles music. The theme is the track named in data-track on the script tag (House – July by Easy_Eva);
// each station tile on the page passes its own genre track (all from Pixabay, Pixabay Content License).
// Without data-track it falls back to an upbeat loop synthesized live with Web Audio.
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
  var me = document.currentScript || document.querySelector('script[src*="beat.js"]');
  var TRACK = me && me.getAttribute("data-track");   // e.g. "assets/theme.mp3"
  // Tempo of the track, measured offline: the heart beats on this grid, in sync with audio.currentTime.
  var TRACK_BPM = me && +me.getAttribute("data-bpm") || 0, TRACK_OFFSET = me && +me.getAttribute("data-offset") || 0;
  // The site theme (House – July) plays from the play buttons and the hearts; station tiles bring their own tracks.
  var THEME = TRACK ? { src: TRACK, bpm: TRACK_BPM, offset: TRACK_OFFSET } : null;
  var current = null, players = {}, beatClock = null, lastBeat = -1;
  var playing = false, step = 0, loop = 0, nextTime = 0;
  // Every beating heart on the page (the one in "Try it" and the one at the bottom).
  var stages = Array.prototype.slice.call(document.querySelectorAll(".beat-stage"));
  var stage = stages[0] || null;
  var bars = document.querySelectorAll(".beat-stage .bars rect");
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
    if (!stages.length) return;
    var wait = Math.max(0, (t - ctx.currentTime) * 1000);
    setTimeout(function () {
      if (!playing) return;
      stages.forEach(function (st) {
        st.classList.remove("kick"); void st.offsetWidth; st.classList.add("kick");
        var ring = document.createElement("span");
        ring.className = "ring live";
        st.appendChild(ring);
        setTimeout(function () { ring.remove(); }, 1300);
      });
    }, wait);
  }

  function player(track) {
    if (!players[track.src]) {
      var el = new Audio(track.src); el.loop = true; el.crossOrigin = "anonymous"; el.preload = "auto";
      var node = ctx.createMediaElementSource(el); node.connect(master);
      players[track.src] = { audio: el, node: node };
    }
    return players[track.src].audio;
  }

  // With a real song there is no sequencer: a clock reads the song's position and pulses on every beat.
  function startBeatClock() {
    clearInterval(beatClock); lastBeat = -1;
    if (!current || !current.bpm) return;
    var period = 60 / current.bpm, el = player(current), off = current.offset || 0;
    beatClock = setInterval(function () {
      if (el.paused) return;
      var t = el.currentTime - off;
      var beat = t < 0 ? -1 : Math.floor(t / period);
      if (beat !== lastBeat) { lastBeat = beat; if (beat >= 0) pulseAt(ctx.currentTime); }
    }, 15);
  }

  // A short burst of radio static between stations, like turning the dial.
  function tuneStatic() {
    var t = ctx.currentTime;
    noiseHit(t, "bandpass", 2600, 0.6, 0.12, 0.26);
    noiseHit(t + 0.05, "highpass", 5000, 0.7, 0.05, 0.2);
  }

  // Station tiles "join the broadcast" somewhere in the middle of the song, like real radio.
  function playTrack(track) {
    var el = player(track);
    function go() {
      if (track.live && isFinite(el.duration) && el.duration > 8) el.currentTime = Math.random() * (el.duration - 6);
      else if (!track.live) el.currentTime = 0;
      el.play().then(startBeatClock).catch(function () { stop(); });
    }
    if (el.readyState >= 1) go(); else el.addEventListener("loadedmetadata", go, { once: true });
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
    document.dispatchEvent(new CustomEvent("radiotiles:music", { detail: { playing: on } }));
  }

  // start() plays the theme; start(track) plays a station's track, switching with a burst of static if music is on.
  function start(track) {
    track = track || THEME;
    if (!ctx) setup();
    ctx.resume();
    if (playing && track && current && current.src === track.src) return;
    if (playing && track) {
      if (current) player(current).pause();
      tuneStatic();
      current = track;
      playTrack(track);
      return;
    }
    if (playing) return;
    playing = true; step = 0; loop = 0; nextTime = ctx.currentTime + 0.08;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.gain.exponentialRampToValueAtTime(track ? 0.7 : 0.5, ctx.currentTime + 0.5);
    if (track) {
      current = track;
      playTrack(track);
    } else {
      timer = setInterval(tick, 25); tick();
    }
    drawBars();
    setUI(true);
  }

  function stop() {
    if (!playing) return;
    playing = false;
    clearInterval(timer); clearInterval(beatClock); cancelAnimationFrame(raf);
    var now = ctx.currentTime, was = current;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), now);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    setTimeout(function () {
      if (was && (!playing || current !== was)) player(was).pause();   // never leave two stations playing
      if (!playing) ctx.suspend();
    }, 450);
    current = null;
    Array.prototype.forEach.call(bars, function (r) { r.style.transform = ""; });
    stages.forEach(function (st) { st.classList.remove("kick"); });
    setUI(false);
  }

  toggles.forEach(function (b) {
    b.addEventListener("click", function () { playing ? stop() : start(); });
  });
  // Tapping the heart works too.
  stages.forEach(function (st) {
    st.setAttribute("role", "button");
    st.setAttribute("tabindex", "0");
    st.setAttribute("aria-label", "Play or pause the music");
    st.addEventListener("click", function () { playing ? stop() : start(); });
    st.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); playing ? stop() : start(); }
    });
  });
  window.RadioTilesMusic = {
    start: start, stop: stop,
    isPlaying: function () { return playing; },
    nowPlaying: function () { return current && current.src; }
  };

  // Pause when the tab goes to the background.
  document.addEventListener("visibilitychange", function () { if (document.hidden && playing) stop(); });
})();
