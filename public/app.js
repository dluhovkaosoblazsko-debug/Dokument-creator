const state = {
  contactData: {
    exekutori: [],
    banky: [],
    ossz: [],
    pojistovny: [],
    soudy: []
  },
  selectedContact: null,
  currentCategory: 'all'
};

function byId(id) {
  return document.getElementById(id);
}

function showToast(message, timeout = 3000) {
  const toast = byId('toast');
  if (!toast) return;
  toast.innerText = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), timeout);
}

function showError(message) {
  showToast(`Chyba: ${message}`, 4500);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function setPrompt(value) {
  const input = byId('aiPromptInput');
  if (!input) return;
  input.value = value;
  toggleInstallmentFields();
  updateStatus();
}

function getSelectedFile() {
  return byId('fileInput')?.files?.[0] || null;
}

function getTotalContacts() {
  return Object.values(state.contactData).reduce((sum, list) => sum + list.length, 0);
}

function updateTotalCount() {
  const totalDisplay = byId('totalCount');
  if (totalDisplay) {
    totalDisplay.innerText = `${getTotalContacts()} kontaktů`;
  }
}

function updateStatus() {
  const promptInput = byId('aiPromptInput');
  const hasFile = !!getSelectedFile();
  const hasContact = state.selectedContact !== null;
  const hasPrompt = !!promptInput && promptInput.value.trim().length > 5;

  const indicator = byId('statusIndicator');
  const text = byId('statusText');
  if (!indicator || !text) return;

  if (hasFile && hasContact && hasPrompt) {
    indicator.style.background = '#10b981';
    indicator.style.boxShadow = '0 0 0 6px rgba(16, 185, 129, 0.15)';
    text.innerText = 'Připraveno ke generování';
    return;
  }

  if (hasFile || hasContact || hasPrompt) {
    indicator.style.background = '#f59e0b';
    indicator.style.boxShadow = 'none';
    text.innerText = 'Doplňte zbývající údaje';
    return;
  }

  indicator.style.background = '#cbd5e1';
  indicator.style.boxShadow = 'none';
  text.innerText = 'Čekám na zadání';
}

function setLoading(isLoading) {
  const btn = byId('aiGenerateBtn');
  const btnText = byId('btnText');
  const btnSpinner = byId('btnSpinner');
  const btnIcon = byId('btnIcon');

  if (btn) btn.disabled = isLoading;
  if (btnText) btnText.innerText = isLoading ? 'ANALYZUJI A GENERUJI...' : 'GENEROVAT LISTINU Z PDF';
  if (btnSpinner) btnSpinner.classList.toggle('hidden', !isLoading);
  if (btnIcon) btnIcon.classList.toggle('hidden', isLoading);
}

function setFileUi(file) {
  const fileNameDisplay = byId('fileNameDisplay');
  const fileIndicator = byId('fileIndicator');
  const clearFileBtn = byId('clearFile');

  if (file) {
    if (fileNameDisplay) fileNameDisplay.innerText = file.name;
    if (fileIndicator) fileIndicator.classList.remove('hidden');
    if (clearFileBtn) clearFileBtn.classList.remove('hidden');
  } else {
    if (fileNameDisplay) fileNameDisplay.innerText = 'Nahrát PDF odesílatele';
    if (fileIndicator) fileIndicator.classList.add('hidden');
    if (clearFileBtn) clearFileBtn.classList.add('hidden');
  }

  updateStatus();
}

function openContactDetail(item, category) {
  const detail = byId('contactDetail');
  if (!detail) return;

  const detailTitle = byId('detailTitle');
  const detailMesto = byId('detailMesto');
  const detailDS = byId('detailDS');
  const detailTel = byId('detailTel');
  const detailHours = byId('detailHours');
  const detailTag = byId('detailTag');

  const dsValue = item.ds || item.datova_schranka || '---';
  const telValue = item.tel || item.telefon_display?.[0] || (Array.isArray(item.telefon) ? item.telefon[0] : item.telefon) || '---';
  const hoursValue = item.oteviraciDoba || item.oteviraci_doba || '---';

  if (detailTitle) detailTitle.innerText = item.nazev || item.nazev_subjektu || item.jmeno_plne || '--';
  if (detailMesto) detailMesto.innerText = item.mesto || item.adresa || item.adresa_pobocky || '--';
  if (detailDS) detailDS.innerText = dsValue;
  if (detailTel) detailTel.innerText = telValue;
  if (detailHours) detailHours.innerText = hoursValue;

  if (detailTag) {
    detailTag.innerText = category;
    detailTag.className = `category-tag cat-${category}`;
  }

  detail.classList.remove('hidden');
}

function closeContactDetail() {
  state.selectedContact = null;
  byId('contactDetail')?.classList.add('hidden');
  renderResults();
  updateStatus();
}

function getVisibleItems() {
  const q = (byId('searchInput')?.value || '').trim().toLowerCase();
  const categories = state.currentCategory === 'all' ? Object.keys(state.contactData) : [state.currentCategory];
  const items = [];

  categories.forEach((cat) => {
    (state.contactData[cat] || []).forEach((item) => {
      const haystack = String(item.search || '').toLowerCase();
      if (!q || haystack.includes(q)) {
        items.push({ ...item, category: cat });
      }
    });
  });

  return items;
}

function renderResults() {
  const res = byId('results');
  if (!res) return;

  const items = getVisibleItems();
  res.innerHTML = '';

  if (!items.length) {
    res.innerHTML = '<div class="empty-state">Nenalezeny žádné záznamy v této kategorii.</div>';
    return;
  }

  items.forEach((item) => {
    const div = document.createElement('button');
    div.type = 'button';
    div.className = `contact-row ${state.selectedContact?.id === item.id ? 'selected' : ''}`;
    div.innerHTML = `
      <div class="contact-text">
        <span class="contact-title">${escapeHtml(item.nazev)}</span>
        <span class="contact-subtitle">${escapeHtml(item.mesto)}</span>
      </div>
      <span class="category-tag cat-${escapeHtml(item.category)}">${escapeHtml(item.category.substring(0, 4))}</span>
    `;

    div.addEventListener('click', () => {
      state.selectedContact = item;
      openContactDetail(item, item.category);
      renderResults();
      updateStatus();
    });

    res.appendChild(div);
  });
}

async function loadContactsFromServer() {
  const response = await fetch('/api/contacts');
  const result = await response.json();

  if (!response.ok || !result.ok) {
    throw new Error(result.error || 'Nepodařilo se načíst kontakty ze serveru.');
  }

  state.contactData = {
    exekutori: [],
    banky: [],
    ossz: [],
    pojistovny: [],
    soudy: []
  };

  for (const item of result.items || []) {
    const category = item.category || 'banky';
    if (!state.contactData[category]) continue;
    state.contactData[category].push(item);
  }

  updateTotalCount();
  renderResults();
  updateStatus();
}

function renderDocument(result) {
  byId('docPlaceholder')?.classList.add('hidden');
  byId('docContent')?.classList.remove('hidden');

  byId('docSenderName').innerText = result.senderName || 'Neuvedeno';
  byId('docSenderAddress').innerText = result.senderAddress || 'Neuvedeno';
  byId('docTargetTitle').innerText = state.selectedContact?.nazev || '--';
  byId('docTargetAddress').innerText = state.selectedContact?.adresa || state.selectedContact?.mesto || '--';
  byId('docRefData').innerText = result.refData || '---';
  byId('docMainTitle').innerText = result.title || 'ÚŘEDNÍ LISTINA';
  byId('docBodyText').innerText = result.body || '';

  const city = (result.senderAddress || '').split(',')[0]?.trim() || 'Praze';
  byId('docDate').innerText = `V ${city} dne ${new Date().toLocaleDateString('cs-CZ')}`;
}

let installmentLastEdited = null;

function isInstallmentPrompt(value) {
  const v = String(value || '').toLowerCase();
  return v.includes('splátkový kalendář') || v.includes('splátkovy kalendar');
}

function toggleInstallmentFields() {
  const wrapper = byId('installmentFields');
  const prompt = byId('aiPromptInput')?.value || '';
  if (!wrapper) return;

  const show = isInstallmentPrompt(prompt);
  wrapper.classList.toggle('hidden', !show);

  if (!show) {
    clearInstallmentFields();
  }
}

function clearInstallmentFields() {
  const debt = byId('debtAmountInput');
  const months = byId('monthsInput');
  const payment = byId('monthlyPaymentInput');
  const hint = byId('installmentHint');

  if (debt) debt.value = '';
  if (months) months.value = '';
  if (payment) payment.value = '';
  if (hint) {
    hint.innerText = '';
    hint.classList.add('hidden');
  }

  installmentLastEdited = null;
}

function parseCzNumber(value) {
  const raw = String(value || '')
    .replace(/\s/g, '')
    .replace(',', '.')
    .trim();

  const num = Number(raw);
  return Number.isFinite(num) ? num : NaN;
}

function formatCzNumber(value, decimals = 2) {
  if (!Number.isFinite(value)) return '';
  return new Intl.NumberFormat('cs-CZ', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value);
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function updateInstallmentHint(message = '') {
  const hint = byId('installmentHint');
  if (!hint) return;

  if (!message) {
    hint.innerText = '';
    hint.classList.add('hidden');
    return;
  }

  hint.innerText = message;
  hint.classList.remove('hidden');
}

function recalcInstallmentFields(triggeredBy = null) {
  const debtInput = byId('debtAmountInput');
  const monthsInput = byId('monthsInput');
  const paymentInput = byId('monthlyPaymentInput');

  if (!debtInput || !monthsInput || !paymentInput) return;

  const debt = parseCzNumber(debtInput.value);
  const months = Number(monthsInput.value);
  const payment = parseCzNumber(paymentInput.value);

  if (!Number.isFinite(debt) || debt <= 0) {
    updateInstallmentHint('');
    return;
  }

  if (triggeredBy === 'months') {
    if (Number.isFinite(months) && months > 0) {
      const computedPayment = round2(debt / months);
      paymentInput.value = formatCzNumber(computedPayment);
      updateInstallmentHint('Měsíční splátka byla dopočtena z dlužné částky a počtu měsíců.');
    }
    return;
  }

  if (triggeredBy === 'payment') {
    if (Number.isFinite(payment) && payment > 0) {
      const computedMonths = Math.ceil(debt / payment);
      monthsInput.value = String(computedMonths);
      updateInstallmentHint('Počet měsíců byl dopočten z dlužné částky a měsíční splátky.');
    }
    return;
  }

  if (triggeredBy === 'debt') {
    if (Number.isFinite(months) && months > 0) {
      const computedPayment = round2(debt / months);
      paymentInput.value = formatCzNumber(computedPayment);
      updateInstallmentHint('Měsíční splátka byla přepočtena podle nové dlužné částky.');
      return;
    }

    if (Number.isFinite(payment) && payment > 0) {
      const computedMonths = Math.ceil(debt / payment);
      monthsInput.value = String(computedMonths);
      updateInstallmentHint('Počet měsíců byl přepočten podle nové dlužné částky.');
      return;
    }
  }

  updateInstallmentHint('');
}

async function extractDebtAmountFromPdf() {
  const file = getSelectedFile();
  if (!file) {
    throw new Error('Nejdřív nahrajte PDF.');
  }

  const formData = new FormData();
  formData.append('pdf', file);

  const response = await fetch('/api/extract-debt', {
    method: 'POST',
    body: formData
  });

  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(result.error || 'Nepodařilo se načíst dlužnou částku z PDF.');
  }

  return result.debtAmount || '';
}

async function generateDocumentViaServer() {
  const file = getSelectedFile();
  const prompt = byId('aiPromptInput')?.value?.trim() || '';
  let aiContext = byId('inputAiContext')?.value?.trim() || '';

  if (!state.selectedContact) throw new Error('Není vybraný příjemce.');
  if (!file) throw new Error('Není nahrané PDF.');
  if (prompt.length < 5) throw new Error('Zadejte konkrétnější účel listiny.');

  if (isInstallmentPrompt(prompt)) {
    const debt = byId('debtAmountInput')?.value?.trim() || '';
    const months = byId('monthsInput')?.value?.trim() || '';
    const payment = byId('monthlyPaymentInput')?.value?.trim() || '';

    const installmentContext = [
      debt ? `Dlužná částka: ${debt} Kč` : '',
      months ? `Počet měsíců: ${months}` : '',
      payment ? `Měsíční splátka: ${payment} Kč` : ''
    ].filter(Boolean).join('\n');

    if (installmentContext) {
      aiContext = aiContext ? `${aiContext}\n\n${installmentContext}` : installmentContext;
    }
  }

  const formData = new FormData();
  formData.append('pdf', file);
  formData.append('prompt', prompt);
  formData.append('aiContext', aiContext);
  formData.append('recipient', JSON.stringify(state.selectedContact));

  const response = await fetch('/api/generate', {
    method: 'POST',
    body: formData
  });

  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(result.error || 'Generování selhalo.');
  }

  return result.document;
}

