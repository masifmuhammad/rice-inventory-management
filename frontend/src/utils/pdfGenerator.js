import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { formatPKR, formatQuantity } from './currency';

/**
 * Generate PDF invoice for a transaction
 * @param {Object} transaction - Transaction data
 * @param {Object} product - Product data
 * @param {Object} companyInfo - Company information
 */
export const generateTransactionPDF = (transaction, product, companyInfo = {}) => {
  const doc = new jsPDF();

  // Default company info
  const company = {
    name: companyInfo.name || 'Rice Inventory Management',
    address: companyInfo.address || 'Pakistan',
    phone: companyInfo.phone || '',
    email: companyInfo.email || '',
    ...companyInfo
  };

  // Colors
  const primaryColor = [2, 132, 199]; // #0284c7
  const darkColor = [31, 41, 55]; // #1f2937
  const lightGray = [243, 244, 246]; // #f3f4f6

  // Header - Company Name
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, 210, 40, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont(undefined, 'bold');
  doc.text(company.name, 15, 20);

  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  if (company.address) doc.text(company.address, 15, 27);
  if (company.phone) doc.text(`Phone: ${company.phone}`, 15, 32);
  if (company.email) doc.text(`Email: ${company.email}`, 15, 37);

  // Transaction Type Badge
  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  const typeText = transaction.type === 'stock_in' ? 'STOCK IN' :
                   transaction.type === 'stock_out' ? 'STOCK OUT' :
                   transaction.type === 'adjustment' ? 'ADJUSTMENT' : 'TRANSFER';
  doc.text(typeText, 200, 20, { align: 'right' });

  // Document Info Box
  doc.setTextColor(...darkColor);
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');

  const docInfoY = 50;
  doc.setFillColor(...lightGray);
  doc.rect(140, docInfoY, 55, 25, 'F');

  doc.setFont(undefined, 'bold');
  doc.text('Transaction ID:', 145, docInfoY + 6);
  doc.text('Date:', 145, docInfoY + 12);
  doc.text('Reference:', 145, docInfoY + 18);

  doc.setFont(undefined, 'normal');
  const transactionId = transaction._id ? transaction._id.slice(-8).toUpperCase() : 'N/A';
  const transactionDate = new Date(transaction.createdAt).toLocaleDateString('en-PK', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  doc.text(transactionId, 195, docInfoY + 6, { align: 'right' });
  doc.text(transactionDate, 195, docInfoY + 12, { align: 'right' });
  doc.text(transaction.reference || 'N/A', 195, docInfoY + 18, { align: 'right' });

  // Party Information (Supplier/Customer)
  let partyY = docInfoY;
  if (transaction.supplier || transaction.customer) {
    doc.setFont(undefined, 'bold');
    doc.setFontSize(12);
    const partyLabel = transaction.supplier ? 'Supplier Information' : 'Customer Information';
    doc.text(partyLabel, 15, partyY + 6);

    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(transaction.supplier || transaction.customer || 'N/A', 15, partyY + 12);
  }

  // Product Details Section
  const productY = 85;
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...primaryColor);
  doc.text('Product Details', 15, productY);

  // Product Details Table
  const productDetails = [
    ['Product Name', product?.name || 'N/A'],
    ['SKU', product?.sku || 'N/A'],
    ['Category', product?.category || 'N/A'],
    ['Batch Number', transaction.batchNumber || 'N/A'],
    ['Location', product?.location || 'N/A']
  ];

  if (transaction.expiryDate) {
    productDetails.push(['Expiry Date', new Date(transaction.expiryDate).toLocaleDateString('en-PK')]);
  }

  doc.autoTable({
    startY: productY + 5,
    head: [['Field', 'Value']],
    body: productDetails,
    theme: 'grid',
    headStyles: {
      fillColor: primaryColor,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 10
    },
    styles: {
      fontSize: 10,
      cellPadding: 4
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 50 },
      1: { cellWidth: 130 }
    }
  });

  // Transaction Details Section
  let transactionY = doc.lastAutoTable.finalY + 15;
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...primaryColor);
  doc.text('Transaction Details', 15, transactionY);

  // Transaction Table
  const transactionDetails = [
    ['Quantity', formatQuantity(transaction.quantity, transaction.unit || product?.unit || 'kg')],
    ['Price per Unit', formatPKR(transaction.price || product?.sellingPrice || 0)],
    ['Total Value', formatPKR(transaction.totalValue || (transaction.quantity * (transaction.price || 0)))],
    ['Stock Before', formatQuantity(transaction.stockBefore, transaction.unit || product?.unit || 'kg')],
    ['Stock After', formatQuantity(transaction.stockAfter, transaction.unit || product?.unit || 'kg')]
  ];

  doc.autoTable({
    startY: transactionY + 5,
    head: [['Description', 'Amount']],
    body: transactionDetails,
    theme: 'striped',
    headStyles: {
      fillColor: primaryColor,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 10
    },
    styles: {
      fontSize: 11,
      cellPadding: 5
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 80 },
      1: { cellWidth: 110, halign: 'right', fontStyle: 'bold' }
    }
  });

  // Notes Section
  if (transaction.notes) {
    const notesY = doc.lastAutoTable.finalY + 15;
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...darkColor);
    doc.text('Notes:', 15, notesY);

    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    const splitNotes = doc.splitTextToSize(transaction.notes, 180);
    doc.text(splitNotes, 15, notesY + 6);
  }

  // Footer
  const pageHeight = doc.internal.pageSize.height;
  doc.setDrawColor(...lightGray);
  doc.line(15, pageHeight - 25, 195, pageHeight - 25);

  doc.setFontSize(9);
  doc.setTextColor(128, 128, 128);
  doc.setFont(undefined, 'italic');
  doc.text('This is a computer-generated document. No signature required.', 105, pageHeight - 18, { align: 'center' });
  doc.text(`Generated on: ${new Date().toLocaleString('en-PK')}`, 105, pageHeight - 13, { align: 'center' });

  // Save PDF
  const fileName = `Transaction_${typeText.replace(' ', '_')}_${transactionId}_${new Date().getTime()}.pdf`;
  doc.save(fileName);
};

