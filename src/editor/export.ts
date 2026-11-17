import { getFontEmbedCSS, toJpeg, toPng } from 'html-to-image';
import type { FormatDef } from './formats';

function download(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function prepare(node: HTMLElement) {
  await document.fonts.ready;
  return getFontEmbedCSS(node);
}

export async function exportPng(nodes: HTMLElement[], scale: number, baseName: string, pageNumbers?: number[]) {
  if (!nodes.length) return;
  const fontEmbedCSS = await prepare(nodes[0]);
  for (let i = 0; i < nodes.length; i++) {
    const url = await toPng(nodes[i], { pixelRatio: scale, fontEmbedCSS });
    const n = pageNumbers?.[i] ?? i + 1;
    download(url, nodes.length === 1 && !pageNumbers ? `${baseName}.png` : `${baseName}-pagina-${n}.png`);
    if (i < nodes.length - 1) await wait(400);
  }
}

export async function exportPdf(
  nodes: HTMLElement[],
  fmt: FormatDef,
  scale: number,
  baseName: string,
  mode: 'download' | 'print',
) {
  if (!nodes.length) return;
  const { jsPDF } = await import('jspdf');
  const fontEmbedCSS = await prepare(nodes[0]);
  const orientation = fmt.width > fmt.height ? 'landscape' : 'portrait';
  const pdf = new jsPDF({ orientation, unit: 'px', format: [fmt.width, fmt.height], hotfixes: ['px_scaling'] });

  for (let i = 0; i < nodes.length; i++) {
    const url = await toJpeg(nodes[i], { pixelRatio: scale, fontEmbedCSS, quality: 0.92, backgroundColor: '#ffffff' });
    if (i > 0) pdf.addPage([fmt.width, fmt.height], orientation);
    pdf.addImage(url, 'JPEG', 0, 0, fmt.width, fmt.height, undefined, 'FAST');
  }

  if (mode === 'print') {
    pdf.autoPrint();
    window.open(pdf.output('bloburl'), '_blank');
  } else {
    pdf.save(`${baseName}.pdf`);
  }
}

export function fileBaseName(title: string) {
  const slug = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `encarte-${slug || 'ofertas'}`;
}
