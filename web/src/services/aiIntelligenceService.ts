import {
  AIExtractedOrderDraft,
  DocumentRecord,
  ExportOrder,
  FinancialAssessment,
  PaymentRecord
} from '../types/models';
import {
  evaluatePortfolioRisks,
  formatInrShort,
  isDocumentVerifiedOrApproved,
  isPaymentSettled,
  round2
} from '../domain/financialEngine';

export const SAMPLE_EXTRACTION_TEMPLATES: Array<{
  id: string;
  label: string;
  corridor: string;
  rawText: string;
}> = [
  {
    id: 'tpl_germany_turmeric',
    label: 'Germany CIF • Organic Turmeric (EUR 49,200)',
    corridor: 'Chennai → Hamburg (EUR)',
    rawText: `PURCHASE ORDER: PO-DE-2026-8841
EXPORTER: Tamil Nadu Global Exports Pvt. Ltd., Guindy Industrial Estate, Chennai 600032
EXPORTER CONTACT: exports@tnglobalexports.in | +91 44 2250 4890
BUYER: Hanseatic Spice & Botanicals GmbH
BUYER COUNTRY: Germany
BUYER ADDRESS: Am Sandtorkai 48, HafenCity, 20457 Hamburg, Germany
BUYER CONTACT: procurement@hanseatic-spice.de
PRODUCT: Organic Erode Turmeric Finger & Alleppey Curcumin Powder (HS 091030)
DESCRIPTION: EU Organic Certified High-Curcumin (5.2%) Erode Turmeric in 25kg Kraft Bags
QUANTITY: 12000
UNIT: KG
UNIT PRICE: 4.10
CURRENCY: EUR
INCOTERM: CIF
DESTINATION PORT: Port of Hamburg, Germany
ORDER DATE: 2026-04-12
SHIPMENT DATE: 2026-05-04
PAYMENT TERMS: 40% Advance, 60% CAD against Original B/L
ADVANCE PERCENTAGE: 40`
  },
  {
    id: 'tpl_usa_apparel',
    label: 'USA FOB • GOTS Cotton Apparel (USD 64,600)',
    corridor: 'Tirupur → Long Beach (USD)',
    rawText: `PURCHASE ORDER: PO-US-LB-9920
EXPORTER: Tamil Nadu Global Exports Pvt. Ltd., Tirupur Knitwear Cluster, TN
EXPORTER CONTACT: apparel@tnglobalexports.in
BUYER: Pacific Coast Sustainable Apparel Inc.
BUYER COUNTRY: United States
BUYER ADDRESS: 1450 OceanGate Blvd, Long Beach, CA 90802, USA
BUYER CONTACT: sourcing@pacificcoastapparel.com
PRODUCT: 100% GOTS Organic Combed Cotton Interlock Kids Rompers (HS 611120)
DESCRIPTION: 180 GSM Bio-Washed Organic Cotton Knitted Apparel, Azo-Free Reactive Dyed
QUANTITY: 9500
UNIT: PCS
UNIT PRICE: 6.80
CURRENCY: USD
INCOTERM: FOB
DESTINATION PORT: Port of Long Beach, USA
ORDER DATE: 2026-04-12
SHIPMENT DATE: 2026-05-10
PAYMENT TERMS: 50% Advance, 50% CAD
ADVANCE PERCENTAGE: 50`
  },
  {
    id: 'tpl_japan_valves',
    label: 'Japan CIF • CNC SS316L Valves (JPY 6,150,000)',
    corridor: 'Coimbatore → Yokohama (JPY)',
    rawText: `PURCHASE ORDER: PO-JP-OSA-4410
EXPORTER: Tamil Nadu Global Exports Pvt. Ltd., Coimbatore Precision CNC Cluster
EXPORTER CONTACT: engineering@tnglobalexports.in
BUYER: Kansai Industrial Fluid Controls Co., Ltd.
BUYER COUNTRY: Japan
BUYER ADDRESS: 2-3-18 Nakanoshima, Kita-ku, Osaka 530-0005, Japan
BUYER CONTACT: global-qa@kansaifluid.co.jp
PRODUCT: CNC-Machined SS316L High-Pressure Cryogenic Valve Bodies (HS 848190)
DESCRIPTION: JIS B2001 Stainless Steel 316L Precision Machined Valve Castings with 3.1 MTC
QUANTITY: 1500
UNIT: PCS
UNIT PRICE: 4100
CURRENCY: JPY
INCOTERM: CIF
DESTINATION PORT: Port of Yokohama, Japan
ORDER DATE: 2026-04-12
SHIPMENT DATE: 2026-05-18
PAYMENT TERMS: 30% Advance, 70% Sight L/C
ADVANCE PERCENTAGE: 30`
  }
];

