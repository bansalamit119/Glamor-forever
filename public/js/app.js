// Small progressive enhancements. The app works without JavaScript.

// Confirm before destructive actions: <form data-confirm="Are you sure?">
document.querySelectorAll('form[data-confirm]').forEach((form) => {
  form.addEventListener('submit', (e) => {
    if (!window.confirm(form.dataset.confirm)) e.preventDefault();
  });
});

// Flash messages: dismiss button + auto-hide success messages.
document.querySelectorAll('.flash').forEach((flash) => {
  const hide = () => {
    flash.classList.add('hide');
    setTimeout(() => flash.remove(), 300);
  };
  const close = flash.querySelector('.flash-close');
  if (close) close.addEventListener('click', hide);
  if (flash.classList.contains('flash-success')) setTimeout(hide, 5000);
});

// Clickable table rows: <tr data-href="/employees/1">
document.querySelectorAll('tr[data-href]').forEach((row) => {
  row.addEventListener('click', (e) => {
    if (e.target.closest('a, button, form')) return;
    window.location.href = row.dataset.href;
  });
});

// Filter dropdowns submit the search form immediately.
document.querySelectorAll('select.auto-submit').forEach((select) => {
  select.addEventListener('change', () => select.form.submit());
});

// Show the chosen file name in the upload box.
document.querySelectorAll('.dropzone input[type=file]').forEach((input) => {
  input.addEventListener('change', () => {
    const zone = input.closest('.dropzone');
    const text = zone.querySelector('.dropzone-text');
    if (input.files.length) {
      text.textContent = input.files[0].name;
      zone.classList.add('has-file');
    } else {
      text.textContent = 'Click to choose a file';
      zone.classList.remove('has-file');
    }
  });
});
