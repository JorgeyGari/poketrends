/**
 * Statistics Panel Component
 */
export class StatsPanel {
  constructor() {
    this.container = null;
  }

  mount(selector) {
    this.container = document.querySelector(selector);
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="stats-panel">
        <div class="stat-item">
          <span class="stat-label">Racha</span>
          <span class="stat-value" id="stat-streak">0</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Mejor</span>
          <span class="stat-value" id="stat-best">0</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Ronda</span>
          <span class="stat-value" id="stat-round">1</span>
        </div>
      </div>
    `;
  }

  update(stats) {
    document.getElementById('stat-streak').textContent = stats.currentStreak;
    document.getElementById('stat-best').textContent = stats.bestStreak;
    document.getElementById('stat-round').textContent = stats.round;
  }
}
