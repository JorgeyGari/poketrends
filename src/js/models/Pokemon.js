/**
 * @file Pokémon entity model.
 * Represents a Pokémon with its relevant data.
 */

export class Pokemon {
    constructor(id, name, generation, popularityScore = null) {
        this.id = id;
        this.name = name;
        this.generation = generation;
        this.popularityScore = popularityScore;
        this.sprite = null;
    }

    /**
     * Set popularity score (Google Trends or static)
     * @param {number} score - Popularity score to set
     */
    setPopularityScore(score) {
        this.popularityScore = score;
    }
    
    /**
     * Set sprite URL
     * @param {string} url - URL of the Pokémon sprite
     */
    setSpriteUrl(url) {
        this.sprite = url;
    }

    /**
     * Get sprite URL from PokeAPI
     * @returns {string} URL of the Pokémon sprite
     */
    getSpriteUrl() {
        return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${this.id}.png`;
    }

    /**
     * Check if Pokémon has all required data
     * @returns {boolean} True if valid, false otherwise
     */
    isComplete() {
        return this.id !== null && this.name !== null && this.popularityScore !== null && this.sprite !== null;
    }

    /**
     * Get formatted display name
     * @returns {string} Formatted name
     */
    getDisplayName() {
        return this.name.charAt(0).toUpperCase() + this.name.slice(1);
    }

    /**
     * Create Pokémon from data object
     * @param {Object} data - Data object
     * @returns {Pokemon} New Pokémon instance
     */
    static fromData(data) {
        const pokemon = new Pokemon(data.id, data.name, data.generation, data.popularityScore);
        if (data.sprite) pokemon.setSpriteUrl(data.sprite);
        return pokemon;
    }
}