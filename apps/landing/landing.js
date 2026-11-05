/**
 * Hero scrubber: the landing page demonstrates the product's own technique —
 * 120 progressive WebP frames drawn to a canvas as you scroll. No WebGL, no
 * video element, no library.
 */
(function () {
  var canvas = document.getElementById('scrub');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var readout = document.getElementById('frame-readout');
  var hero = document.getElementById('hero');
  var total = 120;
  var step = 4;
  // Start mid-sequence: the first frames of the gradient clip are nearly black,
  // and the hero needs visible colour before anyone scrolls.
  var firstSlot = 14;
  var cache = new Map();
  var current = -1;
  var queued = 0;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function frameNumber(slot) {
    return 1 + slot * step;
  }

  function urlFor(slot) {
    var n = String(frameNumber(slot)).padStart(4, '0');
    return 'assets/frames/frame_' + n + '.webp';
  }

  function image(slot) {
    if (cache.has(slot)) return cache.get(slot);
    var img = new Image();
    img.decoding = 'async';
    img.src = urlFor(slot);
    cache.set(slot, img);
    return img;
  }

  function draw(slot) {
    var img = image(slot);
    if (!img.complete || !img.naturalWidth) {
      img.addEventListener('load', function () { draw(slot); }, { once: true });
      return;
    }
    if (slot === current) return;
    current = slot;
    // Cover-fit so the frame fills the viewport at any aspect ratio.
    var scale = Math.max(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
    var w = img.naturalWidth * scale;
    var h = img.naturalHeight * scale;
    ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    if (readout) readout.textContent = 'frame ' + String(frameNumber(slot)).padStart(4, '0');
  }

  function preload(slot) {
    for (var i = Math.max(0, slot - 3); i <= Math.min(total - 1, slot + 6); i += 1) image(i);
  }

  function onScroll() {
    cancelAnimationFrame(queued);
    queued = requestAnimationFrame(function () {
      var rect = hero.getBoundingClientRect();
      var span = rect.height - window.innerHeight;
      var progress = span > 0 ? Math.min(1, Math.max(0, -rect.top / span)) : 0;
      var slot = Math.round(firstSlot + progress * (total - 1 - firstSlot));
      draw(slot);
      preload(slot);
    });
  }

  draw(firstSlot);
  preload(firstSlot);

  if (!reduced) {
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();
  }
})();
