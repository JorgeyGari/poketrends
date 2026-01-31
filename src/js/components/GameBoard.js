/**
 * Game Board Component
 * Displays two Pokemon cards for comparison
 */
export class GameBoard {
  constructor() {
    this.container = null;
    this.leftCard = null;
    this.rightCard = null;
    this.guessCallback = null;
  }

  mount(selector) {
    this.container = document.querySelector(selector);
    this.render();
    this.attachEventListeners();
  }

  render() {
    this.container.innerHTML = `
      <div class="game-board">
        <div class="loading-overlay" id="loading">
          <div class="spinner"></div>
          <p>Cargando...</p>
        </div>

        <div class="pokemon-cards">
          <div class="pokemon-card" id="card-left" data-side="left">
            <div class="pokemon-sprite">
              <img id="sprite-left" alt="" />
            </div>
            <h2 class="pokemon-name" id="name-left"></h2>
            <div class="pokemon-gen" id="gen-left"></div>
            <div class="popularity-score hidden" id="score-left">
              <span class="score-label">Búsquedas estimadas</span>
              <div class="score-main">
                <span class="score-value"></span>
              </div>
              <div class="score-sub">
                <span class="score-sub-label">Popularidad:</span>
                <span class="score-avg"></span>
              </div>
            </div>
          </div>

          <div class="vs-divider">
            <span>VS</span>
          </div>

          <div class="pokemon-card" id="card-right" data-side="right">
            <div class="pokemon-sprite">
              <img id="sprite-right" alt="" />
            </div>
            <h2 class="pokemon-name" id="name-right"></h2>
            <div class="pokemon-gen" id="gen-right"></div>
            <div class="popularity-score hidden" id="score-right">
              <span class="score-label">Búsquedas estimadas</span>
              <div class="score-main">
                <span class="score-value"></span>
              </div>
              <div class="score-sub">
                <span class="score-sub-label">Popularidad:</span>
                <span class="score-avg"></span>
              </div>
            </div>
          </div>
        </div>

        <p class="instruction">Haz clic en el Pokémon más popular</p>
      </div>
    `;

    this.leftCard = this.container.querySelector('#card-left');
    this.rightCard = this.container.querySelector('#card-right');
  }

  attachEventListeners() {
    this.leftCard.addEventListener('click', () => this.handleClick('left'));
    this.rightCard.addEventListener('click', () => this.handleClick('right'));
  }

  handleClick(side) {
    if (this.guessCallback && !this.leftCard.classList.contains('disabled')) {
      this.guessCallback(side);
    }
  }

  setPokemon(pokemon1, pokemon2, options = {}) {
    // Left Pokemon
    document.getElementById('sprite-left').src = pokemon1.sprite;
    document.getElementById('sprite-left').alt = pokemon1.name;
    document.getElementById('name-left').textContent = pokemon1.getDisplayName();
    document.getElementById('gen-left').textContent = `Gen ${pokemon1.generation}`;

    // Right Pokemon
    document.getElementById('sprite-right').src = pokemon2.sprite;
    document.getElementById('sprite-right').alt = pokemon2.name;
    document.getElementById('name-right').textContent = pokemon2.getDisplayName();
    document.getElementById('gen-right').textContent = `Gen ${pokemon2.generation}`;

    const preserveLeft = !!options.preserveLeft;
    const preserveRight = !!options.preserveRight;

    this.resetCards(preserveLeft, preserveRight, pokemon1, pokemon2);
  }