function extractField(text: string, keys: string[]): string {
  for (const key of keys) {
    const regex = new RegExp(`^\\s*${key}\\s*[:=-]\\s*(.+)$`, 'im');
    const match = text.match(regex);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return '';
}

export async function extractPurchaseOrderFromText(
  rawText: string,
  optionalGeminiApiKey?: string
): Promise<AIExtractedOrderDraft> {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new Error('Please paste a Purchase Order or select a sample trade document first.');
  }

  // If user configured a live Gemini API key in browser settings, attempt structured Gemini extraction first
  if (optionalGeminiApiKey && optionalGeminiApiKey.trim().length > 15) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
          optionalGeminiApiKey.trim()
        )}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `Extract structured export purchase order fields from the following text and return ONLY valid JSON matching keys: exporterName, exporterContact, exporterAddress, buyerName, buyerCountry, buyerContact, buyerAddress, productName, productDescription, quantity (number), unit, unitPrice (number), currency, incoterm, destinationPort, orderDate, expectedShipmentDate, paymentTerms, advancePercentage (number), confidenceScore (number), missingFields (string[]), uncertainFields (string[]), conflictsDetected (string[]), aiExtractionNotes.\n\nTEXT:\n${trimmed}`
                  }
                ]
              }
            ],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: 'application/json'
            }
          })
        }
      );

      if (response.ok) {
        const data = await response.json();
        const jsonText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (jsonText) {
          const parsed = JSON.parse(jsonText);
          return {
            exporterName: parsed.exporterName || 'Tamil Nadu Global Exports Pvt. Ltd.',
            exporterContact: parsed.exporterContact || 'exports@tnglobalexports.in',
            exporterAddress:
              parsed.exporterAddress || 'Guindy Industrial Estate, Chennai, Tamil Nadu 600032, India',
            buyerName: parsed.buyerName || '',
            buyerCountry: parsed.buyerCountry || '',
            buyerContact: parsed.buyerContact || '',
            buyerAddress: parsed.buyerAddress || '',
            productName: parsed.productName || '',
            productDescription: parsed.productDescription || '',
            quantity: Number(parsed.quantity) || 0,
            unit: parsed.unit || 'KG',
            unitPrice: Number(parsed.unitPrice) || 0,
            currency: (parsed.currency || 'USD').toUpperCase(),
            incoterm: (parsed.incoterm || 'FOB').toUpperCase(),
            destinationPort: parsed.destinationPort || '',
            orderDate: parsed.orderDate || new Date().toISOString().slice(0, 10),
            expectedShipmentDate: parsed.expectedShipmentDate || '',
            paymentTerms: parsed.paymentTerms || '30% Advance, 70% CAD',
            advancePercentage: Number(parsed.advancePercentage) || 30,
            confidenceScore: Number(parsed.confidenceScore) || 95,
            missingFields: Array.isArray(parsed.missingFields) ? parsed.missingFields : [],
            uncertainFields: Array.isArray(parsed.uncertainFields) ? parsed.uncertainFields : [],
            conflictsDetected: Array.isArray(parsed.conflictsDetected)
              ? parsed.conflictsDetected
              : [],
            aiExtractionNotes:
              parsed.aiExtractionNotes ||
              'Extracted via live Gemini 2.5 Flash structured JSON schema.',
            extractionEngineLabel: 'Gemini 2.5 Flash Live API'
          };
        }
      }
    } catch {
      // Fall through cleanly to deterministic local parser
    }
  }

  // Deterministic Local Structured Parser (Zero-Cost Demo Mode)
  const exporterName =
    extractField(trimmed, ['EXPORTER', 'EXPORTER NAME', 'SELLER']) ||
    'Tamil Nadu Global Exports Pvt. Ltd.';
  const exporterContact =
    extractField(trimmed, ['EXPORTER CONTACT', 'SELLER CONTACT']) ||
    'exports@tnglobalexports.in | +91 44 2250 4890';
  const exporterAddress =
    extractField(trimmed, ['EXPORTER ADDRESS', 'SELLER ADDRESS']) ||
    'Guindy Industrial Estate, Chennai, Tamil Nadu 600032, India';

  const buyerName = extractField(trimmed, ['BUYER', 'BUYER NAME', 'CONSIGNEE', 'IMPORTER']);
  const buyerCountry = extractField(trimmed, ['BUYER COUNTRY', 'COUNTRY', 'DESTINATION COUNTRY']);
  const buyerContact = extractField(trimmed, ['BUYER CONTACT', 'CONSIGNEE CONTACT']);
  const buyerAddress = extractField(trimmed, ['BUYER ADDRESS', 'CONSIGNEE ADDRESS']);
  const productName = extractField(trimmed, ['PRODUCT', 'PRODUCT NAME', 'COMMODITY', 'ITEM']);
  const productDescription =
    extractField(trimmed, ['DESCRIPTION', 'PRODUCT DESCRIPTION', 'SPECIFICATION']) || productName;

  const qtyStr = extractField(trimmed, ['QUANTITY', 'QTY']).replace(/,/g, '');
  const quantity = parseFloat(qtyStr) || 1000;
  const unit = (extractField(trimmed, ['UNIT', 'UOM']) || 'KG').toUpperCase();

  const priceStr = extractField(trimmed, ['UNIT PRICE', 'PRICE', 'RATE']).replace(/[^0-9.]/g, '');
  const unitPrice = parseFloat(priceStr) || 10;

  const currency = (extractField(trimmed, ['CURRENCY', 'CURR']) || 'USD').toUpperCase();
  const incoterm = (extractField(trimmed, ['INCOTERM', 'INCOTERMS', 'TERMS OF DELIVERY']) || 'CIF').toUpperCase();
  const destinationPort = extractField(trimmed, ['DESTINATION PORT', 'PORT OF DISCHARGE', 'PORT']);
  const orderDate =
    extractField(trimmed, ['ORDER DATE', 'PO DATE', 'DATE']) ||
    new Date().toISOString().slice(0, 10);
  const expectedShipmentDate =
    extractField(trimmed, ['SHIPMENT DATE', 'EXPECTED SHIPMENT DATE', 'DELIVERY DATE']) ||
    '2026-05-15';
  const paymentTerms =
    extractField(trimmed, ['PAYMENT TERMS', 'SETTLEMENT TERMS']) || '30% Advance, 70% CAD';
  const advStr = extractField(trimmed, ['ADVANCE PERCENTAGE', 'ADVANCE %', 'ADVANCE']).replace(
    /[^0-9.]/g,
    ''
  );
  const advancePercentage = parseFloat(advStr) || 30;

  const missingFields: string[] = [];
  if (!buyerName) missingFields.push('buyerName');
  if (!buyerCountry) missingFields.push('buyerCountry');
  if (!productName) missingFields.push('productName');
  if (!destinationPort) missingFields.push('destinationPort');

  const uncertainFields: string[] = [];
  if (!priceStr) uncertainFields.push('unitPrice (defaulted to 10.0)');
  if (!qtyStr) uncertainFields.push('quantity (defaulted to 1000)');

  const confidenceScore = Math.max(
    68,
    98 - missingFields.length * 8 - uncertainFields.length * 5
  );

  return {
    exporterName,
    exporterContact,
    exporterAddress,
    buyerName: buyerName || 'Global Trade Partner GmbH',
    buyerCountry: buyerCountry || 'Germany',
    buyerContact: buyerContact || 'procurement@globaltradepartner.de',
    buyerAddress: buyerAddress || 'HafenCity Trade Center, Hamburg',
    productName: productName || 'Export Consignment (Extracted)',
    productDescription: productDescription || 'Standard export specification per buyer PO',
    quantity,
    unit,
    unitPrice,
    currency,
    incoterm,
    destinationPort: destinationPort || 'Port of Hamburg',
    orderDate,
    expectedShipmentDate,
    paymentTerms,
    advancePercentage,
    confidenceScore,
    missingFields,
    uncertainFields,
    conflictsDetected: [],
    aiExtractionNotes:
      'Parsed via NiryatFlow Deterministic PO Extraction Engine (Zero-Cost Demo Mode). Review fields below and click Confirm to create the Export Order.',
    extractionEngineLabel: 'Deterministic Local PO Parser (Demo Mode)'
  };
}

