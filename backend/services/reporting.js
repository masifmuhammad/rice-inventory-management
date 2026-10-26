const { getPool } = require('../config/db');
const { ApiError } = require('../middleware/errorHandler');
const { isValidUuid, round2 } = require('../db/helpers');
const { dayStart, localDay, shiftDay } = require('../db/dates');
const { reportTimezone } = require('../config/env');

// A report is one database snapshot: pagination totals and exported detail must
// not describe different moments when another user records a repayment.
const snapshot = async (work) => {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
};

const calendar = (value, fallback) => {
  const day = value || fallback;
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new ApiError(400, 'Choose a valid report date.');
  dayStart(day);
  return day;
};
const positiveInteger = (value, fallback, max) => {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(String(value)) || Number(value) < 1 || Number(value) > max) throw new ApiError(400, 'Choose a valid report page and page size.');
  return Number(value);
};
const reportFilters = (query = {}) => {
  const startDate = calendar(query.startDate, shiftDay(localDay(), -29));
  const endDate = calendar(query.endDate, localDay());
  if (startDate > endDate) throw new ApiError(400, 'The start date must be on or before the end date.');
  const customer = String(query.customer || '').trim();
  if (customer.length > 120) throw new ApiError(400, 'Customer search must be 120 characters or fewer.');
  if (query.productId && !isValidUuid(query.productId)) throw new ApiError(400, 'Choose a valid product.');
  if (query.paymentType && !['cash', 'credit'].includes(query.paymentType)) throw new ApiError(400, 'Choose cash or credit sales.');
  if (query.status && !['paid', 'partial', 'unpaid'].includes(query.status)) throw new ApiError(400, 'Choose a valid payment status.');
  if (query.export && query.export !== 'all') throw new ApiError(400, 'Choose a valid export option.');
  return { startDate, endDate, customer, productId: query.productId || '', paymentType: query.paymentType || '', status: query.status || '',
    page: positiveInteger(query.page, 1, 100000000), limit: positiveInteger(query.limit, 50, 200), all: query.export === 'all' };
};

