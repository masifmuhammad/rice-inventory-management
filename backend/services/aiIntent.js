const { chatCompletion } = require('./openrouter');

const normalize = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^\w\s\u0600-\u06FF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Fuzzy match a spoken/typed product name against the catalog. */
const matchProduct = (query, products) => {
  const needle = normalize(query);
  if (!needle) return null;

  let best = null;
  let bestScore = 0;

  for (const product of products) {
    const haystacks = [product.name, product.sku, product.category].filter(Boolean).map(normalize);

    for (const hay of haystacks) {
      if (hay === needle) return product;
      if (hay.includes(needle) || needle.includes(hay)) {
        const score = Math.min(needle.length, hay.length) / Math.max(needle.length, hay.length);
        if (score > bestScore) {
          bestScore = score;
          best = product;
        }
      }

      const needleParts = needle.split(' ').filter(Boolean);
      const matchedParts = needleParts.filter((part) => hay.includes(part)).length;
      const partScore = matchedParts / needleParts.length;
      if (partScore > bestScore && partScore >= 0.5) {
        bestScore = partScore;
        best = product;
      }
    }
  }

  return bestScore >= 0.4 ? best : null;
};

const INTENT_SCHEMA = {
  action: [
    'stock_check',
    'stock_out',
    'stock_in',
    'low_stock',
    'today_summary',
    'month_summary',
    'restock_advice',
    'navigate',
    'general_question',
    'unknown',
  ],
};

const parseIntentFromText = async (text, context) => {
  const productNames = context.products.slice(0, 80).map((p) => p.name).join(', ');

  const { content } = await chatCompletion(
    [
      {
        role: 'system',
        content:
          'You parse commands for a rice inventory app. Users speak Urdu, English, or mixed. ' +
          'Return ONLY valid JSON with keys: action, productQuery, quantity, unit, customer, supplier, destination, confidence. ' +
          `Allowed actions: ${INTENT_SCHEMA.action.join(', ')}. ` +
          'destination is a page: dashboard, products, transactions, cash-book, reports, settings. ' +
          'quantity must be a number or null. confidence is 0-1. ' +
          `Known products: ${productNames}`,
      },
      { role: 'user', content: text },
    ],
    { json: true }
  );

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = { action: 'unknown', confidence: 0 };
  }

  if (!INTENT_SCHEMA.action.includes(parsed.action)) {
    parsed.action = 'unknown';
  }

  return parsed;
};

const resolveIntent = (parsed, context) => {
  const result = {
    action: parsed.action || 'unknown',
    confidence: parsed.confidence ?? 0.5,
    product: null,
    quantity: parsed.quantity != null ? Number(parsed.quantity) : null,
    unit: parsed.unit || null,
    customer: parsed.customer || null,
    supplier: parsed.supplier || null,
    destination: parsed.destination || null,
    message: null,
    data: null,
    requiresConfirmation: false,
    proposedTransaction: null,
  };

  if (parsed.productQuery) {
    result.product = matchProduct(parsed.productQuery, context.products);
  }

  switch (result.action) {
    case 'stock_check': {
      if (!result.product) {
        result.message = 'Which product? Try saying the product name.';
        result.action = 'unknown';
        break;
      }
      result.data = {
        name: result.product.name,
        currentStock: result.product.currentStock,
        unit: result.product.unit,
        minStockLevel: result.product.minStockLevel,
      };
      result.message = `${result.product.name}: ${result.product.currentStock} ${result.product.unit} in stock.`;
      break;
    }

    case 'low_stock': {
      result.data = context.lowStock;
      result.message =
        context.lowStock.length === 0
          ? 'All products are above minimum stock levels.'
          : `${context.lowStock.length} product(s) are low on stock.`;
      break;
    }

    case 'today_summary': {
      result.data = context.today;
      result.message = `Today: ${context.today.salesCount} sale(s), Rs ${context.today.salesValue} revenue.`;
      break;
    }

    case 'month_summary': {
      result.data = context.last30Days;
      result.message = `Last 30 days: Rs ${context.last30Days.salesValue} in sales.`;
      break;
    }

    case 'restock_advice': {
      result.data = context.restockHints;
      result.message =
        context.restockHints.length === 0
          ? 'No urgent restock items right now.'
          : `${context.restockHints.length} product(s) may need reordering.`;
      break;
    }

    case 'stock_out':
    case 'stock_in': {
      if (!result.product) {
        result.message = 'Could not find that product. Check the name and try again.';
        result.action = 'unknown';
        break;
      }
      if (!result.quantity || result.quantity <= 0) {
        result.message = 'How much quantity? Say the amount with the product.';
        result.action = 'unknown';
        break;
      }
      result.requiresConfirmation = true;
      result.proposedTransaction = {
        type: result.action === 'stock_out' ? 'stock_out' : 'stock_in',
        product: result.product.id,
        productName: result.product.name,
        quantity: result.quantity,
        unit: result.product.unit,
        price: result.action === 'stock_out' ? result.product.sellingPrice : result.product.costPrice,
        customer: result.customer,
        supplier: result.supplier,
      };
      result.message = `Confirm ${result.action === 'stock_out' ? 'sale' : 'stock in'}: ${result.quantity} ${result.product.unit} of ${result.product.name}.`;
      break;
    }

    case 'navigate': {
      result.message = parsed.destination ? `Opening ${parsed.destination}.` : 'Where would you like to go?';
      break;
    }

    default:
      result.message = 'I can help with stock checks, sales, purchases, summaries, and restock advice.';
  }

  return result;
};

