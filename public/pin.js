(function () {
  var KEY = 'gosmile-leads-unlocked';
  var PIN = '2000';
  var lockEl = document.getElementById('lock');
  var pin = document.getElementById('pin');
  var boxes = [].slice.call(document.querySelectorAll('.pin-box'));
  var pinErr = document.getElementById('pin-err');
  var form = document.getElementById('pin-form');
  if (!lockEl || !pin || !form) return;

  function unlocked() {
    try {
      return sessionStorage.getItem(KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function showApp() {
    document.documentElement.classList.add('is-unlocked');
    lockEl.hidden = true;
    lockEl.style.display = 'none';
    window.dispatchEvent(new Event('gosmile-unlocked'));
  }

  function paintBoxes() {
    var v = String(pin.value || '').replace(/\D/g, '').slice(0, 4);
    pin.value = v;
    boxes.forEach(function (b, i) {
      b.textContent = v[i] ? '•' : '';
      b.className = 'pin-box' + (i === Math.min(v.length, 3) ? ' on' : '');
    });
    if (v.length === 4) tryPin();
  }

  function tryPin() {
    if (pin.value === PIN) {
      if (pinErr) pinErr.textContent = '';
      try {
        sessionStorage.setItem(KEY, '1');
      } catch (e) {}
      showApp();
      return;
    }
    if (pinErr) pinErr.textContent = 'PIN incorrecto';
    pin.value = '';
    paintBoxes();
    pin.focus();
  }

  if (unlocked()) {
    showApp();
    return;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    tryPin();
  });
  pin.addEventListener('input', paintBoxes);
  document.getElementById('boxes').addEventListener('click', function () {
    pin.focus();
  });
  lockEl.addEventListener('click', function () {
    if (!lockEl.hidden) pin.focus();
  });
  paintBoxes();
  setTimeout(function () {
    pin.focus();
  }, 80);
})();
