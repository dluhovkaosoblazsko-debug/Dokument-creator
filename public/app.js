const state = {
  contactData: { exekutori: [], banky: [], ossz: [], pojistovny: [], soudy: [] },
  selectedContact: null,
  currentCategory: 'all'
};

function byId(id) { return document.getElementById(id); }

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

function getSelectedFile() {
  return byId('fileInput')?.files?.[0] || null;
}

function getTotalContacts() {
  return Object.values(state.contactData).reduce((sum, list) => sum + list.length, 0);
}

function updateTotalCount() {
  const totalDisplay = byId('totalCount');
  if (totalDisplay) totalDisplay.innerText = `${getTotalContacts()} kontaktů`;
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
  const dsValue = item.ds || item.datova_schranka || '---';
  const telValue = item.tel || item.telefon_display?.[0] || (Array.isArray(item.telefon) ? item.telefon[0] : item.telefon) || '---';
  const hoursValue = item.oteviraciDoba || item.oteviraci_doba || '---';

  if (byId('detailTitle')) byId('detailTitle').innerText = item.nazev || item.nazev_subjektu || item.jmeno_plne || '--';
  if (byId('detailMesto')) byId('detailMesto').innerText = item.mesto || item.adresa || item.adresa_pobocky || '--';
  if (byId('detailDS')) byId('detailDS').innerText = dsValue;
  if (byId('detailTel')) byId('detailTel').innerText = telValue;
  if (byId('detailHours')) byId('detailHours').innerText = hoursValue;

  const detailTag = byId('detailTag');
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
      if (!q || haystack.includes(q)) items.push({ ...item, category: cat });
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
  if (!response.ok || !result.ok) throw new Error(result.error || 'Nepodařilo se načíst kontakty ze serveru.');

  state.contactData = { exekutori: [], banky: [], ossz: [], pojistovny: [], soudy: [] };
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

function isInstallmentPrompt(value) {
  const v = String(value || '').toLowerCase();
  return v.includes('splátkový kalendář') || v.includes('splátkovy kalendar');
}

function isStopExecutionPrompt(value) {
  const v = String(value || '').toLowerCase();
  return v.includes('zastavení exekuce') || v.includes('zastaveni exekuce');
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
}

function toggleInstallmentFields() {
  const wrapper = byId('installmentFields');
  const prompt = byId('aiPromptInput')?.value || '';
  if (!wrapper) return;
  const show = isInstallmentPrompt(prompt);
  wrapper.classList.toggle('hidden', !show);
  if (!show) clearInstallmentFields();
}

function parseCzNumber(value) {
  const raw = String(value || '').replace(/\s/g, '').replace(',', '.').trim();
  const num = Number(raw);
  return Number.isFinite(num) ? num : NaN;
}

function formatCzNumber(value, decimals = 2) {
  if (!Number.isFinite(value)) return '';
  return new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
}

function round2(value) { return Math.round(value * 100) / 100; }

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

  if (triggeredBy === 'months' && Number.isFinite(months) && months > 0) {
    paymentInput.value = formatCzNumber(round2(debt / months));
    updateInstallmentHint('Měsíční splátka byla dopočtena z dlužné částky a počtu měsíců.');
    return;
  }

  if (triggeredBy === 'payment' && Number.isFinite(payment) && payment > 0) {
    monthsInput.value = String(Math.ceil(debt / payment));
    updateInstallmentHint('Počet měsíců byl dopočten z dlužné částky a měsíční splátky.');
    return;
  }

  if (triggeredBy === 'debt') {
    if (Number.isFinite(months) && months > 0) {
      paymentInput.value = formatCzNumber(round2(debt / months));
      updateInstallmentHint('Měsíční splátka byla přepočtena podle nové dlužné částky.');
      return;
    }
    if (Number.isFinite(payment) && payment > 0) {
      monthsInput.value = String(Math.ceil(debt / payment));
      updateInstallmentHint('Počet měsíců byl přepočten podle nové dlužné částky.');
      return;
    }
  }

  updateInstallmentHint('');
}

function getRadioValue(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value || '';
}

function setPrompt(value) {
  const input = byId('aiPromptInput');
  if (!input) return;
  input.value = value;
  toggleInstallmentFields();
  toggleStopExecutionFields();
  updateStatus();
}

function prefillStopExecutionDefaults() {
  const dateInput = byId('seDate');
  if (dateInput && !dateInput.value) dateInput.value = new Date().toISOString().slice(0, 10);
}

