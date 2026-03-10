// =================================================================
// ===== FUNGSI UTAMA APLIKASI (LOGIKA INTI) - OPTIMIZED =====
// =================================================================

function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle("Monitoring Produk Short ED")
    .addMetaTag('viewport', 'content=width=device-width, initial-scale=1.0');
}

/**
 * Mendefinisikan batas tanggal ED keras untuk seluruh aplikasi.
 */
function getHardLimitDate_() {
    return new Date(2027, 3, 1); // 1 April 2027
}

// --- FUNGSI CACHE & READ-ONLY (Tidak Perlu Lock) ---

function getProductList() {
  const cache = CacheService.getScriptCache();
  const chunkCountKey = CONFIG.CACHE_KEYS.PRODUCT_LIST_CHUNK_COUNT;
  const chunkCount = cache.get(chunkCountKey);

  if (chunkCount != null) {
    let allProducts = [];
    const chunkKeys = [];
    for (let i = 0; i < chunkCount; i++) {
      chunkKeys.push(`${CONFIG.CACHE_KEYS.PRODUCT_LIST_CHUNK_PREFIX}${i}`);
    }
    const cachedChunks = cache.getAll(chunkKeys);
    for (let i = 0; i < chunkCount; i++) {
      const chunkData = cachedChunks[`${CONFIG.CACHE_KEYS.PRODUCT_LIST_CHUNK_PREFIX}${i}`];
      if (chunkData) { allProducts = allProducts.concat(JSON.parse(chunkData)); }
    }
    return allProducts;
  }

  const freshData = fetchProductListFromSheet_();
  const chunkSize = 500;
  let chunkIndex = 0;
  const chunksToCache = {};
  for (let i = 0; i < freshData.length; i += chunkSize) {
    const chunk = freshData.slice(i, i + chunkSize);
    chunksToCache[`${CONFIG.CACHE_KEYS.PRODUCT_LIST_CHUNK_PREFIX}${chunkIndex}`] = JSON.stringify(chunk);
    chunkIndex++;
  }
  chunksToCache[chunkCountKey] = chunkIndex.toString();
  cache.putAll(chunksToCache, CONFIG.CACHE_DURATION_SECONDS);
  return freshData;
}

function fetchProductListFromSheet_() {
  const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.SHEETS.MASTER_PRODUCT);
  if (sheet.getLastRow() < 2) return [];
  const values = sheet.getRange(2, 2, sheet.getLastRow() - 1, 12).getValues();
  const products = [];
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    if (row[1] && row[2]) { products.push({ barcode: row[0], code: row[1], description: row[2], uom: row[7] }); }
  }
  return products;
}

function getOutletList() { return getCachedData_(CONFIG.CACHE_KEYS.OUTLET_LIST, getOutletList_); }
function getOutletList_() {
  const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.SHEETS.MASTER_OUTLET);
  if(sheet.getLastRow() < 2) return [];
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  return data.map(row => ({ name: row[0], code: row[1] }));
}

function getAmList() { return getCachedData_(CONFIG.CACHE_KEYS.AM_LIST, getAmList_); }
function getAmList_() {
  const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.SHEETS.MASTER_AM);
  if (sheet.getLastRow() < 2) return [];
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
  return data.map(row => ({ username: row[0], password: row[1], name: row[2] }));
}

function getProcodeExcludeList() { return getCachedData_(CONFIG.CACHE_KEYS.PROCODE_EXCLUDE, getProcodeExcludeList_); }
function getProcodeExcludeList_() {
  const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.SHEETS.PROCODE_EXCLUDE);
  if (sheet.getLastRow() < 2) return [];
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  return data.map(row => row[0].toString().trim()).filter(code => code);
}

function getLoginOptions() {
  const outlets = getOutletList();
  const ams = getAmList();
  const outletNames = outlets.map(o => ({ name: o.name, needsPassword: false }));
  const amNames = ams.map(a => ({ name: a.name, needsPassword: true }));
  const specialRoles = [{ name: 'PROCUREMENT', needsPassword: true },{ name: 'BOD', needsPassword: true }];
  const allLoginsMap = new Map();
  [...outletNames, ...amNames, ...specialRoles].forEach(item => { allLoginsMap.set(item.name.toUpperCase(), item); });
  return Array.from(allLoginsMap.values());
}

function validateLogin(loginData) {
  const usernameInput = loginData.username.trim().toUpperCase();
  const password = loginData.password;
  const scriptProperties = PropertiesService.getScriptProperties();

  if (usernameInput === "PROCUREMENT") {
    const PROCUREMENT_PASSWORD = scriptProperties.getProperty(CONFIG.PROPERTY_KEYS.PROCUREMENT_PASSWORD);
    return (password === PROCUREMENT_PASSWORD) ? { success: true, role: 'PROCUREMENT', name: 'Procurement Team' } : { success: false, message: 'Password salah.' };
  }
  if (usernameInput === "BOD") {
    const BOD_PASSWORD = scriptProperties.getProperty(CONFIG.PROPERTY_KEYS.BOD_PASSWORD);
    return (password === BOD_PASSWORD) ? { success: true, role: 'BOD', name: 'Board of Directors' } : { success: false, message: 'Password salah.' };
  }
  const ams = getAmList();
  const foundAm = ams.find(am => am.name.toUpperCase() === usernameInput);
  if (foundAm) {
    return (password === foundAm.password) ? { success: true, role: 'AM', am: foundAm } : { success: false, message: 'Password salah.' };
  }
  const outlets = getOutletList();
  const foundOutlet = outlets.find(o => o.name.toUpperCase() === usernameInput);
  if (foundOutlet) {
    return { success: true, role: 'OUTLET', outlet: foundOutlet };
  }
  return { success: false, message: 'Nama Pengguna / Toko tidak ditemukan.' };
}

// --- FUNGSI WRITE (MEMBUTUHKAN LOCK & OPTIMASI) ---

/**
 * Menyimpan data transaksi baru.
 * OPTIMASI: Menggunakan Lock 60s, Batch Read, dan Row-Level Update.
 */