const salesRegister = (businessId, query = {}) => snapshot(async (client) => {
  const filters = reportFilters(query);
  const values = [businessId, dayStart(filters.startDate), dayStart(shiftDay(filters.endDate, 1))];
  const clauses = ["t.business_id=$1", "t.type='stock_out'", 't.created_at >= $2', 't.created_at < $3'];
  for (const [value, clause] of [[filters.customer, "COALESCE(t.customer,'') ILIKE"], [filters.productId, 't.product_id ='], [filters.paymentType, 't.payment_type =']]) {
    if (value) { values.push(clause.endsWith('ILIKE') ? `%${value.replace(/[\\%_]/g, '\\$&')}%` : value); clauses.push(`${clause} $${values.length}`); }
  }
  const statusClause = filters.status === 'paid' ? 'outstanding=0' : filters.status === 'partial' ? 'outstanding>0 AND received>0' : filters.status === 'unpaid' ? 'outstanding>0 AND received=0' : 'TRUE';
  const cte = `WITH sales AS (
    SELECT t.id, t.created_at AS date, t.reference, COALESCE(t.customer,'') AS customer,
      t.customer_id, p.name AS product_name, p.sku, t.product_id, t.quantity, t.unit,
      COALESCE(t.price,0) AS rate, ROUND(COALESCE(t.total_value,0),2) AS total, t.payment_type,
      t.due_date, COALESCE(u.name,'') AS recorded_by,
      CASE WHEN t.payment_type='credit' THEN COALESCE(t.amount_received,0) ELSE ROUND(COALESCE(t.total_value,0),2) END AS received_at_sale,
      COALESCE(paid.amount,0) AS repayments,
      CASE WHEN t.payment_type='credit' THEN GREATEST(COALESCE(c.amount,0)-COALESCE(paid.amount,0),0) ELSE 0 END AS outstanding,
      CASE WHEN t.payment_type='credit' THEN COALESCE(t.amount_received,0)+COALESCE(paid.amount,0) ELSE ROUND(COALESCE(t.total_value,0),2) END AS received,
      ROUND(COALESCE(t.total_value,0)-COALESCE(t.cost_price_snapshot,p.cost_price,0)*t.quantity,2) AS gross_profit
    FROM transactions t JOIN products p ON p.id=t.product_id AND p.business_id=t.business_id
    LEFT JOIN users u ON u.id=t.created_by
    LEFT JOIN credit_charges c ON c.transaction_id=t.id AND c.business_id=t.business_id AND c.voided_at IS NULL
    LEFT JOIN LATERAL (SELECT SUM(a.amount) AS amount FROM credit_allocations a
      JOIN credit_payments cp ON cp.id=a.payment_id AND cp.business_id=t.business_id AND cp.voided_at IS NULL
      WHERE a.charge_id=c.id) paid ON TRUE
    WHERE ${clauses.join(' AND ')}
  ), filtered AS (SELECT * FROM sales WHERE ${statusClause})`;
  const { rows: totals } = await client.query(`${cte} SELECT COUNT(*)::int AS count,
    COALESCE(SUM(total),0) AS total_sales, COALESCE(SUM(gross_profit),0) AS gross_profit,
    COALESCE(SUM(received_at_sale),0) AS received_at_sale, COALESCE(SUM(repayments),0) AS repayments,
    COALESCE(SUM(received),0) AS received, COALESCE(SUM(outstanding),0) AS outstanding FROM filtered`, values);
  const count = totals[0].count;
  const page = Math.min(filters.page, Math.max(1, Math.ceil(count / filters.limit)));
  const detailValues = [...values];
  let paging = '';
  if (!filters.all) { detailValues.push(filters.limit, (page - 1) * filters.limit); paging = `LIMIT $${detailValues.length - 1} OFFSET $${detailValues.length}`; }
  const { rows } = await client.query(`${cte} SELECT * FROM filtered ORDER BY date DESC,id DESC ${paging}`, detailValues);
  const { rows: products } = await client.query('SELECT id,name FROM products WHERE business_id=$1 ORDER BY name,id', [businessId]);
  return {
    generatedAt: new Date().toISOString(), timezone: reportTimezone, filters,
    products,
    balanceBasis: 'Current payment status, including repayments after the sales period.',
    summary: { count, totalSales: round2(totals[0].total_sales), grossProfit: round2(totals[0].gross_profit),
      receivedAtSale: round2(totals[0].received_at_sale), repayments: round2(totals[0].repayments), received: round2(totals[0].received), outstanding: round2(totals[0].outstanding) },
    pagination: { page, limit: filters.limit, total: count, pages: Math.max(1, Math.ceil(count / filters.limit)) },
    complete: filters.all || rows.length === count,
    rows: rows.map(r => ({ id: r.id, date: r.date, reference: r.reference || '', customer: r.customer, customerId: r.customer_id,
      productName: r.product_name, productId: r.product_id, sku: r.sku, quantity: Number(r.quantity), unit: r.unit, rate: Number(r.rate),
      total: round2(r.total), paymentType: r.payment_type, dueDate: r.due_date, receivedAtSale: round2(r.received_at_sale),
      repayments: round2(r.repayments), received: round2(r.received), outstanding: round2(r.outstanding), grossProfit: round2(r.gross_profit),
      status: Number(r.outstanding) === 0 ? 'paid' : Number(r.received) > 0 ? 'partial' : 'unpaid', recordedBy: r.recorded_by }))
  };
});

