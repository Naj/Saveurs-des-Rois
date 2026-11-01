/* Saveurs des Rois — PDF en fichier (pièce jointe, partage) : la feuille A4 est photographiée puis mise en page.
   Utilisé par le devis ; même principe que la facture. */

function chargerLib(src, nom) {
  if (window[nom]) return Promise.resolve();
  return new Promise((ok, ko) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => ko(new Error('Module PDF indisponible : rechargez la page.')); document.head.append(s); });
}

// el : la feuille ; avant / apres : passage en rendu « papier » puis retour à l'écran
export async function pdfDepuis(el, { avant, apres, titre = '', auteur = 'Saveurs des Rois' }) {
  await chargerLib('/admin/vendor/html2canvas.min.js?v=3.7', 'html2canvas');
  await chargerLib('/admin/vendor/jspdf.umd.min.js?v=3.7', 'jspdf');
  document.activeElement?.blur();
  await document.fonts.ready;
  avant?.(); el.classList.add('capture');
  let canvas;
  try {
    await Promise.all([...el.querySelectorAll('img')].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
    canvas = await window.html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true, windowWidth: 1100, logging: false });
  } finally { el.classList.remove('capture'); apres?.(); }
  const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const pageH = Math.round(canvas.width * 297 / 210);
  for (let y = 0, n = 0; y < canvas.height - pageH * 0.02; y += pageH, n++) {
    const h = Math.min(pageH, canvas.height - y);
    const c = document.createElement('canvas'); c.width = canvas.width; c.height = pageH;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
    if (n) pdf.addPage();
    pdf.addImage(c.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 210, 297);
  }
  pdf.setProperties({ title: titre, author: auteur });
  return pdf.output('blob');
}

export const enBase64 = blob => new Promise((ok, ko) => {
  const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = () => ko(new Error('Lecture du PDF impossible.')); r.readAsDataURL(blob);
});

export function telechargerBlob(blob, nom) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nom;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export const peutPartager = (() => { try { return Boolean(navigator.canShare?.({ files: [new File(['x'], 'x.pdf', { type: 'application/pdf' })] })); } catch { return false; } })();
