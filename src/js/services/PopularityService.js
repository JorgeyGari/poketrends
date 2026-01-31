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
     * Get a popularity object for a pokemon name and country.
     * Returns an object { score, estimatedSearches, estimatedLabel, rawData, ... }
     */
    async getPopularityScore(pokemonName, countryCode = 'US') {
        try {
            const data = await this.trends.getTrendsScore(pokemonName, countryCode);
            // Ensure we return a consistent object
            if (data && typeof data === 'object') {
                return {
                    score: typeof data.score === 'number' ? data.score : this.getFallbackFromPokemon(pokemonName),
                    avgScore: data.avgScore != null ? Number(data.avgScore) : null,
                    estimatedSearches: data.estimatedSearches != null ? Number(data.estimatedSearches) : null,
                    estimatedLabel: data.estimatedLabel || null,
                    timelineValues: Array.isArray(data.timelineValues) ? data.timelineValues.map(v => Number(v)) : null,
                    timelineSum: data.timelineSum != null ? Number(data.timelineSum) : null,
                    rawData: data.rawData || null,
                    cached: !!data.cached,
                    fallback: !!data.fallback
                };
            }
            // If trends returned unexpected value, fallback
            const fallbackScore = await this.getFallbackFromPokemon(pokemonName);
            return { score: fallbackScore, estimatedSearches: null, estimatedLabel: null, fallback: true };
        } catch (e) {
            console.warn('PopularityService: trends fetch failed, falling back', e);
            const fallbackScore = await this.getFallbackFromPokemon(pokemonName);
            return { score: fallbackScore, estimatedSearches: null, estimatedLabel: null, fallback: true };
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