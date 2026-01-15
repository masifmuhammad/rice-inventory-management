import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatPKR, formatQuantity } from './currency';
import { loadLogoForPDF } from './logoHelper';

/**
 * Generate PDF invoice for a transaction
 * @param {Object} transaction - Transaction data
 * @param {Object} product - Product data
 * @param {Object} companyInfo - Company information
 */
export const generateTransactionPDF = async (transaction, product, companyInfo = {}) => {
  try {
    console.log('Starting PDF generation...');
    const doc = new jsPDF();
    
    // Load logo
    const logoData = await loadLogoForPDF();

  // Default company info
  const company = {
    name: companyInfo.name || 'Haji Muhammad Rice Mills Inventory',
    address: companyInfo.address || 'Pakistan',
    phone: companyInfo.phone || '',
    email: companyInfo.email || '',
    ...companyInfo
  };

  // Colors - Matching HM Rice Mills Logo
  const darkGreen = [26, 95, 63]; // #1a5f3f - Main brand color (from logo outer ring)
  const goldenBrown = [212, 165, 116]; // #d4a574 - Accent color (from logo text/decorations)
  const darkGreenDarker = [20, 70, 50]; // Darker shade for borders
  const white = [255, 255, 255];

  // Compact Header - White background to match logo
  doc.setFillColor(...white);
  doc.rect(0, 0, 210, 42, 'F');
  
  // Top accent bar in dark green for branding
  doc.setFillColor(...darkGreen);
  doc.rect(0, 0, 210, 5, 'F');

  // Add logo if available - smaller for compact header
  let textStartX = 15;
  let logoSize = 0;
  if (logoData && logoData.data) {
    try {
      logoSize = 28; // Compact logo size
      const logoX = 15;
      const logoY = 7;
      
      // Add logo directly without background
      doc.addImage(logoData.data, logoData.type, logoX, logoY, logoSize, logoSize);
      textStartX = logoX + logoSize + 10;
      console.log('Logo added successfully to PDF');
    } catch (e) {
      console.error('Error adding logo to PDF:', e);
      logoSize = 0;
    }
  }

  // Company name in dark green (on white background)
  doc.setTextColor(...darkGreen);
  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.text(company.name, textStartX, 22);

  // Company address in dark gray (on white background)
  doc.setTextColor(60, 60, 60);
  doc.setFontSize(8);
  doc.setFont(undefined, 'normal');
  if (company.address) doc.text(company.address, textStartX, 28);

  // Transaction Type Badge - top right (golden-brown on white)
  const typeText = transaction.type === 'stock_in' ? 'STOCK IN' :
                   transaction.type === 'stock_out' ? 'STOCK OUT' :
                   transaction.type === 'adjustment' ? 'ADJUSTMENT' : 'TRANSFER';
  
  doc.setFillColor(...goldenBrown);
  doc.roundedRect(165, 12, 40, 10, 2, 2, 'F');
  doc.setTextColor(...darkGreen);
  doc.setFontSize(9);
  doc.setFont(undefined, 'bold');
  doc.text(typeText, 185, 19, { align: 'center' });

  // Transaction Info - Compact box on right side
  const transactionId = transaction._id ? transaction._id.slice(-8).toUpperCase() : 'N/A';
  const transactionDate = new Date(transaction.createdAt).toLocaleDateString('en-PK', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const hasReference = transaction.reference && transaction.reference !== 'N/A';

  doc.setFillColor(...goldenBrown);
  doc.setDrawColor(...darkGreenDarker);
  doc.setLineWidth(0.5);
  const infoBoxHeight = hasReference ? 16 : 12;
  doc.roundedRect(140, 28, 65, infoBoxHeight, 2, 2, 'FD');
  
  doc.setTextColor(...white);
  doc.setFontSize(7);
  doc.setFont(undefined, 'bold');
  let infoY = 33;
  doc.text('ID:', 145, infoY);
  doc.text('Date:', 145, infoY + 5);
  if (hasReference) {
    doc.text('Ref:', 145, infoY + 10);
  }
  
  doc.setTextColor(...darkGreen);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(8);
  doc.text(transactionId, 200, infoY, { align: 'right' });
  doc.text(transactionDate, 200, infoY + 5, { align: 'right' });
  if (hasReference) {
    doc.text(transaction.reference, 200, infoY + 10, { align: 'right' });
  }

  // Start content area
  let currentY = 50;

  // Supplier/Customer Information - Compact
  if (transaction.supplier || transaction.customer) {
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...darkGreen);
    const partyLabel = transaction.supplier ? 'Supplier' : 'Customer';
    doc.text(`${partyLabel}:`, 15, currentY);
    
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(60, 60, 60);
    doc.text(transaction.supplier || transaction.customer || 'N/A', 50, currentY);
    currentY += 8;
  }

  // Product Details - Compact inline format
  currentY += 3;
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...darkGreen);
  doc.text('Product Details', 15, currentY);
  
  currentY += 7;
  const productInfo = [
    ['Product Name', product?.name || 'N/A'],
    ['SKU', product?.sku || 'N/A'],
    ['Category', product?.category || 'N/A']
  ];
  
  if (transaction.batchNumber) productInfo.push(['Batch', transaction.batchNumber]);
  if (product?.location) productInfo.push(['Location', product.location]);
  if (transaction.expiryDate) {
    productInfo.push(['Expiry', new Date(transaction.expiryDate).toLocaleDateString('en-PK')]);
  }

  // Compact product info table
  autoTable(doc, {
    startY: currentY,
    head: [['Field', 'Value']],
    body: productInfo,
    theme: 'plain',
    headStyles: {
      fillColor: darkGreen,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9
    },
    styles: {
      fontSize: 9,
      cellPadding: 3,
      lineColor: [200, 200, 200]
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 45, textColor: [60, 60, 60] },
      1: { cellWidth: 150, textColor: [40, 40, 40] }
    },
    margin: { left: 15, right: 15 }
  });

  currentY = doc.lastAutoTable.finalY + 8;

  // Transaction Details - Prominent values
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...darkGreen);
  doc.text('Transaction Details', 15, currentY);
  
  currentY += 7;
  
  // Transaction details with prominent values
  const transactionDetails = [
    ['Quantity', formatQuantity(transaction.quantity, transaction.unit || product?.unit || 'kg')],
    ['Price per Unit', formatPKR(transaction.price || product?.sellingPrice || 0)],
    ['Total Value', formatPKR(transaction.totalValue || (transaction.quantity * (transaction.price || 0)))],
    ['Stock Before', formatQuantity(transaction.stockBefore, transaction.unit || product?.unit || 'kg')],
    ['Stock After', formatQuantity(transaction.stockAfter, transaction.unit || product?.unit || 'kg')]
  ];

  autoTable(doc, {
    startY: currentY,
    head: [['Description', 'Amount']],
    body: transactionDetails,
    theme: 'striped',
    headStyles: {
      fillColor: darkGreen,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 10
    },
    styles: {
      fontSize: 10,
      cellPadding: 4
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 75, textColor: [60, 60, 60] },
      1: { 
        cellWidth: 115, 
        halign: 'right', 
        fontStyle: 'bold',
        textColor: [40, 40, 40],
        fontSize: 11
      }
    },
    didParseCell: (data) => {
      // Make Total Value extra prominent
      if (data.row.index === 2 && data.column.index === 1) {
        data.cell.styles.fontSize = 13;
        data.cell.styles.textColor = darkGreen;
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [240, 248, 255]; // Light background for emphasis
      }
      // Make all monetary values more readable
      if (data.column.index === 1 && data.row.index > 0) {
        data.cell.styles.fontSize = 11;
        if (data.row.index === 1 || data.row.index === 2) {
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
    margin: { left: 15, right: 15 }
  });

  currentY = doc.lastAutoTable.finalY + 8;

  // Notes Section - Compact
  if (transaction.notes) {
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...darkGreen);
    doc.text('Notes:', 15, currentY);

    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(60, 60, 60);
    const splitNotes = doc.splitTextToSize(transaction.notes, 180);
    doc.text(splitNotes, 15, currentY + 5);
    currentY += 5 + (splitNotes.length * 4);
  }

  // Footer - Compact at bottom
  const pageHeight = doc.internal.pageSize.height;
  const footerY = pageHeight - 15;
  
  doc.setDrawColor(...darkGreen);
  doc.setLineWidth(0.3);
  doc.line(15, footerY - 8, 195, footerY - 8);

  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.setFont(undefined, 'italic');
  doc.text('This is a computer-generated document. No signature required.', 105, footerY - 3, { align: 'center' });
  doc.text(`Generated: ${new Date().toLocaleString('en-PK')}`, 105, footerY + 2, { align: 'center' });

  // Save PDF
  const fileName = `Transaction_${typeText.replace(' ', '_')}_${transactionId}_${new Date().getTime()}.pdf`;
  console.log('Saving PDF as:', fileName);
  doc.save(fileName);
  console.log('PDF saved successfully');
  return true;
  } catch (error) {
    console.error('Error in generateTransactionPDF:', error);
    throw error;
  }
};

