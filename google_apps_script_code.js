/**
 * =========================================================================
 * GOOGLE APPS SCRIPT: SINKRONISASI & DASHBOARD REKAP PENJUALAN SHORT ED
 * Spreadsheet Target : REKAP PILAR SALES SHORT ED
 * Sheet 1            : Sheet1 (Data Mentah dari Supabase)
 * Sheet 2            : Dashboard (Dashboard Interaktif Eksekutif & KPI)
 * Frekuensi Update   : Setiap 4 Jam (Otomatis) / Tombol Manual
 * =========================================================================
 */

// ── KONFIGURASI SUPABASE ──
const SUPABASE_CONFIG = {
  url: 'https://wjbyrbbqumqpbqhkdpus.supabase.co',
  key: 'sb_publishable_s0k06SAx7sw6xG-KUafPLQ_wpI1dzjc',
  sheetData: 'Sheet1',
  sheetDashboard: 'Dashboard',
  // Daftar outlet & AM uji coba yang dieksklusi secara permanen
  excludedOutlets: ['ADMIN-TEST', 'HQ-OSS'],
  excludedAMs: ['HENDRI']
};

/**
 * SINKRONISASI DATA PENJUALAN DARI SUPABASE KE SHEET1
 * - Otomatis mengecualikan outlet ADMIN-TEST (HQ-OSS) & AM HENDRI
 * - Full Overwrite: Membersihkan data lama agar data yang dihapus di Supabase hilang
 * - Menuliskan Banner Indikator "Last Update" di Baris 1
 */
function syncSalesToGoogleSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SUPABASE_CONFIG.sheetData);
  
  if (!sheet) {
    sheet = ss.getActiveSheet();
  }

  Logger.log('Memulai penarikan data penjualan dari Supabase...');
  
  let salesData = fetchSalesFromSupabase();
  Logger.log('Total transaksi mentah diambil: ' + salesData.length);

  // Filter keluar akun uji coba (ADMIN-TEST / HQ-OSS dan AM HENDRI)
  salesData = salesData.filter(function(item) {
    const outCode = String(item.outlet_code || '').trim().toUpperCase();
    const outName = String(item.outlet_name || '').trim().toUpperCase();
    const amName = String(item.am_name || '').trim().toUpperCase();

    if (SUPABASE_CONFIG.excludedOutlets.indexOf(outCode) !== -1) return false;
    if (outName.indexOf('ADMIN-TEST') !== -1 || outName.indexOf('ADMIN TEST') !== -1) return false;
    if (SUPABASE_CONFIG.excludedAMs.indexOf(amName) !== -1) return false;
    return true;
  });

  Logger.log('Total transaksi riil operasional setelah filter: ' + salesData.length);

  // Bersihkan SELURUH isi sheet lama (Full Overwrite)
  sheet.clear();
  sheet.clearFormats();

  // Waktu Update (WIB / GMT+7)
  const now = new Date();
  const timeZone = 'Asia/Jakarta';
  const formattedTime = Utilities.formatDate(now, timeZone, 'EEEE, dd MMM yyyy HH:mm:ss') + ' WIB';
  const bannerText = '🕒 Terakhir Diperbarui: ' + formattedTime + '   |   Total Data: ' + salesData.length + ' Transaksi (Eksklusi Data Test)   |   Status: Sinkronisasi Berhasil';

  // Tulis Banner Indikator Last Update di Baris 1
  const bannerRange = sheet.getRange(1, 1, 1, 12);
  bannerRange.merge();
  bannerRange.setValue(bannerText);
  bannerRange.setBackground('#dcfce7');
  bannerRange.setFontColor('#15803d');
  bannerRange.setFontWeight('bold');
  bannerRange.setFontSize(10);
  bannerRange.setHorizontalAlignment('center');
  bannerRange.setVerticalAlignment('middle');
  sheet.setRowHeight(1, 32);

  sheet.setRowHeight(2, 10);

  // Header Tabel di Baris 3
  const headers = [
    'Nama Apotek',
    'Kode Outlet',
    'Area Manager (AM)',
    'Tanggal Transaksi',
    'Nomor Struk',
    'Kode Produk',
    'Nama Produk',
    'Qty Terjual',
    'Harga Satuan (Rp)',
    'Total Penjualan (Rp)',
    'Waktu Input Sistem',
    'Periode Bulan'
  ];

  const headerRange = sheet.getRange(3, 1, 1, 12);
  headerRange.setValues([headers]);
  headerRange.setBackground('#0f172a');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');
  headerRange.setFontSize(10);
  headerRange.setHorizontalAlignment('center');
  headerRange.setVerticalAlignment('middle');
  sheet.setRowHeight(3, 30);

  // Tulis Data ke Baris 4 dst
  if (salesData && salesData.length > 0) {
    const rows = salesData.map(function(item) {
      const receiptNo = item.receipt_number ? "'" + String(item.receipt_number).trim() : "'-";
      const productCode = item.product_code ? "'" + String(item.product_code).trim() : "'-";
      const createdAt = item.created_at ? Utilities.formatDate(new Date(item.created_at), timeZone, 'yyyy-MM-dd HH:mm:ss') : '-';
      const periodMonth = item.transaction_date ? String(item.transaction_date).substring(0, 7) : '-';

      return [
        item.outlet_name || item.outlet_code || '-',
        item.outlet_code || '-',
        item.am_name || '-',
        item.transaction_date || '-',
        receiptNo,
        productCode,
        item.item_description || '(Tidak diketahui)',
        Number(item.qty) || 0,
        Number(item.unit_price) || 0,
        Number(item.total_price) || 0,
        createdAt,
        periodMonth
      ];
    });

    const dataRange = sheet.getRange(4, 1, rows.length, 12);
    dataRange.setValues(rows);

    // Format Angka & Tampilan
    sheet.getRange(4, 4, rows.length, 1).setNumberFormat('yyyy-mm-dd').setHorizontalAlignment('center');
    sheet.getRange(4, 5, rows.length, 2).setHorizontalAlignment('center');
    sheet.getRange(4, 8, rows.length, 1).setNumberFormat('#,##0.##').setHorizontalAlignment('right');
    sheet.getRange(4, 9, rows.length, 2).setNumberFormat('"Rp "#,##0').setHorizontalAlignment('right');
    sheet.getRange(4, 11, rows.length, 2).setHorizontalAlignment('center');

    sheet.getRange(3, 1, rows.length + 1, 12).setBorder(true, true, true, true, true, true, '#cbd5e1', SpreadsheetApp.BorderStyle.SOLID);
  }

  sheet.setFrozenRows(3);

  // Lebar kolom
  sheet.setColumnWidth(1, 240);
  sheet.setColumnWidth(2, 120);
  sheet.setColumnWidth(3, 160);
  sheet.setColumnWidth(4, 120);
  sheet.setColumnWidth(5, 120);
  sheet.setColumnWidth(6, 120);
  sheet.setColumnWidth(7, 280);
  sheet.setColumnWidth(8, 90);
  sheet.setColumnWidth(9, 120);
  sheet.setColumnWidth(10, 130);
  sheet.setColumnWidth(11, 150);
  sheet.setColumnWidth(12, 100);

  Logger.log('Sinkronisasi Sheet1 selesai pada ' + formattedTime);
}

