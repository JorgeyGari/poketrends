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
            // First check cache
            const cached = StorageService.loadPokemonList();
            if (cached) return cached;
        

        const url = `${this.baseUrl}/pokemon?limit=${limit}&offset=${offset}`;
        const response = await fetch(url);

        if (!response.ok) throw new Error('Failed to fetch Pokémon list');

        const data = await response.json();
        const pokemonList = data.results.map((pokemon, index) => ({
            name: pokemon.name,
            url: pokemon.url,
            id: offset + index + 1, // Calculate ID based on offset and index
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
            const url = `${this.baseUrl}/pokemon/${query}`;
            const response = await fetch(url);

            if (!response.ok) throw new Error(`Failed to fetch details for Pokémon: ${query}`);

            const data = await response.json();

            const pokemon = {
                id: data.id,
                name: data.name,
                sprite: data.sprites.other['official-artwork'].front_default || data.sprites.front_default,
                types: data.types.map(t => t.type.name),
                generation: this.getGenerationById(data.id),
                baseExperience: data.base_experience,
            };

            // Cache the details
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
     * Clear cached Pokémon data
     * @returns {void}
     */
    clearCache() {
        this.detailsCache.clear();
        this.listCache = null;
        StorageService.clearPokemonList();
    }
}