/**
 * Generate comprehensive inventory report PDF
 * @param {Array} products - Array of product data
 * @param {Object} summary - Summary statistics
 * @param {Object} companyInfo - Company information
 */
export const generateInventoryReportPDF = async (products, summary, companyInfo = {}) => {
  try {
    console.log('Generating inventory report PDF...');
    const doc = new jsPDF('landscape');
    
    // Load logo
    const logoData = await loadLogoForPDF();

  const company = {
    name: companyInfo.name || 'Haji Muhammad Rice Mills Inventory',
    ...companyInfo
  };

  // Colors - Matching HM Rice Mills Logo
  const darkGreen = [26, 95, 63]; // #1a5f3f - Main brand color
  const goldenBrown = [212, 165, 116]; // #d4a574 - Accent color
  const darkGreenDarker = [20, 70, 50];
  const white = [255, 255, 255];

  // Header - White background to match logo
  doc.setFillColor(...white);
  doc.rect(0, 0, 297, 40, 'F');
  
  // Top accent bar in dark green for branding
  doc.setFillColor(...darkGreen);
  doc.rect(0, 0, 297, 5, 'F');

  // Add logo if available - positioned nicely
  let textStartX = 15;
  if (logoData && logoData.data) {
    try {
      const logoSize = 30;
      const logoX = 15;
      const logoY = 5;
      
      // Add logo directly without background
      doc.addImage(logoData.data, logoData.type, logoX, logoY, logoSize, logoSize);
      textStartX = logoX + logoSize + 12;
      console.log('Logo added successfully to inventory report PDF');
    } catch (e) {
      console.error('Error adding logo to PDF:', e);
    }
  } else {
    console.log('Logo data not available for inventory report:', logoData);
  }

  // Company name in dark green (on white background)
  doc.setTextColor(...darkGreen);
  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  doc.text(company.name, textStartX, 20);

  doc.setTextColor(60, 60, 60);
  doc.setFontSize(12);
  doc.setFont(undefined, 'normal');
  doc.text('Inventory Stock Report', textStartX, 30);

  doc.setFontSize(9);
  const reportDate = new Date().toLocaleDateString('en-PK', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  doc.text(`Generated: ${reportDate}`, 282, 30, { align: 'right' });

  // Summary Boxes - styled with brand colors
  const summaryY = 48;
  doc.setFontSize(10);

  const summaryData = [
    { label: 'Total Products', value: summary.totalProducts || products.length },
    { label: 'Total Value', value: formatPKR(summary.totalValue || 0) },
    { label: 'Potential Value', value: formatPKR(summary.totalPotentialValue || 0) }
  ];

  let summaryX = 15;
  summaryData.forEach((item, index) => {
    // Box background in golden-brown with dark green border
    doc.setFillColor(...goldenBrown);
    doc.setDrawColor(...darkGreenDarker);
    doc.setLineWidth(0.5);
    doc.roundedRect(summaryX, summaryY, 85, 18, 3, 3, 'FD');

    doc.setTextColor(...white);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    doc.text(item.label, summaryX + 5, summaryY + 8);

    doc.setFont(undefined, 'bold');
    doc.setFontSize(11);
    doc.text(String(item.value), summaryX + 5, summaryY + 15);

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

  autoTable(doc, {
    startY: summaryY + 25,
    head: [['Product Name', 'SKU', 'Category', 'Stock', 'Cost Price', 'Sell Price', 'Stock Value', 'Status']],
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: darkGreen,
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

  // Footer - styled with brand colors
  const pageHeight = doc.internal.pageSize.height;
  doc.setDrawColor(...darkGreen);
  doc.setLineWidth(0.5);
  doc.line(15, pageHeight - 15, 282, pageHeight - 15);
  
  doc.setFontSize(8);
  doc.setTextColor(...darkGreen);
  doc.setFont(undefined, 'italic');
  doc.text(`Page 1 - Inventory Report - ${reportDate}`, 148.5, pageHeight - 8, { align: 'center' });

  // Save
  const fileName = `Inventory_Report_${new Date().getTime()}.pdf`;
  console.log('Saving inventory report as:', fileName);
  doc.save(fileName);
  console.log('Inventory report saved successfully');
  return true;
  } catch (error) {
    console.error('Error in generateInventoryReportPDF:', error);
    throw error;
  }
};
