/**
 * Modal Component
 */
export class Modal {
  constructor() {
    this.modal = null;
    this.init();
  }

  init() {
    const modalHTML = `
      <div class="modal" id="modal">
        <div class="modal-overlay"></div>
        <div class="modal-content">
          <div class="modal-header">
            <h2 id="modal-title"></h2>
            <button class="modal-close" id="modal-close">&times;</button>
          </div>
          <div class="modal-body" id="modal-body"></div>
          <div class="modal-footer" id="modal-footer"></div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    this.modal = document.getElementById('modal');

    document.getElementById('modal-close').addEventListener('click', () => {
      this.hide();
    });

    this.modal.querySelector('.modal-overlay').addEventListener('click', () => {
      this.hide();
    });
  }

  show(options) {
    document.getElementById('modal-title').textContent = options.title;
    document.getElementById('modal-body').innerHTML = options.content;

    const footer = document.getElementById('modal-footer');
    footer.innerHTML = '';

    if (options.buttons) {
      options.buttons.forEach(btn => {
        const button = document.createElement('button');
        button.textContent = btn.text;
        button.className = btn.primary ? 'btn-primary' : 'btn-secondary';
        button.addEventListener('click', () => {
          btn.action();
          this.hide();
        });
        footer.appendChild(button);
      });
    }

    this.modal.classList.add('active');
  }

  hide() {
    this.modal.classList.remove('active');
  }
}
