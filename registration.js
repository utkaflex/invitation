(() => {
  const endpoint = 'https://script.google.com/macros/s/AKfycby2lh9UEARB6YcWPHONON4Keymsh3MnRF7lW_KNcEiSX-WiOF8nOR_UnuSoRYwZ-sduOQ/exec';
  const form = document.querySelector('#registration-form');
  if (!form) return;
  const button = form.querySelector('.form-submit');
  const status = form.querySelector('.registration-status');
  const debug = new URLSearchParams(window.location.search).get('registrationDebug') === '1';
  let diagnostics;
  if (debug) {
    diagnostics = document.createElement('pre');
    diagnostics.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px';
    diagnostics.textContent = 'Замеры появятся после отправки новой заявки.';
    form.appendChild(diagnostics);
  }
  let busy = false;
  let attempt = null;
  const storageKey = '70aero-registration-v1';
  const message = (text, kind = 'error') => {
    status.hidden = false;
    status.dataset.kind = kind;
    status.textContent = text;
  };
  // Persist only a hash and receipt ID, never the guest's contact details.
  try { attempt = JSON.parse(sessionStorage.getItem(storageKey)); } catch (_) {}
  if (!attempt || !/^[a-f0-9-]{36}$/.test(attempt.id || '') || typeof attempt.hash !== 'string') attempt = null;
  const persist = () => {
    try { sessionStorage.setItem(storageKey, JSON.stringify(attempt)); } catch (_) {}
  };
  const uuid = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };
  const errors = {
    invalid: 'Проверьте заполнение полей и согласие на обработку данных.',
    closed: 'Регистрация закрыта. Свяжитесь с организатором.',
    busy: 'Сервис занят. Подождите немного и повторите отправку.',
    conflict: 'Данные заявки изменились. Свяжитесь с организатором для проверки регистрации.',
    uncertain: 'Не удалось подтвердить результат. Свяжитесь с организатором перед повторной регистрацией.'
  };
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !form.reportValidity()) return;
    if (!navigator.onLine) { message('Нет подключения к интернету. Данные остаются в форме.'); return; }
    busy = true;
    button.disabled = true;
    const controls = Array.from(form.querySelectorAll('input, select'));
    let timeout;
    let slow;
    try {
      const body = new URLSearchParams();
      new FormData(form).forEach((value, key) => body.append(key, String(value).trim()));
      controls.forEach(control => { control.disabled = true; });
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body.toString()));
      const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
      if (attempt && attempt.hash !== hash && attempt.state !== 'saved' && attempt.state !== 'rejected') {
        message('Результат предыдущей отправки неизвестен. Верните прежние данные для повторной проверки или свяжитесь с организатором.');
        return;
      }
      if (attempt && attempt.hash === hash && attempt.state === 'saved') {
        message('Ваша заявка уже сохранена. Повторно отправлять её не нужно.', 'success');
        return;
      }
      if (!attempt || attempt.hash !== hash) attempt = { id: uuid(), hash, state: 'pending' };
      attempt.state = 'pending';
      persist();
      body.set('requestId', attempt.id);
      message('Отправляем заявку…', 'pending');
      button.firstChild.textContent = 'Отправляем… ';
      const controller = new AbortController();
      slow = setTimeout(() => message('Google отвечает дольше обычного. Подождите, отправка продолжается…', 'pending'), 8000);
      timeout = setTimeout(() => controller.abort(), 30000);
      const requestStarted = performance.now();
      const response = await fetch(endpoint, {
        method: 'POST', body, credentials: 'omit', redirect: 'follow', signal: controller.signal
      });
      if (!response.ok) throw new Error('HTTP');
      const result = await response.json();
      if (diagnostics) {
        const labels = {
          readConfigMs: 'Чтение настроек', lockWaitMs: 'Ожидание блокировки',
          readReceiptMs: 'Проверка дубля', openFormMs: 'Открытие формы',
          checkOpenMs: 'Проверка приёма заявок', createResponseMs: 'Создание ответа',
          writePendingMs: 'Запись начала отправки', submitMs: 'Сохранение в Google Forms',
          readSavedIdMs: 'Получение подтверждения', writeReceiptMs: 'Запись результата',
          beforeResponseMs: 'Всего в скрипте до формирования ответа'
        };
        for (let i = 1; i <= 6; i++) labels[`prepareField${i}Ms`] = `Подготовка поля ${i}`;
        const lines = [`Запрос целиком: ${Math.round(performance.now() - requestStarted)} мс`];
        const timing = result.diagnostics && result.diagnostics.timings;
        if (timing) {
          Object.keys(labels).forEach(key => {
            if (Number.isFinite(timing[key]) && timing[key] >= 0) lines.push(`${labels[key]}: ${timing[key]} мс`);
          });
          lines.push('Общее время запроса включает сеть и перенаправления Google.');
        } else {
          lines.push('Обработчик ещё не возвращает замеры. Обновите Apps Script до версии 3.');
        }
        diagnostics.textContent = lines.join('\n');
      }
      if (result.ok === true && result.code === 'saved' && result.requestId === attempt.id) {
        attempt.state = 'saved';
        persist();
        message('Спасибо! Ваша заявка сохранена. Ждём вас на мероприятии.', 'success');
      } else {
        if (['invalid', 'closed', 'busy'].includes(result.code)) { attempt.state = 'rejected'; persist(); }
        message((errors[result.code] || 'Не удалось подтвердить отправку. Повторите с теми же данными или свяжитесь с организатором.') + ' Номер заявки: ' + attempt.id);
      }
    } catch (_) {
      message('Не удалось получить подтверждение. Данные остаются в форме. Повторите отправку с теми же данными — используем прежний номер заявки.' + (attempt ? ' Номер заявки: ' + attempt.id : ''));
    } finally {
      clearTimeout(timeout);
      clearTimeout(slow);
      controls.forEach(control => { control.disabled = false; });
      busy = false;
      button.disabled = false;
      button.firstChild.textContent = 'Отправить заявку ';
    }
  });
  if (window.fetch && window.crypto && crypto.subtle && window.AbortController) {
    button.disabled = false;
  } else {
    message('Этот браузер не поддерживает отправку на сайте. Откройте Google Форму по ссылке ниже.');
  }
})();