function toggleStopExecutionSubsections() {
  const role = getRadioValue('seNavrhovatelRole') || 'povinny';
  const opravnenyPO = !!byId('seOpravnenyPO')?.checked;
  const povinnyPO = !!byId('sePovinnyPO')?.checked;
  const spouseActive = !!byId('seSpouseActive')?.checked;
  const costsActive = !!byId('seCostsActive')?.checked;
  const noticeNotDelivered = !!byId('seNoticeNotDelivered')?.checked;
  const filingType = getRadioValue('seFilingType') || 'listinne';

  byId('seOpravnenyRepWrap')?.classList.toggle('hidden', !opravnenyPO);
  byId('sePovinnyRepWrap')?.classList.toggle('hidden', !povinnyPO);
  byId('seSpouseWrap')?.classList.toggle('hidden', !spouseActive);
  byId('seCostsWrap')?.classList.toggle('hidden', !costsActive);
  byId('seCopiesWrap')?.classList.toggle('hidden', filingType !== 'listinne');

  const noticeDate = byId('seNoticeDate');
  if (noticeDate) {
    noticeDate.disabled = noticeNotDelivered;
    if (noticeNotDelivered) noticeDate.value = '';
  }

  byId('seTimeSection')?.classList.toggle('hidden', role !== 'povinny');
  byId('seOpravnenySection')?.classList.toggle('hidden', role === 'manzel_povinneho');
  byId('seCostsSection')?.classList.toggle('hidden', role === 'manzel_povinneho');
  byId('seSpouseSection')?.classList.toggle('hidden', role !== 'manzel_povinneho' && !spouseActive);
}

function toggleStopExecutionFields() {
  const wrapper = byId('stopExecutionFields');
  const prompt = byId('aiPromptInput')?.value || '';
  if (!wrapper) return;
  const show = isStopExecutionPrompt(prompt);
  wrapper.classList.toggle('hidden', !show);
  if (show) prefillStopExecutionDefaults();
  toggleStopExecutionSubsections();
}

function fillStopExecutionForm(data) {
  if (!data) return;
  if (data.exekutor && byId('seExecutorName')) byId('seExecutorName').value = data.exekutor;
  if (data.exekutorskyUrad && byId('seOfficeName')) byId('seOfficeName').value = data.exekutorskyUrad;
  if (data.adresaUradu && byId('seOfficeAddress')) byId('seOfficeAddress').value = data.adresaUradu;
  if (data.spisovaZnacka && byId('seCaseNo')) byId('seCaseNo').value = data.spisovaZnacka;
  if (data.opravneny && byId('seOpravnenyName')) byId('seOpravnenyName').value = data.opravneny;
  if (data.povinny && byId('sePovinnyName')) byId('sePovinnyName').value = data.povinny;
  if (data.exekucniTitul && byId('seTitleBasis')) byId('seTitleBasis').value = data.exekucniTitul;
  if (data.datumVyzvy && byId('seNoticeDate')) byId('seNoticeDate').value = data.datumVyzvy;
  toggleStopExecutionSubsections();
}

