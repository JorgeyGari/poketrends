/**
 * @file Game configuration constants.
 */

export const GAME_CONFIG = {
    MAX_ROUNDS: 10,
    ROUND_DELAY: 1500, // ms before next round
    ANIMATION_DURATION: 300,
    POKEMON_LIMIT: 151, // First generation only
};

export const COUNTRIES = [
    { code: 'ES', name: 'España', flag: '🇪🇸' },
    { code: 'JP', name: 'Japan', flag: '🇯🇵' },
    { code: 'US', name: 'United States', flag: '🇺🇸' },
    { code: 'DE', name: 'Germany', flag: '🇩🇪' },
    { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
    { code: 'FR', name: 'France', flag: '🇫🇷' },
    { code: 'BR', name: 'Brazil', flag: '🇧🇷' },
    { code: 'MX', name: 'México', flag: '🇲🇽' },
    { code: 'AR', name: 'Argentina', flag: '🇦🇷' },
    { code: 'IT', name: 'Italy', flag: '🇮🇹' },
    { code: 'CA', name: 'Canada', flag: '🇨🇦' },
    { code: 'AU', name: 'Australia', flag: '🇦🇺' },
];

export const STORAGE_KEYS = {
    BEST_STREAK: 'bestStreak',
    SELECTED_COUNTRY: 'selectedCountry',
    GAME_STATS: 'gameStats',
    POKEMON_CACHE: 'pokemonCache',
};

export const API_ENDPOINTS = {
    POKEAPI: 'https://pokeapi.co/api/v2',
    POKEMON_SPRITES: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork',
};