function saveData(dataObject) {
  const lock = LockService.getScriptLock();
  // 1. Extended Lock: 60 detik untuk antrian panjang
  try {
    const success = lock.tryLock(60000); 
    if (!success) {
      return "ERROR: Server sedang sibuk (Timeout). Silakan coba simpan lagi dalam 1-2 menit.";
    }

    const [year, month, day] = dataObject.edDate.split('-').map(Number);
    const edDate = new Date(year, month - 1, day);
    const hardLimit = getHardLimitDate_();
    if (edDate >= hardLimit) {
      return `ERROR: Tanggal ED tidak boleh lebih dari 31 Maret 2027.`;
    }

    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const dataSheet = ss.getSheetByName(CONFIG.SHEETS.DATA_ED);
    const stockSheet = ss.getSheetByName(CONFIG.SHEETS.STOCK_AKTUAL);
    const outletSheet = ss.getSheetByName(CONFIG.SHEETS.MASTER_OUTLET);
    const productSheet = ss.getSheetByName(CONFIG.SHEETS.MASTER_PRODUCT);

    // 2. Batch Read: Baca semua data referensi sekaligus
    // Menggunakan createDataMapWithRowIndex yang sudah ada (efisien untuk lookup)
    const stockDataMap = createDataMapWithRowIndex(stockSheet, 0); 
    const outletMap = createDataMapWithRowIndex(outletSheet, 1);
    const productMap = createDataMapWithRowIndex(productSheet, 2);
    
    const outletData = outletMap.get(dataObject.outletCode.trim()) || [];
    const productData = productMap.get(dataObject.productCode.trim()) || [];

    // Simpan ke DATA_ED (Append selalu aman di akhir)
    const newRowData = [ 
      new Date(), dataObject.outletCode, dataObject.outletName, dataObject.inputDate, 
      "'" + dataObject.productCode, dataObject.productName, dataObject.batchId, 
      dataObject.uom, dataObject.qty, edDate, outletData[2] || 'N/A', outletData[3] || 'N/A', 
      productData[5] || 'N/A', productData[6] || 'N/A', productData[4] || 'N/A', 
      productData[7] || 'N/A', productData[9] || 0 
    ];
    dataSheet.appendRow(newRowData);
    
    const formattedEdDate = Utilities.formatDate(edDate, Session.getScriptTimeZone(), "yyyy-MM-dd");
    const uniqueId = `${dataObject.outletCode}_${dataObject.productCode}_${dataObject.batchId}_${formattedEdDate}`;
    const existingStockRowData = stockDataMap.get(uniqueId);
    
    const remarkValue = dataObject.remark || '';

    if (existingStockRowData) {
      // UPDATE EXISTING:
      // Ambil index baris dari map (elemen terakhir array)
      const rowIndex = existingStockRowData[existingStockRowData.length - 1];
      
      // Hitung qty baru di memori (hindari call .getValue())
      // existingStockRowData[5] adalah Qty (index 5 di array 0-based dari sheet)
      const currentQty = parseFloat(existingStockRowData[5]) || 0; 
      const newQty = currentQty + parseFloat(dataObject.qty);
      
      // 3. Minimize Calls: Update satu baris penuh (Kolom A-G) atau spesifik sel dengan setValues
      // Kita update Qty (Kolom F/6) dan Remark (Kolom G/7)
      // getRange(row, col, numRows, numCols) -> getRange(rowIndex, 6, 1, 2) untuk F dan G
      stockSheet.getRange(rowIndex, 6, 1, 2).setValues([[newQty, remarkValue]]);
      
    } else {
      // INSERT NEW:
      // 3. Minimize Calls: Append satu baris penuh
      stockSheet.appendRow([
        uniqueId, 
        dataObject.outletCode, 
        "'" + dataObject.productCode, 
        dataObject.batchId, 
        edDate, 
        dataObject.qty, 
        remarkValue
      ]);
    }
    
    // 4. Concurrency Safety: Flush sebelum lepas lock
    SpreadsheetApp.flush();
    return "SUCCESS: Data berhasil disimpan dan stok diperbarui.";

  } catch (e) {
    Logger.log(e);
    return "ERROR: Gagal menyimpan data. " + e.message;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Memperbarui entri monitoring.
 * OPTIMASI: Menggunakan Lock 60s, Batch Read, dan Row-Level Update.
 * PERBAIKAN: Menangani masalah leading zero pada Kode Produk.
 */
function updateMonitoringEntry(payload) {
  const lock = LockService.getScriptLock();
  // 1. Extended Lock
  try {
    const success = lock.tryLock(60000);
    if (!success) {
      return { success: false, message: "Server sibuk (Timeout). Silakan coba lagi dalam 1-2 menit." };
    }

    const { uniqueId, newBatch, newEd, newQty, newRemark, currentUser } = payload;
    if (!uniqueId || !newBatch || !newEd || newQty === '' || parseFloat(newQty) < 0) {
      throw new Error("Input tidak lengkap atau tidak valid.");
    }
    
    const [year, month, day] = newEd.split('-').map(Number);
    const newEdDate = new Date(year, month - 1, day);

    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const stockSheet = ss.getSheetByName(CONFIG.SHEETS.STOCK_AKTUAL);
    const logSheet = ss.getSheetByName(CONFIG.SHEETS.LOG_EDIT);
    
    // 2. Batch Read: Baca seluruh data stok ke memori
    const stockDataMap = createDataMapWithRowIndex(stockSheet, 0);
    const stockRowData = stockDataMap.get(uniqueId);
    
    if (stockRowData) {
      const rowIndex = stockRowData[stockRowData.length - 1];
      
      // Ambil data lama dari array di memori (bukan getRange().getValue())
      // Index array: 0=UniqueId, 1=Outlet, 2=Product, 3=Batch, 4=ED, 5=Qty, 6=Remark
      const oldBatch = stockRowData[3];
      const oldEd = new Date(stockRowData[4]);
      const oldQty = stockRowData[5];
      const oldRemark = stockRowData[6]; 
      const outletCode = stockRowData[1];
      
      // [PERBAIKAN] Bersihkan dan validasi Kode Produk (menangani leading zero)
      let rawProductCode = stockRowData[2].toString();
      if (rawProductCode.startsWith("'")) {
          rawProductCode = rawProductCode.substring(1);
      }
      // Jika ternyata masih berupa angka dan panjangnya 6, kembalikan 0 di depan (safety net)
      if (!isNaN(rawProductCode) && rawProductCode.length === 6) {
          rawProductCode = "0" + rawProductCode;
      }
      const productCode = rawProductCode;
      
      const formattedNewEdForId = Utilities.formatDate(newEdDate, Session.getScriptTimeZone(), "yyyy-MM-dd");
      const newUniqueId = `${outletCode}_${productCode}_${newBatch.trim().toUpperCase()}_${formattedNewEdForId}`;
      
      // Cek duplikasi ID baru
      const existingEntryWithNewId = stockDataMap.get(newUniqueId);
      if (existingEntryWithNewId && existingEntryWithNewId[0] !== uniqueId) {
        throw new Error("Gagal: Kombinasi Produk, Batch, dan ED yang baru sudah ada di data lain.");
      }
      
      // 3. Minimize Calls: Siapkan array baris baru untuk update sekaligus
      // Urutan Kolom: A=UniqueId, B=Outlet, C=Product, D=Batch, E=ED, F=Qty, G=Remark
      // Kita update A, D, E, F, G. B dan C tetap.
      // Strategi: Update range A:G pada baris tersebut.
      const updatedRow = [
        newUniqueId,
        outletCode,
        "'" + productCode, // [PERBAIKAN] Paksa format string dengan kutip satu
        newBatch.trim().toUpperCase(),
        newEdDate,
        parseFloat(newQty),
        newRemark || ''
      ];

      // Tulis satu baris penuh (Overwrite baris lama)
      stockSheet.getRange(rowIndex, 1, 1, 7).setValues([updatedRow]);
      
      // Persiapan Log
      const oldValuesString = `Batch: ${oldBatch}, ED: ${oldEd.toLocaleDateString('id-ID')}, Qty: ${oldQty}, Remark: ${oldRemark}`;
      const newValuesString = `Batch: ${newBatch.trim().toUpperCase()}, ED: ${newEdDate.toLocaleDateString('id-ID')}, Qty: ${newQty}, Remark: ${newRemark}`;
      
      // Log ke LOG_EDIT
      logSheet.appendRow([new Date(), outletCode, productCode, oldBatch, oldEd, oldValuesString, newValuesString, currentUser.name, newRemark || '']);
      
      // Hitung reload logic (di memori)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const getCategoryKey = (date, todayRef) => {
        const currentYear = todayRef.getFullYear();
        const currentMonth = todayRef.getMonth();
        const edYear = date.getFullYear();
        const edMonth = date.getMonth();
        if (date < todayRef) return 'terkumpul';
        if (edYear === currentYear && edMonth === currentMonth) return 'bulanIni';
        const monthDiff = (edYear - currentYear) * 12 + (edMonth - currentMonth);
        if (monthDiff >= 1 && monthDiff <= 3) return '1to3';
        if (monthDiff >= 4 && monthDiff <= 6) return '4to6';
        if (monthDiff >= 7 && monthDiff <= 12) return '7to12';
        return 'other';
      };
      const oldCategory = getCategoryKey(oldEd, today);
      const newCategory = getCategoryKey(newEdDate, today);
      const needsReload = (oldCategory !== newCategory);
      
      // 4. Concurrency Safety
      SpreadsheetApp.flush();
      
      return { 
        success: true, 
        message: "SUCCESS: Data berhasil diperbarui.", 
        newUniqueId: newUniqueId,
        needsReload: needsReload 
      };
    } else {
      return { success: false, message: "ERROR: Data tidak ditemukan. Mungkin sudah dihapus user lain." };
    }
  } catch (e) {
    Logger.log(e);
    return { success: false, message: `ERROR: ${e.message}`};
  } finally {
    lock.releaseLock();
  }
}

// --- FUNGSI READ LAINNYA (TIDAK PERLU LOCK KETAT) ---

function getAllProcurementData_() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const dataSheet = ss.getSheetByName(CONFIG.SHEETS.DATA_ED);
  const stockSheet = ss.getSheetByName(CONFIG.SHEETS.STOCK_AKTUAL);
  const procLogSheet = ss.getSheetByName(CONFIG.SHEETS.LOG_PROCUREMENT);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const hardLimit = getHardLimitDate_();

  const getEdCategory = (edDate) => {
    const monthDiff = (edDate.getFullYear() - today.getFullYear()) * 12 + (edDate.getMonth() - today.getMonth());
    if (monthDiff < 0) return null;
    if (monthDiff === 0) return 'edBulanIni';
    if (monthDiff >= 1 && monthDiff <= 3) return 'ed1to3Bulan';
    if (monthDiff >= 4 && monthDiff <= 6) return 'ed4to6Bulan';
    if (monthDiff >= 7 && monthDiff <= 12) return 'ed7to12Bulan';
    return null;
  };

  const individualStocks = [];
  if (stockSheet.getLastRow() > 1) {
    const stockValues = stockSheet.getRange(2, 2, stockSheet.getLastRow() - 1, 5).getValues();
    for (const row of stockValues) {
      const edDate = new Date(row[3]);
      if (edDate < today || edDate >= hardLimit) continue;

      const edCategory = getEdCategory(edDate);
      if (!edCategory) continue;

      individualStocks.push({
        outletCode: row[0],
        productCode: row[1].toString().trim(),
        batchId: row[2].toString().trim().toUpperCase(),
        edDate: edDate,
        qty: parseFloat(row[4]) || 0,
        edCategory: edCategory
      });
    }
  }

  if (individualStocks.length === 0) return { data: [], filters: { procurementIds: [], suppliers: [], productNames: [] } };

  const productMasterInfo = new Map();
  if (dataSheet.getLastRow() > 1) {
    const dataEdValues = dataSheet.getRange(2, 1, dataSheet.getLastRow() - 1, 17).getValues();
    for (let i = dataEdValues.length - 1; i >= 0; i--) {
      const row = dataEdValues[i];
      const productCode = row[4].toString().replace(/'/g, '').trim();
      if (productCode && !productMasterInfo.has(productCode)) {
        productMasterInfo.set(productCode, { supplier: row[13] || 'N/A', productName: row[5] || 'N/A', procurementId: row[12] || 'N/A', unitCost: parseFloat(row[16]) || 0 });
      }
    }
  }
  const actionsMap = new Map();
  if (procLogSheet.getLastRow() > 1) {
    const procLogValues = procLogSheet.getRange(2, 1, procLogSheet.getLastRow() - 1, 8).getValues();
    for (const row of procLogValues) {
      actionsMap.set(row[0], { actionType: row[3], actionDetails: JSON.parse(row[4] || '{}') });
    }
  }

  const groupedStockMap = new Map();
  individualStocks.forEach(stock => {
    const groupKey = `${stock.productCode}_${stock.edCategory}`;
    if (!groupedStockMap.has(groupKey)) {
      groupedStockMap.set(groupKey, {
        productCode: stock.productCode,
        edCategory: stock.edCategory,
        totalQty: 0,
        outlets: new Set(),
        batchIds: new Set(),
        minEdDate: stock.edDate,
      });
    }
    const groupData = groupedStockMap.get(groupKey);
    groupData.totalQty += stock.qty;
    groupData.outlets.add(stock.outletCode);
    groupData.batchIds.add(stock.batchId);
    if (stock.edDate < groupData.minEdDate) {
      groupData.minEdDate = stock.edDate;
    }
  });

  const procurementData = [];
  const filterSets = { procurementIds: new Set(), suppliers: new Set(), productNames: new Set() };
  
  groupedStockMap.forEach((groupInfo, groupKey) => {
    const { productCode, edCategory, totalQty, outlets, batchIds, minEdDate } = groupInfo;
    const masterInfo = productMasterInfo.get(productCode) || { supplier: 'N/A', productName: 'N/A', procurementId: 'N/A', unitCost: 0 };
    
    let groupStatus = '';
    let groupActionDetails = {};
    for (const batchId of batchIds) {
      const actionKey = `${productCode}_${batchId}`;
      if (actionsMap.has(actionKey)) {
        const action = actionsMap.get(actionKey);
        groupStatus = action.actionType;
        groupActionDetails = action.actionDetails;
        break; 
      }
    }
    
    procurementData.push({
      groupKey: groupKey,
      supplier: masterInfo.supplier,
      productName: masterInfo.productName,
      productCode: productCode,
      batchIds: Array.from(batchIds),
      edCategory: edCategory,
      minEdDate: minEdDate.toISOString().split('T')[0],
      status: groupStatus,
      sisaStokAktual: totalQty,
      jumlahApotek: outlets.size,
      unitCost: masterInfo.unitCost,
      totalCost: totalQty * masterInfo.unitCost,
      procurementId: masterInfo.procurementId,
      actionDetails: groupActionDetails
    });

    filterSets.procurementIds.add(masterInfo.procurementId);
    filterSets.suppliers.add(masterInfo.supplier);
    filterSets.productNames.add(masterInfo.productName);
  });

  const excludedProductCodes = getProcodeExcludeList();
  const filteredProcurementData = procurementData.filter(item => {
    const isActionTaken = item.status && item.status !== '';
    const isExcluded = excludedProductCodes.includes(item.productCode);
    if (isExcluded && !isActionTaken) {
      return false;
    }
    return true;
  });

  return {
    data: filteredProcurementData.sort((a, b) => new Date(a.minEdDate) - new Date(b.minEdDate)),
    filters: {
      procurementIds: Array.from(filterSets.procurementIds).filter(Boolean).sort(),
      suppliers: Array.from(filterSets.suppliers).filter(Boolean).sort(),
      productNames: Array.from(filterSets.productNames).filter(Boolean).sort()
    }
  };
}

function getProcurementData(filters = {}, page = 1, rowsPerPage = 100) {
  try {
    const { data: allData, filters: initialFilters } = getAllProcurementData_();
    
    let dataToProcess = allData;

    if (Object.keys(filters).length > 0 && Object.values(filters).some(f => (Array.isArray(f) && f.length > 0) || (typeof f === 'string' && f !== 'semua') || typeof f === 'boolean' && f)) {
        dataToProcess = allData.filter(item => {
            if (filters.procIds && filters.procIds.length > 0 && !filters.procIds.includes(item.procurementId)) return false;
            if (filters.suppliers && filters.suppliers.length > 0 && !filters.suppliers.includes(item.supplier)) return false;
            if (filters.products && filters.products.length > 0 && !filters.products.includes(item.productName)) return false;
            if (filters.status === 'belum' && item.status) return false;
            if (filters.status === 'sudah' && !item.status) return false;
            if (filters.edRanges && filters.edRanges.length > 0 && !filters.edRanges.includes(item.edCategory)) return false;
            return true;
        });
    }

    if (filters.roundDownStock) {
      dataToProcess = dataToProcess.map(item => {
        const roundedQty = Math.floor(item.sisaStokAktual);
        return {
          ...item,
          sisaStokAktual: roundedQty,
          totalCost: roundedQty * item.unitCost
        };
      });
    }

    const totalItems = dataToProcess.length;
    const totalPages = Math.ceil(totalItems / rowsPerPage);
    const startIndex = (page - 1) * rowsPerPage;
    const pageData = dataToProcess.slice(startIndex, startIndex + rowsPerPage);

    const response = { pageData, currentPage: page, totalPages, totalItems, chartData: dataToProcess };
    if (page === 1 && initialFilters) {
        response.initialFilters = initialFilters;
    }

    return response;
  } catch (e) {
    Logger.log(e);
    return { error: e.message };
  }
}

function getOutletsWithProductStock(groupKey) {
  if (!groupKey) return [];
  
  const [productCode, edCategory] = groupKey.split('_');
  if (!productCode || !edCategory) return [];

  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const stockSheet = ss.getSheetByName(CONFIG.SHEETS.STOCK_AKTUAL);
  if (stockSheet.getLastRow() < 2) return [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const getEdCategory = (edDate) => {
    const monthDiff = (edDate.getFullYear() - today.getFullYear()) * 12 + (edDate.getMonth() - today.getMonth());
    if (monthDiff < 0) return null;
    if (monthDiff === 0) return 'edBulanIni';
    if (monthDiff >= 1 && monthDiff <= 3) return 'ed1to3Bulan';
    if (monthDiff >= 4 && monthDiff <= 6) return 'ed4to6Bulan';
    if (monthDiff >= 7 && monthDiff <= 12) return 'ed7to12Bulan';
    return null;
  };

  const stockValues = stockSheet.getRange(2, 2, stockSheet.getLastRow() - 1, 5).getValues();
  const outletCodesWithStock = new Set();

  for (const row of stockValues) {
    const currentProductCode = row[1].toString().trim();
    if (currentProductCode === productCode) {
      const edDate = new Date(row[3]);
      const currentEdCategory = getEdCategory(edDate);
      if (currentEdCategory === edCategory) {
        outletCodesWithStock.add(row[0]);
      }
    }
  }

  const outletList = getOutletList();
  return outletList.filter(outlet => outletCodesWithStock.has(outlet.code));
}

function saveProcurementAction(actionData) {
  try {
    const { groupKey, actionType, actionDetails, currentUser } = actionData;
    const [productCode] = groupKey.split('_'); 

    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.SHEETS.LOG_PROCUREMENT);
    const lock = LockService.getScriptLock();
    // Lock untuk procurement action juga ditingkatkan
    if (!lock.tryLock(60000)) {
        return { success: false, message: "Server sibuk. Coba lagi nanti." };
    }
    
    try {
        const allBatchesInGroup = getBatchesInGroup_(groupKey);
        
        allBatchesInGroup.forEach(batchId => {
          const productBatchId = `${productCode}_${batchId}`;
          const dataMap = createDataMapWithRowIndex(sheet, 0);
          const existingRow = dataMap.get(productBatchId);
          
          const dataToStore = [
            productBatchId,
            "'" + productCode,
            batchId,
            actionType,
            JSON.stringify(actionDetails),
            new Date(),
            currentUser.name,
            ''
          ];
          
          if (existingRow) {
            const rowIndex = existingRow[existingRow.length - 1];
            sheet.getRange(rowIndex, 1, 1, dataToStore.length).setValues([dataToStore]);
          } else {
            sheet.appendRow(dataToStore);
          }
        });

        SpreadsheetApp.flush();
        return { success: true, message: `Aksi berhasil disimpan untuk ${allBatchesInGroup.length} batch.` };
    } finally {
        lock.releaseLock();
    }
  } catch(e) {
    Logger.log(e);
    return { success: false, message: "Gagal menyimpan: " + e.message };
  }
}

function getBatchesInGroup_(groupKey) {
  if (!groupKey) return [];
  
  const [productCode, edCategory] = groupKey.split('_');
  if (!productCode || !edCategory) return [];

  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const stockSheet = ss.getSheetByName(CONFIG.SHEETS.STOCK_AKTUAL);
  if (stockSheet.getLastRow() < 2) return [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const getEdCategory = (edDate) => {
    const monthDiff = (edDate.getFullYear() - today.getFullYear()) * 12 + (edDate.getMonth() - today.getMonth());
    if (monthDiff < 0) return null;
    if (monthDiff === 0) return 'edBulanIni';
    if (monthDiff >= 1 && monthDiff <= 3) return 'ed1to3Bulan';
    if (monthDiff >= 4 && monthDiff <= 6) return 'ed4to6Bulan';
    if (monthDiff >= 7 && monthDiff <= 12) return 'ed7to12Bulan';
    return null;
  };

  const stockValues = stockSheet.getRange(2, 2, stockSheet.getLastRow() - 1, 5).getValues();
  const batches = new Set();

  for (const row of stockValues) {
    const currentProductCode = row[1].toString().trim();
    if (currentProductCode === productCode) {
      const edDate = new Date(row[3]);
      const currentEdCategory = getEdCategory(edDate);
      if (currentEdCategory === edCategory) {
        batches.add(row[2].toString().trim().toUpperCase());
      }
    }
  }
  return Array.from(batches);
}

function getMonitoringData(userIdentifier) {
    try {
        const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
        const productMap = createDataMapWithRowIndex(ss.getSheetByName(CONFIG.SHEETS.MASTER_PRODUCT), 2);
        const procLogSheet = ss.getSheetByName(CONFIG.SHEETS.LOG_PROCUREMENT);
        
        let procLogValues = [];
        if (procLogSheet.getLastRow() > 1) {
            procLogValues = procLogSheet.getRange(2, 1, procLogSheet.getLastRow() - 1, 8).getValues();
        }
        const actionsMap = new Map();
        for (const row of procLogValues) {
            actionsMap.set(row[0], { actionType: row[3], actionDetails: JSON.parse(row[4] || '{}') });
        }
        
        const stockSheet = ss.getSheetByName(CONFIG.SHEETS.STOCK_AKTUAL);
        let data = [];
        if (stockSheet.getLastRow() > 1) {
            // [MODIFIKASI] Ambil range sampai kolom 7 (G) untuk mendapatkan Remark
            const allStockData = stockSheet.getRange(2, 1, stockSheet.getLastRow() - 1, 7).getValues();
            const hasAllAccess = (userIdentifier === 'PROCUREMENT' || userIdentifier === 'BOD');
            if (hasAllAccess) {
                data = allStockData;
            } else {
                data = allStockData.filter(row => row[1] === userIdentifier);
            }
        }
        
        const categories = { edBulanIni: [], ed1to3Bulan: [], ed4to6Bulan: [], ed7to12Bulan: [], edTerkumpul: [] };
        if (data.length === 0) {
            return categories;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const firstDayOfCurrentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth();
        const hardLimit = getHardLimitDate_();
        const excludedProductCodes = getProcodeExcludeList();

        for (const row of data) {
            const edDateValue = row[4];
            if (!(edDateValue instanceof Date) || edDateValue.getFullYear() < 1970) continue;
            
            const edDate = new Date(edDateValue);
            if (edDate >= hardLimit) continue;

            const productDetails = productMap.get(row[2].toString().trim()) || [];
            const productCode = row[2].toString().replace(/'/g, '').trim();
            const batchId = row[3].toString().trim().toUpperCase();
            const productBatchKey = `${productCode}_${batchId}`;
            
            const itemData = {
                uniqueId: row[0],
                productCode: productCode,
                productName: productDetails[3] || 'Nama Tidak Ditemukan',
                batchId: batchId,
                totalQty: row[5],
                remark: row[6] || '', // [BARU] Ambil remark dari kolom index 6 (Kolom G)
                edDate: Utilities.formatDate(edDate, Session.getScriptTimeZone(), 'dd MMM yyyy'),
                edDateForInput: Utilities.formatDate(edDate, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
                rekomendasi: ''
            };

            const edYear = edDate.getFullYear();
            const edMonth = edDate.getMonth();
            const monthDiff = (edYear - currentYear) * 12 + (edMonth - currentMonth);
            const isExcluded = excludedProductCodes.includes(productCode);

            if (isExcluded) {
                itemData.rekomendasi = "Jual dengan harga normal atau ikuti diskon promosi tematik (Non-ED).";
            } else if (actionsMap.has(productBatchKey)) {
                const action = actionsMap.get(productBatchKey);
                itemData.rekomendasi = formatActionDetailsForMonitoring(action);
            } else {
                if (edYear === currentYear && edMonth === currentMonth) {
                    itemData.rekomendasi = "Pisahkan di Box ED Untuk STTK";
                } else if (monthDiff >= 1 && monthDiff <= 6) {
                    const nonMemberPrice = productDetails[11];
                    const discountedPrice = productDetails[12];
                    if (typeof nonMemberPrice === 'number' && nonMemberPrice > 0 && typeof discountedPrice === 'number' && discountedPrice > 0) {
                        const formatter = (num) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num);
                        itemData.rekomendasi = `Diskon 40%<br><b>${formatter(nonMemberPrice)}</b> -> <b>${formatter(discountedPrice)}</b>`;
                    }
                }
            }
            
            if (edDate < firstDayOfCurrentMonth) {
                categories.edTerkumpul.push(itemData);
            } else if (edYear === currentYear && edMonth === currentMonth) {
                categories.edBulanIni.push(itemData);
            } else if (monthDiff >= 1 && monthDiff <= 3) {
                categories.ed1to3Bulan.push(itemData);
            } else if (monthDiff >= 4 && monthDiff <= 6) {
                categories.ed4to6Bulan.push(itemData);
            } else if (monthDiff >= 7 && monthDiff <= 12) {
                categories.ed7to12Bulan.push(itemData);
            }
        }
        return categories;
    } catch (e) {
        Logger.log(e);
        return { error: e.message };
    }
}

function getNotificationsForOutlet(outlet) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const procLogSheet = ss.getSheetByName(CONFIG.SHEETS.LOG_PROCUREMENT);
  const productSheet = ss.getSheetByName(CONFIG.SHEETS.MASTER_PRODUCT);
  const stockSheet = ss.getSheetByName(CONFIG.SHEETS.STOCK_AKTUAL);
  if (procLogSheet.getLastRow() < 2) return [];
  const productMap = createDataMapWithRowIndex(productSheet, 2);
  const outletStock = new Set();
  if (stockSheet.getLastRow() > 1) {
    const stockValues = stockSheet.getRange(2, 1, stockSheet.getLastRow() - 1, 5).getValues();
    stockValues.forEach(row => {
      if (row[1] === outlet.code) {
        const productCode = row[2].toString().trim();
        const batchId = row[3].toString().trim().toUpperCase();
        outletStock.add(`${productCode}_${batchId}`);
      }
    });
  }
  const logValues = procLogSheet.getRange(2, 1, procLogSheet.getLastRow() - 1, 8).getValues();
  const newNotifications = [];
  logValues.forEach(row => {
    const productBatchId = row[0];
    const notifiedOutlets = row[7] ? row[7].toString() : '';
    if (outletStock.has(productBatchId) && !notifiedOutlets.includes(outlet.code)) {
      const productCode = row[1].replace(/'/g, '');
      const productDetails = productMap.get(productCode) || [];
      const action = { actionType: row[3], actionDetails: JSON.parse(row[4] || '{}') };
      newNotifications.push({ productBatchId: productBatchId, productName: productDetails[3] || 'Nama Produk Tidak Ditemukan', formattedAction: formatActionDetailsForMonitoring(action) });
    }
  });
  return newNotifications;
}

function markNotificationsAsSeen(outletCode, productBatchIds) {
  if (!productBatchIds || productBatchIds.length === 0) return { success: true };
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEETS.LOG_PROCUREMENT);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { success: false, message: "Busy" };
  try {
    const dataMap = createDataMapWithRowIndex(sheet, 0);
    productBatchIds.forEach(id => {
      const rowData = dataMap.get(id);
      if (rowData) {
        const rowIndex = rowData[rowData.length - 1];
        const notifiedCell = sheet.getRange(rowIndex, 8);
        let notifiedValue = notifiedCell.getValue().toString();
        if (!notifiedValue.includes(outletCode)) {
          notifiedCell.setValue(notifiedValue + outletCode + ',');
        }
      }
    });
  } catch (e) {
    Logger.log(e);
    return { success: false, message: e.message };
  } finally {
    lock.releaseLock();
  }
  return { success: true };
}

function sendWeeklySummaryEmail() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEETS.LOG_PROCUREMENT);
  if (sheet.getLastRow() < 2) {
    Logger.log("Tidak ada data di LOG PROCUREMENT untuk dikirim.");
    return;
  }
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentActions = values.filter(row => new Date(row[5]) > sevenDaysAgo);
  if (recentActions.length === 0) {
    MailApp.sendEmail(CONFIG.PROCUREMENT_EMAIL_RECIPIENT, "Ringkasan Mingguan Produk ED - Tidak Ada Aktivitas Baru", "Tidak ada aksi procurement baru yang diambil dalam 7 hari terakhir.");
    return;
  }
  let emailBody = ` <h1>Ringkasan Mingguan Aksi Procurement</h1> <p>Berikut adalah ringkasan aksi yang telah diambil dalam 7 hari terakhir:</p> <table border="1" cellpadding="5" style="border-collapse: collapse;"> <tr style="background-color: #f2f2f2;"> <th>Produk & Batch</th> <th>Aksi</th> <th>Detail Aksi</th> <th>Diubah Oleh</th> <th>Tanggal Ubah</th> </tr> `;
  recentActions.forEach(row => {
    const action = { actionType: row[3], actionDetails: JSON.parse(row[4] || '{}') };
    emailBody += ` <tr> <td>${row[1]}<br><small>Batch: ${row[2]}</small></td> <td>${row[3]}</td> <td>${formatActionDetailsForMonitoring(action).replace(/<br>/g, '; ')}</td> <td>${row[6]}</td> <td>${new Date(row[5]).toLocaleString('id-ID')}</td> </tr> `;
  });
  emailBody += "</table><p>Email ini dibuat secara otomatis.</p>";
  MailApp.sendEmail({ to: CONFIG.PROCUREMENT_EMAIL_RECIPIENT, subject: `Ringkasan Mingguan Produk ED - ${recentActions.length} Aksi Baru`, htmlBody: emailBody });
}

function createWeeklyTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === "sendWeeklySummaryEmail") {
      ScriptApp.deleteTrigger(trigger);
    }
  }
  ScriptApp.newTrigger("sendWeeklySummaryEmail")
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(8)
    .create();
  Logger.log("Trigger email mingguan berhasil dibuat.");
}

