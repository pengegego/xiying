/* ============================================
   开屏轮播交互 Splash Carousel
   自动播放 · 箭头 · 圆点 · 触摸滑动 · 关闭进入首页
   ============================================ */
(function () {
  var splash = document.getElementById('splash');
  if (!splash) return;

  var track = document.getElementById('splashTrack');
  var dotsWrap = document.getElementById('splashDots');
  var btnPrev = document.getElementById('splashPrev');
  var btnNext = document.getElementById('splashNext');
  var btnClose = document.getElementById('splashClose');
  var btnEnter = document.getElementById('splashEnter');

  var slides = track ? track.querySelectorAll('.splash-slide') : [];
  var total = slides.length;
  if (total === 0) { splash.remove(); return; }

  var index = 0;
  var timer = null;
  var AUTOPLAY_MS = 3500;

  // 锁滚动
  document.body.style.overflow = 'hidden';

  // 生成圆点
  var dots = [];
  if (dotsWrap) {
    for (var i = 0; i < total; i++) {
      var d = document.createElement('button');
      d.className = 'splash-dot' + (i === 0 ? ' active' : '');
      d.setAttribute('aria-label', '第 ' + (i + 1) + ' 张');
      (function (idx) {
        d.addEventListener('click', function () { goTo(idx); restartAuto(); });
      })(i);
      dotsWrap.appendChild(d);
      dots.push(d);
    }
  }

  function render() {
    track.style.transform = 'translateX(' + (-index * 100) + '%)';
    for (var i = 0; i < dots.length; i++) {
      dots[i].classList.toggle('active', i === index);
    }
  }

  function goTo(i) {
    index = (i + total) % total;
    render();
  }
  function next() { goTo(index + 1); }
  function prev() { goTo(index - 1); }

  function startAuto() {
    stopAuto();
    timer = setInterval(next, AUTOPLAY_MS);
  }
  function stopAuto() {
    if (timer) { clearInterval(timer); timer = null; }
  }
  function restartAuto() {
    if (!splash.classList.contains('is-hidden')) startAuto();
  }

  // 按钮
  if (btnNext) btnNext.addEventListener('click', function () { next(); restartAuto(); });
  if (btnPrev) btnPrev.addEventListener('click', function () { prev(); restartAuto(); });

  // 鼠标悬停暂停
  splash.addEventListener('mouseenter', stopAuto);
  splash.addEventListener('mouseleave', restartAuto);

  // 触摸滑动
  var touchStartX = 0, touchStartY = 0, touching = false;
  track.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touching = true;
    stopAuto();
  }, { passive: true });

  track.addEventListener('touchend', function (e) {
    if (!touching) return;
    touching = false;
    var t = e.changedTouches[0];
    var dx = t.clientX - touchStartX;
    var dy = t.clientY - touchStartY;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) next(); else prev();
    }
    restartAuto();
  }, { passive: true });

  // 键盘
  document.addEventListener('keydown', function (e) {
    if (splash.classList.contains('is-hidden')) return;
    if (e.key === 'ArrowLeft') { prev(); restartAuto(); }
    else if (e.key === 'ArrowRight') { next(); restartAuto(); }
    else if (e.key === 'Escape') { closeSplash(); }
  });

  // 关闭
  function closeSplash() {
    stopAuto();
    splash.classList.add('is-hidden');
    document.body.style.overflow = '';
    // 动画结束后从 DOM 移除，避免遮挡
    setTimeout(function () {
      if (splash && splash.parentNode) splash.parentNode.removeChild(splash);
    }, 550);
  }
  if (btnClose) btnClose.addEventListener('click', closeSplash);
  if (btnEnter) btnEnter.addEventListener('click', closeSplash);

  // 初始化
  render();
  startAuto();
})();