const dailyClosing = (businessId, query = {}) => snapshot(async (client) => {
  const date = calendar(query.date, localDay());
  const values = [businessId, dayStart(date), dayStart(shiftDay(date, 1))];
  const { rows: balances } = await client.query(`SELECT
    COALESCE(SUM(CASE WHEN occurred_at<$2 THEN CASE WHEN direction='in' THEN amount ELSE -amount END ELSE 0 END),0) AS opening,
    COALESCE(SUM(amount) FILTER (WHERE occurred_at >= $2 AND direction='in'),0) AS money_in,
    COALESCE(SUM(amount) FILTER (WHERE occurred_at >= $2 AND direction='out'),0) AS money_out
    FROM cash_entries WHERE business_id=$1 AND occurred_at<$3`, values);
  const { rows: sales } = await client.query(`SELECT COUNT(*)::int AS count,
    COALESCE(SUM(t.total_value),0) AS total,
    COALESCE(SUM(t.total_value) FILTER (WHERE t.payment_type='cash'),0) AS cash_sales,
    COALESCE(SUM(t.total_value) FILTER (WHERE t.payment_type='credit'),0) AS credit_sales,
    COALESCE(SUM(t.amount_received) FILTER (WHERE t.payment_type='credit'),0) AS deposits,
    COALESCE(SUM(ROUND(t.total_value-COALESCE(t.cost_price_snapshot,p.cost_price,0)*t.quantity,2)),0) AS gross_profit
    FROM transactions t JOIN products p ON p.id=t.product_id AND p.business_id=t.business_id
    WHERE t.business_id=$1 AND t.type='stock_out' AND t.created_at >=$2 AND t.created_at<$3`, values);
  const { rows: categories } = await client.query(`SELECT direction,category,source,COUNT(*)::int AS count,SUM(amount) AS amount
    FROM cash_entries WHERE business_id=$1 AND occurred_at >=$2 AND occurred_at<$3 GROUP BY direction,category,source ORDER BY direction,category`, values);
  const { rows: methods } = await client.query(`SELECT COALESCE(ce.payment_method,cp.method,'unclassified') AS method,
    COALESCE(SUM(CASE WHEN ce.direction='in' THEN ce.amount ELSE -ce.amount END) FILTER (WHERE ce.occurred_at<$2),0) AS opening,
    COALESCE(SUM(ce.amount) FILTER (WHERE ce.direction='in' AND ce.occurred_at >=$2),0) AS money_in,
    COALESCE(SUM(ce.amount) FILTER (WHERE ce.direction='out' AND ce.occurred_at >=$2),0) AS money_out
    FROM cash_entries ce LEFT JOIN credit_payments cp ON cp.id=ce.credit_payment_id AND cp.business_id=ce.business_id
    WHERE ce.business_id=$1 AND ce.occurred_at<$3 GROUP BY COALESCE(ce.payment_method,cp.method,'unclassified') ORDER BY method`, values);
  const { rows: collections } = await client.query(`SELECT COALESCE(SUM(a.amount),0) AS amount
    FROM credit_allocations a JOIN credit_payments p ON p.id=a.payment_id AND p.voided_at IS NULL
    JOIN credit_charges c ON c.id=a.charge_id AND c.business_id=p.business_id
    WHERE p.business_id=$1 AND p.payment_date=$2::date AND c.occurred_at<$3`, [businessId, date, dayStart(date)]);
  const openingBalance = round2(balances[0].opening), moneyIn = round2(balances[0].money_in), moneyOut = round2(balances[0].money_out);
  return { date, timezone: reportTimezone, generatedAt: new Date().toISOString(), openingBalance, moneyIn, moneyOut,
    closingBalance: round2(openingBalance + moneyIn - moneyOut),
    sales: { count: sales[0].count, total: round2(sales[0].total), cashSales: round2(sales[0].cash_sales), creditSales: round2(sales[0].credit_sales), deposits: round2(sales[0].deposits), grossProfit: round2(sales[0].gross_profit) },
    collectionsFromEarlierDebt: round2(collections[0].amount),
    categories: categories.map(r => ({ ...r, amount: round2(r.amount) })),
    methods: methods.map(r => ({ method: r.method, openingBalance: round2(r.opening), moneyIn: round2(r.money_in), moneyOut: round2(r.money_out), closingBalance: round2(r.opening+r.money_in-r.money_out) })),
    balanceBasis: 'Combined money ledger across all payment methods. This is not counted physical cash. Unclassified entries have no recorded payment method.',
    profitBasis: 'Gross profit excludes operating expenses. Money out can include supplier payments, loans and owner withdrawals.' };
});

module.exports = { salesRegister, dailyClosing, reportFilters };
