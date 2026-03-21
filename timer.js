let timerInterval = null;

export const GoTimer = {
  init(timerSeconds, minutes) {
    const secs = (minutes || 10) * 60;
    timerSeconds[1] = secs;
    timerSeconds[2] = secs;
    GoTimer.updateDisplay(timerSeconds);
  },

  start(timerSeconds, getCurrentPlayer, onTimeout) {
    GoTimer.stop();
    timerInterval = setInterval(() => {
      const player = getCurrentPlayer();
      timerSeconds[player]--;
      GoTimer.updateDisplay(timerSeconds);
      if (timerSeconds[player] <= 0) {
        timerSeconds[player] = 0;
        GoTimer.updateDisplay(timerSeconds);
        GoTimer.stop();
        onTimeout(player);
      }
    }, 1000);
  },

  switch(timerSeconds, getCurrentPlayer, onTimeout) {
    GoTimer.stop();
    GoTimer.start(timerSeconds, getCurrentPlayer, onTimeout);
  },

  stop() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  },

  updateDisplay(timerSeconds) {
    const bEl = document.getElementById('blackTimer');
    const wEl = document.getElementById('whiteTimer');
    if (!bEl || !wEl) return;
    bEl.textContent = GoTimer.formatTime(timerSeconds[1]);
    wEl.textContent = GoTimer.formatTime(timerSeconds[2]);
    bEl.classList.toggle('urgent', timerSeconds[1] < 60);
    wEl.classList.toggle('urgent', timerSeconds[2] < 60);
  },

  /** Pure: convert seconds to "MM:SS" string. */
  formatTime(s) {
    return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
  }
};
