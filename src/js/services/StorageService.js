/**
 * @file Service for handling storage operations.
 */

import { STORAGE_KEYS } from '../config/constants.js';

/**
 * @class StorageService
 * Local storage service.
 * Handles persistent data storage.
 */
export class StorageService {
    /**
     * Save game statistics
     * @param {Object} stats - Statistics object
     * @returns {void}
     */
    static saveStats(stats) {
        try {
            localStorage.setItem(STORAGE_KEYS.GAME_STATS, JSON.stringify(stats));
        } catch (error) {
            console.error('Error saving game statistics:', error);
        }
    }

    /**
     * Load game statistics
     * @returns {Object|null} - Statistics object or null if not found
     */
    static loadStats() {
        try {
            const data = localStorage.getItem(STORAGE_KEYS.GAME_STATS);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('Error loading game statistics:', error);
            return null;
        }
    }

    /**
     * Save selected country
     * @param {string} countryCode - Country code
     * @returns {void}
     */
    static saveSelectedCountry(countryCode) {
        try {
            localStorage.setItem(STORAGE_KEYS.SELECTED_COUNTRY, countryCode);
        } catch (error) {
            console.error('Error saving selected country:', error);
        }
    }

    /**
     * Load selected country
     * @returns {string|null} - Country code or null if not found
     */
    static loadSelectedCountry() {
        try {
            return localStorage.getItem(STORAGE_KEYS.SELECTED_COUNTRY);
        } catch (error) {
            console.error('Error loading selected country:', error, '(returning default "US")');
            return 'US';
        }
    }

    /**
     * Backwards-compatible alias: saveCountry
     * @param {string} countryCode
     */
    static saveCountry(countryCode) {
        return this.saveSelectedCountry(countryCode);
    }

    /**
     * Backwards-compatible alias: loadCountry
     * @returns {string|null}
     */
    static loadCountry() {
        return this.loadSelectedCountry();
    }

    /**
     * Save Pokemon list cache
     * @param {Array} pokemonList - List of Pokemon data
     * @returns {void}
     */
    static savePokemonCache(pokemonList) {
        try {
            localStorage.setItem(STORAGE_KEYS.POKEMON_CACHE, JSON.stringify(pokemonList));
        } catch (error) {
            console.error('Error saving Pokémon cache:', error);
        }
    }

    /**
     * Load Pokemon list cache
     * @returns {Array|null} - List of Pokemon data or null if not found
     */
    static loadPokemonCache() {
        try {
            const data = localStorage.getItem(STORAGE_KEYS.POKEMON_CACHE);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('Error loading Pokémon cache:', error);
            return null;
        }
    }

    /**
     * Backwards-compatible alias: savePokemonList
     * @param {Array} pokemonList
     */
    static savePokemonList(pokemonList) {
        return this.savePokemonCache(pokemonList);
    }

    /**
     * Backwards-compatible alias: loadPokemonList
     * @returns {Array|null}
     */
    static loadPokemonList() {
        return this.loadPokemonCache();
    }

    /**
     * Backwards-compatible alias: clearPokemonList
     */
    static clearPokemonList() {
        try {
            localStorage.removeItem(STORAGE_KEYS.POKEMON_CACHE);
        } catch (error) {
            console.error('Error clearing Pokémon cache:', error);
        }
    }

    /**
     * Clear all stored data
     * @returns {void}
     */
    static clearAll() {
        Object.values(STORAGE_KEYS).forEach(key => {
            try {
                localStorage.removeItem(key);
            } catch (error) {
                console.error(`Error clearing storage key ${key}:`, error);
            }
        });
    }
}