const answerQuestion = async (question, context) => {
  const contextJson = JSON.stringify(
    {
      today: context.today,
      last30Days: context.last30Days,
      lowStock: context.lowStock,
      restockHints: context.restockHints,
      cash: context.cash,
      productCount: context.productCount,
      topProducts: context.products.slice(0, 30).map((p) => ({
        name: p.name,
        stock: p.currentStock,
        unit: p.unit,
      })),
    },
    null,
    0
  );

  const { content } = await chatCompletion(
    [
      {
        role: 'system',
        content:
          'You are a helpful assistant for a rice mill inventory app. ' +
          'Answer using ONLY the JSON data provided — never invent stock levels or sales figures. ' +
          'Reply in English first, then the same answer in Urdu on a new paragraph prefixed with "اردو:". ' +
          'Keep answers concise and practical for shop staff.',
      },
      {
        role: 'user',
        content: `Business data:\n${contextJson}\n\nQuestion: ${question}`,
      },
    ],
    { temperature: 0.2 }
  );

  return content;
};

const generateBriefing = async (context, anomalies) => {
  // Prefer a local bilingual snapshot — empty/quiet days should not wait on OpenRouter.
  const local = buildLocalBriefing(context, anomalies);
  if (shouldSkipBriefingAi(context, anomalies)) {
    return local;
  }

  const slim = {
    today: context.today,
    last30Days: context.last30Days,
    lowStock: context.lowStock,
    restockHints: (context.restockHints || []).slice(0, 8),
    expiringSoon: context.expiringSoon,
    cash: context.cash,
    productCount: context.productCount,
    anomalies,
  };

  try {
    const { content } = await chatCompletion(
      [
        {
          role: 'system',
          content:
            'Write a short daily business briefing for a rice mill owner. ' +
            'Use ONLY the provided JSON data. Structure: 3-5 bullet points in English, then repeat as bullet points in Urdu under "اردو:". ' +
            'Mention low stock, today sales, restock priorities, and any anomalies. Be direct and actionable. Keep under 120 words.',
        },
        { role: 'user', content: JSON.stringify(slim) },
      ],
      { temperature: 0.3 }
    );
    return content || local;
  } catch {
    return local;
  }
};

/** True when AI would mostly restate "nothing happened". */
const shouldSkipBriefingAi = (context, anomalies = []) => {
  const today = context.today || {};
  const month = context.last30Days || {};
  const noToday = !(today.salesCount || 0) && !(today.stockInCount || 0);
  const noMonth = !(month.salesCount || 0);
  const noAlerts =
    !(context.lowStock || []).length &&
    !(context.expiringSoon || []).length &&
    !(anomalies || []).length;
  const noCash = !context.cash || (!(context.cash.cashIn || 0) && !(context.cash.cashOut || 0));
  return (context.productCount || 0) === 0 || (noToday && noMonth && noAlerts && noCash);
};

