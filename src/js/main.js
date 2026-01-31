import { GameController } from './controllers/GameController.js';
import { UIController } from './controllers/UIController.js';
import { StorageService } from './services/StorageService.js';

/**
 * Application Entry Point
 * Initializes game with PokéAPI data
 */
class App {
  constructor() {
    this.init();
  }

  async init() {
    try {
      // Initialize controllers
      this.uiController = new UIController();
      this.gameController = new GameController(this.uiController);

      // Set up callbacks
      this.uiController.setGuessCallback((side) => {
        this.gameController.handleGuess(side);
      });

      this.uiController.setRestartCallback(() => {
        this.gameController.startGame();
      });

      this.uiController.setCountryChangeCallback((countryCode) => {
        this.gameController.changeCountry(countryCode);
      });

      // Load saved country
      const savedCountry = StorageService.loadCountry();
      this.uiController.countrySelector.setSelected(savedCountry);

      // Initialize game (fetch Pokémon from PokéAPI)
      await this.gameController.initializeGame();

      // Start first game
      await this.gameController.startGame();

    } catch (error) {
      console.error('Fatal error initializing app:', error);
      this.uiController.showError(
        'Error al inicializar la aplicación. Por favor, recarga la página.'
      );
    }
  }
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new App());
} else {
  new App();
}
