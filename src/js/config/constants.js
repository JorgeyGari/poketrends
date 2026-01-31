/**
 * @file Game configuration constants.
 */

export const GAME_CONFIG = {
    MAX_ROUNDS: 10,
    ROUND_DELAY: 3000, // ms before next round
    ANIMATION_DURATION: 500,
    // Set to 0 to fetch all available Pokémon from the API (all generations)
    POKEMON_LIMIT: 0,
};

export const COUNTRIES = [
    { code: 'ES', name: 'España', flag: '🇪🇸' },
    { code: 'JP', name: '日本', flag: '🇯🇵' },
    { code: 'US', name: 'United States', flag: '🇺🇸' },
    { code: 'DE', name: 'Deutschland', flag: '🇩🇪' },
    { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
    { code: 'FR', name: 'France', flag: '🇫🇷' },
    { code: 'BR', name: 'Brasil', flag: '🇧🇷' },
    { code: 'MX', name: 'México', flag: '🇲🇽' },
    { code: 'AR', name: 'Argentina', flag: '🇦🇷' },
    { code: 'IT', name: 'Italia', flag: '🇮🇹' },
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