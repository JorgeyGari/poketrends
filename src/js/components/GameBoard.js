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
              <span class="score-label">Popularidad</span>
              <span class="score-value"></span>
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
              <span class="score-label">Popularidad</span>
              <span class="score-value"></span>
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

  setPokemon(pokemon1, pokemon2) {
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

    this.resetCards();
  }

  revealScores(pokemon1, pokemon2) {
    const scoreLeft = document.querySelector('#score-left .score-value');
    const scoreRight = document.querySelector('#score-right .score-value');

    scoreLeft.textContent = Math.round(pokemon1.popularityScore);
    scoreRight.textContent = Math.round(pokemon2.popularityScore);

    document.getElementById('score-left').classList.remove('hidden');
    document.getElementById('score-right').classList.remove('hidden');
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

  resetCards() {
    [this.leftCard, this.rightCard].forEach(card => {
      card.classList.remove('correct', 'incorrect', 'disabled');
    });

    document.querySelectorAll('.popularity-score').forEach(el => {
      el.classList.add('hidden');
    });
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
