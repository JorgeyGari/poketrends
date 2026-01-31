import { PokemonService } from "./PokemonService.js";
import { TrendsApiService } from "./TrendsApiService.js";

/**
 * @class PopularityService
 * Adapter that provides a single `getPopularityScore` method used by controllers.
 */
export class PopularityService {
    constructor() {
        this.pokemonService = new PokemonService();
        this.trends = new TrendsApiService();
    }

    /**
     * Get a popularity score for a pokemon name and country.
     * Returns a number 0-100.
     */
    async getPopularityScore(pokemonName, countryCode = 'US') {
        // Prefer Trends API but fall back to Pokémon base_experience if trends fail.
        try {
            const score = await this.trends.getTrendsScore(pokemonName, countryCode);
            return typeof score === 'number' ? score : Number(score) || this.getFallbackFromPokemon(pokemonName);
        } catch (e) {
            console.warn('PopularityService: trends fetch failed, falling back', e);
            return this.getFallbackFromPokemon(pokemonName);
        }
    }

    /**
     * Clear any internal caches
     */
    clearCache() {
        if (this.trends && typeof this.trends.clearCache === 'function') this.trends.clearCache();
    }

    /**
     * Fallback using PokéAPI base_experience as a proxy
     */
    async getFallbackFromPokemon(pokemonName) {
        try {
            const details = await this.pokemonService.getPokemonDetails(pokemonName);
            if (details && typeof details.baseExperience === 'number') {
                // Normalize baseExperience (typical values 60-300) into 0-100
                const be = details.baseExperience;
                const normalized = Math.min(100, Math.round((be / 300) * 100));
                return normalized;
            }
        } catch (e) {
            console.error('PopularityService fallback failed:', e);
        }
        // final fallback deterministic seed
        const seed = pokemonName.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
        return 30 + (seed % 50);
    }
}