function getBodDashboardData() {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const stockSheet = ss.getSheetByName(CONFIG.SHEETS.STOCK_AKTUAL);
    const dataSheet = ss.getSheetByName(CONFIG.SHEETS.DATA_ED);
    const procLogSheet = ss.getSheetByName(CONFIG.SHEETS.LOG_PROCUREMENT);
    const outletSheet = ss.getSheetByName(CONFIG.SHEETS.MASTER_OUTLET);
    const historySheet = ss.getSheetByName(CONFIG.SHEETS.LOG_HISTORY);

    if (stockSheet.getLastRow() < 2) {
      return { error: "Tidak ada data stok untuk ditampilkan." };
    }

    const dataEdMap = new Map();
    if (dataSheet.getLastRow() > 1) {
      const dataEdValues = dataSheet.getRange(2, 1, dataSheet.getLastRow() - 1, 17).getValues();
      for (let i = dataEdValues.length - 1; i >= 0; i--) {
        const row = dataEdValues[i];
        const productCode = row[4].toString().replace(/'/g, '').trim();
        const batchId = row[6].toString().trim().toUpperCase();
        const key = `${productCode}_${batchId}`;
        if (!dataEdMap.has(key)) {
          dataEdMap.set(key, { unitCost: parseFloat(row[16]) || 0 });
        }
      }
    }

    const outletMap = new Map();
    if (outletSheet.getLastRow() > 1) {
      const outletValues = outletSheet.getRange(2, 1, outletSheet.getLastRow() - 1, 4).getValues();
      outletValues.forEach(row => outletMap.set(row[1], { name: row[0], am: row[3] }));
    }

    const stockValues = stockSheet.getRange(2, 2, stockSheet.getLastRow() - 1, 5).getValues();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const hardLimit = getHardLimitDate_();

    const expiredStartDate = new Date(2025, 8, 1);
    const expiredEndDate = new Date(today.getFullYear(), today.getMonth(), 0);
    let totalExpiredCost = 0;

    let totalRiskCost = 0;
    const riskySkus = new Set();
    const monthlyRisk = {};
    const outletRisk = {};
    const amRisk = {};
    const stockMap = new Map();

    stockValues.forEach(row => {
      const edDate = new Date(row[3]);
      const productCode = row[1].toString().trim();
      const batchId = row[2].toString().trim().toUpperCase();
      const qty = parseFloat(row[4]) || 0;
      const key = `${productCode}_${batchId}`;
      const unitCost = (dataEdMap.get(key) || { unitCost: 0 }).unitCost;
      const cost = qty * unitCost;

      if (edDate >= expiredStartDate && edDate <= expiredEndDate) {
        totalExpiredCost += cost;
      }

      if (edDate < today || edDate >= hardLimit) return;

      const outletCode = row[0];
      if (!stockMap.has(key)) stockMap.set(key, { totalQty: 0 });
      stockMap.get(key).totalQty += qty;

      totalRiskCost += cost;
      riskySkus.add(productCode);
      
      const monthKey = edDate.toLocaleString('id-ID', { month: 'short', year: 'numeric' });
      if (!monthlyRisk[monthKey]) {
        monthlyRisk[monthKey] = { b0: 0, b1_3: 0, b4_6: 0, b7_12: 0 };
      }
      
      const monthDiff = (edDate.getFullYear() - today.getFullYear()) * 12 + (edDate.getMonth() - today.getMonth());
      
      if (monthDiff <= 0) {
        monthlyRisk[monthKey].b0 += cost;
      } else if (monthDiff >= 1 && monthDiff <= 3) {
        monthlyRisk[monthKey].b1_3 += cost;
      } else if (monthDiff >= 4 && monthDiff <= 6) {
        monthlyRisk[monthKey].b4_6 += cost;
      } else if (monthDiff >= 7 && monthDiff <= 12) {
        monthlyRisk[monthKey].b7_12 += cost;
      }
      
      const outletInfo = outletMap.get(outletCode) || { name: outletCode, am: 'N/A' };
      if (!outletRisk[outletInfo.name]) outletRisk[outletInfo.name] = 0;
      outletRisk[outletInfo.name] += cost;

      if (outletInfo.am && outletInfo.am !== 'N/A') {
        if (!amRisk[outletInfo.am]) amRisk[outletInfo.am] = 0;
        amRisk[outletInfo.am] += cost;
      }
    });

    const monthMap = { 'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'Mei': 4, 'Jun': 5, 'Jul': 6, 'Agu': 7, 'Sep': 8, 'Okt': 9, 'Nov': 10, 'Des': 11 };
    const sortedMonths = Object.keys(monthlyRisk).sort((a, b) => {
        const [monthAStr, yearA] = a.split(' ');
        const [monthBStr, yearB] = b.split(' ');
        const dateA = new Date(yearA, monthMap[monthAStr]);
        const dateB = new Date(yearB, monthMap[monthBStr]);
        return dateA - dateB;
    });
    
    const trendData = [['Bulan ED', 'ED 7-12 Bln', 'ED 4-6 Bln', 'ED 1-3 Bln', 'Bulan Berjalan']];
    sortedMonths.forEach(monthName => {
      const monthData = monthlyRisk[monthName];
      trendData.push([monthName, monthData.b7_12, monthData.b4_6, monthData.b1_3, monthData.b0]);
    });

    const topOutlets = Object.entries(outletRisk).sort(([,a],[,b]) => b-a).slice(0, 10);
    const topAMs = Object.entries(amRisk).sort(([,a],[,b]) => b-a).slice(0, 10);

    let actionDistribution = {};
    let statusSummary = { 'Belum Ditangani': { totalCost: totalRiskCost } };
    let handledCost = 0;

    if (procLogSheet.getLastRow() > 1) {
      const procLogValues = procLogSheet.getRange(2, 1, procLogSheet.getLastRow() - 1, 5).getValues();
      procLogValues.forEach(row => {
        const key = row[0];
        const actionType = row[3] || 'Lainnya';
        const stockInfo = stockMap.get(key);
        if (stockInfo) {
          const unitCost = (dataEdMap.get(key) || {unitCost: 0}).unitCost;
          const cost = stockInfo.totalQty * unitCost;
          if (!actionDistribution[actionType]) actionDistribution[actionType] = 0;
          actionDistribution[actionType] += cost;
          handledCost += cost;
        }
      });
      statusSummary['Sudah Ditangani'] = { totalCost: handledCost };
      statusSummary['Belum Ditangani'].totalCost = totalRiskCost - handledCost;
    }
    
    let historyData = [['Bulan', 'Total Biaya Risiko']];
    if (historySheet.getLastRow() > 1) {
      const historyValues = historySheet.getRange(2, 1, historySheet.getLastRow() - 1, 2).getValues();
      historyValues.forEach(row => {
        const date = new Date(row[0]);
        const monthName = date.toLocaleString('id-ID', { month: 'short', year: 'numeric' });
        historyData.push([monthName, row[1]]);
      });
    }

    return {
      kpi: {
        totalRiskCost: totalRiskCost,
        totalRiskSku: riskySkus.size,
        totalExpiredCost: totalExpiredCost
      },
      trendChartData: trendData,
      topOutletsData: [['Apotek', 'Total Biaya Risiko']].concat(topOutlets),
      topAMsData: [['Area Manager', 'Total Biaya Risiko']].concat(topAMs),
      actionDistData: [['Aksi', 'Total Biaya']].concat(Object.entries(actionDistribution)),
      statusSummary: statusSummary,
      historyChartData: historyData
    };

  } catch (e) {
    Logger.log(e);
    return { error: e.message };
  }
}

function recordMonthlySnapshot() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const stockSheet = ss.getSheetByName(CONFIG.SHEETS.STOCK_AKTUAL);
  const dataSheet = ss.getSheetByName(CONFIG.SHEETS.DATA_ED);
  const historySheet = ss.getSheetByName(CONFIG.SHEETS.LOG_HISTORY);
  if (stockSheet.getLastRow() < 2) return;
  const dataEdMap = new Map();
  if (dataSheet.getLastRow() > 1) {
    const dataEdValues = dataSheet.getRange(2, 1, dataSheet.getLastRow() - 1, 17).getValues();
    for (let i = dataEdValues.length - 1; i >= 0; i--) {
      const row = dataEdValues[i];
      const productCode = row[4].toString().replace(/'/g, '').trim();
      const batchId = row[6].toString().trim().toUpperCase();
      const key = `${productCode}_${batchId}`;
      if (!dataEdMap.has(key)) {
        dataEdMap.set(key, { unitCost: parseFloat(row[16]) || 0 });
      }
    }
  }
  const stockValues = stockSheet.getRange(2, 2, stockSheet.getLastRow() - 1, 5).getValues();
  const today = new Date();
  today.setHours(0,0,0,0);
  const hardLimit = getHardLimitDate_();
  let totalRiskCost = 0;
  stockValues.forEach(row => {
    const edDate = new Date(row[3]);
    if (edDate < today || edDate >= hardLimit) return;
    const productCode = row[1].toString().trim();
    const batchId = row[2].toString().trim().toUpperCase();
    const qty = parseFloat(row[4]) || 0;
    const key = `${productCode}_${batchId}`;
    const unitCost = (dataEdMap.get(key) || {unitCost: 0}).unitCost;
    totalRiskCost += qty * unitCost;
  });
  const snapshotDate = new Date();
  historySheet.appendRow([snapshotDate, totalRiskCost]);
}

function createMonthlyTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === "recordMonthlySnapshot") {
      ScriptApp.deleteTrigger(trigger);
    }
  }
  ScriptApp.newTrigger("recordMonthlySnapshot")
    .timeBased()
    .onMonthDay(22)
    .atHour(1)
    .create();
  Logger.log("Trigger snapshot bulanan berhasil dibuat untuk tanggal 22.");
}

