/**
 * @file Game state model.
 * Manages the current state of the game.
 */

export class GameState {
    constructor() {
        this.currentStreak = 0;
        this.bestStreak = 0;
        this.round = 0;
        this.isActive = false;
        this.selectedCountry = 'US';
        this.usedPokemon =[];
        this.totalGames = 0;
        this.totalRounds = 0;
    }

    /**
     * Start a new game
     * @returns {void}
     */
    startGame() {
        this.currentStreak = 0;
        this.round = 0;
        this.isActive = true;
        this.usedPokemon = [];
        this.totalGames++;
    }

    /**
     * Handle correct guess
     * @returns {void}
     */
    correctGuess() {
        this.currentStreak++;
        this.round++;
        this.totalRounds++;
        if (this.currentStreak > this.bestStreak) this.bestStreak = this.currentStreak;
    }

    /**
     * Handle incorrect guess (ends the game)
     * @returns {void}
     */
    incorrectGuess() {
        this.isActive = false;
        this.totalRounds++;
    }

    /**
     * Mark Pokemon as used in current game
     * @param {number|string} pokemonId - ID or name of the used Pokemon
     * @returns {void}
     */
    markPokemonAsUsed(pokemonId) {
        if (!this.usedPokemon.includes(pokemonId)) this.usedPokemon.push(pokemonId);
    }

    /**
     * Check if Pokemon has been used in current game
     * @param {number} pokemonId - ID of the Pokemon to check
     * @returns {boolean} - True if used, false otherwise
     */
    isPokemonUsed(pokemonId) {
        return this.usedPokemon.includes(pokemonId);
    }

    /**
     * Set selected country for trends comparison
     * @param {string} countryCode - Country code (e.g., 'JP', 'ES')
     * @returns {void}
     */
    setSelectedCountry(countryCode) {
        this.selectedCountry = countryCode;
    }

    /**
     * Backwards-compatible alias: setCountry
     * @param {string} countryCode
     */
    setCountry(countryCode) {
        return this.setSelectedCountry(countryCode);
    }

    /**
     * Backwards-compatible alias: markPokemonUsed
     * Accepts either id or name to match controller usage.
     * @param {number|string} pokemonIdentifier
     */
    markPokemonUsed(pokemonIdentifier) {
        return this.markPokemonAsUsed(pokemonIdentifier);
    }

    /**
     * Get current game statistics
     * @returns {object} - Current game statistics
     */
    getStats() {
        return {
            currentStreak: this.currentStreak,
            bestStreak: this.bestStreak,
            round: this.round,
            totalGames: this.totalGames,
            totalRounds: this.totalRounds,
            averageStreak: this.totalGames > 0 ? (this.totalRounds / this.totalGames).toFixed(2) : 0
        };
    }

    /**
     * Serialize game state to a plain object
     * @returns {object} - Plain object representation of the game state
     */
    toJSON() {
        return {
            currentStreak: this.currentStreak,
            bestStreak: this.bestStreak,
            round: this.round,
            isActive: this.isActive,
            selectedCountry: this.selectedCountry,
            usedPokemon: this.usedPokemon,
            totalGames: this.totalGames,
            totalRounds: this.totalRounds
        };
    }

    /**
     * Load game state from JSON
     * @param {string} jsonString - JSON string of the game state
     * @returns {void}
     */
    fromJSON(json) {
        if (!json) return;
        let data = json;
        if (typeof json === 'string') {
            try {
                data = JSON.parse(json);
            } catch (e) {
                console.error('GameState.fromJSON: failed to parse string, ignoring', e);
                return;
            }
        }

        this.currentStreak = data.currentStreak || 0;
        this.bestStreak = data.bestStreak || 0;
        this.round = data.round || 0;
        this.isActive = data.isActive || false;
        this.selectedCountry = data.selectedCountry || 'US';
        this.usedPokemon = data.usedPokemon || [];
        this.totalGames = data.totalGames || 0;
        this.totalRounds = data.totalRounds || 0;
    }
}