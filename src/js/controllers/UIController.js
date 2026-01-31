import { GameBoard } from '../components/GameBoard.js';
import { StatsPanel } from '../components/StatsPanel.js';
import { CountrySelector } from '../components/CountrySelector.js';
import { Modal } from '../components/Modal.js';

/**
 * UI Controller
 * Manages all UI components
 */
export class UIController {
  constructor() {
    this.gameBoard = new GameBoard();
    this.statsPanel = new StatsPanel();
    this.countrySelector = new CountrySelector();
    this.modal = new Modal();

    this.initializeUI();
  }

  initializeUI() {
    this.gameBoard.mount('#game-container');
    this.statsPanel.mount('#stats-container');
    this.countrySelector.mount('#country-selector-container');
  }

  displayPokemonPair(pokemon1, pokemon2, enableClicks = true) {
    const preserveLeft = !!pokemon1 && !!pokemon1.keepRevealed;
    const preserveRight = !!pokemon2 && !!pokemon2.keepRevealed;
    this.gameBoard.setPokemon(pokemon1, pokemon2, { preserveLeft, preserveRight });
    if (enableClicks) this.gameBoard.enableClicks(); else this.gameBoard.disableClicks();
  }

  enableClicks() {
    this.gameBoard.enableClicks();
  }

  disableClicks() {
    this.gameBoard.disableClicks();
  }

  revealScores(pokemon1, pokemon2, selectedSide, correct) {
    this.gameBoard.disableClicks();
    this.gameBoard.revealScores(pokemon1, pokemon2);
    this.gameBoard.highlightResult(selectedSide, correct);
  }

  updateStats(stats) {
    this.statsPanel.update(stats);
  }

  showLoading() {
    this.gameBoard.showLoading();
  }

  hideLoading() {
    this.gameBoard.hideLoading();
  }

  showError(message) {
    this.modal.show({
      title: 'Error',
      content: `
        <p>${message}</p>
      `,
      buttons: [
        {
          text: 'Cerrar',
          action: () => {},
          primary: true,
        },
      ],
    });
  }

  showGameOver(stats) {
    this.modal.show({
      title: '¡Juego Terminado!',
      content: `
        <div class="game-over-content">
          <p class="final-score">Racha final: <strong>${stats.currentStreak}</strong></p>
          <p>Mejor racha: <strong>${stats.bestStreak}</strong></p>
          <p>Promedio: <strong>${stats.averageStreak}</strong> por juego</p>
        </div>
      `,
      buttons: [
        {
          text: 'Jugar de Nuevo',
          action: () => this.onRestartGame(),
          primary: true,
        },
      ],
    });
  }

  setRestartCallback(callback) {
    this.onRestartGame = callback;
  }

  setGuessCallback(callback) {
    this.gameBoard.setGuessCallback(callback);
  }

  setCountryChangeCallback(callback) {
    this.countrySelector.setChangeCallback(callback);
  }
}
