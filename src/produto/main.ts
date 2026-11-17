import '@fontsource/montserrat/latin-700.css';
import '@fontsource/montserrat/latin-800.css';
import '@fontsource/montserrat/latin-900.css';
import '@fontsource/anton/latin-400.css';
import './produto.css';
import { parseBRNumber } from '../editor/parser';
import { ensureFonts, renderSingleProduct } from './render';
import { getTemplate, TEMPLATES } from './template';

const STORAGE_KEY = 'encartesforte:produto-unico';
let template = TEMPLATES[0];

const form = document.getElementById('form') as HTMLFormElement;
const nameInput = document.getElementById('nome') as HTMLInputElement;
const priceInput = document.getElementById('valor') as HTMLInputElement;
const unitInput = document.getElementById('unidade') as HTMLInputElement;
const canvas = document.getElementById('preview') as HTMLCanvasElement;
const downloadBtn = document.getElementById('baixar') as HTMLButtonElement;
const priceError = document.getElementById('valorErro') as HTMLElement;
const modelList = document.getElementById('modelos') as HTMLElement;

// Restaura os últimos valores usados.
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
  if (saved) {
    nameInput.value = saved.name ?? '';
    priceInput.value = saved.price ?? '';
    unitInput.value = saved.unit ?? '';
    if (saved.template) template = getTemplate(saved.template);
  }
} catch { /* ignora */ }

// Lista de modelos (miniaturas clicáveis).
for (const t of TEMPLATES) {
  const label = document.createElement('label');
  label.className = 'model';
  label.innerHTML = `
    <input type="radio" name="modelo" value="${t.id}">
    <img src="${t.src}" alt="">
    <span>${t.name}</span>`;
  const radio = label.querySelector('input')!;
  radio.checked = t.id === template.id;
  radio.addEventListener('change', () => {
    template = getTemplate(radio.value);
    update();
  });
  modelList.appendChild(label);
}

function readData() {
  const price = parseBRNumber(priceInput.value);
  const invalid = priceInput.value.trim() !== '' && price == null;
  priceError.hidden = !invalid;
  return { name: nameInput.value, price, unit: unitInput.value };
}

let pending = 0;
async function update() {
  const ticket = ++pending;
  const data = readData();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: nameInput.value, price: priceInput.value, unit: unitInput.value, template: template.id }));
  await ensureFonts();
  if (ticket !== pending) return; // já existe uma atualização mais nova
  await renderSingleProduct(canvas, template, data);
}

form.addEventListener('input', update);
form.addEventListener('submit', (e) => e.preventDefault());

priceInput.addEventListener('blur', () => {
  const v = parseBRNumber(priceInput.value);
  if (v != null) priceInput.value = v.toFixed(2).replace('.', ',');
});

downloadBtn.addEventListener('click', async () => {
  await update();
  const slug = nameInput.value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `oferta-${slug || 'produto'}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
});

update();