function getAmDashboardData(amInfo) { 
  try { 
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID); 
    const stockSheet = ss.getSheetByName(CONFIG.SHEETS.STOCK_AKTUAL); 
    const dataSheet = ss.getSheetByName(CONFIG.SHEETS.DATA_ED); 
    const outletSheet = ss.getSheetByName(CONFIG.SHEETS.MASTER_OUTLET); 
    const productSheet = ss.getSheetByName(CONFIG.SHEETS.MASTER_PRODUCT); 

    if (stockSheet.getLastRow() < 2) { return { error: "Tidak ada data stok untuk ditampilkan." }; } 
    
    const amOutletsMap = new Map(); 
    const amOutletsList = []; 
    if (outletSheet.getLastRow() > 1) { 
        const outletValues = outletSheet.getRange(2, 1, outletSheet.getLastRow() - 1, 4).getValues(); 
        outletValues.forEach(row => { 
            if (row[3] === amInfo.name) { 
                const outletCode = row[1]; 
                const outletName = row[0]; 
                amOutletsMap.set(outletCode, outletName); 
                amOutletsList.push({ code: outletCode, name: outletName }); 
            } 
        }); 
    } 

    if (amOutletsMap.size === 0) { 
        return { fullData: [], filters: { outlets: amOutletsList } }; 
    } 
    
    const dataEdMap = new Map(); 
    if (dataSheet.getLastRow() > 1) { 
        const dataEdValues = dataSheet.getRange(2, 1, dataSheet.getLastRow() - 1, 17).getValues(); 
        for (let i = dataEdValues.length - 1; i >= 0; i--) { 
            const row = dataEdValues[i]; 
            const productCode = row[4].toString().replace(/'/g, '').trim(); 
            const batchId = row[6].toString().trim().toUpperCase(); 
            const key = `${productCode}_${batchId}`; 
            if (!dataEdMap.has(key)) { 
                dataEdMap.set(key, { unitCost: parseFloat(row[16]) || 0 }); 
            } 
        } 
    } 

    const productMap = createDataMapWithRowIndex(productSheet, 2); 
    const stockValues = stockSheet.getRange(2, 2, stockSheet.getLastRow() - 1, 5).getValues(); 
    const today = new Date(); 
    today.setHours(0, 0, 0, 0); 
    const hardLimit = getHardLimitDate_();
    const expiredStartDate = new Date(2025, 8, 1);
    const expiredEndDate = new Date(today.getFullYear(), today.getMonth(), 0);

    const amData = []; 
    stockValues.forEach(row => { 
        const outletCode = row[0]; 
        if (amOutletsMap.has(outletCode)) { 
            const edDate = new Date(row[3]); 
            
            const productCode = row[1].toString().trim(); 
            const batchId = row[2].toString().trim().toUpperCase(); 
            const qty = parseFloat(row[4]) || 0; 
            const key = `${productCode}_${batchId}`; 
            const unitCost = (dataEdMap.get(key) || { unitCost: 0 }).unitCost; 
            const cost = qty * unitCost; 

            const outletName = amOutletsMap.get(outletCode);
            const productInfo = productMap.get(productCode) || []; 
            const productName = productInfo[3] || productCode;

            // --- PERUBAHAN LOGIKA ---
            // Kirim SEMUA data (risiko masa depan & expired) ke frontend
            // Tambahkan properti untuk membedakannya
            let isExpired = false;
            let riskCost = 0;
            let expiredCost = 0;

            if (edDate >= expiredStartDate && edDate <= expiredEndDate) {
                isExpired = true;
                expiredCost = cost;
            } else if (edDate >= today && edDate < hardLimit) {
                riskCost = cost;
            } else {
                return; // Abaikan data lain
            }

            amData.push({ 
                outletName: outletName, 
                productName: productName, 
                totalCost: riskCost,       // Ini adalah nilai risiko MASA DEPAN
                expiredCost: expiredCost,  // Ini adalah nilai risiko EXPIRED
                edDate: edDate.toISOString() 
            }); 
        } 
    }); 
    
    return { 
        fullData: amData, 
        filters: { outlets: amOutletsList.sort((a, b) => a.name.localeCompare(b.name)) } 
    }; 
  } catch (e) { 
      Logger.log(e); return { error: e.message }; 
  } 
}

