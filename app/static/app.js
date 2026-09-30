(() => {
  const els = {
    interval: document.getElementById("interval"),
    toggle: document.getElementById("toggle"),
    reset: document.getElementById("reset"),
    runState: document.getElementById("run-state"),
    total: document.getElementById("total"),
    ok: document.getElementById("ok"),
    fail: document.getElementById("fail"),
    latency: document.getElementById("latency"),
    downtime: document.getElementById("downtime"),
    pod: document.getElementById("pod"),
    lastResponse: document.getElementById("last-response"),
    lastError: document.getElementById("last-error"),
    downtimeList: document.getElementById("downtime-list"),
    chart: document.getElementById("chart"),
  };

  const state = {
    running: true,
    timer: null,
    total: 0,
    ok: 0,
    fail: 0,
    downtimeMs: 0,
    outageStart: null,
    outages: [],
    latencies: [],
    inFlight: false,
  };

  const MAX_POINTS = 60;

  function setRunning(running) {
    state.running = running;
    els.toggle.textContent = running ? "Pausar" : "Reanudar";
    els.runState.textContent = running ? "corriendo" : "pausado";
    els.runState.className = `pill ${running ? "running" : "paused"}`;
    if (running) {
      scheduleNext(0);
    } else if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
  }

  function scheduleNext(delayMs) {
    if (state.timer) clearTimeout(state.timer);
    if (!state.running) return;
    state.timer = setTimeout(tick, delayMs);
  }

  function intervalMs() {
    const raw = Number(els.interval.value);
    if (!Number.isFinite(raw) || raw < 100) return window.PROBE_DEFAULT_INTERVAL_MS || 750;
    return raw;
  }

  async function tick() {
    if (!state.running || state.inFlight) {
      scheduleNext(intervalMs());
      return;
    }

    state.inFlight = true;
    const clientStart = performance.now();
    try {
      const res = await fetch("/api/query", {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const data = await res.json();
      const clientLatency = Math.round(performance.now() - clientStart);
      handleResult(data, res.ok && data.ok, clientLatency);
    } catch (err) {
      handleResult(
        {
          ok: false,
          pod: els.pod.textContent,
          ts: new Date().toISOString(),
          latency_ms: null,
          error: String(err),
        },
        false,
        Math.round(performance.now() - clientStart)
      );
    } finally {
      state.inFlight = false;
      scheduleNext(intervalMs());
    }
  }

  function handleResult(data, ok, clientLatency) {
    state.total += 1;
    els.total.textContent = String(state.total);

    if (data.pod) {
      els.pod.textContent = data.pod;
    }

    if (ok) {
      state.ok += 1;
      els.ok.textContent = String(state.ok);
      const latency = data.latency_ms != null ? data.latency_ms : clientLatency;
      els.latency.textContent = `${latency} ms`;
      pushLatency(latency, true);
      closeOutageIfNeeded();
      els.lastError.textContent = "Ninguno";
      els.lastError.classList.add("muted");
      els.lastResponse.textContent = JSON.stringify(data, null, 2);
    } else {
      state.fail += 1;
      els.fail.textContent = String(state.fail);
      els.latency.textContent = `${clientLatency} ms*`;
      pushLatency(clientLatency, false);
      openOutageIfNeeded();
      els.lastError.textContent = data.error || `HTTP error (${data.ts || "sin ts"})`;
      els.lastError.classList.remove("muted");
      els.lastResponse.textContent = JSON.stringify(data, null, 2);
    }

    renderDowntime();
    drawChart();
  }

  function openOutageIfNeeded() {
    if (state.outageStart == null) {
      state.outageStart = Date.now();
    }
  }

  function closeOutageIfNeeded() {
    if (state.outageStart == null) return;
    const ended = Date.now();
    const duration = ended - state.outageStart;
    state.downtimeMs += duration;
    state.outages.unshift({
      start: new Date(state.outageStart).toISOString(),
      end: new Date(ended).toISOString(),
      durationMs: duration,
    });
    if (state.outages.length > 20) state.outages.pop();
    state.outageStart = null;
  }

  function renderDowntime() {
    let live = state.downtimeMs;
    if (state.outageStart != null) {
      live += Date.now() - state.outageStart;
    }
    els.downtime.textContent = `${(live / 1000).toFixed(2)} s`;

    if (!state.outages.length && state.outageStart == null) {
      els.downtimeList.innerHTML = '<li class="muted">Sin downtime registrado</li>';
      return;
    }

    const items = [];
    if (state.outageStart != null) {
      const ongoing = Date.now() - state.outageStart;
      items.push(
        `<li>EN CURSO · ${(ongoing / 1000).toFixed(2)} s · desde ${new Date(state.outageStart).toISOString()}</li>`
      );
    }
    for (const o of state.outages) {
      items.push(
        `<li>${(o.durationMs / 1000).toFixed(2)} s · ${o.start} → ${o.end}</li>`
      );
    }
    els.downtimeList.innerHTML = items.join("");
  }

  function pushLatency(value, ok) {
    state.latencies.push({ value, ok });
    if (state.latencies.length > MAX_POINTS) state.latencies.shift();
  }

  function drawChart() {
    const canvas = els.chart;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth || 640;
    const cssHeight = 160;
    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(cssHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    ctx.strokeStyle = "rgba(232,242,238,0.12)";
    ctx.beginPath();
    ctx.moveTo(0, cssHeight - 0.5);
    ctx.lineTo(cssWidth, cssHeight - 0.5);
    ctx.stroke();

    if (!state.latencies.length) return;

    const max = Math.max(50, ...state.latencies.map((p) => p.value));
    const step = cssWidth / Math.max(MAX_POINTS - 1, 1);

    ctx.beginPath();
    state.latencies.forEach((p, i) => {
      const x = i * step;
      const y = cssHeight - (p.value / max) * (cssHeight - 12) - 6;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "#3dcf8e";
    ctx.lineWidth = 2;
    ctx.stroke();

    state.latencies.forEach((p, i) => {
      if (p.ok) return;
      const x = i * step;
      const y = cssHeight - (p.value / max) * (cssHeight - 12) - 6;
      ctx.fillStyle = "#ff6b6b";
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function resetMetrics() {
    state.total = 0;
    state.ok = 0;
    state.fail = 0;
    state.downtimeMs = 0;
    state.outageStart = null;
    state.outages = [];
    state.latencies = [];
    els.total.textContent = "0";
    els.ok.textContent = "0";
    els.fail.textContent = "0";
    els.latency.textContent = "—";
    els.downtime.textContent = "0.00 s";
    els.lastResponse.textContent = "Métricas reiniciadas";
    els.lastError.textContent = "Ninguno";
    els.lastError.classList.add("muted");
    renderDowntime();
    drawChart();
  }

  els.toggle.addEventListener("click", () => setRunning(!state.running));
  els.reset.addEventListener("click", resetMetrics);
  els.interval.addEventListener("change", () => {
    if (state.running) scheduleNext(0);
  });

  window.addEventListener("resize", drawChart);
  setInterval(renderDowntime, 250);

  els.runState.className = "pill running";
  drawChart();
  setRunning(true);
})();