const buildLocalBriefing = (context, anomalies = []) => {
  const en = [];
  const ur = [];

  if (!(context.productCount || 0)) {
    return (
      'No products yet — add stock to unlock a useful daily briefing.\n\n' +
      'اردو: ابھی کوئی پروڈکٹ نہیں۔ روزانہ خلاصہ کے لیے پہلے اسٹاک شامل کریں۔'
    );
  }

  const today = context.today || {};
  const month = context.last30Days || {};

  if (!(today.salesCount || 0) && !(today.stockInCount || 0)) {
    en.push('Quiet day so far — no sales or stock-in recorded yet.');
    ur.push('آج ابھی کوئی فروخت یا اسٹاک ان درج نہیں ہوا۔');
  } else {
    if (today.salesCount) {
      en.push(
        `Today: ${today.salesCount} sale(s) · qty ${today.salesQuantity} · value ${today.salesValue}.`
      );
      ur.push(
        `آج: ${today.salesCount} فروخت · مقدار ${today.salesQuantity} · رقم ${today.salesValue}۔`
      );
    }
    if (today.stockInCount) {
      en.push(`Stock in today: ${today.stockInCount} entry(ies), qty ${today.stockInQuantity}.`);
      ur.push(`آج اسٹاک ان: ${today.stockInCount} اندراجات، مقدار ${today.stockInQuantity}۔`);
    }
  }

  if (month.salesCount) {
    en.push(`Last 30 days: ${month.salesCount} sale(s), value ${month.salesValue}.`);
    ur.push(`آخری ۳۰ دن: ${month.salesCount} فروخت، رقم ${month.salesValue}۔`);
  }

  const low = context.lowStock || [];
  if (low.length) {
    const names = low
      .slice(0, 3)
      .map((p) => p.name)
      .join(', ');
    en.push(`${low.length} product(s) at/below minimum${names ? ` (${names})` : ''}.`);
    ur.push(`${low.length} پروڈکٹ کم اسٹاک پر ہیں${names ? ` (${names})` : ''}۔`);
  } else {
    en.push('Stock levels look fine — nothing below minimum.');
    ur.push('اسٹاک ٹھیک ہے — کوئی چیز کم از کم حد سے نیچے نہیں۔');
  }

  if ((context.expiringSoon || []).length) {
    en.push(`${context.expiringSoon.length} item(s) expire within 30 days.`);
    ur.push(`${context.expiringSoon.length} اشیاء ۳۰ دن میں ختم ہو رہی ہیں۔`);
  }

  if (anomalies.length) {
    en.push(`${anomalies.length} unusual pattern(s) this week — see Alerts below.`);
    ur.push(`${anomalies.length} غیر معمولی اشارے — نیچے انتباہات دیکھیں۔`);
  } else {
    en.push('No unusual activity flagged this week.');
    ur.push('اس ہفتے کوئی غیر معمولی سرگرمی نہیں ملی۔');
  }

  if (context.cash) {
    en.push(
      `Cash (30d): in ${context.cash.cashIn}, out ${context.cash.cashOut}, net ${context.cash.netCash}.`
    );
    ur.push(
      `کیش (۳۰ دن): آمد ${context.cash.cashIn}، خرچ ${context.cash.cashOut}، خالص ${context.cash.netCash}۔`
    );
  }

  return `${en.map((line) => `• ${line}`).join('\n')}\n\nاردو:\n${ur.map((line) => `• ${line}`).join('\n')}`;
};

const explainRestock = async (hints) => {
  if (!hints.length) {
    return (
      'No urgent restock items.\n\nاردو: فی الحال فوری ری آرڈر کی ضرورت نہیں۔'
    );
  }

  const { content } = await chatCompletion(
    [
      {
        role: 'system',
        content:
          'Explain restock suggestions for a rice mill. English first (short bullets), then Urdu under "اردو:". Use only the JSON provided. Keep under 80 words.',
      },
      { role: 'user', content: JSON.stringify(hints.slice(0, 8)) },
    ],
    { temperature: 0.3 }
  );

  return content;
};

const explainAnomalies = async (anomalies) => {
  if (!anomalies.length) {
    return (
      'No unusual activity detected this week.\n\nاردو: اس ہفتے کوئی غیر معمولی سرگرمی نہیں ملی۔'
    );
  }

  const { content } = await chatCompletion(
    [
      {
        role: 'system',
        content:
          'Turn inventory anomaly alerts into plain English then Urdu (prefix "اردو:"). Be brief and non-alarmist. Keep under 80 words.',
      },
      { role: 'user', content: JSON.stringify(anomalies) },
    ],
    { temperature: 0.2 }
  );

  return content;
};

module.exports = {
  matchProduct,
  parseIntentFromText,
  resolveIntent,
  answerQuestion,
  generateBriefing,
  buildLocalBriefing,
  shouldSkipBriefingAi,
  explainRestock,
  explainAnomalies,
};
