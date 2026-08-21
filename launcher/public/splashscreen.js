// Splash progress bridge. The splash is a static page outside the React
// bundle, so it talks to the Tauri runtime directly through the injected
// internals instead of @tauri-apps/api. It keeps the bar indeterminate until
// the backend reports a real milestone, then switches to a smooth determinate
// fill. Progress never moves backwards.
/* global window, document */
(function () {
  "use strict";

  var internals = window.__TAURI_INTERNALS__;
  var fillEl = document.getElementById("splash-fill");
  var statusEl = document.getElementById("splash-status");
  var maxProgress = 0;

  function invoke(cmd, args) {
    if (!internals || typeof internals.invoke !== "function") {
      return Promise.reject(new Error("Tauri runtime is unavailable"));
    }
    return internals.invoke(cmd, args || {});
  }

  function applyProgress(progress, label) {
    var pct = Math.max(0, Math.min(1, Number(progress) || 0));
    if (pct < maxProgress) {
      pct = maxProgress;
    }
    maxProgress = pct;

    if (fillEl) {
      fillEl.classList.remove("indeterminate");
      fillEl.style.width = (pct * 100).toFixed(1) + "%";
    }
    if (statusEl && label) {
      statusEl.textContent = label;
    }
  }

  // Browser preview or a runtime that did not inject internals: leave the
  // indeterminate animation running untouched.
  if (!internals || typeof internals.invoke !== "function") {
    return;
  }

  // Live updates pushed from the backend.
  try {
    var handler = internals.transformCallback(function (eventData) {
      var payload = eventData && eventData.payload;
      if (payload && typeof payload.progress === "number") {
        applyProgress(payload.progress, payload.label);
      }
    });
    invoke("plugin:event|listen", {
      event: "splash-progress",
      target: { kind: "Any" },
      handler: handler,
    }).catch(function () {});
  } catch {
    // Ignore: the poll below still covers the first milestone.
  }

  // Poll once for progress reported before this listener attached (the
  // backend can finish initialising before the splash HTML is ready).
  invoke("get_startup_progress", {})
    .then(function (snapshot) {
      if (snapshot && typeof snapshot.progress === "number" && snapshot.progress > 0) {
        applyProgress(snapshot.progress, snapshot.label);
      }
    })
    .catch(function () {});
})();
