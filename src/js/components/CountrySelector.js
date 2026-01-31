import { COUNTRIES } from '../config/constants.js';

/**
 * Country Selector Component
 */
export class CountrySelector {
  constructor() {
    this.container = null;
    this.changeCallback = null;
  }

  mount(selector) {
    this.container = document.querySelector(selector);
    this.render();
    this.attachEventListeners();
  }

  render() {
    const options = COUNTRIES.map(country => `
      <option value="${country.code}">
        ${country.flag} ${country.name}
      </option>
    `).join('');

    this.container.innerHTML = `
      <div class="country-selector">
        <label for="country-select">
          <span class="icon">🌍</span>
          País:
        </label>
        <select id="country-select" class="country-select">
          ${options}
        </select>
      </div>
    `;
  }

  attachEventListeners() {
    const select = this.container.querySelector('#country-select');
    select.addEventListener('change', (e) => {
      if (this.changeCallback) {
        this.changeCallback(e.target.value);
      }
    });
  }

  setChangeCallback(callback) {
    this.changeCallback = callback;
  }

  setSelected(countryCode) {
    const select = this.container.querySelector('#country-select');
    if (select) {
      select.value = countryCode;
    }
  }
}
