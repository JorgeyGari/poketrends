import { GameState } from '../models/GameState.js';
import { Pokemon } from '../models/Pokemon.js';
import { PopularityService } from '../services/PopularityService.js';
import { PokemonService } from '../services/PokemonService.js';
import { StorageService } from '../services/StorageService.js';
import { GAME_CONFIG } from '../config/constants.js';

/**
 * Main Game Controller
 * Orchestrates game logic with PokéAPI data
 */
export class GameController {
  constructor(uiController) {
    this.uiController = uiController;
    this.gameState = new GameState();
    this.pokemonService = new PokemonService();
    this.popularityService = new PopularityService();
    this.currentPair = null;
    this.pokemonList = null;

    this.loadSavedData();
  }

  loadSavedData() {
    const savedStats = StorageService.loadStats();
    if (savedStats) {
      this.gameState.fromJSON(savedStats);
    }

    const savedCountry = StorageService.loadCountry();
    this.gameState.setCountry(savedCountry);
  }

  /**
   * Initialize game - fetch Pokémon list from PokéAPI
   */
  async initializeGame() {
    try {
      this.uiController.showLoading();

      // Fetch Pokémon list from PokéAPI
      this.pokemonList = await this.pokemonService.fetchPokemonList(
        GAME_CONFIG.POKEMON_LIMIT
      );

      if (!this.pokemonList || this.pokemonList.length < 2) {
        throw new Error('Failed to load Pokémon');
      }

      this.uiController.hideLoading();
    } catch (error) {
      console.error('Error initializing game:', error);
      this.uiController.showError(
        'Error cargando Pokémon. Intenta recargar la página.'
      );
    }
  }

  async startGame() {
    this.gameState.startGame();
    this.uiController.updateStats(this.gameState.getStats());
    await this.loadNextRound();
  }

  /**
   * Load next round - get two random Pokémon from PokéAPI data
   */
  async loadNextRound() {
    this.uiController.showLoading();

    try {
      const [pokemon1, pokemon2] = await this.getRandomPokemonPair();

      if (!pokemon1 || !pokemon2) {
        throw new Error('Failed to load Pokémon for round');
      }

      // Get popularity scores
      const country = this.gameState.selectedCountry;
      const data1 = await this.popularityService.getPopularityScore(
        pokemon1.name,
        country
      );
      const data2 = await this.popularityService.getPopularityScore(
        pokemon2.name,
        country
      );

      // Keep numeric score for game logic, also attach timeline raw values
      pokemon1.setPopularityScore(data1.score);
      pokemon2.setPopularityScore(data2.score);
      if (typeof pokemon1.setEstimatedSearches === 'function') pokemon1.setEstimatedSearches(data1.estimatedSearches, data1.estimatedLabel);
      if (typeof pokemon2.setEstimatedSearches === 'function') pokemon2.setEstimatedSearches(data2.estimatedSearches, data2.estimatedLabel);
      if (typeof pokemon1.setTimelineData === 'function') pokemon1.setTimelineData(data1.timelineSum, data1.timelineValues);
      if (typeof pokemon2.setTimelineData === 'function') pokemon2.setTimelineData(data2.timelineSum, data2.timelineValues);
      if (typeof pokemon1.setAvgScore === 'function') pokemon1.setAvgScore(data1.avgScore);
      if (typeof pokemon2.setAvgScore === 'function') pokemon2.setAvgScore(data2.avgScore);

      this.currentPair = { left: pokemon1, right: pokemon2 };

      this.uiController.hideLoading();
      this.uiController.displayPokemonPair(pokemon1, pokemon2);

    } catch (error) {
      console.error('Error loading round:', error);
      this.uiController.showError('Error cargando datos. Intenta de nuevo.');
    }
  }

  /**
   * Get two random Pokémon that haven't been used in this game
   */
  async getRandomPokemonPair() {
    // Get list of unused Pokémon
    let available = this.pokemonList.filter(
      p => !this.gameState.isPokemonUsed(p.name)
    );

    // Reset if all Pokémon used
    if (available.length < 2) {
      this.gameState.usedPokemon = [];
      available = [...this.pokemonList];
    }

    // Shuffle and pick 2
    const shuffled = available.sort(() => 0.5 - Math.random());
    const [p1, p2] = shuffled.slice(0, 2);

    this.gameState.markPokemonUsed(p1.name);
    this.gameState.markPokemonUsed(p2.name);

    // Fetch full details from PokéAPI
    const details1 = await this.pokemonService.getPokemonDetails(p1.name);
    const details2 = await this.pokemonService.getPokemonDetails(p2.name);

    if (!details1 || !details2) {
      throw new Error('Failed to get Pokémon details');
    }

    return [
      this.createPokemonModel(details1),
      this.createPokemonModel(details2),
    ];
  }

  /**
   * Create Pokemon model from PokéAPI data
   */
  createPokemonModel(details) {
    const pokemon = new Pokemon(
      details.id,
      details.name,
      details.generation
    );
    // Pokemon model exposes setSpriteUrl()
    const spriteUrl = details.sprite || pokemon.getSpriteUrl?.();
    if (spriteUrl && typeof pokemon.setSpriteUrl === 'function') {
      pokemon.setSpriteUrl(spriteUrl);
    }
    return pokemon;
  }

  /**
   * Handle player guess
   */
  async handleGuess(side) {
    if (!this.gameState.isActive) return;

    const leftScore = this.currentPair.left.popularityScore;
    const rightScore = this.currentPair.right.popularityScore;

    const correct =
      (side === 'left' && leftScore >= rightScore) ||
      (side === 'right' && rightScore >= leftScore);

    this.uiController.revealScores(
      this.currentPair.left,
      this.currentPair.right,
      side,
      correct
    );

    if (correct) {
      this.gameState.correctGuess();
      this.uiController.updateStats(this.gameState.getStats());
      this.saveProgress();

      setTimeout(() => {
        this.loadNextRound();
      }, GAME_CONFIG.ROUND_DELAY);

    } else {
      this.gameState.incorrectGuess();
      this.saveProgress();

      setTimeout(() => {
        this.uiController.showGameOver(this.gameState.getStats());
      }, GAME_CONFIG.ROUND_DELAY);
    }
  }

  /**
   * Change selected country
   */
  changeCountry(countryCode) {
    this.gameState.setCountry(countryCode);
    StorageService.saveCountry(countryCode);
    this.popularityService.clearCache();

    if (this.gameState.isActive) {
      this.startGame();
    }
  }

  /**
   * Save current progress
   */
  saveProgress() {
    StorageService.saveStats(this.gameState.toJSON());
  }

  /**
   * Reset all stats and caches
   */
  resetStats() {
    StorageService.clearAll();
    this.popularityService.clearCache();
    this.gameState = new GameState();
    this.uiController.updateStats(this.gameState.getStats());
  }
}