function buildStopExecutionContext() {
  const data = {
    executorName: byId('seExecutorName')?.value?.trim() || '',
    officeName: byId('seOfficeName')?.value?.trim() || '',
    officeAddress: byId('seOfficeAddress')?.value?.trim() || '',
    caseNo: byId('seCaseNo')?.value?.trim() || '',
    place: byId('sePlace')?.value?.trim() || '',
    date: byId('seDate')?.value?.trim() || '',
    navrhovatelRole: getRadioValue('seNavrhovatelRole'),
    opravnenyPO: !!byId('seOpravnenyPO')?.checked,
    opravnenyName: byId('seOpravnenyName')?.value?.trim() || '',
    opravnenyId: byId('seOpravnenyId')?.value?.trim() || '',
    opravnenyAddress: byId('seOpravnenyAddress')?.value?.trim() || '',
    opravnenyDelivery: byId('seOpravnenyDelivery')?.value?.trim() || '',
    opravnenyRep: byId('seOpravnenyRep')?.value?.trim() || '',
    opravnenyRepBasis: byId('seOpravnenyRepBasis')?.value?.trim() || '',
    povinnyPO: !!byId('sePovinnyPO')?.checked,
    povinnyName: byId('sePovinnyName')?.value?.trim() || '',
    povinnyId: byId('sePovinnyId')?.value?.trim() || '',
    povinnyAddress: byId('sePovinnyAddress')?.value?.trim() || '',
    povinnyDelivery: byId('sePovinnyDelivery')?.value?.trim() || '',
    povinnyRep: byId('sePovinnyRep')?.value?.trim() || '',
    povinnyRepBasis: byId('sePovinnyRepBasis')?.value?.trim() || '',
    spouseActive: !!byId('seSpouseActive')?.checked,
    spouseName: byId('seSpouseName')?.value?.trim() || '',
    spouseId: byId('seSpouseId')?.value?.trim() || '',
    spouseAddress: byId('seSpouseAddress')?.value?.trim() || '',
    filingType: getRadioValue('seFilingType'),
    copies: byId('seCopies')?.value?.trim() || '',
    attachmentsType: getRadioValue('seAttachmentsType'),
    titleBasis: byId('seTitleBasis')?.value?.trim() || '',
    reasons: byId('seReasons')?.value?.trim() || '',
    evidence: byId('seEvidence')?.value?.trim() || '',
    costsActive: !!byId('seCostsActive')?.checked,
    costsAmount: byId('seCostsAmount')?.value?.trim() || '',
    costsBreakdown: byId('seCostsBreakdown')?.value?.trim() || '',
    costsEvidence: byId('seCostsEvidence')?.value?.trim() || '',
    reasonKnownDate: byId('seReasonKnownDate')?.value?.trim() || '',
    reasonKnownHow: byId('seReasonKnownHow')?.value?.trim() || '',
    noticeDate: byId('seNoticeDate')?.value?.trim() || '',
    noticeNotDelivered: !!byId('seNoticeNotDelivered')?.checked,
    timeEvidence: byId('seTimeEvidence')?.value?.trim() || ''
  };

  const lines = [
    'FORMULÁŘ: NÁVRH NA ZASTAVENÍ EXEKUCE',
    data.executorName ? `Soudní exekutor: ${data.executorName}` : '',
    data.officeName ? `Exekutorský úřad: ${data.officeName}` : '',
    data.officeAddress ? `Adresa exekutorského úřadu: ${data.officeAddress}` : '',
    data.caseNo ? `Spisová značka: ${data.caseNo}` : '',
    data.place ? `Místo sepsání: ${data.place}` : '',
    data.date ? `Datum: ${data.date}` : '',
    data.navrhovatelRole ? `Navrhovatel: ${data.navrhovatelRole}` : '',
    data.opravnenyName ? `Oprávněný: ${data.opravnenyName}` : '',
    data.opravnenyId ? `Oprávněný identifikátor: ${data.opravnenyId}` : '',
    data.opravnenyAddress ? `Oprávněný adresa: ${data.opravnenyAddress}` : '',
    data.opravnenyDelivery ? `Oprávněný doručovací adresa: ${data.opravnenyDelivery}` : '',
    data.opravnenyPO ? 'Oprávněný je právnická osoba.' : '',
    data.opravnenyRep ? `Za oprávněného jedná: ${data.opravnenyRep}` : '',
    data.opravnenyRepBasis ? `Na základě: ${data.opravnenyRepBasis}` : '',
    data.povinnyName ? `Povinný: ${data.povinnyName}` : '',
    data.povinnyId ? `Povinný identifikátor: ${data.povinnyId}` : '',
    data.povinnyAddress ? `Povinný adresa: ${data.povinnyAddress}` : '',
    data.povinnyDelivery ? `Povinný doručovací adresa: ${data.povinnyDelivery}` : '',
    data.povinnyPO ? 'Povinný je právnická osoba.' : '',
    data.povinnyRep ? `Za povinného jedná: ${data.povinnyRep}` : '',
    data.povinnyRepBasis ? `Na základě: ${data.povinnyRepBasis}` : '',
    data.spouseActive ? 'Manžel/ka povinného je účastníkem řízení.' : '',
    data.spouseName ? `Manžel povinného: ${data.spouseName}` : '',
    data.spouseId ? `Manžel povinného identifikátor: ${data.spouseId}` : '',
    data.spouseAddress ? `Manžel povinného adresa: ${data.spouseAddress}` : '',
    data.filingType ? `Forma podání: ${data.filingType}` : '',
    data.filingType === 'listinne' && data.copies ? `Počet vyhotovení: ${data.copies}` : '',
    data.attachmentsType ? `Přílohy: ${data.attachmentsType}` : '',
    data.titleBasis ? `Exekuční titul: ${data.titleBasis}` : '',
    data.reasons ? `Důvod zastavení exekuce: ${data.reasons}` : '',
    data.evidence ? `Důkazy: ${data.evidence}` : '',
    data.costsActive ? 'Navrhovatel uplatňuje nárok na náhradu nákladů.' : '',
    data.costsAmount ? `Výše nákladů: ${data.costsAmount}` : '',
    data.costsBreakdown ? `Rozpis nákladů: ${data.costsBreakdown}` : '',
    data.costsEvidence ? `Důkazy k nákladům: ${data.costsEvidence}` : '',
    data.reasonKnownDate ? `Datum, kdy se navrhovatel dozvěděl o důvodu: ${data.reasonKnownDate}` : '',
    data.reasonKnownHow ? `Jak se navrhovatel o důvodu dozvěděl: ${data.reasonKnownHow}` : '',
    data.noticeNotDelivered ? 'Výzva ke splnění vymáhané povinnosti nebyla doručena.' : '',
    !data.noticeNotDelivered && data.noticeDate ? `Výzva ke splnění byla doručena dne: ${data.noticeDate}` : '',
    data.timeEvidence ? `Důkazy k časovým údajům: ${data.timeEvidence}` : '',
    'Na základě výše uvedeného má být vytvořen formální návrh na zastavení exekuce v češtině.'
  ];

  return lines.filter(Boolean).join('\n');
}