function getDetailedStockReportForExport() {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const stockSheet = ss.getSheetByName(CONFIG.SHEETS.STOCK_AKTUAL);
    const dataSheet = ss.getSheetByName(CONFIG.SHEETS.DATA_ED);
    const outletSheet = ss.getSheetByName(CONFIG.SHEETS.MASTER_OUTLET);
    const productSheet = ss.getSheetByName(CONFIG.SHEETS.MASTER_PRODUCT);

    if (stockSheet.getLastRow() < 2) {
      return [];
    }

    const outletMap = new Map();
    if (outletSheet.getLastRow() > 1) {
      const outletValues = outletSheet.getRange(2, 1, outletSheet.getLastRow() - 1, 2).getValues();
      outletValues.forEach(row => outletMap.set(row[1], row[0]));
    }

    const productMap = new Map();
    if (productSheet.getLastRow() > 1) {
      const productValues = productSheet.getRange(2, 3, productSheet.getLastRow() - 1, 2).getValues();
      productValues.forEach(row => productMap.set(row[0], row[1]));
    }
    
    const costMap = new Map();
    if (dataSheet.getLastRow() > 1) {
      const dataEdValues = dataSheet.getRange(2, 1, dataSheet.getLastRow() - 1, 17).getValues();
      for (let i = dataEdValues.length - 1; i >= 0; i--) {
        const row = dataEdValues[i];
        const productCode = row[4].toString().replace(/'/g, '').trim();
        const batchId = row[6].toString().trim().toUpperCase();
        const key = `${productCode}_${batchId}`;
        if (!costMap.has(key)) {
          costMap.set(key, parseFloat(row[16]) || 0);
        }
      }
    }

    const allStockData = stockSheet.getRange(2, 1, stockSheet.getLastRow() - 1, 6).getValues();
    const reportData = [];
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const firstDayOfCurrentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();

    for (const row of allStockData) {
      const edDateValue = row[4];
      if (!(edDateValue instanceof Date) || edDateValue.getFullYear() < 1970) continue;
      
      const edDate = new Date(edDateValue);
      const outletCode = row[1];
      const productCode = row[2].toString().replace(/'/g, '').trim();
      const batchId = row[3].toString().trim().toUpperCase();
      const qty = parseFloat(row[5]) || 0;
      const productBatchKey = `${productCode}_${batchId}`;
      const unitCost = costMap.get(productBatchKey) || 0;
      const totalCost = qty * unitCost;
      const monthDiff = (edDate.getFullYear() - currentYear) * 12 + (edDate.getMonth() - currentMonth);
      let category = '';
      if (edDate < firstDayOfCurrentMonth) { category = 'Produk Kedaluwarsa (Terkumpul)'; } 
      else if (edDate.getFullYear() === currentYear && edDate.getMonth() === currentMonth) { category = 'ED Bulan Berjalan'; } 
      else if (monthDiff >= 1 && monthDiff <= 3) { category = 'ED 1-3 Bulan Mendatang'; } 
      else if (monthDiff >= 4 && monthDiff <= 6) { category = 'ED 4-6 Bulan Mendatang'; } 
      else if (monthDiff >= 7 && monthDiff <= 12) { category = 'ED 7-12 Bulan Mendatang'; } 
      else { continue; }
      
      reportData.push({ category, outletName: outletMap.get(outletCode) || outletCode, productName: productMap.get(productCode) || 'Nama Tidak Ditemukan', productCode, batchId, edDate: Utilities.formatDate(edDate, Session.getScriptTimeZone(), 'dd-MM-yyyy'), qty, unitCost, totalCost });
    }
    return reportData.sort((a,b) => new Date(a.edDate.split('-').reverse().join('-')) - new Date(b.edDate.split('-').reverse().join('-')));
  } catch (e) { Logger.log(e); return { error: `Gagal membuat laporan: ${e.message}` }; }
}

function getProductInfoByBarcode(barcode) { 
    if (!barcode) return null;
    const productList = getProductList();
    const product = productList.find(p => p.barcode && p.barcode.toString().trim() === barcode.trim());
    return product ? { code: product.code, description: product.description, uom: product.uom } : null; 
}

function formatActionDetailsForMonitoring(action) {
  if (action && action.actionDetails) {
    let details = [];
    for (const key in action.actionDetails) {
      if (action.actionDetails[key]) {
        details.push(`${key}: ${action.actionDetails[key]}`);
      }
    }
    return `Aksi: ${action.actionType}<br><small>${details.join(', ')}</small>`;
  }
  return `Aksi: ${action.actionType || 'Tidak ada detail'}`;
}

/**
 * Memproses Upload CSV Massal dari Outlet.
 * OPTIMASI: Membaca seluruh sheet, memodifikasi di memori, dan menulis balik sekali (Batch Update).
 */
/**
 * Memproses Upload CSV Massal dari Outlet.
 * OPTIMASI: Membaca seluruh sheet, memodifikasi di memori, dan menulis balik sekali (Batch Update).
 */
function processMassUpload(fileContent, outletCode) {
  const lock = LockService.getScriptLock();
  // 1. Lock Service (60 detik)
  if (!lock.tryLock(60000)) {
    return { success: false, message: "Server sibuk. Silakan coba lagi dalam 1-2 menit." };
  }

  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const stockSheet = ss.getSheetByName(CONFIG.SHEETS.STOCK_AKTUAL);
    const logSheet = ss.getSheetByName(CONFIG.SHEETS.LOG_EDIT);
    const hardLimit = getHardLimitDate_();

    // Parse CSV
    const csvData = Utilities.parseCsv(fileContent);
    if (csvData.length < 2) {
      return { success: false, message: "File CSV kosong atau format salah." };
    }

    // 2. Batch Read: Ambil seluruh data stok
    // Kita butuh range penuh untuk melakukan batch update nantinya
    const range = stockSheet.getRange(2, 1, stockSheet.getLastRow() - 1, 7);
    const allStockValues = range.getValues(); // Array 2D di memori

    // Buat Map untuk lookup cepat: UniqueID -> Index Baris di Array allStockValues
    const stockMap = new Map();
    allStockValues.forEach((row, index) => {
      // row[0] adalah Unique ID
      stockMap.set(row[0].toString(), index);
    });

    const logsToAppend = [];
    let successCount = 0;
    let errorCount = 0;
    let errors = [];

    // Iterasi data CSV (Mulai index 1 untuk skip header)
    // Asumsi Urutan Kolom CSV: 
    // 0: Original Unique ID, 1: Kategori, 2: Nama Produk, 3: Kode Produk, 
    // 4: Batch ID, 5: Tanggal ED, 6: Qty, 7: Remark, 8: Rekomendasi
    for (let i = 1; i < csvData.length; i++) {
      const row = csvData[i];
      const originalId = row[0];
      
      // a. Validasi Keberadaan Data (Security: Hanya update, dilarang insert baru via upload ini)
      if (!stockMap.has(originalId)) {
        errorCount++;
        errors.push(`Baris ${i+1}: ID Produk tidak ditemukan (Mungkin sudah berubah/dihapus).`);
        continue;
      }

      const rowIndex = stockMap.get(originalId);
      const currentRow = allStockValues[rowIndex];

      // Validasi Outlet (Security: Pastikan outlet hanya mengedit datanya sendiri)
      if (currentRow[1] !== outletCode) {
        errorCount++;
        errors.push(`Baris ${i+1}: Akses ditolak (Bukan data outlet Anda).`);
        continue;
      }

      // Parsing Data Baru dari CSV
      // Handle Kode Produk: Hapus format Excel formula (="...") jika ada
      let newProductCode = row[3].replace(/^="|"$/g, '').replace(/"/g, '').trim();
      // Pastikan leading zero aman
      if (newProductCode.length === 6 && !isNaN(newProductCode)) newProductCode = "0" + newProductCode;

      const newBatch = row[4].trim().toUpperCase();
      const newQty = parseFloat(row[6]);
      const newRemark = row[7] ? row[7].trim() : '';
      
      // [PERBAIKAN DISINI] Hapus 'Utilities.' karena parseDateSafely adalah fungsi global custom
      const newEdDate = parseDateSafely(row[5]);

      if (!newEdDate) {
        errorCount++;
        errors.push(`Baris ${i+1}: Format tanggal tidak valid. Gunakan YYYY-MM-DD atau DD/MM/YYYY.`);
        continue;
      }

      // b. Validasi Hard Limit
      if (newEdDate >= hardLimit) {
        errorCount++;
        errors.push(`Baris ${i+1}: Tanggal ED melebihi batas (Apr 2027).`);
        continue;
      }
      
      if (isNaN(newQty) || newQty < 0) {
        errorCount++;
        errors.push(`Baris ${i+1}: Qty tidak valid.`);
        continue;
      }

      // c. Deteksi Perubahan
      const oldBatch = currentRow[3];
      const oldEdDate = new Date(currentRow[4]);
      const oldQty = currentRow[5];
      const oldRemark = currentRow[6];

      const isBatchChanged = oldBatch !== newBatch;
      const isEdChanged = oldEdDate.getTime() !== newEdDate.getTime();
      const isQtyChanged = oldQty !== newQty;
      const isRemarkChanged = oldRemark !== newRemark;

      if (!isBatchChanged && !isEdChanged && !isQtyChanged && !isRemarkChanged) {
        continue; // Tidak ada perubahan
      }

      // Logika Update
      let finalUniqueId = originalId;
      
      // Jika Batch atau ED berubah, Generate ID Baru
      if (isBatchChanged || isEdChanged) {
        const formattedEdForId = Utilities.formatDate(newEdDate, Session.getScriptTimeZone(), "yyyy-MM-dd");
        finalUniqueId = `${outletCode}_${newProductCode}_${newBatch}_${formattedEdForId}`;
        
        // Cek bentrok ID (kecuali bentrok dengan diri sendiri/originalId)
        if (stockMap.has(finalUniqueId) && finalUniqueId !== originalId) {
           errorCount++;
           errors.push(`Baris ${i+1}: Gagal update. Kombinasi Batch & ED baru sudah ada di data lain.`);
           continue;
        }
      }

      // UPDATE ARRAY DI MEMORI (Optimasi)
      // Kolom: 0:ID, 1:Outlet, 2:Procode, 3:Batch, 4:ED, 5:Qty, 6:Remark
      allStockValues[rowIndex][0] = finalUniqueId;
      allStockValues[rowIndex][2] = "'" + newProductCode; // Paksa string
      allStockValues[rowIndex][3] = newBatch;
      allStockValues[rowIndex][4] = newEdDate;
      allStockValues[rowIndex][5] = newQty;
      allStockValues[rowIndex][6] = newRemark;

      // Siapkan Log
      const oldValStr = `Batch:${oldBatch}, ED:${Utilities.formatDate(oldEdDate, Session.getScriptTimeZone(), 'yyyy-MM-dd')}, Qty:${oldQty}, Rem:${oldRemark}`;
      const newValStr = `Batch:${newBatch}, ED:${Utilities.formatDate(newEdDate, Session.getScriptTimeZone(), 'yyyy-MM-dd')}, Qty:${newQty}, Rem:${newRemark}`;
      
      logsToAppend.push([
        new Date(), outletCode, "'" + newProductCode, oldBatch, oldEdDate, 
        oldValStr, newValStr, "Mass Upload", newRemark
      ]);

      successCount++;
    }

    // 3. Batch Write: Tulis balik ke Spreadsheet HANYA JIKA ada yang sukses
    if (successCount > 0) {
      range.setValues(allStockValues);
      
      // Tulis Log
      if (logsToAppend.length > 0) {
        logSheet.getRange(logSheet.getLastRow() + 1, 1, logsToAppend.length, logsToAppend[0].length).setValues(logsToAppend);
      }
      
      SpreadsheetApp.flush();
    }

    let message = `Berhasil update ${successCount} baris.`;
    if (errorCount > 0) {
      message += ` Gagal: ${errorCount} baris. (Cek error pertama: ${errors[0]})`;
    }

    return { 
      success: true, 
      message: message,
      errors: errors // Kirim list error ke frontend jika perlu ditampilkan detail
    };

  } catch (e) {
    Logger.log(e);
    return { success: false, message: "Error Sistem: " + e.message };
  } finally {
    lock.releaseLock();
  }
}