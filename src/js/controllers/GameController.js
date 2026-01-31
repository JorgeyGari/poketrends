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
    this.buffer = [];
    this.BUFFER_SIZE = 3;

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
    await this.initializeBuffer();
    await this.loadNextRound();
  }

  /**
   * Load next round - get two random Pokémon from PokéAPI data
   */
  async loadNextRound() {
    // Prefer showing the sprites/names immediately and fetch popularity in parallel
    try {
      if (!this.buffer || this.buffer.length < 2) {
        await this.initializeBuffer();
      }

      const pokemon1 = this.buffer[0];
      const pokemon2 = this.buffer[1];

      // Show pair quickly but keep clicks disabled until popularity is loaded
      this.currentPair = { left: pokemon1, right: pokemon2 };
      this.uiController.displayPokemonPair(pokemon1, pokemon2, false);

      // Fetch popularity scores in parallel
      const country = this.gameState.selectedCountry;
      const [data1, data2] = await Promise.all([
        this.popularityService.getPopularityScore(pokemon1.name, country, pokemon1.id),
        this.popularityService.getPopularityScore(pokemon2.name, country, pokemon2.id),
      ]);

      // Attach scores and extra data
      if (data1) {
        pokemon1.setPopularityScore(data1.score);
        if (typeof pokemon1.setEstimatedSearches === 'function') pokemon1.setEstimatedSearches(data1.estimatedSearches, data1.estimatedLabel);
        if (typeof pokemon1.setTimelineData === 'function') pokemon1.setTimelineData(data1.timelineSum, data1.timelineValues);
        if (typeof pokemon1.setAvgScore === 'function') pokemon1.setAvgScore(data1.avgScore);
      }
      if (data2) {
        pokemon2.setPopularityScore(data2.score);
        if (typeof pokemon2.setEstimatedSearches === 'function') pokemon2.setEstimatedSearches(data2.estimatedSearches, data2.estimatedLabel);
        if (typeof pokemon2.setTimelineData === 'function') pokemon2.setTimelineData(data2.timelineSum, data2.timelineValues);
        if (typeof pokemon2.setAvgScore === 'function') pokemon2.setAvgScore(data2.avgScore);
      }

      // Enable clicks now that popularity data is available
      this.uiController.enableClicks();

    } catch (error) {
      console.error('Error loading round:', error);
      this.uiController.showError('Error cargando datos. Intenta de nuevo.');
    }
  }

  /**
   * Initialize buffer with BUFFER_SIZE unique Pokémon
   */
  async initializeBuffer() {
    this.buffer = [];

    if (!this.pokemonList || this.pokemonList.length === 0) return;

    // Pick unique candidates first
    let available = this.pokemonList.filter(
      p => !this.gameState.isPokemonUsed(p.name)
    );

    if (available.length < this.BUFFER_SIZE) {
      this.gameState.usedPokemon = [];
      available = [...this.pokemonList];
    }

    const shuffled = available.sort(() => 0.5 - Math.random());
    const picks = shuffled.slice(0, this.BUFFER_SIZE);

    // Mark as used
    picks.forEach(p => this.gameState.markPokemonUsed(p.name));

    // Fetch details in parallel
    const detailsArr = await Promise.all(
      picks.map(p => this.pokemonService.getPokemonDetails(p.name))
    );

    detailsArr.forEach(details => {
      if (details) this.buffer.push(this.createPokemonModel(details));
    });
  }

  /**
   * Fetch a single unused Pokemon from the list and return a Pokemon model
   */
  async fetchUniquePokemonModel() {
    if (!this.pokemonList || this.pokemonList.length === 0) return null;

    let available = this.pokemonList.filter(
      p => !this.gameState.isPokemonUsed(p.name)
    );

    if (available.length === 0) {
      this.gameState.usedPokemon = [];
      available = [...this.pokemonList];
    }

    const shuffled = available.sort(() => 0.5 - Math.random());
    const pick = shuffled[0];

    // mark as used (by name)
    this.gameState.markPokemonUsed(pick.name);

    const details = await this.pokemonService.getPokemonDetails(pick.name);
    if (!details) return null;
    return this.createPokemonModel(details);
  }

  /**
   * Ensure the pokemon model has popularity data; fetch if missing
   */
  async ensurePopularity(pokemon) {
    if (typeof pokemon.popularityScore !== 'undefined' && pokemon.popularityScore !== null) return;
    const country = this.gameState.selectedCountry;
    const data = await this.popularityService.getPopularityScore(
      pokemon.name,
      country
    );
    if (!data) return;
    if (typeof pokemon.setPopularityScore === 'function') pokemon.setPopularityScore(data.score);
    if (typeof pokemon.setEstimatedSearches === 'function') pokemon.setEstimatedSearches(data.estimatedSearches, data.estimatedLabel);
    if (typeof pokemon.setTimelineData === 'function') pokemon.setTimelineData(data.timelineSum, data.timelineValues);
    if (typeof pokemon.setAvgScore === 'function') pokemon.setAvgScore(data.avgScore);
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
    // Prefer speciesName for internal `name` to avoid form suffixes; keep `details.name` as fallback
    const internalName = details.speciesName || details.name;
    const pokemon = new Pokemon(
      details.id,
      internalName,
      details.generation
    );
    // set prettyName if provided by service
    if (details.prettyName) pokemon.prettyName = details.prettyName;
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

      setTimeout(async () => {
        try {
          // mark the middle pokemon (B) to keep its revealed data
          if (this.buffer && this.buffer[1]) this.buffer[1].keepRevealed = true;
          // slide the window: remove the first (A), keep B and C, append new D
          this.buffer.shift();
          const newP = await this.fetchUniquePokemonModel();
          if (newP) this.buffer.push(newP);
          await this.loadNextRound();
        } catch (e) {
          console.error('Error preparing next buffered round:', e);
          // fallback to normal next-round loader
          this.loadNextRound();
        }
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
