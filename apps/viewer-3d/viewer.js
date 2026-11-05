/**
 * Standalone scroll-scrub viewer. No build step, no framework, no WebGL.
 * Configure the API origin once via window.OMNIGTM_API_BASE, the ?api= query
 * param, or the data-api attribute on the script tag.
 */
(function () {
  var params = new URLSearchParams(window.location.search);
  var script = document.currentScript;
  var apiBase = (
    params.get('api') ||
    (script && script.getAttribute('data-api')) ||
    window.OMNIGTM_API_BASE ||
    'http://localhost:3000'
  ).replace(/\/+$/, '');
  var slug = params.get('slug') || 'demo';
  var root = document.getElementById('root');

  function fail(message) {
    root.innerHTML = '<div class="error"><div><h1>Preview unavailable</h1><p>' + message + '</p></div></div>';
  }

  function frameUrl(index) {
    return apiBase + '/api/v1/media/frames/' + encodeURIComponent(slug) + '/frame_' + String(index).padStart(4, '0') + '.webp';
  }

  fetch(apiBase + '/api/v1/media/manifest/' + encodeURIComponent(slug))
    .then(function (res) { return res.json(); })
    .then(function (json) {
      if (!json.ok || !json.manifest) throw new Error(json.error || 'Manifest not found');
      render(json.manifest);
    })
    .catch(function (error) { fail(error.message + ' — build a preview in the dashboard first.'); });

  function render(manifest) {
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      root.innerHTML =
        '<div class="static"><img alt="Preview frame" src="' + frameUrl(1) + '" />' +
        '<div class="overlay"><h1>Scroll-reactive 3D preview</h1><p>Reduced motion enabled — showing one of ' +
        manifest.frameCount + ' frames.</p></div></div>';
      return;
    }

    root.innerHTML =
      '<div class="scroll" id="scroll"><div class="track"><div class="stage">' +
      '<canvas id="canvas" width="' + manifest.width + '" height="' + manifest.height + '"></canvas>' +
      '<div class="hint">Scroll to scrub · ' + manifest.frameCount + ' frames</div>' +
      '<div class="overlay"><h1>Scroll to move through the scene</h1><p>' + manifest.frameCount +
      ' WebP frames at ' + manifest.fps + ' FPS · zero WebGL bundle</p></div>' +
      '</div></div></div><div class="rail"><span id="rail"></span></div>';

    var canvas = document.getElementById('canvas');
    var ctx = canvas.getContext('2d');
    var scroll = document.getElementById('scroll');
    var rail = document.getElementById('rail');
    var cache = new Map();
    var current = -1;
    var queued = 0;

    function image(index) {
      if (cache.has(index)) return cache.get(index);
      var img = new Image();
      img.decoding = 'async';
      img.src = frameUrl(index);
      cache.set(index, img);
      return img;
    }

    function draw(index) {
      var img = image(index);
      if (!img.complete) {
        img.addEventListener('load', function () { draw(index); }, { once: true });
        return;
      }
      if (index === current) return;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      current = index;
    }

    function preload(index) {
      for (var offset = -12; offset <= 24; offset += 1) {
        var target = index + offset;
        if (target >= 1 && target <= manifest.frameCount) image(target);
      }
      if (cache.size > 160) {
        var keep = new Set();
        for (var i = -12; i <= 24; i += 1) keep.add(index + i);
        cache.forEach(function (_value, key) { if (!keep.has(key)) cache.delete(key); });
      }
    }

    function onScroll() {
      cancelAnimationFrame(queued);
      queued = requestAnimationFrame(function () {
        var max = scroll.scrollHeight - scroll.clientHeight;
        var progress = max > 0 ? Math.min(1, Math.max(0, scroll.scrollTop / max)) : 0;
        var index = 1 + Math.round(progress * (manifest.frameCount - 1));
        draw(index);
        preload(index);
        rail.style.height = Math.round(progress * 100) + '%';
      });
    }

    draw(1);
    preload(1);
    scroll.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
})();