  revealScores(pokemon1, pokemon2) {
    const leftValueEl = document.querySelector('#score-left .score-value');
    const rightValueEl = document.querySelector('#score-right .score-value');
    const leftAvgEl = document.querySelector('#score-left .score-avg');
    const rightAvgEl = document.querySelector('#score-right .score-avg');

    // Use exact raw timeline sum if available; otherwise fall back to the numeric score
    // Use estimatedSearches as the big displayed number (exact counts)
    const leftTarget = (typeof pokemon1.estimatedSearches === 'number' && pokemon1.estimatedSearches != null)
      ? pokemon1.estimatedSearches
      : (typeof pokemon1.timelineSum === 'number' ? pokemon1.timelineSum : Math.round(pokemon1.popularityScore || 0));
    const rightTarget = (typeof pokemon2.estimatedSearches === 'number' && pokemon2.estimatedSearches != null)
      ? pokemon2.estimatedSearches
      : (typeof pokemon2.timelineSum === 'number' ? pokemon2.timelineSum : Math.round(pokemon2.popularityScore || 0));

    // (tooltip removed) show timelineSum as part of the UI via labels if needed

    // Animate main count (integers) and avgScore below (2-decimal)
    // If a pokemon was preserved from previous round, show static values (no animation)
    const leftPreserved = !!pokemon1 && !!pokemon1.keepRevealed;
    const rightPreserved = !!pokemon2 && !!pokemon2.keepRevealed;

    if (leftPreserved) {
      leftValueEl.textContent = this.formatNumber(leftTarget, 0);
    } else {
      this.animateCount(leftValueEl, leftTarget, 900, 0);
    }

    if (rightPreserved) {
      rightValueEl.textContent = this.formatNumber(rightTarget, 0);
    } else {
      this.animateCount(rightValueEl, rightTarget, 900, 0);
    }

    const leftAvg = (pokemon1.avgScore != null) ? Number(pokemon1.avgScore) : null;
    const rightAvg = (pokemon2.avgScore != null) ? Number(pokemon2.avgScore) : null;
    if (leftAvgEl) {
      if (leftAvg != null) {
        if (leftPreserved) leftAvgEl.textContent = this.formatNumber(leftAvg, 2);
        else this.animateCount(leftAvgEl, leftAvg, 700, 2);
      } else leftAvgEl.textContent = '';
    }
    if (rightAvgEl) {
      if (rightAvg != null) {
        if (rightPreserved) rightAvgEl.textContent = this.formatNumber(rightAvg, 2);
        else this.animateCount(rightAvgEl, rightAvg, 700, 2);
      } else rightAvgEl.textContent = '';
    }

    document.getElementById('score-left').classList.remove('hidden');
    document.getElementById('score-right').classList.remove('hidden');

    // Clear transient preserve flags now that we've revealed the values
    if (pokemon1 && pokemon1.keepRevealed) delete pokemon1.keepRevealed;
    if (pokemon2 && pokemon2.keepRevealed) delete pokemon2.keepRevealed;
  }

  // Simple formatting helper
  formatNumber(n, decimals = 0) {
    if (typeof n !== 'number') return '';
    return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  // Count-up animation using requestAnimationFrame (supports decimals)
  animateCount(el, target, duration = 800, decimals = 0) {
    if (!el) return;
    const start = 0;
    const startTime = performance.now();
    const that = this;

    function tick(now) {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      const rawValue = start + (target - start) * eased;
      const value = decimals > 0 ? Number(rawValue.toFixed(decimals)) : Math.round(rawValue);
      el.textContent = that.formatNumber(value, decimals);
      if (t < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  highlightResult(selectedSide, correct) {
    const selectedCard = selectedSide === 'left' ? this.leftCard : this.rightCard;
    const otherCard = selectedSide === 'left' ? this.rightCard : this.leftCard;

    if (correct) {
      selectedCard.classList.add('correct');
    } else {
      selectedCard.classList.add('incorrect');
      otherCard.classList.add('correct');
    }
  }

  resetCards(preserveLeft = false, preserveRight = false, pokemon1 = null, pokemon2 = null) {
    [this.leftCard, this.rightCard].forEach(card => {
      card.classList.remove('correct', 'incorrect', 'disabled');
    });

    // Hide both by default
    const leftScoreEl = document.getElementById('score-left');
    const rightScoreEl = document.getElementById('score-right');

    // Helper to populate static values from model
    const populateStatic = (scoreEl, pokemon) => {
      if (!scoreEl || !pokemon) return;
      const valueEl = scoreEl.querySelector('.score-value');
      const avgEl = scoreEl.querySelector('.score-avg');

      const target = (typeof pokemon.estimatedSearches === 'number' && pokemon.estimatedSearches != null)
        ? pokemon.estimatedSearches
        : (typeof pokemon.timelineSum === 'number' ? pokemon.timelineSum : Math.round(pokemon.popularityScore || 0));

      const avg = (pokemon.avgScore != null) ? Number(pokemon.avgScore) : null;

      if (valueEl) valueEl.textContent = this.formatNumber(target, 0);
      if (avgEl) avgEl.textContent = avg != null ? this.formatNumber(avg, 2) : '';
      scoreEl.classList.remove('hidden');
    };

    if (preserveLeft && pokemon1) {
      populateStatic(leftScoreEl, pokemon1);
    } else if (leftScoreEl) {
      leftScoreEl.classList.add('hidden');
    }

    if (preserveRight && pokemon2) {
      populateStatic(rightScoreEl, pokemon2);
    } else if (rightScoreEl) {
      rightScoreEl.classList.add('hidden');
    }

    // Do not clear keepRevealed here; it will be removed after reveal to
    // ensure revealScores can detect preserved sides and skip animations.
  }

  enableClicks() {
    [this.leftCard, this.rightCard].forEach(card => {
      card.classList.remove('disabled');
    });
  }

  disableClicks() {
    [this.leftCard, this.rightCard].forEach(card => {
      card.classList.add('disabled');
    });
  }

  showLoading() {
    document.getElementById('loading').classList.add('active');
  }

  hideLoading() {
    document.getElementById('loading').classList.remove('active');
  }

  setGuessCallback(callback) {
    this.guessCallback = callback;
  }
}