export function generateFinancialViabilityAdvisory(
  order: ExportOrder,
  assessment: FinancialAssessment
): {
  headline: string;
  riskRating: 'STRONG' | 'MODERATE' | 'CRITICAL';
  recommendations: string[];
  modeLabel: string;
} {
  const margin = assessment.profitMarginPercent;
  const totalCostInr =
    assessment.procurementCostInr +
    assessment.logisticsCostInr +
    assessment.packagingCostInr +
    assessment.otherCostsInr;
  const logisticsSharePct =
    assessment.convertedValueInr > 0
      ? round2((assessment.logisticsCostInr / assessment.convertedValueInr) * 100)
      : 0;
  const feeSharePct =
    assessment.convertedValueInr > 0
      ? round2((assessment.paymentFeeInr / assessment.convertedValueInr) * 100)
      : 0;

  const riskRating = margin >= 18 ? 'STRONG' : margin >= 10 ? 'MODERATE' : 'CRITICAL';

  const headline =
    riskRating === 'STRONG'
      ? `${order.orderNumber} achieves a healthy ${margin}% net export margin (₹${formatInrShort(
          assessment.estimatedProfitInr
        )} net profit on ₹${formatInrShort(assessment.convertedValueInr)} converted value).`
      : riskRating === 'MODERATE'
      ? `${order.orderNumber} delivers a moderate ${margin}% net margin (₹${formatInrShort(
          assessment.estimatedProfitInr
        )}). Sensitive to ${order.currency}/INR spot fluctuations below ${round2(
          assessment.exchangeRate * 0.97
        )}.`
      : `CRITICAL MARGIN ALERT: ${order.orderNumber} nets only ${margin}% (₹${formatInrShort(
          assessment.estimatedProfitInr
        )}). Immediate cost or FX renegotiation required before vessel booking.`;

  const recommendations: string[] = [
    `FX Protection: Lock 60% of ${order.currency} ${assessment.grossOrderValue.toLocaleString()} via an Authorized Dealer (AD Category-I) forward contract at ≥ ₹${assessment.exchangeRate} to protect ₹${formatInrShort(
      assessment.estimatedProfitInr
    )} net profit.`,
    `Payment Corridor Optimization: International payment fees consume ₹${formatInrShort(
      assessment.paymentFeeInr
    )} (${feeSharePct}% of gross value). Collect the ${assessment.advancePercentage}% advance (${
      order.currency
    } ${assessment.advanceAmount.toLocaleString()}) immediately and settle the ${round2(
      100 - assessment.advancePercentage
    )}% balance via e-FIRC wire/CAD to save ~1.8% in gateway fees.`,
    `Freight & Operating Structure: Total operating cost is ₹${formatInrShort(
      totalCostInr
    )}, with logistics at ₹${formatInrShort(
      assessment.logisticsCostInr
    )} (${logisticsSharePct}% of order value under ${order.incoterm} ${order.destinationPort}). Claim RoDTEP / Duty Drawback on the ICEGATE Shipping Bill to add ~1.9%–2.8% post-shipment incentive.`
  ];

  return {
    headline,
    riskRating,
    recommendations,
    modeLabel: 'Deterministic Export Finance Analyst (Grounded in Order Math)'
  };
}