function bindEvents() {
  byId('fileInput')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0] || null;
    if (file && file.type !== 'application/pdf') {
      e.target.value = '';
      setFileUi(null);
      showError('Vybraný soubor není PDF.');
      return;
    }
    setFileUi(file);
  });

  byId('clearFile')?.addEventListener('click', () => {
    const fileInput = byId('fileInput');
    if (fileInput) fileInput.value = '';
    setFileUi(null);
  });

  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.currentCategory = btn.dataset.category;
      renderResults();
    });
  });

  document.querySelectorAll('.quick-tag').forEach((tag) => {
    tag.addEventListener('click', () => setPrompt(tag.dataset.prompt || ''));
  });

  byId('searchInput')?.addEventListener('input', renderResults);
  byId('aiPromptInput')?.addEventListener('input', () => {
    toggleInstallmentFields();
    updateStatus();
  });
  byId('closeDetail')?.addEventListener('click', closeContactDetail);
  byId('toggleContextBtn')?.addEventListener('click', () => {
    byId('contextWrapper')?.classList.toggle('hidden');
  });

  byId('debtAmountInput')?.addEventListener('input', () => {
    installmentLastEdited = 'debt';
    recalcInstallmentFields('debt');
  });

  byId('monthsInput')?.addEventListener('input', () => {
    installmentLastEdited = 'months';
    recalcInstallmentFields('months');
  });

  byId('monthlyPaymentInput')?.addEventListener('input', () => {
    installmentLastEdited = 'payment';
    recalcInstallmentFields('payment');
  });

  byId('extractDebtBtn')?.addEventListener('click', async () => {
    try {
      const debtAmount = await extractDebtAmountFromPdf();
      const debtInput = byId('debtAmountInput');
      if (debtInput) {
        debtInput.value = debtAmount;
        recalcInstallmentFields('debt');
      }
      showToast(debtAmount ? 'Dlužná částka byla načtena z PDF.' : 'Dlužná částka v PDF nebyla nalezena.');
    } catch (error) {
      showError(error.message);
    }
  });

  byId('aiGenerateBtn')?.addEventListener('click', async () => {
    try {
      setLoading(true);
      const result = await generateDocumentViaServer();
      renderDocument(result);
      showToast('Listina byla úspěšně vygenerována.');
    } catch (error) {
      showError(error.message);
    } finally {
      setLoading(false);
    }
  });

  byId('printBtn')?.addEventListener('click', () => window.print());
  byId('downloadPdfBtn')?.addEventListener('click', () => window.print());
}

async function initApp() {
  bindEvents();

  try {
    await loadContactsFromServer();
  } catch (error) {
    console.error('Chyba při načítání kontaktů:', error);
    showError(error.message);
  }

  toggleInstallmentFields();
  updateStatus();
}

initApp();