/**
 * Generate comprehensive inventory report PDF
 * @param {Array} products - Array of product data
 * @param {Object} summary - Summary statistics
 * @param {Object} companyInfo - Company information
 */
export const generateInventoryReportPDF = (products, summary, companyInfo = {}) => {
  const doc = new jsPDF('landscape');

  const company = {
    name: companyInfo.name || 'Rice Inventory Management',
    ...companyInfo
  };

  const primaryColor = [2, 132, 199];

  // Header
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, 297, 30, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont(undefined, 'bold');
  doc.text(company.name, 15, 12);

  doc.setFontSize(14);
  doc.text('Inventory Stock Report', 15, 22);

  doc.setFontSize(10);
  const reportDate = new Date().toLocaleDateString('en-PK', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  doc.text(`Generated: ${reportDate}`, 282, 22, { align: 'right' });

  // Summary Boxes
  const summaryY = 40;
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);

  const summaryData = [
    { label: 'Total Products', value: summary.totalProducts || products.length },
    { label: 'Total Value', value: formatPKR(summary.totalValue || 0) },
    { label: 'Potential Value', value: formatPKR(summary.totalPotentialValue || 0) }
  ];

  let summaryX = 15;
  summaryData.forEach((item, index) => {
    doc.setFillColor(243, 244, 246);
    doc.rect(summaryX, summaryY, 85, 15, 'F');

    doc.setFont(undefined, 'normal');
    doc.text(item.label, summaryX + 3, summaryY + 6);

    doc.setFont(undefined, 'bold');
    doc.setFontSize(11);
    doc.text(String(item.value), summaryX + 3, summaryY + 12);

    doc.setFontSize(10);
    summaryX += 90;
  });

  // Products Table
  const tableData = products.map(p => [
    p.name || 'N/A',
    p.sku || 'N/A',
    p.category || 'N/A',
    formatQuantity(p.currentStock, p.unit),
    formatPKR(p.costPrice, false),
    formatPKR(p.sellingPrice, false),
    formatPKR(p.stockValue || (p.currentStock * p.costPrice), false),
    p.currentStock <= (p.minStockLevel || 0) ? 'Low' : 'OK'
  ]);

  doc.autoTable({
    startY: summaryY + 25,
    head: [['Product Name', 'SKU', 'Category', 'Stock', 'Cost Price', 'Sell Price', 'Stock Value', 'Status']],
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: primaryColor,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9
    },
    styles: {
      fontSize: 8,
      cellPadding: 3
    },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 30 },
      2: { cellWidth: 35 },
      3: { cellWidth: 30, halign: 'right' },
      4: { cellWidth: 30, halign: 'right' },
      5: { cellWidth: 30, halign: 'right' },
      6: { cellWidth: 35, halign: 'right', fontStyle: 'bold' },
      7: { cellWidth: 22, halign: 'center' }
    },
    didParseCell: (data) => {
      if (data.column.index === 7 && data.cell.raw === 'Low') {
        data.cell.styles.textColor = [220, 38, 38];
        data.cell.styles.fontStyle = 'bold';
      }
    }
  });

  // Footer
  const pageHeight = doc.internal.pageSize.height;
  doc.setFontSize(8);
  doc.setTextColor(128, 128, 128);
  doc.text(`Page 1 - Inventory Report - ${reportDate}`, 148.5, pageHeight - 10, { align: 'center' });

  // Save
  const fileName = `Inventory_Report_${new Date().getTime()}.pdf`;
  doc.save(fileName);
};