export function answerWorkspaceBusinessQuery(params: {
  query: string;
  orders: ExportOrder[];
  assessments: FinancialAssessment[];
  documents: DocumentRecord[];
  payments: PaymentRecord[];
}): {
  answerTitle: string;
  answerBullets: string[];
  citedOrders: string[];
  engineLabel: string;
} {
  const q = params.query.trim().toLowerCase();
  const assessmentMap = new Map(params.assessments.map((a) => [a.exportOrderId, a]));
  const risks = evaluatePortfolioRisks(
    params.orders,
    params.assessments,
    params.documents,
    params.payments
  );

  if (q.includes('document') || q.includes('missing') || q.includes('reupload') || q.includes('compliance')) {
    const flagged = params.documents.filter(
      (d) => d.requirementLevel === 'REQUIRED' && !isDocumentVerifiedOrApproved(d.status)
    );
    const cited = Array.from(new Set(flagged.map((d) => d.exportOrderId)));
    return {
      answerTitle: `Found ${flagged.length} unverified mandatory export document(s) across ${cited.length} order(s):`,
      answerBullets:
        flagged.length === 0
          ? ['All mandatory export documents across the active portfolio are verified.']
          : flagged.map(
              (d) =>
                `${d.exportOrderId} — ${d.documentType}: Status [${d.status}] ${
                  d.reviewerNote ? `(${d.reviewerNote})` : ''
                }`
            ),
      citedOrders: cited,
      engineLabel: 'Portfolio Grounded Query Engine (Live Workspace Data)'
    };
  }

  if (q.includes('payment') || q.includes('unpaid') || q.includes('advance') || q.includes('receivable') || q.includes('capture')) {
    const pendingPayments = params.payments.filter((p) => !isPaymentSettled(p.paymentStatus));
    const ordersWithoutAdvance = params.orders.filter((o) => {
      const cap = params.payments
        .filter((p) => p.exportOrderId === o.id && isPaymentSettled(p.paymentStatus))
        .reduce((s, p) => s + p.amount, 0);
      return cap === 0;
    });
    const cited = Array.from(
      new Set([
        ...pendingPayments.map((p) => p.exportOrderId),
        ...ordersWithoutAdvance.map((o) => o.id)
      ])
    );

    const bullets: string[] = [];
    for (const p of pendingPayments) {
      bullets.push(
        `${p.exportOrderId}: ${p.paymentType} of ${p.currency} ${p.amount.toLocaleString()} is in [${
          p.paymentStatus
        }] (Ref: ${p.paypalOrderId}).`
      );
    }
    for (const o of ordersWithoutAdvance) {
      if (!pendingPayments.some((p) => p.exportOrderId === o.id)) {
        bullets.push(
          `${o.orderNumber} (${o.buyerName}, ${o.buyerCountry}): Zero captured receipts against ${
            o.currency
          } ${o.orderValue.toLocaleString()} (${o.advancePercentage}% advance expected).`
        );
      }
    }

    return {
      answerTitle: `Receivable & Settlement Exposure Analysis (${cited.length} order(s) require action):`,
      answerBullets:
        bullets.length > 0
          ? bullets
          : ['All export orders have settled their required advance/full payment milestones.'],
      citedOrders: cited,
      engineLabel: 'Portfolio Grounded Query Engine (Live Workspace Data)'
    };
  }

  if (q.includes('margin') || q.includes('profit') || q.includes('highest') || q.includes('financial')) {
    const ranked = [...params.orders]
      .map((o) => ({
        order: o,
        assessment: assessmentMap.get(o.id)
      }))
      .sort(
        (a, b) =>
          (b.assessment?.profitMarginPercent ?? 0) - (a.assessment?.profitMarginPercent ?? 0)
      );

    return {
      answerTitle: 'Portfolio Profitability & Margin Ranking (Deterministic INR Math):',
      answerBullets: ranked.map(({ order, assessment }) =>
        assessment
          ? `${order.orderNumber} (${order.buyerCountry} • ${order.currency} ${order.orderValue.toLocaleString()}): Net Margin ${
              assessment.profitMarginPercent
            }% • Est. Profit ₹${formatInrShort(
              assessment.estimatedProfitInr
            )} on Converted Value ₹${formatInrShort(assessment.convertedValueInr)} @ FX ${
              assessment.exchangeRate
            }`
          : `${order.orderNumber}: Financial assessment not yet saved.`
      ),
      citedOrders: ranked.map((r) => r.order.orderNumber),
      engineLabel: 'Portfolio Grounded Query Engine (Live Workspace Data)'
    };
  }

  // Default comprehensive executive summary grounded in workspace state
  const criticalRisks = risks.filter((r) => r.severity === 'CRITICAL');
  return {
    answerTitle: `Executive Portfolio Operations Brief (${params.orders.length} Orders, ${criticalRisks.length} Critical Action Items):`,
    answerBullets: [
      ...risks.slice(0, 5).map((r) => `[${r.severity} • ${r.category}] ${r.title} — ${r.evidence}`),
      `Tip: Ask about "missing documents", "unpaid advances", or "highest profit margin orders" for targeted drill-downs.`
    ],
    citedOrders: Array.from(new Set(risks.map((r) => r.orderNumber))),
    engineLabel: 'Portfolio Grounded Query Engine (Live Workspace Data)'
  };
}