/**
 * =========================================================================
 * 1️⃣ LANGKAH 1: MEMBUAT SELURUH LAYOUT, FORMULA & TABEL DASHBOARD
 *    (Dijalankan terlebih dahulu sampai selesai 100% tanpa membuat grafik)
 * =========================================================================
 */
function step1_setupDashboardData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let dashSheet = ss.getSheetByName(SUPABASE_CONFIG.sheetDashboard);

  if (!dashSheet) {
    const sheet2 = ss.getSheetByName('Sheet2');
    if (sheet2) {
      sheet2.setName(SUPABASE_CONFIG.sheetDashboard);
      dashSheet = sheet2;
    } else {
      dashSheet = ss.insertSheet(SUPABASE_CONFIG.sheetDashboard);
    }
  }

  // Bersihkan sheet
  dashSheet.clear();
  dashSheet.clearFormats();

  // Hapus seluruh chart lama agar tidak bertumpuk
  const existingCharts = dashSheet.getCharts();
  for (let i = 0; i < existingCharts.length; i++) {
    dashSheet.removeChart(existingCharts[i]);
  }

  // Atur lebar kolom
  dashSheet.setColumnWidth(1, 20);  // Col A
  dashSheet.setColumnWidth(2, 210); // Col B
  dashSheet.setColumnWidth(3, 140); // Col C
  dashSheet.setColumnWidth(4, 110); // Col D
  dashSheet.setColumnWidth(5, 130); // Col E
  dashSheet.setColumnWidth(6, 130); // Col F
  dashSheet.setColumnWidth(7, 24);  // Col G
  dashSheet.setColumnWidth(8, 220); // Col H
  dashSheet.setColumnWidth(9, 130); // Col I
  dashSheet.setColumnWidth(10, 100); // Col J
  dashSheet.setColumnWidth(11, 130); // Col K
  dashSheet.setColumnWidth(12, 130); // Col L

  // 1. Header Dashboard
  dashSheet.setRowHeight(1, 42);
  const titleRange = dashSheet.getRange('B1:L1');
  titleRange.merge();
  titleRange.setValue('🚀 EXECUTIVE DASHBOARD — MONITORING PENJUALAN SHORT ED');
  titleRange.setBackground('#0f172a');
  titleRange.setFontColor('#ffffff');
  titleRange.setFontWeight('bold');
  titleRange.setFontSize(13);
  titleRange.setHorizontalAlignment('center');
  titleRange.setVerticalAlignment('middle');

  // Baris 2: Sub-info
  dashSheet.setRowHeight(2, 24);
  const subRange = dashSheet.getRange('B2:L2');
  subRange.merge();
  subRange.setFormula('="🕒 Sumber Data Terakhir: " & IF(ISBLANK(Sheet1!A1), "Menunggu sinkronisasi...", Sheet1!A1)');
  subRange.setBackground('#f8fafc');
  subRange.setFontColor('#64748b');
  subRange.setFontSize(9);
  subRange.setFontStyle('italic');
  subRange.setHorizontalAlignment('center');
  subRange.setVerticalAlignment('middle');

  // 2. Helper Validasi Filter (Kolom Z, AA, AB)
  dashSheet.getRange('Z1').setValue('Helper Bulan');
  dashSheet.getRange('Z2').setValue('Semua Periode');
  dashSheet.getRange('Z3').setFormula('=IFERROR(SORT(UNIQUE(FILTER(Sheet1!L4:L, Sheet1!L4:L<>""))), "")');

  dashSheet.getRange('AA1').setValue('Helper AM');
  dashSheet.getRange('AA2').setValue('Semua AM');
  dashSheet.getRange('AA3').setFormula('=IFERROR(SORT(UNIQUE(FILTER(Sheet1!C4:C, Sheet1!C4:C<>"", Sheet1!C4:C<>"-", Sheet1!C4:C<>"HENDRI"))), "")');

  dashSheet.getRange('AB1').setValue('Helper Apotek');
  dashSheet.getRange('AB2').setValue('Semua Apotek');
  dashSheet.getRange('AB3').setFormula('=IFERROR(SORT(UNIQUE(FILTER(Sheet1!A4:A, Sheet1!A4:A<>"", Sheet1!A4:A<>"-", Sheet1!A4:A<>"ADMIN-TEST"))), "")');

  // 3. Panel Filter Interaktif (Baris 4 & 5)
  dashSheet.setRowHeight(4, 26);
  const filterHeader = dashSheet.getRange('B4:L4');
  filterHeader.merge();
  filterHeader.setValue('🔍 FILTER ANALITIK INTERAKTIF (Pilih dropdown di bawah untuk memperbarui dashboard secara otomatis)');
  filterHeader.setBackground('#e2e8f0');
  filterHeader.setFontColor('#1e293b');
  filterHeader.setFontWeight('bold');
  filterHeader.setFontSize(9);
  filterHeader.setHorizontalAlignment('center');
  filterHeader.setVerticalAlignment('middle');

  dashSheet.setRowHeight(5, 34);
  dashSheet.getRange('B5').setValue('📅 Periode:').setFontWeight('bold').setHorizontalAlignment('right').setVerticalAlignment('middle');
  const cellPeriod = dashSheet.getRange('C5');
  cellPeriod.setValue('Semua Periode').setBackground('#ffffff').setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle');
  const rulePeriod = SpreadsheetApp.newDataValidation().requireValueInRange(dashSheet.getRange('Z2:Z30')).build();
  cellPeriod.setDataValidation(rulePeriod);

  dashSheet.getRange('E5').setValue('👔 Area Manager:').setFontWeight('bold').setHorizontalAlignment('right').setVerticalAlignment('middle');
  const cellAM = dashSheet.getRange('F5');
  cellAM.setValue('Semua AM').setBackground('#ffffff').setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle');
  const ruleAM = SpreadsheetApp.newDataValidation().requireValueInRange(dashSheet.getRange('AA2:AA50')).build();
  cellAM.setDataValidation(ruleAM);

  dashSheet.getRange('H5').setValue('🏪 Cabang Apotek:').setFontWeight('bold').setHorizontalAlignment('right').setVerticalAlignment('middle');
  const cellOutlet = dashSheet.getRange('I5:K5');
  cellOutlet.merge();
  cellOutlet.setValue('Semua Apotek').setBackground('#ffffff').setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle');
  const ruleOutlet = SpreadsheetApp.newDataValidation().requireValueInRange(dashSheet.getRange('AB2:AB300')).build();
  cellOutlet.setDataValidation(ruleOutlet);

  dashSheet.getRange('B4:L5').setBorder(true, true, true, true, true, true, '#94a3b8', SpreadsheetApp.BorderStyle.SOLID);

  // 4. Kartu Metrik KPI (Baris 7–9)
  dashSheet.setRowHeight(7, 22);
  dashSheet.setRowHeight(8, 38);
  dashSheet.setRowHeight(9, 18);

  const filterCond = '(Sheet1!A4:A<>"") * (Sheet1!A4:A<>"ADMIN-TEST") * (Sheet1!C4:C<>"HENDRI") * IF(C5="Semua Periode", 1, Sheet1!L4:L=C5) * IF(F5="Semua AM", 1, Sheet1!C4:C=F5) * IF(I5="Semua Apotek", 1, Sheet1!A4:A=I5)';

  // Card 1: Total Omzet
  dashSheet.getRange('B7:D7').merge().setValue('TOTAL OMZET PENJUALAN').setFontSize(8).setFontWeight('bold').setFontColor('#065f46').setBackground('#d1fae5').setHorizontalAlignment('center').setVerticalAlignment('middle');
  dashSheet.getRange('B8:D9').merge().setFormula('=IFERROR(SUM(FILTER(Sheet1!J4:J, ' + filterCond + ')), 0)').setNumberFormat('"Rp "#,##0').setFontSize(16).setFontWeight('bold').setFontColor('#065f46').setBackground('#ecfdf5').setHorizontalAlignment('center').setVerticalAlignment('middle');
  dashSheet.getRange('B7:D9').setBorder(true, true, true, true, true, true, '#10b981', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  // Card 2: Qty Terjual
  dashSheet.getRange('E7:F7').merge().setValue('TOTAL QTY TERJUAL').setFontSize(8).setFontWeight('bold').setFontColor('#1e40af').setBackground('#dbeafe').setHorizontalAlignment('center').setVerticalAlignment('middle');
  dashSheet.getRange('E8:F9').merge().setFormula('=IFERROR(SUM(FILTER(Sheet1!H4:H, ' + filterCond + ')), 0)').setNumberFormat('#,##0.##" Pcs"').setFontSize(16).setFontWeight('bold').setFontColor('#1e40af').setBackground('#eff6ff').setHorizontalAlignment('center').setVerticalAlignment('middle');
  dashSheet.getRange('E7:F9').setBorder(true, true, true, true, true, true, '#3b82f6', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  // Card 3: Total Struk
  dashSheet.getRange('H7:I7').merge().setValue('TOTAL STRUK KASIR').setFontSize(8).setFontWeight('bold').setFontColor('#854d0e').setBackground('#fef08a').setHorizontalAlignment('center').setVerticalAlignment('middle');
  dashSheet.getRange('H8:I9').merge().setFormula('=IFERROR(COUNTA(UNIQUE(FILTER(Sheet1!E4:E, ' + filterCond + '))), 0)').setNumberFormat('#,##0" Struk"').setFontSize(16).setFontWeight('bold').setFontColor('#854d0e').setBackground('#fefce8').setHorizontalAlignment('center').setVerticalAlignment('middle');
  dashSheet.getRange('H7:I9').setBorder(true, true, true, true, true, true, '#eab308', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  // Card 4: Apotek Aktif
  dashSheet.getRange('J7:L7').merge().setValue('APOTEK AKTIF MENJUAL').setFontSize(8).setFontWeight('bold').setFontColor('#6b21a8').setBackground('#f3e8ff').setHorizontalAlignment('center').setVerticalAlignment('middle');
  dashSheet.getRange('J8:L9').merge().setFormula('=IFERROR(COUNTA(UNIQUE(FILTER(Sheet1!A4:A, ' + filterCond + '))), 0)').setNumberFormat('#,##0" Cabang"').setFontSize(16).setFontWeight('bold').setFontColor('#6b21a8').setBackground('#faf5ff').setHorizontalAlignment('center').setVerticalAlignment('middle');
  dashSheet.getRange('J7:L9').setBorder(true, true, true, true, true, true, '#a855f7', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  // Baris 11 s/d 25 dialokasikan untuk area grafik
  for (let r = 11; r <= 25; r++) {
    dashSheet.setRowHeight(r, 20);
  }

  // 5. Tabel Top 10 Apotek & Top 10 Produk (Baris 27–38)
  dashSheet.setRowHeight(26, 14);

  // Top 10 Apotek
  dashSheet.setRowHeight(27, 26);
  dashSheet.getRange('B27:F27').merge().setValue('🏆 TOP 10 APOTEK PENJUALAN TERTINGGI').setBackground('#1e293b').setFontColor('#ffffff').setFontWeight('bold').setFontSize(9).setHorizontalAlignment('center').setVerticalAlignment('middle');
  
  dashSheet.setRowHeight(28, 22);
  const apotekHeaders = ['Nama Apotek', 'Area Manager', 'Qty', 'Total Omzet (Rp)', '% Pangsa'];
  dashSheet.getRange('B28:F28').setValues([apotekHeaders]).setBackground('#334155').setFontColor('#ffffff').setFontWeight('bold').setFontSize(8).setHorizontalAlignment('center').setVerticalAlignment('middle');

  const qApotek = '=IFERROR(QUERY(Sheet1!A4:L, "SELECT A, C, SUM(H), SUM(J) WHERE A IS NOT NULL AND A <> \'ADMIN-TEST\' AND C <> \'HENDRI\' " & IF(C5="Semua Periode", "", " AND L = \'" & C5 & "\'") & IF(F5="Semua AM", "", " AND C = \'" & F5 & "\'") & IF(I5="Semua Apotek", "", " AND A = \'" & SUBSTITUTE(I5, "\'", "\'\'") & "\'") & " GROUP BY A, C ORDER BY SUM(J) DESC LIMIT 10 LABEL SUM(H) \'\', SUM(J) \'\'", 0), {"-", "-", 0, 0})';
  dashSheet.getRange('B29').setFormula(qApotek);

  for (let r = 29; r <= 38; r++) {
    dashSheet.setRowHeight(r, 20);
    dashSheet.getRange('F' + r).setFormula('=IF(OR(ISBLANK(B' + r + '), B' + r + '="", B' + r + '="-", E' + r + '=0, B8=0), "", E' + r + '/$B$8)').setNumberFormat('0.0%').setHorizontalAlignment('right');
    dashSheet.getRange('D' + r).setNumberFormat('#,##0.##').setHorizontalAlignment('right');
    dashSheet.getRange('E' + r).setNumberFormat('"Rp "#,##0').setHorizontalAlignment('right').setFontWeight('bold');
    dashSheet.getRange('B' + r).setFontWeight('bold').setFontColor('#0f172a');
    dashSheet.getRange('C' + r).setFontColor('#475569');
  }
  dashSheet.getRange('B27:F38').setBorder(true, true, true, true, true, true, '#cbd5e1', SpreadsheetApp.BorderStyle.SOLID);

  // Top 10 Produk
  dashSheet.getRange('H27:L27').merge().setValue('📦 TOP 10 PRODUK SHORT ED TERLARIS').setBackground('#1e293b').setFontColor('#ffffff').setFontWeight('bold').setFontSize(9).setHorizontalAlignment('center').setVerticalAlignment('middle');
  
  const prodHeaders = ['Nama Produk', 'Kode Produk', 'Qty', 'Total Omzet (Rp)', '% Pangsa'];
  dashSheet.getRange('H28:L28').setValues([prodHeaders]).setBackground('#334155').setFontColor('#ffffff').setFontWeight('bold').setFontSize(8).setHorizontalAlignment('center').setVerticalAlignment('middle');

  const qProd = '=IFERROR(QUERY(Sheet1!A4:L, "SELECT G, F, SUM(H), SUM(J) WHERE G IS NOT NULL AND A <> \'ADMIN-TEST\' AND C <> \'HENDRI\' " & IF(C5="Semua Periode", "", " AND L = \'" & C5 & "\'") & IF(F5="Semua AM", "", " AND C = \'" & F5 & "\'") & IF(I5="Semua Apotek", "", " AND A = \'" & SUBSTITUTE(I5, "\'", "\'\'") & "\'") & " GROUP BY G, F ORDER BY SUM(J) DESC LIMIT 10 LABEL SUM(H) \'\', SUM(J) \'\'", 0), {"-", "-", 0, 0})';
  dashSheet.getRange('H29').setFormula(qProd);

  for (let r = 29; r <= 38; r++) {
    dashSheet.setRowHeight(r, 20);
    dashSheet.getRange('L' + r).setFormula('=IF(OR(ISBLANK(H' + r + '), H' + r + '="", H' + r + '="-", K' + r + '=0, B8=0), "", K' + r + '/$B$8)').setNumberFormat('0.0%').setHorizontalAlignment('right');
    dashSheet.getRange('J' + r).setNumberFormat('#,##0.##').setHorizontalAlignment('right');
    dashSheet.getRange('K' + r).setNumberFormat('"Rp "#,##0').setHorizontalAlignment('right').setFontWeight('bold');
    dashSheet.getRange('I' + r).setHorizontalAlignment('center');
    dashSheet.getRange('H' + r).setFontWeight('bold').setFontColor('#0f172a');
  }
  dashSheet.getRange('H27:L38').setBorder(true, true, true, true, true, true, '#cbd5e1', SpreadsheetApp.BorderStyle.SOLID);

    // 6. Tabel Rekapitulasi Area Manager (Baris 40–67: Kapasitas s/d 25 AM tanpa risiko tumpang tindih #REF!)
  dashSheet.setRowHeight(39, 14);
  dashSheet.setRowHeight(40, 26);
  dashSheet.getRange('B40:F40').merge().setValue('👔 REKAPITULASI KINERJA PENJUALAN SELURUH AREA MANAGER').setBackground('#0f172a').setFontColor('#ffffff').setFontWeight('bold').setFontSize(9).setHorizontalAlignment('center').setVerticalAlignment('middle');

  dashSheet.setRowHeight(41, 22);
  const amHeaders = ['Nama Area Manager', 'Total Transaksi', 'Qty Terjual', 'Total Omzet (Rp)', '% Kontribusi'];
  dashSheet.getRange('B41:F41').setValues([amHeaders]).setBackground('#334155').setFontColor('#ffffff').setFontWeight('bold').setFontSize(8).setHorizontalAlignment('center').setVerticalAlignment('middle');

  // Bersihkan dahulu area ekspansi B42:F66 agar QUERY tidak terhalang sisa data lama
  dashSheet.getRange('B42:E66').clearContent();

  // Batasi query dengan LIMIT 25 agar tidak pernah tumpah menabrak baris Grand Total di baris 67
  const qAM = '=IFERROR(QUERY(Sheet1!A4:L, "SELECT C, COUNT(A), SUM(H), SUM(J) WHERE C IS NOT NULL AND C <> \'-\' AND C <> \'HENDRI\' AND A <> \'ADMIN-TEST\' " & IF(C5="Semua Periode", "", " AND L = \'" & C5 & "\'") & IF(I5="Semua Apotek", "", " AND A = \'" & SUBSTITUTE(I5, "\'", "\'\'") & "\'") & " GROUP BY C ORDER BY SUM(J) DESC LIMIT 25 LABEL COUNT(A) \'\', SUM(H) \'\', SUM(J) \'\'", 0), {"-", 0, 0, 0})';
  dashSheet.getRange('B42').setFormula(qAM);

  for (let r = 42; r <= 66; r++) {
    dashSheet.setRowHeight(r, 20);
    dashSheet.getRange('F' + r).setFormula('=IFERROR(IF(OR(ISBLANK(B' + r + '), B' + r + '="", B' + r + '="-", E' + r + '=0, $B$8=0), "", E' + r + '/$B$8), "")').setNumberFormat('0.0%').setHorizontalAlignment('right');
    dashSheet.getRange('C' + r).setNumberFormat('#,##0').setHorizontalAlignment('center');
    dashSheet.getRange('D' + r).setNumberFormat('#,##0.##').setHorizontalAlignment('right');
    dashSheet.getRange('E' + r).setNumberFormat('"Rp "#,##0').setHorizontalAlignment('right').setFontWeight('bold');
    dashSheet.getRange('B' + r).setFontWeight('bold').setFontColor('#0f172a');
  }
  dashSheet.getRange('B40:F66').setBorder(true, true, true, true, true, true, '#cbd5e1', SpreadsheetApp.BorderStyle.SOLID);

  // Grand Total Row AM di Baris 67
  dashSheet.setRowHeight(67, 24);
  dashSheet.getRange('B67').setValue('GRAND TOTAL PENJUALAN AM').setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle');
  dashSheet.getRange('C67').setFormula('=SUM(C42:C66)').setNumberFormat('#,##0').setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle');
  dashSheet.getRange('D67').setFormula('=SUM(D42:D66)').setNumberFormat('#,##0.##').setFontWeight('bold').setHorizontalAlignment('right').setVerticalAlignment('middle');
  dashSheet.getRange('E67').setFormula('=SUM(E42:E66)').setNumberFormat('"Rp "#,##0').setFontWeight('bold').setHorizontalAlignment('right').setVerticalAlignment('middle');
  dashSheet.getRange('F67').setFormula('=IFERROR(IF(B8>0, E67/$B$8, 1), 1)').setNumberFormat('0.0%').setFontWeight('bold').setHorizontalAlignment('right').setVerticalAlignment('middle');
  dashSheet.getRange('B67:F67').setBackground('#f1f5f9').setFontColor('#0f172a').setBorder(true, true, true, true, true, true, '#0f172a', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  dashSheet.getRange('B68:F78').clearContent().clearFormat();

  // 7. Siapkan Tabel Data Sumber Grafik di Baris 80+
  dashSheet.setRowHeight(79, 14);
  dashSheet.getRange('B80:C80').setValues([['Area Manager', 'Total Omzet']]).setFontWeight('bold').setFontColor('#64748b');
  dashSheet.getRange('E80:F80').setValues([['Tanggal Transaksi', 'Total Omzet']]).setFontWeight('bold').setFontColor('#64748b');

  // Formula QUERY dinamis untuk grafik
  const qChartAM = '=IFERROR(QUERY(Sheet1!A4:L, "SELECT C, SUM(J) WHERE C IS NOT NULL AND C <> \'-\' AND C <> \'HENDRI\' AND A <> \'ADMIN-TEST\' " & IF(C5="Semua Periode", "", " AND L = \'" & C5 & "\'") & IF(I5="Semua Apotek", "", " AND A = \'" & SUBSTITUTE(I5, "\'", "\'\'") & "\'") & " GROUP BY C ORDER BY SUM(J) DESC LIMIT 15 LABEL C \'\', SUM(J) \'\'", 0), {"-", 0})';
  dashSheet.getRange('B81').setFormula(qChartAM);

  const qChartTren = '=IFERROR(QUERY(Sheet1!A4:L, "SELECT D, SUM(J) WHERE D IS NOT NULL AND C <> \'HENDRI\' AND A <> \'ADMIN-TEST\' " & IF(C5="Semua Periode", "", " AND L = \'" & C5 & "\'") & IF(F5="Semua AM", "", " AND C = \'" & F5 & "\'") & IF(I5="Semua Apotek", "", " AND A = \'" & SUBSTITUTE(I5, "\'", "\'\'") & "\'") & " GROUP BY D ORDER BY D ASC LABEL D \'\', SUM(J) \'\'", 0), {"-", 0})';
  dashSheet.getRange('E81').setFormula(qChartTren);

  ss.setActiveSheet(dashSheet);
  ss.moveActiveSheet(1);

  ss.toast('Langkah 1 Selesai! Seluruh data & tabel dashboard siap. Silakan klik Langkah 2 untuk memasang grafik.', '✅ Tahap 1 Sukses', 8);
  Logger.log('Step 1 finished.');
}

/**
 * =========================================================================
 * 2️⃣ LANGKAH 2: MEMBUAT & MEMASANG KEDUA GRAFIK DASHBOARD
 *    (Dijalankan setelah Langkah 1 selesai dan data spreadsheet telah siap)
 * =========================================================================
 */
function step2_buildDashboardCharts() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dashSheet = ss.getSheetByName(SUPABASE_CONFIG.sheetDashboard);

  if (!dashSheet) {
    SpreadsheetApp.getUi().alert('Silakan jalankan Langkah 1 terlebih dahulu!');
    return;
  }

  // Hapus grafik lama
  const existingCharts = dashSheet.getCharts();
  for (let i = 0; i < existingCharts.length; i++) {
    dashSheet.removeChart(existingCharts[i]);
  }

  // GRAFIK 1: Donut Chart Kontribusi Penjualan per Area Manager
  // Data bersumber dari B70:C86 (Row 70 adalah header: 'Area Manager' & 'Total Omzet')
  const chartAM = dashSheet.newChart()
    .setChartType(Charts.ChartType.PIE)
    .addRange(dashSheet.getRange('B80:C96'))
    .setNumHeaders(1)
    .setPosition(11, 2, 0, 0) // Baris 11, Kolom B
    .setOption('title', '📊 GRAFIK 1: KONTRIBUSI PENJUALAN PER AREA MANAGER')
    .setOption('pieHole', 0.4)
    .setOption('width', 485)
    .setOption('height', 295)
    .setOption('legend', { position: 'right', textStyle: { fontSize: 8.5 } })
    .setOption('chartArea', { left: 15, top: 35, width: '92%', height: '82%' })
    .build();

  dashSheet.insertChart(chartAM);

  // GRAFIK 2: Column Chart Tren Penjualan Harian
  // Data bersumber dari E70:F80 (Row 70 adalah header: 'Tanggal Transaksi' & 'Total Omzet')
  const chartTren = dashSheet.newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(dashSheet.getRange('E80:F110'))
    .setNumHeaders(1)
    .setPosition(11, 8, 0, 0) // Baris 11, Kolom H
    .setOption('title', '📈 GRAFIK 2: TREN PENJUALAN HARIAN (TOTAL OMZET RP)')
    .setOption('width', 525)
    .setOption('height', 295)
    .setOption('legend', { position: 'none' })
    .setOption('colors', ['#10b981'])
    .setOption('vAxis', { format: 'short', title: 'Omzet (Rp)' })
    .setOption('hAxis', { slantedText: true, slantedTextAngle: 45, textStyle: { fontSize: 8 } })
    .setOption('chartArea', { left: 65, top: 35, width: '88%', height: '70%' })
    .build();

  dashSheet.insertChart(chartTren);

  ss.toast('Kedua grafik berhasil dipasang dan aktif 100%!', '🎉 Selesai', 6);
  Logger.log('Step 2 finished.');
}

/**
 * FUNGSI ALL-IN-ONE (Menjalankan Tahap 1, flush, delay 2 detik, lalu Tahap 2)
 */
function setupDashboardSheet() {
  step1_setupDashboardData();
  SpreadsheetApp.flush();
  Utilities.sleep(2000); // Jeda 2 detik agar seluruh formula Google Sheets tuntas dievaluasi
  step2_buildDashboardCharts();
}

/**
 * HELPER: Mengambil Data dari Supabase REST API
 */
function fetchSalesFromSupabase() {
  // Opsi HTTP tanpa 'Prefer': 'count=exact' agar tidak memicu statement timeout di PostgreSQL
  const options = {
    method: 'get',
    headers: {
      'apikey': SUPABASE_CONFIG.key,
      'Authorization': 'Bearer ' + SUPABASE_CONFIG.key
    },
    muteHttpExceptions: true
  };

  try {
    const viewUrl = SUPABASE_CONFIG.url + '/rest/v1/v_sales_short_ed_national?select=*&order=transaction_date.desc,created_at.desc&limit=5000';
    const viewResponse = UrlFetchApp.fetch(viewUrl, options);
    
    if (viewResponse.getResponseCode() === 200) {
      const data = JSON.parse(viewResponse.getContentText());
      if (Array.isArray(data) && data.length > 0) {
        Logger.log('Sukses mengambil ' + data.length + ' transaksi dari View v_sales_short_ed_national.');
        return data;
      }
    } else {
      Logger.log('View response code: ' + viewResponse.getResponseCode() + ' -> Beralih ke fallback query relasional...');
    }
  } catch (e) {
    Logger.log('Info: View timeout atau error (' + e + '), beralih ke fallback query relasional...');
  }

  return fetchSalesDirectWithLookup(options);
}

function fetchSalesDirectWithLookup(options) {
  const salesUrl = SUPABASE_CONFIG.url + '/rest/v1/sales_short_ed?select=*&order=transaction_date.desc,created_at.desc&limit=5000';
  const salesRes = UrlFetchApp.fetch(salesUrl, options);
  const salesCode = salesRes.getResponseCode();
  if (salesCode !== 200 && salesCode !== 206) {
    throw new Error('Gagal mengambil data sales_short_ed: ' + salesRes.getContentText());
  }
  const sales = JSON.parse(salesRes.getContentText());
  if (!sales || sales.length === 0) return [];

  let outletMap = {};
  try {
    const outletUrl = SUPABASE_CONFIG.url + '/rest/v1/master_outlets?select=outlet_code,outlet_name,am_name&limit=2000';
    const outRes = UrlFetchApp.fetch(outletUrl, options);
    const outCode = outRes.getResponseCode();
    if (outCode === 200 || outCode === 206) {
      const outlets = JSON.parse(outRes.getContentText());
      outlets.forEach(function(o) {
        outletMap[o.outlet_code] = { name: o.outlet_name, am: o.am_name };
      });
    }
  } catch (err) {
    Logger.log('Error fetch master_outlets: ' + err);
  }

  // Lookup nama produk secara presisi & chunked dari master_products
  let productMap = {};
  try {
    let uniqueCodes = [];
    sales.forEach(function(s) {
      const c = String(s.product_code || '').trim();
      if (c && uniqueCodes.indexOf(c) === -1) {
        uniqueCodes.push(c);
      }
    });

    Logger.log('Total kode produk unik yang dicari: ' + uniqueCodes.length);

    // Ambil dalam kelompok per 80 produk agar URL aman di Apps Script
    const chunkSize = 80;
    for (let i = 0; i < uniqueCodes.length; i += chunkSize) {
      const chunk = uniqueCodes.slice(i, i + chunkSize);
      const inList = chunk.map(encodeURIComponent).join(',');
      const chunkUrl = SUPABASE_CONFIG.url + '/rest/v1/master_products?select=product_code,barcode,item_description&or=(barcode.in.(' + inList + '),product_code.in.(' + inList + '))';
      const chunkRes = UrlFetchApp.fetch(chunkUrl, options);
      const chunkCode = chunkRes.getResponseCode();
      
      if (chunkCode === 200 || chunkCode === 206) {
        const prods = JSON.parse(chunkRes.getContentText());
        prods.forEach(function(p) {
          if (p.barcode) productMap[String(p.barcode).trim()] = p;
          if (p.product_code) productMap[String(p.product_code).trim()] = p;
        });
      }
    }
    Logger.log('Sukses mencocokkan ' + Object.keys(productMap).length + ' produk dari master.');
  } catch (err) {
    Logger.log('Error targeted fetch master_products: ' + err);
  }

  return sales.map(function(s) {
    const o = outletMap[s.outlet_code] || {};
    const p = productMap[String(s.product_code || '').trim()] || {};
    
    return {
      outlet_name: o.name || s.outlet_code,
      outlet_code: s.outlet_code,
      am_name: o.am || '—',
      transaction_date: s.transaction_date,
      receipt_number: s.receipt_number,
      product_code: p.barcode || s.product_code,
      item_description: p.item_description || '(Tidak diketahui)',
      qty: s.qty,
      unit_price: s.unit_price,
      total_price: s.total_price || (s.qty * s.unit_price),
      created_at: s.created_at
    };
  });
}

function createEvery4HoursTrigger() {
  deleteSyncTrigger();

  ScriptApp.newTrigger('syncSalesToGoogleSheet')
    .timeBased()
    .everyHours(4)
    .create();

  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Jadwal otomatis per 4 jam berhasil diaktifkan!',
    '✅ Sukses Terpasang',
    6
  );
}

function deleteSyncTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'syncSalesToGoogleSheet') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}

/**
 * MENU KUSTOM DI TOOLBAR GOOGLE SHEET
 * Menyediakan pemisahan langkah 1 (Data) dan langkah 2 (Grafik) secara terpisah
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🚀 Apotek Alpro')
    .addItem('🔄 Sinkronkan Data Sekarang (Update Sheet1)', 'syncSalesToGoogleSheet')
    .addSeparator()
    .addItem('1️⃣ Langkah 1: Buat Layout & Data Dashboard', 'step1_setupDashboardData')
    .addItem('2️⃣ Langkah 2: Pasang / Perbarui Grafik (Charts)', 'step2_buildDashboardCharts')
    .addSeparator()
    .addItem('⚡ Buat Lengkap Sekaligus (Data + Grafik)', 'setupDashboardSheet')
    .addSeparator()
    .addItem('⏰ Aktifkan Jadwal Otomatis (Per 4 Jam)', 'createEvery4HoursTrigger')
    .addItem('⏹️ Matikan Jadwal Otomatis', 'deleteSyncTrigger')
    .addToUi();
}