async function extractDebtAmountFromPdf() {
  const file = getSelectedFile();
  if (!file) throw new Error('Nejdřív nahrajte PDF.');
  const formData = new FormData();
  formData.append('pdf', file);
  const response = await fetch('/api/extract-debt', { method: 'POST', body: formData });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || 'Nepodařilo se načíst dlužnou částku z PDF.');
  return result.debtAmount || '';
}

async function extractStopExecutionFromPdf() {
  const file = getSelectedFile();
  if (!file) throw new Error('Nejdřív nahrajte PDF.');
  const formData = new FormData();
  formData.append('pdf', file);
  const response = await fetch('/api/extract-stop-execution', { method: 'POST', body: formData });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || 'Extrakce údajů z PDF selhala.');
  return result.data || {};
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
    if (installmentContext) aiContext = aiContext ? `${aiContext}\n\n${installmentContext}` : installmentContext;
  }

  if (isStopExecutionPrompt(prompt)) {
    const stopContext = buildStopExecutionContext();
    if (stopContext) aiContext = aiContext ? `${aiContext}\n\n${stopContext}` : stopContext;
  }

  const formData = new FormData();
  formData.append('pdf', file);
  formData.append('prompt', prompt);
  formData.append('aiContext', aiContext);
  formData.append('recipient', JSON.stringify(state.selectedContact));

  const response = await fetch('/api/generate', { method: 'POST', body: formData });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || 'Generování selhalo.');
  return result.document;
}

async function downloadDocx() {
  const payload = {
    senderName: byId("docSenderName")?.innerText || "",
    senderAddress: byId("docSenderAddress")?.innerText || "",
    recipientName: byId("docTargetTitle")?.innerText || "",
    recipientAddress: byId("docTargetAddress")?.innerText || "",
    refData: byId("docRefData")?.innerText || "",
    dateText: byId("docDate")?.innerText || "",
    title: byId("docMainTitle")?.innerText || "",
    body: byId("docBodyText")?.innerText || ""
  };

  const response = await fetch("/api/export-docx", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || "Stažení DOCX selhalo.");
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "listina.docx";
  document.body.appendChild(a);
  a.click();
  a.remove();

  window.URL.revokeObjectURL(url);
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
  
byId("downloadDocxBtn")?.addEventListener("click", async () => {
  try {
    await downloadDocx();
    showToast("Soubor DOCX byl stažen.");
  } catch (error) {
    showError(error.message);
  }
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
    toggleStopExecutionFields();
    updateStatus();
  });

  byId('closeDetail')?.addEventListener('click', closeContactDetail);
  byId('toggleContextBtn')?.addEventListener('click', () => byId('contextWrapper')?.classList.toggle('hidden'));

  byId('debtAmountInput')?.addEventListener('input', () => recalcInstallmentFields('debt'));
  byId('monthsInput')?.addEventListener('input', () => recalcInstallmentFields('months'));
  byId('monthlyPaymentInput')?.addEventListener('input', () => recalcInstallmentFields('payment'));

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

  byId('extractStopExecutionBtn')?.addEventListener('click', async () => {
    try {
      const data = await extractStopExecutionFromPdf();
      fillStopExecutionForm(data);
      showToast('Formulář zastavení exekuce byl předvyplněn z PDF.');
    } catch (error) {
      showError(error.message);
    }
  });

  byId('seOpravnenyPO')?.addEventListener('change', toggleStopExecutionSubsections);
  byId('sePovinnyPO')?.addEventListener('change', toggleStopExecutionSubsections);
  byId('seSpouseActive')?.addEventListener('change', toggleStopExecutionSubsections);
  byId('seCostsActive')?.addEventListener('change', toggleStopExecutionSubsections);
  byId('seNoticeNotDelivered')?.addEventListener('change', toggleStopExecutionSubsections);
  document.querySelectorAll('input[name="seFilingType"]').forEach((el) => el.addEventListener('change', toggleStopExecutionSubsections));
  document.querySelectorAll('input[name="seNavrhovatelRole"]').forEach((el) => el.addEventListener('change', toggleStopExecutionSubsections));

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
  toggleStopExecutionFields();
  updateStatus();
}

initApp();
