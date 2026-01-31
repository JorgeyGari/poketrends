import { GameState } from './js/models/GameState.js';

const gameState = new GameState();

console.log('PokéTrends starting', gameState);

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('game-container');
  if (!container) return;

  const startBtn = document.createElement('button');
  startBtn.id = 'start-btn';
  startBtn.textContent = 'Start Game';
  container.appendChild(startBtn);

  startBtn.addEventListener('click', () => {
    gameState.startGame();
    startBtn.textContent = 'Game Started';
  });
});
