/**
 * @file Pokémon service.
 * Handles fetching Pokémon data from PokéAPI.
 */

import { API_ENDPOINTS, GAME_CONFIG } from '../config/constants.js';
import { StorageService } from './StorageService.js';

/**
 * @class PokemonService
 * Service for fetching Pokémon data from PokéAPI.
 */
export class PokemonService {
    constructor() {
        this.baseUrl = API_ENDPOINTS.POKEAPI;
        this.detailsCache = new Map();
        this.listCache = null;
    }

    /**
     * Fetch list of Pokémon with pagination
     * @param {number} limit - Number of Pokémon to fetch
     * @param {number} offset - Starting offset for pagination
     * @returns {Promise<Array>} - List of Pokémon
     */
    async fetchPokemonList(limit = GAME_CONFIG.POKEMON_LIMIT, offset = 0) {
        try {
            // First check cache (only use cache when a specific limit is requested)
            const cached = StorageService.loadPokemonList();
            if (cached && limit > 0) return cached;

        // If limit is 0 or not provided, determine total count from API and fetch all
        let fetchLimit = limit;
        if (!fetchLimit || fetchLimit <= 0) {
            const metaUrl = `${this.baseUrl}/pokemon?limit=1&offset=0`;
            const metaResp = await fetch(metaUrl);
            if (!metaResp.ok) throw new Error('Failed to fetch Pokémon meta count');
            const metaData = await metaResp.json();
            fetchLimit = metaData.count || 0;
        }

        // Use the species endpoint to avoid alternative forms (species represent vanilla Pokémon)
        const url = `${this.baseUrl}/pokemon-species?limit=${fetchLimit}&offset=${offset}`;
        const response = await fetch(url);

        if (!response.ok) throw new Error('Failed to fetch Pokémon species list');

        const data = await response.json();
        const pokemonList = data.results.map((species) => ({
            name: species.name,
            url: species.url,
        }));

        // Cache the list
        StorageService.savePokemonList(pokemonList);
        this.listCache = pokemonList;

        return pokemonList;
        } catch (error) {
            console.error('Error fetching Pokémon list:', error);
            return [];
        }
    }

    /**
     * Fetch detailed data for a specific Pokémon by name or ID
     * @param {string|number} query - Pokémon name or ID
     * @returns {Promise<Object|null>} - Pokémon details or null if not found
     */
    async getPokemonDetails(query) {
        try {
            // Check cache first
            if (this.detailsCache.has(query)) return this.detailsCache.get(query);
            // First try fetching as a direct pokemon resource
            let response = await fetch(`${this.baseUrl}/pokemon/${query}`);
            let data = null;

            if (!response.ok) {
                // If not found, try resolving as a species to get the default variety
                try {
                    const speciesResp = await fetch(`${this.baseUrl}/pokemon-species/${query}`);
                    if (speciesResp.ok) {
                        const speciesData = await speciesResp.json();
                        const defaultVar = (speciesData.varieties || []).find(v => v.is_default === true);
                        const varName = defaultVar && defaultVar.pokemon && defaultVar.pokemon.name;
                        if (varName) {
                            response = await fetch(`${this.baseUrl}/pokemon/${varName}`);
                        }
                    }
                } catch (e) {
                    // ignore and fall through to error handling
                }
            }

            if (!response.ok) throw new Error(`Failed to fetch details for Pokémon: ${query}`);

            data = await response.json();

            // Try to get a localized English pretty name from the species endpoint
            let prettyName = null;
            // derive a sensible speciesName fallback from data if available
            let speciesName = (data.species && data.species.name) ? data.species.name : (typeof data.name === 'string' ? data.name.split('-')[0] : null);
            try {
                if (data.species && data.species.url) {
                    const spResp = await fetch(data.species.url);
                    if (spResp.ok) {
                        const sp = await spResp.json();
                        // prefer the localized English name when available
                        const en = (sp.names || []).find(n => n.language && n.language.name === 'en');
                        if (en && en.name) prettyName = en.name;
                        // update speciesName from species resource and fallback to a formatted species name
                        if (sp && sp.name) speciesName = sp.name;
                        if (!prettyName && sp && sp.name) prettyName = this.formatDisplayName(sp.name);
                    }
                }
            } catch (e) {
                // ignore failures to fetch species names
            }

            // final fallback: format the derived speciesName if we still don't have a pretty name
            if (!prettyName && speciesName) prettyName = this.formatDisplayName(speciesName);

            const pokemon = {
                id: data.id,
                name: data.name,
                speciesName: speciesName || null,
                prettyName: prettyName || null,
                sprite: data.sprites.other['official-artwork'].front_default || data.sprites.front_default,
                types: data.types.map(t => t.type.name),
                generation: this.getGenerationById(data.id),
                baseExperience: data.base_experience,
            };

            // Cache the details for both the resolved name and the original query key
            this.detailsCache.set(data.name, pokemon);
            this.detailsCache.set(query, pokemon);

            return pokemon;
        } catch (error) {
            console.error(`Error fetching details for Pokémon (${query}):`, error);
            return null;
        }   
    }

    /**
     * Get batch details for multiple Pokémon
     * @param {Array<string|number>} queries - Array of Pokémon names or IDs
     * @returns {Promise<Array>} - Array of Pokémon details
     */
    async getBatchPokemonDetails(queries) {
        const promises = queries.map(query => this.getPokemonDetails(query).catch(() => null));
        const results = await Promise.all(promises);
        return results.filter(p => p !== null);
    }

    /**
     * Get Pokémon generation by ID
     * @param {number} id - Pokémon ID
     * @returns {number} - Generation number
     */
    getGenerationById(id) {
        if (id <= 151) return 1;  // Generation I:    Kanto
        if (id <= 251) return 2;  // Generation II:   Johto
        if (id <= 386) return 3;  // Generation III:  Hoenn
        if (id <= 493) return 4;  // Generation IV:   Sinnoh
        if (id <= 649) return 5;  // Generation V:    Unova
        if (id <= 721) return 6;  // Generation VI:   Kalos
        if (id <= 809) return 7;  // Generation VII:  Alola
        if (id <= 905) return 8;  // Generation VIII: Galar
        return 9;                 // Generation IX:   Paldea
    }

    /**
     * Format a species name into a human-friendly display string.
     * Examples: "mimikyu" => "Mimikyu", "mr-mime" => "Mr Mime"
     * @param {string} speciesName
     * @returns {string}
     */
    formatDisplayName(speciesName) {
        if (!speciesName) return '';
        // Replace hyphens and underscores with spaces, then capitalize each word
        const parts = speciesName.replace(/[_-]+/g, ' ').split(' ');
        return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
    }
    /**
     * Clear cached Pokémon data
     * @returns {void}
     */
    clearCache() {
        this.detailsCache.clear();
        this.listCache = null;
        StorageService.clearPokemonList();
    }
}