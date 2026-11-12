import React, { useMemo, useState } from 'react';
import {
  AIExtractedOrderDraft,
  DocumentRecord,
  DocumentStatus,
  ExportOrder,
  FinancialAssessment,
  PaymentRecord,
  TimePeriodCode,
  WebNavTab,
  WorkspaceMode
} from './types/models';
import {
  STANDARD_DOCUMENT_TYPES,
  buildDigitalTwinState,
  calculateAssessment,
  calculateGrossOrderValue,
  calculatePeriodAnalytics,
   calculatePortfolioMetrics,
  defaultExchangeRateForCurrency,
  evaluatePortfolioRisks,
  formatInrShort,
  isDocumentVerifiedOrApproved,
  isPaymentSettled,
  round2
} from './domain/financialEngine';
import {
  SAMPLE_USER_ID,
  SAMPLE_WORKSPACE_PROFILE,
  WorkspaceDataset,
  loadProductionWorkspace,
  loadSampleWorkspace,
  resetSampleWorkspace,
  saveProductionWorkspace,
  saveSampleWorkspace
} from './data/sampleWorkspaceSeeder';
import {
  SIMULATED_PAYMENT_BANNER,
  createDemoPayment,
  transitionDemoPayment
} from './services/demoPaymentService';
import {
  SAMPLE_EXTRACTION_TEMPLATES,
  answerWorkspaceBusinessQuery,
  extractPurchaseOrderFromText,
  generateFinancialViabilityAdvisory
} from './services/aiIntelligenceService';

const TIME_PERIODS: TimePeriodCode[] = ['1D', '1W', '1M', '3M', '1Y', 'ALL'];

async function computeFileSha256Hex(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback deterministic hash if Web Crypto unavailable in non-secure context
  const bytes = new Uint8Array(arrayBuffer);
  let acc = 2166136261;
  for (let i = 0; i < bytes.length; i++) {
    acc ^= bytes[i];
    acc = Math.imul(acc, 16777619);
  }
  return Array.from({ length: 64 }, (_, idx) =>
    (((acc >>> 0) + idx * 13) % 16).toString(16)
  ).join('');
}

function statusChipVariant(status: string): 'positive' | 'warning' | 'critical' | 'info' | 'neutral' {
  const s = status.toUpperCase();
  if (
    s === 'COMPLETED' ||
    s === 'VERIFIED' ||
    s === 'APPROVED' ||
    s === 'OFFICIALLY_CERTIFIED' ||
    s === 'CAPTURED' ||
    s === 'DEMO_CAPTURED' ||
    s === 'DOCS_READY'
  ) {
    return 'positive';
  }
  if (
    s === 'PENDING_REVIEW' ||
    s === 'UNDER_REVIEW' ||
    s === 'UPLOADED' ||
    s === 'PENDING_APPROVAL' ||
    s === 'DEMO_PENDING' ||
    s === 'PAYMENT_INITIATED' ||
    s === 'FINANCIALLY_ASSESSED' ||
    s === 'VALIDATED'
  ) {
    return 'warning';
  }
  if (
    s === 'REJECTED' ||
    s === 'REUPLOAD_REQUIRED' ||
    s === 'FAILED' ||
    s === 'DEMO_FAILED' ||
    s === 'CANCELLED' ||
    s === 'DEMO_CANCELLED'
  ) {
    return 'critical';
  }
  return 'neutral';
}

export function App() {
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('SAMPLE_BUSINESS');
  const [sampleData, setSampleData] = useState<WorkspaceDataset>(() => loadSampleWorkspace());
  const [prodData, setProdData] = useState<WorkspaceDataset>(() => loadProductionWorkspace());
  const [prodUserEmail, setProdUserEmail] = useState<string>('exporter@msme-india.in');

  const activeData = workspaceMode === 'SAMPLE_BUSINESS' ? sampleData : prodData;
  const activeUserId =
    workspaceMode === 'SAMPLE_BUSINESS' ? SAMPLE_USER_ID : `prod_${prodUserEmail}`;

  const updateActiveWorkspace = (updater: (prev: WorkspaceDataset) => WorkspaceDataset) => {
    if (workspaceMode === 'SAMPLE_BUSINESS') {
      setSampleData((prev) => {
        const next = updater(prev);
        saveSampleWorkspace(next);
        return next;
      });
    } else {
      setProdData((prev) => {
        const next = updater(prev);
        saveProductionWorkspace(next);
        return next;
      });
    }
  };

  const [activeTab, setActiveTab] = useState<WebNavTab>('dashboard');
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriodCode>('ALL');
  const [selectedOrderId, setSelectedOrderId] = useState<string>(
    () => activeData.orders[0]?.id || 'ORDER-001'
  );
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [geminiApiKey, setGeminiApiKey] = useState<string>('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
  };

  const selectedOrder: ExportOrder | null = useMemo(() => {
    return (
      activeData.orders.find((o) => o.id === selectedOrderId) || activeData.orders[0] || null
    );
  }, [activeData.orders, selectedOrderId]);

  const selectedAssessment: FinancialAssessment | null = useMemo(() => {
    if (!selectedOrder) return null;
    return (
      activeData.assessments.find((a) => a.exportOrderId === selectedOrder.id) || null
    );
  }, [activeData.assessments, selectedOrder]);

  const selectedOrderDocuments: DocumentRecord[] = useMemo(() => {
    if (!selectedOrder) return [];
    return activeData.documents.filter((d) => d.exportOrderId === selectedOrder.id);
  }, [activeData.documents, selectedOrder]);

  const selectedOrderPayments: PaymentRecord[] = useMemo(() => {
    if (!selectedOrder) return [];
    return activeData.payments.filter((p) => p.exportOrderId === selectedOrder.id);
  }, [activeData.payments, selectedOrder]);

  const periodAnalytics = useMemo(() => {
    return calculatePeriodAnalytics(
      activeData.orders,
      activeData.assessments,
      activeData.documents,
      activeData.payments,
      selectedPeriod
    );
  }, [
    activeData.orders,
    activeData.assessments,
    activeData.documents,
    activeData.payments,
    selectedPeriod
  ]);

  const portfolioMetrics = useMemo(() => {
    return calculatePortfolioMetrics(
      activeData.orders,
      activeData.assessments,
      activeData.documents,
      activeData.payments
    );
  }, [activeData.orders, activeData.assessments, activeData.documents, activeData.payments]);

  const digitalTwinState = useMemo(() => {
    if (!selectedOrder) return null;
    return buildDigitalTwinState(
      selectedOrder,
      selectedAssessment,
      selectedOrderDocuments,
      selectedOrderPayments
    );
  }, [selectedOrder, selectedAssessment, selectedOrderDocuments, selectedOrderPayments]);

  const portfolioRisks = useMemo(() => {
    return evaluatePortfolioRisks(
      activeData.orders,
      activeData.assessments,
      activeData.documents,
      activeData.payments
    );
  }, [activeData.orders, activeData.assessments, activeData.documents, activeData.payments]);

  // --- Module 2 & 3 State: Order Creation & AI Order Extraction ---
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [rawPoText, setRawPoText] = useState(SAMPLE_EXTRACTION_TEMPLATES[0].rawText);
  const [extractedDraft, setExtractedDraft] = useState<AIExtractedOrderDraft | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);

  const [newOrderForm, setNewOrderForm] = useState({
    buyerName: '',
    buyerCountry: 'Germany',
    buyerContact: '',
    buyerAddress: '',
    productName: '',
    productDescription: '',
    quantity: '2500',
    unit: 'KG',
    unitPrice: '8.50',
    currency: 'EUR',
    incoterm: 'CIF',
    destinationPort: 'Port of Hamburg, Germany',
    expectedShipmentDate: '2026-05-20',
    paymentTerms: '40% Advance, 60% CAD',
    advancePercentage: '40',
    extractionSource: 'MANUAL'
  });

  const handleRunAiExtraction = async () => {
    setIsExtracting(true);
    try {
      const draft = await extractPurchaseOrderFromText(rawPoText, geminiApiKey);
      setExtractedDraft(draft);
      setNewOrderForm({
        buyerName: draft.buyerName,
        buyerCountry: draft.buyerCountry,
        buyerContact: draft.buyerContact,
        buyerAddress: draft.buyerAddress,
        productName: draft.productName,
        productDescription: draft.productDescription,
        quantity: String(draft.quantity),
        unit: draft.unit,
        unitPrice: String(draft.unitPrice),
        currency: draft.currency,
        incoterm: draft.incoterm,
        destinationPort: draft.destinationPort,
        expectedShipmentDate: draft.expectedShipmentDate,
        paymentTerms: draft.paymentTerms,
        advancePercentage: String(draft.advancePercentage),
        extractionSource: 'AI_EXTRACTED_CONFIRMED'
      });
      showToast(
        `Purchase Order extracted (${draft.confidenceScore}% confidence via ${draft.extractionEngineLabel}). Review & confirm below.`
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Extraction failed.');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleCreateOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrderForm.buyerName.trim() || !newOrderForm.productName.trim()) {
      showToast('Buyer Name and Product Name are required to create an export order.');
      return;
    }
    const qty = Math.max(1, parseFloat(newOrderForm.quantity) || 1);
    const price = Math.max(0.01, parseFloat(newOrderForm.unitPrice) || 1);
    const advPct = Math.min(100, Math.max(0, parseFloat(newOrderForm.advancePercentage) || 30));
    const currency = newOrderForm.currency.toUpperCase();
    const nextNum = activeData.orders.length + 1;
    const orderId = `ORDER-00${nextNum}`;
    const now = Date.now();

    const newOrder: ExportOrder = {
      id: orderId,
      userId: activeUserId,
      orderNumber: orderId,
      exporterName:
        workspaceMode === 'SAMPLE_BUSINESS'
          ? SAMPLE_WORKSPACE_PROFILE.companyName
          : 'Authenticated Indian Exporter Pvt. Ltd.',
      exporterContact: 'exports@tnglobalexports.in',
      exporterAddress: SAMPLE_WORKSPACE_PROFILE.headquarters,
      buyerName: newOrderForm.buyerName.trim(),
      buyerCountry: newOrderForm.buyerCountry.trim() || 'Germany',
      buyerContact: newOrderForm.buyerContact.trim(),
      buyerAddress: newOrderForm.buyerAddress.trim(),
      productName: newOrderForm.productName.trim(),
      productDescription: newOrderForm.productDescription.trim(),
      quantity: qty,
      unit: newOrderForm.unit.toUpperCase(),
      unitPrice: price,
      orderValue: calculateGrossOrderValue(qty, price),
      currency,
      incoterm: newOrderForm.incoterm.toUpperCase(),
      destinationPort: newOrderForm.destinationPort.trim() || 'Port of Hamburg',
      orderDate: new Date().toISOString().slice(0, 10),
      expectedShipmentDate: newOrderForm.expectedShipmentDate || '2026-05-20',
      paymentTerms: newOrderForm.paymentTerms,
      advancePercentage: advPct,
      orderStatus: 'VALIDATED',
      extractionSource: newOrderForm.extractionSource,
      createdAtEpochMs: now,
      updatedAtEpochMs: now
    };

    const fx = defaultExchangeRateForCurrency(currency);
    const convertedInr = round2(newOrder.orderValue * fx);
    const defaultAssessment = calculateAssessment({
      userId: activeUserId,
      exportOrderId: orderId,
      existingId: `FA-${orderId}`,
      quantity: qty,
      unitPrice: price,
      currency,
      exchangeRate: fx,
      advancePercentage: advPct,
      paymentFeePercentage: 3.9,
      paymentFixedFee: 0.35,
      procurementCostInr: round2(convertedInr * 0.64),
      logisticsCostInr: round2(convertedInr * 0.07),
      packagingCostInr: round2(convertedInr * 0.03),
      otherCostsInr: round2(convertedInr * 0.02),
      assumptionsNote: `Auto-initialized deterministic baseline for ${orderId} @ FX ${fx}`
    });

    const checklistDocs: DocumentRecord[] = STANDARD_DOCUMENT_TYPES.map((item, idx) => ({
      id: `DOC-${orderId}-${idx + 1}`,
      userId: activeUserId,
      exportOrderId: orderId,
      documentType: item.type,
      requirementLevel: item.level,
      status: 'MISSING',
      fileName: '',
      fileReference: '',
      reviewerNote: 'Initialized with export order checklist',
      fileMimeType: 'application/pdf',
      fileSizeBytes: 0,
      sha256Checksum: '',
      versionNumber: 1,
      reviewerRole: '',
      createdAtEpochMs: now,
      updatedAtEpochMs: now
    }));

    updateActiveWorkspace((prev) => ({
      orders: [newOrder, ...prev.orders],
      assessments: [defaultAssessment, ...prev.assessments],
      documents: [...checklistDocs, ...prev.documents],
      payments: prev.payments,
      activities: [
        {
          id: `ACT-CREATE-${now}`,
          userId: activeUserId,
          exportOrderId: orderId,
          eventType: 'ORDER_CREATED',
          title: `Export Order ${orderId} Created (${newOrder.extractionSource})`,
          description: `${newOrder.productName} for ${newOrder.buyerName} (${newOrder.currency} ${newOrder.orderValue.toLocaleString()})`,
          createdAtEpochMs: now,
          updatedAtEpochMs: now
        },
        ...prev.activities
      ]
    }));

    setSelectedOrderId(orderId);
    setExtractedDraft(null);
    showToast(`Created ${orderId} with 8-document checklist and initial financial baseline.`);
  };

  // --- Module 5 State: Financial Intelligence & What-If Scenario Simulator ---
  const [finInputs, setFinInputs] = useState({
    exchangeRate: 91.5,
    advancePercentage: 40,
    paymentFeePercentage: 3.9,
    paymentFixedFee: 0.35,
    procurementCostInr: 2890000,
    logisticsCostInr: 315000,
    packagingCostInr: 125000,
    otherCostsInr: 82000
  });

  const [whatIfDeltas, setWhatIfDeltas] = useState({
    fxShockPct: 0,
    freightDeltaPct: 0,
    rawMaterialDeltaPct: 0
  });
  const [showFormulaAudit, setShowFormulaAudit] = useState(false);

  // Sync financial editor when selectedOrder changes
  React.useEffect(() => {
    if (selectedAssessment) {
      setFinInputs({
        exchangeRate: selectedAssessment.exchangeRate,
        advancePercentage: selectedAssessment.advancePercentage,
        paymentFeePercentage: selectedAssessment.paymentFeePercentage,
        paymentFixedFee: selectedAssessment.paymentFixedFee,
        procurementCostInr: selectedAssessment.procurementCostInr,
        logisticsCostInr: selectedAssessment.logisticsCostInr,
        packagingCostInr: selectedAssessment.packagingCostInr,
        otherCostsInr: selectedAssessment.otherCostsInr
      });
    } else if (selectedOrder) {
      const fx = defaultExchangeRateForCurrency(selectedOrder.currency);
      const conv = round2(selectedOrder.orderValue * fx);
      setFinInputs({
        exchangeRate: fx,
        advancePercentage: selectedOrder.advancePercentage,
        paymentFeePercentage: 3.9,
        paymentFixedFee: 0.35,
        procurementCostInr: round2(conv * 0.65),
        logisticsCostInr: round2(conv * 0.07),
        packagingCostInr: round2(conv * 0.03),
        otherCostsInr: round2(conv * 0.02)
      });
    }
  }, [selectedOrder?.id]);

  const liveCalculatedAssessment = useMemo(() => {
    if (!selectedOrder) return null;
    return calculateAssessment({
      userId: activeUserId,
      exportOrderId: selectedOrder.id,
      existingId: selectedAssessment?.id || `FA-${selectedOrder.id}`,
      quantity: selectedOrder.quantity,
      unitPrice: selectedOrder.unitPrice,
      currency: selectedOrder.currency,
      exchangeRate: finInputs.exchangeRate,
      advancePercentage: finInputs.advancePercentage,
      paymentFeePercentage: finInputs.paymentFeePercentage,
      paymentFixedFee: finInputs.paymentFixedFee,
      procurementCostInr: finInputs.procurementCostInr,
      logisticsCostInr: finInputs.logisticsCostInr,
      packagingCostInr: finInputs.packagingCostInr,
      otherCostsInr: finInputs.otherCostsInr
    });
  }, [selectedOrder, selectedAssessment, finInputs, activeUserId]);

  const hypotheticalWhatIfAssessment = useMemo(() => {
    if (!selectedOrder || !liveCalculatedAssessment) return null;
    const shockedFx = round2(finInputs.exchangeRate * (1 + whatIfDeltas.fxShockPct / 100));
    const shockedLogistics = round2(
      finInputs.logisticsCostInr * (1 + whatIfDeltas.freightDeltaPct / 100)
    );
    const shockedProcurement = round2(
      finInputs.procurementCostInr * (1 + whatIfDeltas.rawMaterialDeltaPct / 100)
    );
    return calculateAssessment({
      userId: activeUserId,
      exportOrderId: selectedOrder.id,
      quantity: selectedOrder.quantity,
      unitPrice: selectedOrder.unitPrice,
      currency: selectedOrder.currency,
      exchangeRate: shockedFx,
      advancePercentage: finInputs.advancePercentage,
      paymentFeePercentage: finInputs.paymentFeePercentage,
      paymentFixedFee: finInputs.paymentFixedFee,
      procurementCostInr: shockedProcurement,
      logisticsCostInr: shockedLogistics,
      packagingCostInr: finInputs.packagingCostInr,
      otherCostsInr: finInputs.otherCostsInr,
      assumptionsNote: 'Hypothetical What-If Scenario (Isolated from saved database record)'
    });
  }, [selectedOrder, liveCalculatedAssessment, finInputs, whatIfDeltas, activeUserId]);

  const handleSaveFinancialAssessment = () => {
    if (!selectedOrder || !liveCalculatedAssessment) return;
    const now = Date.now();
    updateActiveWorkspace((prev) => ({
      ...prev,
      assessments: [
        liveCalculatedAssessment,
        ...prev.assessments.filter((a) => a.exportOrderId !== selectedOrder.id)
      ],
      activities: [
        {
          id: `ACT-FIN-${now}`,
          userId: activeUserId,
          exportOrderId: selectedOrder.id,
          eventType: 'FINANCIAL_ASSESSMENT',
          title: `Financial Assessment Saved for ${selectedOrder.orderNumber}`,
          description: `Converted ₹${formatInrShort(
            liveCalculatedAssessment.convertedValueInr
          )} • Net Profit ₹${formatInrShort(
            liveCalculatedAssessment.estimatedProfitInr
          )} (${liveCalculatedAssessment.profitMarginPercent}% margin @ FX ${
            liveCalculatedAssessment.exchangeRate
          })`,
          createdAtEpochMs: now,
          updatedAtEpochMs: now
        },
        ...prev.activities
      ]
    }));
    showToast(
      `Saved Financial Assessment for ${selectedOrder.orderNumber} (Net Margin: ${liveCalculatedAssessment.profitMarginPercent}%).`
    );
  };

  // --- Module 8 State: Payment Creation & Demo Lifecycle ---
  const [paymentAmountInput, setPaymentAmountInput] = useState<string>('');
  const [paymentTypeInput, setPaymentTypeInput] = useState<'ADVANCE' | 'BALANCE' | 'FULL'>('ADVANCE');

  React.useEffect(() => {
    if (selectedOrder) {
      const advAmount = round2(
        selectedOrder.orderValue * (selectedOrder.advancePercentage / 100)
      );
      setPaymentAmountInput(String(advAmount));
      setPaymentTypeInput('ADVANCE');
    }
  }, [selectedOrder?.id]);

  // --- Module 4 & 6 State: Natural-Language Query ---
  const [nlQueryInput, setNlQueryInput] = useState<string>(
    'Which export orders have missing or re-upload required documents and unpaid advances?'
  );
  const [nlQueryResult, setNlQueryResult] = useState(() =>
    answerWorkspaceBusinessQuery({
      query: 'Which export orders have missing or re-upload required documents and unpaid advances?',
      orders: activeData.orders,
      assessments: activeData.assessments,
      documents: activeData.documents,
      payments: activeData.payments
    })
  );

  React.useEffect(() => {
    setNlQueryResult(
      answerWorkspaceBusinessQuery({
        query: nlQueryInput,
        orders: activeData.orders,
        assessments: activeData.assessments,
        documents: activeData.documents,
        payments: activeData.payments
      })
    );
  }, [
    activeData.orders,
    activeData.assessments,
    activeData.documents,
    activeData.payments
  ]);

  // --- CSV Export Helper ---
  const handleDownloadPortfolioCsv = () => {
    const headers = [
      'OrderNumber',
      'BuyerName',
      'Country',
      'Product',
      'Currency',
      'OrderValue',
      'ConvertedINR',
      'EstimatedProfitINR',
      'ProfitMarginPct',
      'OrderStatus'
    ];
    const assessmentMap = new Map(activeData.assessments.map((a) => [a.exportOrderId, a]));
    const rows = activeData.orders.map((o) => {
      const a = assessmentMap.get(o.id);
      return [
        o.orderNumber,
        `"${o.buyerName.replace(/"/g, '""')}"`,
        `"${o.buyerCountry}"`,
        `"${o.productName.replace(/"/g, '""')}"`,
        o.currency,
        o.orderValue.toFixed(2),
        (a?.convertedValueInr ?? 0).toFixed(2),
        (a?.estimatedProfitInr ?? 0).toFixed(2),
        (a?.profitMarginPercent ?? 0).toFixed(2),
        o.orderStatus
      ].join(',');
    });
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `NiryatFlow_Portfolio_${workspaceMode}_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Exported portfolio ledger CSV to your browser downloads.');
  };

  return (
    <div className="app-shell">
      {/* Desktop Sidebar */}
      <aside className="sidebar">
        <div
          className="brand-header"
          onClick={() => {
            setWorkspaceMode('SAMPLE_BUSINESS');
            setActiveTab('dashboard');
            showToast('Opened Sample Business Workspace (Tamil Nadu Global Exports Pvt. Ltd.).');
          }}
          title="Click Emblem to Jump to Sample Business Workspace"
        >
          <div className="brand-emblem">NF</div>
          <div>
            <div className="brand-title">NiryatFlow AI</div>
            <div className="brand-subtitle">Export Intelligence SaaS</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-label">Core Trade Modules</div>
          <button
            className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <span className="nav-item-left">📊 Executive Dashboard</span>
            <span className="nav-badge">{selectedPeriod}</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'orders' ? 'active' : ''}`}
            onClick={() => setActiveTab('orders')}
          >
            <span className="nav-item-left">📦 Export Orders & AI PO</span>
            <span className="nav-badge">{activeData.orders.length}</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'financials' ? 'active' : ''}`}
            onClick={() => setActiveTab('financials')}
          >
            <span className="nav-item-left">💹 Financial & What-If</span>
            <span className="nav-badge">
              {selectedAssessment ? `${selectedAssessment.profitMarginPercent}%` : 'FX'}
            </span>
          </button>

          <button
            className={`nav-item ${activeTab === 'documents' ? 'active' : ''}`}
            onClick={() => setActiveTab('documents')}
          >
            <span className="nav-item-left">📑 Document Centre</span>
            <span className="nav-badge">
              {digitalTwinState
                ? `${digitalTwinState.verifiedRequiredDocs}/${digitalTwinState.totalRequiredDocs}`
                : 'SHA'}
            </span>
          </button>

          <button
            className={`nav-item ${activeTab === 'payments' ? 'active' : ''}`}
            onClick={() => setActiveTab('payments')}
          >
            <span className="nav-item-left">💳 Payment Hub (Demo)</span>
            <span className="nav-badge">{activeData.payments.length}</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'digital_twin' ? 'active' : ''}`}
            onClick={() => setActiveTab('digital_twin')}
          >
            <span className="nav-item-left">🧭 8-Stage Digital Twin</span>
            <span className="nav-badge">
              {digitalTwinState ? `${digitalTwinState.overallProgressPercent}%` : '8'}
            </span>
          </button>

          <div className="nav-section-label">Intelligence & Governance</div>
          <button
            className={`nav-item ${activeTab === 'ai_risk' ? 'active' : ''}`}
            onClick={() => setActiveTab('ai_risk')}
          >
            <span className="nav-item-left">🛡️ Trade Risk & AI Advisor</span>
            <span className="nav-badge">{portfolioRisks.length}</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'workspace' ? 'active' : ''}`}
            onClick={() => setActiveTab('workspace')}
          >
            <span className="nav-item-left">⚙️ Workspace & Reports</span>
            <span className="nav-badge">CSV</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Active Workspace Mode
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>
            {workspaceMode === 'SAMPLE_BUSINESS'
              ? 'Sample Business (Demo Mode)'
              : `Production (${prodUserEmail})`}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              className="btn btn-outline"
              style={{ fontSize: 11.5, padding: '6px 10px', width: '100%' }}
              onClick={() => {
                if (workspaceMode === 'SAMPLE_BUSINESS') {
                  const fresh = resetSampleWorkspace();
                  setSampleData(fresh);
                  setSelectedOrderId('ORDER-001');
                  showToast('Sample Business Workspace reset to initial 6-order dataset.');
                } else {
                  setWorkspaceMode('SAMPLE_BUSINESS');
                  showToast('Switched to Sample Business Workspace.');
                }
              }}
            >
              {workspaceMode === 'SAMPLE_BUSINESS'
                ? '↺ Reset Sample Data'
                : 'Switch to Sample Demo'}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Viewport */}
      <div className="main-viewport">
        {/* Sticky Top Command Bar */}
        <header className="top-command-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span className={`workspace-pill ${workspaceMode !== 'SAMPLE_BUSINESS' ? 'prod' : ''}`}>
              {workspaceMode === 'SAMPLE_BUSINESS'
                ? '🏛️ SAMPLE WORKSPACE • Tamil Nadu Global Exports Pvt. Ltd. (Zero-Cost Demo Mode)'
                : `🔐 ISOLATED PRODUCTION WORKSPACE • ${prodUserEmail}`}
            </span>
          </div>

          <div className="order-selector-bar">
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-secondary)' }}>
              Active Order Context:
            </label>
            <select
              className="select-control"
              value={selectedOrder?.id || ''}
              onChange={(e) => setSelectedOrderId(e.target.value)}
            >
              {activeData.orders.map((ord) => (
                <option key={ord.id} value={ord.id}>
                  {ord.orderNumber} — {ord.buyerCountry} ({ord.currency}{' '}
                  {ord.orderValue.toLocaleString()})
                </option>
              ))}
            </select>

            <button
              className="btn btn-outline"
              onClick={() => {
                const nextMode =
                  workspaceMode === 'SAMPLE_BUSINESS' ? 'AUTHENTICATED_USER' : 'SAMPLE_BUSINESS';
                setWorkspaceMode(nextMode);
                showToast(
                  nextMode === 'SAMPLE_BUSINESS'
                    ? 'Activated Sample Business Workspace (6 seeded multi-currency export orders).'
                    : 'Activated Isolated Production Workspace.'
                );
              }}
            >
              {workspaceMode === 'SAMPLE_BUSINESS'
                ? 'Switch to Production Workspace'
                : 'Explore Sample Business'}
            </button>
          </div>
        </header>

        <main className="page-container">
          {toastMessage && (
            <div className="toast-banner">
              <span>{toastMessage}</span>
              <button
                className="btn btn-outline"
                style={{ padding: '4px 10px', fontSize: 11 }}
                onClick={() => setToastMessage(null)}
              >
                Dismiss
              </button>
            </div>
          )}

          {/* MODULE 1: EXECUTIVE DASHBOARD */}
          {activeTab === 'dashboard' && (
            <>
              <div className="demo-banner">
                <div>
                  <div className="eyebrow" style={{ color: 'var(--gold-dark)' }}>
                    {workspaceMode === 'SAMPLE_BUSINESS'
                      ? 'Interactive MSME Export Intelligence Showcase'
                      : 'Production Export Portfolio'}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14.5 }}>
                    {workspaceMode === 'SAMPLE_BUSINESS'
                      ? SAMPLE_WORKSPACE_PROFILE.workspaceBannerText
                      : `Isolated Production Workspace for ${prodUserEmail} • Zero sample data contamination`}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {workspaceMode === 'SAMPLE_BUSINESS' && (
                    <button
                      className="btn btn-outline"
                      onClick={() => {
                        const fresh = resetSampleWorkspace();
                        setSampleData(fresh);
                        setSelectedOrderId('ORDER-001');
                        showToast('Sample Business Workspace restored to clean seeded state.');
                      }}
                    >
                      ↺ Reset Sample Data
                    </button>
                  )}
                  <button className="btn btn-primary" onClick={() => setActiveTab('orders')}>
                    + New Export Order / AI PO
                  </button>
                </div>
              </div>

              {/* Period Filter Bar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 12
                }}
              >
                <div>
                  <h1 className="section-title">Executive Trade & Cash-Flow Telemetry</h1>
                  <p style={{ fontSize: 13, color: 'var(--ink-secondary)' }}>
                    {periodAnalytics.periodSummaryText}
                  </p>
                </div>

                <div className="period-pill-group" role="tablist" aria-label="Time Period Filter">
                  {TIME_PERIODS.map((code) => (
                    <button
                      key={code}
                      className={`period-pill ${selectedPeriod === code ? 'active' : ''}`}
                      onClick={() => setSelectedPeriod(code)}
                    >
                      {code}
                    </button>
                  ))}
                </div>
              </div>

              {/* 4 KPI Cards */}
              <div className="grid-4">
                <div className="fintech-card hero">
                  <div className="eyebrow">Period Order Intake (INR)</div>
                  <div className="mono-metric" style={{ marginTop: 6 }}>
                    ₹{formatInrShort(periodAnalytics.metrics.totalOrderValueInr)}
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 12,
                      color: 'var(--ink-secondary)',
                      display: 'flex',
                      justifyContent: 'space-between'
                    }}
                  >
                    <span>{periodAnalytics.metrics.totalOrders} order(s) in window</span>
                    {periodAnalytics.orderValueGrowthPercent !== null && (
                      <span
                        className={`status-chip ${
                          periodAnalytics.orderValueGrowthPercent >= 0 ? 'positive' : 'critical'
                        }`}
                      >
                        {periodAnalytics.orderValueGrowthPercent >= 0 ? '+' : ''}
                        {periodAnalytics.orderValueGrowthPercent}% vs prior
                      </span>
                    )}
                  </div>
                </div>

                <div className="fintech-card">
                  <div className="eyebrow">Settled / Captured Receipts</div>
                  <div
                    className="mono-metric"
                    style={{ marginTop: 6, color: 'var(--emerald-primary)' }}
                  >
                    ₹{formatInrShort(periodAnalytics.metrics.capturedPaymentValueInr)}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-secondary)' }}>
                    Completion: {periodAnalytics.metrics.paymentCompletionRatePercent}% • Uncollected
                    ₹{formatInrShort(periodAnalytics.metrics.outstandingPaymentValueInr)}
                  </div>
                </div>

                <div className="fintech-card">
                  <div className="eyebrow">Estimated Net Export Profit</div>
                  <div
                    className="mono-metric"
                    style={{ marginTop: 6, color: 'var(--gold-dark)' }}
                  >
                    ₹{formatInrShort(periodAnalytics.metrics.totalEstimatedProfitInr)}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-secondary)' }}>
                    Avg Portfolio Net Margin:{' '}
                    <strong>{periodAnalytics.metrics.averageProfitMarginPercent}%</strong>
                  </div>
                </div>

                <div className="fintech-card">
                  <div className="eyebrow">Mandatory Document Readiness</div>
                  <div className="mono-metric" style={{ marginTop: 6 }}>
                    {periodAnalytics.metrics.documentReadinessRatePercent}%
                  </div>
                  <div style={{ marginTop: 10 }} className="progress-track">
                    <div
                      className="progress-fill"
                      style={{
                        width: `${Math.min(
                          100,
                          periodAnalytics.metrics.documentReadinessRatePercent
                        )}%`,
                        backgroundColor: 'var(--emerald-primary)'
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Dual-Series SVG Chart + Destination Corridor Breakdown */}
              <div className="grid-2">
                <div className="fintech-card">
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 14
                    }}
                  >
                    <div>
                      <div className="eyebrow">Real-Time Analytics Curve ({selectedPeriod})</div>
                      <div className="card-title">
                        Order Intake (Gold) vs. Captured Settlements (Emerald)
                      </div>
                    </div>
                    <span className="status-chip info">{periodAnalytics.periodLabel}</span>
                  </div>

                  <DualSeriesSvgChart
                    labels={periodAnalytics.chartBucketLabels}
                    intakeSeries={periodAnalytics.chartOrderIntakeInr}
                    capturedSeries={periodAnalytics.chartCapturedPaymentsInr}
                  />
                </div>

                <div className="fintech-card">
                  <div className="eyebrow">Global Trade Corridors</div>
                  <div className="card-title" style={{ marginBottom: 12 }}>
                    Export Value by Destination Country
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {Object.entries(portfolioMetrics.countryDistribution).map(
                      ([country, valInr]) => {
                        const sharePct =
                          portfolioMetrics.totalOrderValueInr > 0
                            ? round2((valInr / portfolioMetrics.totalOrderValueInr) * 100)
                            : 0;
                        return (
                          <div key={country}>
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                fontSize: 13,
                                fontWeight: 600,
                                marginBottom: 4
                              }}
                            >
                              <span>🌍 {country}</span>
                              <span className="mono-code">
                                ₹{formatInrShort(valInr)} ({sharePct}%)
                              </span>
                            </div>
                            <div className="progress-track">
                              <div
                                className="progress-fill"
                                style={{
                                  width: `${Math.min(100, sharePct)}%`,
                                  backgroundColor: 'var(--gold-primary)'
                                }}
                              />
                            </div>
                          </div>
                        );
                      }
                    )}
                  </div>
                </div>
              </div>

              {/* Filtered Orders Table in Period */}
              <div className="fintech-card">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 12,
                    flexWrap: 'wrap',
                    gap: 8
                  }}
                >
                  <div>
                    <div className="eyebrow">Active Consignment Ledger</div>
                    <div className="card-title">
                      Export Orders in Selected Window ({periodAnalytics.filteredOrders.length})
                    </div>
                  </div>
                  <button className="btn btn-outline" onClick={handleDownloadPortfolioCsv}>
                    ⬇ Export CSV Ledger
                  </button>
                </div>

                <div className="data-table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Order ID</th>
                        <th>Buyer & Destination</th>
                        <th>Commodity</th>
                        <th>Contract Value</th>
                        <th>INR Equivalent</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {periodAnalytics.filteredOrders.map((ord) => {
                        const assess = activeData.assessments.find(
                          (a) => a.exportOrderId === ord.id
                        );
                        const inrVal =
                          assess?.convertedValueInr ??
                          round2(ord.orderValue * defaultExchangeRateForCurrency(ord.currency));
                        return (
                          <tr key={ord.id}>
                            <td className="mono-code" style={{ fontWeight: 700 }}>
                              {ord.orderNumber}
                            </td>
                            <td>
                              <div style={{ fontWeight: 700 }}>{ord.buyerName}</div>
                              <div style={{ fontSize: 12, color: 'var(--ink-secondary)' }}>
                                {ord.destinationPort} ({ord.buyerCountry})
                              </div>
                            </td>
                            <td>
                              <div style={{ maxWidth: 260 }}>{ord.productName}</div>
                              <div
                                className="mono-code"
                                style={{ fontSize: 11, color: 'var(--ink-muted)' }}
                              >
                                {ord.quantity.toLocaleString()} {ord.unit} @ {ord.currency}{' '}
                                {ord.unitPrice} ({ord.incoterm})
                              </div>
                            </td>
                            <td className="mono-code" style={{ fontWeight: 700 }}>
                              {ord.currency} {ord.orderValue.toLocaleString()}
                            </td>
                            <td className="mono-code">
                              ₹{formatInrShort(inrVal)}
                              {assess && (
                                <div style={{ fontSize: 11, color: 'var(--emerald-primary)' }}>
                                  Margin: {assess.profitMarginPercent}%
                                </div>
                              )}
                            </td>
                            <td>
                              <span className={`status-chip ${statusChipVariant(ord.orderStatus)}`}>
                                {ord.orderStatus}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                  className="btn btn-outline"
                                  style={{ padding: '5px 10px', fontSize: 11.5 }}
                                  onClick={() => {
                                    setSelectedOrderId(ord.id);
                                    setActiveTab('digital_twin');
                                  }}
                                >
                                  Digital Twin →
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* MODULE 2 & 3: EXPORT ORDER MANAGEMENT & AI ORDER INTELLIGENCE */}
          {activeTab === 'orders' && (
            <>
              <div className="grid-2">
                {/* AI Order Extraction Card */}
                <div className="fintech-card hero">
                  <div className="eyebrow">Module 3 • AI Order Intelligence</div>
                  <div className="card-title" style={{ marginTop: 4, marginBottom: 8 }}>
                    Extract Structured Export Order from Buyer Purchase Order
                  </div>
                  <p style={{ fontSize: 12.5, color: 'var(--ink-secondary)', marginBottom: 12 }}>
                    Select a pre-loaded international buyer Purchase Order or paste raw PO text.
                    Supports deterministic local extraction in Zero-Cost Demo Mode or live Gemini
                    2.5 Flash extraction if an API key is provided.
                  </p>

                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                    {SAMPLE_EXTRACTION_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        className="btn btn-outline"
                        style={{ fontSize: 11.5, padding: '6px 10px' }}
                        onClick={() => setRawPoText(tpl.rawText)}
                      >
                        📄 {tpl.corridor}
                      </button>
                    ))}
                  </div>

                  <textarea
                    className="textarea-control"
                    rows={8}
                    style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 12 }}
                    value={rawPoText}
                    onChange={(e) => setRawPoText(e.target.value)}
                  />

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginTop: 12,
                      gap: 10,
                      flexWrap: 'wrap'
                    }}
                  >
                    <input
                      type="password"
                      className="input-control"
                      style={{ flex: 1, fontSize: 12 }}
                      placeholder="Optional: Gemini API Key (leave blank for Local Demo Parser)"
                      value={geminiApiKey}
                      onChange={(e) => setGeminiApiKey(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn-gold"
                      disabled={isExtracting}
                      onClick={handleRunAiExtraction}
                    >
                      {isExtracting ? 'Extracting PO...' : '✨ Extract Purchase Order'}
                    </button>
                  </div>

                  {extractedDraft && (
                    <div
                      style={{
                        marginTop: 14,
                        padding: 12,
                        borderRadius: 10,
                        backgroundColor: 'var(--emerald-soft)',
                        border: '1px solid rgba(30, 126, 90, 0.35)',
                        fontSize: 12.5
                      }}
                    >
                      <div style={{ fontWeight: 700, color: 'var(--emerald-primary)' }}>
                        ✓ Extracted with {extractedDraft.confidenceScore}% Confidence (
                        {extractedDraft.extractionEngineLabel})
                      </div>
                      <div style={{ marginTop: 4 }}>{extractedDraft.aiExtractionNotes}</div>
                      {extractedDraft.missingFields.length > 0 && (
                        <div style={{ color: 'var(--crimson-primary)', marginTop: 4 }}>
                          Missing fields: {extractedDraft.missingFields.join(', ')}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Human-in-the-loop Order Creation Form */}
                <div className="fintech-card">
                  <div className="eyebrow">Module 2 • Human-in-the-Loop Confirmation</div>
                  <div className="card-title" style={{ marginTop: 4, marginBottom: 12 }}>
                    Confirm & Register Export Order ({newOrderForm.extractionSource})
                  </div>

                  <form onSubmit={handleCreateOrder} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="form-grid">
                      <div className="form-field">
                        <label>Buyer Organization *</label>
                        <input
                          className="input-control"
                          required
                          value={newOrderForm.buyerName}
                          onChange={(e) =>
                            setNewOrderForm({ ...newOrderForm, buyerName: e.target.value })
                          }
                          placeholder="e.g. Hanseatic Spice GmbH"
                        />
                      </div>
                      <div className="form-field">
                        <label>Buyer Country *</label>
                        <input
                          className="input-control"
                          required
                          value={newOrderForm.buyerCountry}
                          onChange={(e) =>
                            setNewOrderForm({ ...newOrderForm, buyerCountry: e.target.value })
                          }
                        />
                      </div>
                      <div className="form-field">
                        <label>Product / HS Code *</label>
                        <input
                          className="input-control"
                          required
                          value={newOrderForm.productName}
                          onChange={(e) =>
                            setNewOrderForm({ ...newOrderForm, productName: e.target.value })
                          }
                          placeholder="e.g. Organic Turmeric (HS 091030)"
                        />
                      </div>
                      <div className="form-field">
                        <label>Destination Port *</label>
                        <input
                          className="input-control"
                          required
                          value={newOrderForm.destinationPort}
                          onChange={(e) =>
                            setNewOrderForm({ ...newOrderForm, destinationPort: e.target.value })
                          }
                        />
                      </div>
                      <div className="form-field">
                        <label>Quantity</label>
                        <input
                          type="number"
                          step="any"
                          className="input-control"
                          value={newOrderForm.quantity}
                          onChange={(e) =>
                            setNewOrderForm({ ...newOrderForm, quantity: e.target.value })
                          }
                        />
                      </div>
                      <div className="form-field">
                        <label>Unit Price</label>
                        <input
                          type="number"
                          step="any"
                          className="input-control"
                          value={newOrderForm.unitPrice}
                          onChange={(e) =>
                            setNewOrderForm({ ...newOrderForm, unitPrice: e.target.value })
                          }
                        />
                      </div>
                      <div className="form-field">
                        <label>Currency</label>
                        <select
                          className="select-control"
                          value={newOrderForm.currency}
                          onChange={(e) =>
                            setNewOrderForm({ ...newOrderForm, currency: e.target.value })
                          }
                        >
                          <option value="EUR">EUR</option>
                          <option value="USD">USD</option>
                          <option value="GBP">GBP</option>
                          <option value="AED">AED</option>
                          <option value="JPY">JPY</option>
                        </select>
                      </div>
                      <div className="form-field">
                        <label>Incoterm & Advance %</label>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <select
                            className="select-control"
                            value={newOrderForm.incoterm}
                            onChange={(e) =>
                              setNewOrderForm({ ...newOrderForm, incoterm: e.target.value })
                            }
                          >
                            <option value="CIF">CIF</option>
                            <option value="FOB">FOB</option>
                            <option value="CFR">CFR</option>
                            <option value="DAP">DAP</option>
                          </select>
                          <input
                            type="number"
                            className="input-control"
                            style={{ width: 90 }}
                            value={newOrderForm.advancePercentage}
                            onChange={(e) =>
                              setNewOrderForm({
                                ...newOrderForm,
                                advancePercentage: e.target.value
                              })
                            }
                          />
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        paddingTop: 8,
                        borderTop: '1px solid var(--border-warm)'
                      }}
                    >
                      <div className="mono-code">
                        Computed Gross Value:{' '}
                        <strong>
                          {newOrderForm.currency}{' '}
                          {calculateGrossOrderValue(
                            parseFloat(newOrderForm.quantity) || 0,
                            parseFloat(newOrderForm.unitPrice) || 0
                          ).toLocaleString()}
                        </strong>
                      </div>
                      <button type="submit" className="btn btn-primary">
                        ✓ Confirm & Save Export Order
                      </button>
                    </div>
                  </form>
                </div>
              </div>

              {/* Search & Manage Existing Orders */}
              <div className="fintech-card">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 14,
                    flexWrap: 'wrap',
                    gap: 10
                  }}
                >
                  <div className="card-title">
                    Portfolio Export Orders ({activeData.orders.length})
                  </div>
                  <input
                    className="input-control"
                    style={{ minWidth: 260 }}
                    placeholder="Search order ID, buyer, country, product..."
                    value={orderSearchQuery}
                    onChange={(e) => setOrderSearchQuery(e.target.value)}
                  />
                </div>

                <div className="data-table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Order</th>
                        <th>Buyer / Country</th>
                        <th>Product</th>
                        <th>Gross Value</th>
                        <th>Source</th>
                        <th>Lifecycle Status</th>
                        <th>Manage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeData.orders
                        .filter((o) => {
                          if (!orderSearchQuery.trim()) return true;
                          const q = orderSearchQuery.toLowerCase();
                          return (
                            o.orderNumber.toLowerCase().includes(q) ||
                            o.buyerName.toLowerCase().includes(q) ||
                            o.buyerCountry.toLowerCase().includes(q) ||
                            o.productName.toLowerCase().includes(q)
                          );
                        })
                        .map((ord) => (
                          <tr key={ord.id}>
                            <td className="mono-code" style={{ fontWeight: 700 }}>
                              {ord.orderNumber}
                            </td>
                            <td>
                              <div style={{ fontWeight: 700 }}>{ord.buyerName}</div>
                              <div style={{ fontSize: 12, color: 'var(--ink-secondary)' }}>
                                {ord.buyerCountry} • {ord.destinationPort}
                              </div>
                            </td>
                            <td>{ord.productName}</td>
                            <td className="mono-code">
                              {ord.currency} {ord.orderValue.toLocaleString()}
                            </td>
                            <td>
                              <span className="status-chip info">{ord.extractionSource}</span>
                            </td>
                            <td>
                              <select
                                className="select-control"
                                style={{ padding: '4px 8px', fontSize: 12 }}
                                value={ord.orderStatus}
                                onChange={(e) => {
                                  const nextStatus = e.target.value as ExportOrder['orderStatus'];
                                  updateActiveWorkspace((prev) => ({
                                    ...prev,
                                    orders: prev.orders.map((item) =>
                                      item.id === ord.id
                                        ? {
                                            ...item,
                                            orderStatus: nextStatus,
                                            updatedAtEpochMs: Date.now()
                                          }
                                        : item
                                    )
                                  }));
                                  showToast(`Updated ${ord.orderNumber} status to ${nextStatus}.`);
                                }}
                              >
                                <option value="CREATED">CREATED</option>
                                <option value="VALIDATED">VALIDATED</option>
                                <option value="FINANCIALLY_ASSESSED">FINANCIALLY_ASSESSED</option>
                                <option value="DOCS_READY">DOCS_READY</option>
                                <option value="PAYMENT_INITIATED">PAYMENT_INITIATED</option>
                                <option value="COMPLETED">COMPLETED</option>
                                <option value="CANCELLED">CANCELLED</option>
                              </select>
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                  className="btn btn-outline"
                                  style={{ padding: '5px 9px', fontSize: 11.5 }}
                                  onClick={() => {
                                    setSelectedOrderId(ord.id);
                                    setActiveTab('financials');
                                  }}
                                >
                                  Financials
                                </button>
                                <button
                                  className="btn btn-danger"
                                  style={{ padding: '5px 9px', fontSize: 11.5 }}
                                  onClick={() => {
                                    updateActiveWorkspace((prev) => ({
                                      ...prev,
                                      orders: prev.orders.filter((i) => i.id !== ord.id),
                                      assessments: prev.assessments.filter(
                                        (a) => a.exportOrderId !== ord.id
                                      ),
                                      documents: prev.documents.filter(
                                        (d) => d.exportOrderId !== ord.id
                                      ),
                                      payments: prev.payments.filter(
                                        (p) => p.exportOrderId !== ord.id
                                      )
                                    }));
                                    showToast(`Deleted order ${ord.orderNumber}.`);
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* MODULE 5: FINANCIAL INTELLIGENCE & ISOLATED WHAT-IF SIMULATOR */}
          {activeTab === 'financials' && selectedOrder && liveCalculatedAssessment && (
            <>
              <div className="grid-4">
                <div className="fintech-card hero">
                  <div className="eyebrow">Converted Gross Value (INR)</div>
                  <div className="mono-metric" style={{ marginTop: 6 }}>
                    ₹{formatInrShort(liveCalculatedAssessment.convertedValueInr)}
                  </div>
                  <div className="mono-code" style={{ marginTop: 6, color: 'var(--ink-secondary)' }}>
                    {selectedOrder.currency} {liveCalculatedAssessment.grossOrderValue.toLocaleString()} @
                    FX {liveCalculatedAssessment.exchangeRate}
                  </div>
                </div>

                <div className="fintech-card">
                  <div className="eyebrow">Estimated Net Revenue</div>
                  <div className="mono-metric" style={{ marginTop: 6 }}>
                    ₹{formatInrShort(liveCalculatedAssessment.estimatedNetRevenueInr)}
                  </div>
                  <div className="mono-code" style={{ marginTop: 6, color: 'var(--crimson-primary)' }}>
                    Gateway Fee: -₹{formatInrShort(liveCalculatedAssessment.paymentFeeInr)} (
                    {liveCalculatedAssessment.paymentFeePercentage}%)
                  </div>
                </div>

                <div className="fintech-card">
                  <div className="eyebrow">Estimated Net Profit</div>
                  <div
                    className="mono-metric"
                    style={{
                      marginTop: 6,
                      color:
                        liveCalculatedAssessment.estimatedProfitInr >= 0
                          ? 'var(--emerald-primary)'
                          : 'var(--crimson-primary)'
                    }}
                  >
                    ₹{formatInrShort(liveCalculatedAssessment.estimatedProfitInr)}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, color: 'var(--ink-secondary)' }}>
                    Net Margin: <strong>{liveCalculatedAssessment.profitMarginPercent}%</strong>
                  </div>
                </div>

                <div className="fintech-card">
                  <div className="eyebrow">Advance vs. Balance Split</div>
                  <div className="mono-metric" style={{ marginTop: 6, fontSize: 21 }}>
                    {selectedOrder.currency} {liveCalculatedAssessment.advanceAmount.toLocaleString()}
                  </div>
                  <div className="mono-code" style={{ marginTop: 6, color: 'var(--ink-secondary)' }}>
                    {liveCalculatedAssessment.advancePercentage}% Advance • Balance{' '}
                    {selectedOrder.currency}{' '}
                    {liveCalculatedAssessment.outstandingAmount.toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="grid-2">
                {/* Deterministic Cost & FX Editor */}
                <div className="fintech-card">
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 14
                    }}
                  >
                    <div>
                      <div className="eyebrow">Deterministic Calculation Engine</div>
                      <div className="card-title">
                        FX, Advance & Cost Structure ({selectedOrder.orderNumber})
                      </div>
                    </div>
                    <button className="btn btn-primary" onClick={handleSaveFinancialAssessment}>
                      💾 Save Assessment
                    </button>
                  </div>

                  <div className="form-grid">
                    <div className="form-field">
                      <label>Exchange Rate ({selectedOrder.currency}/INR)</label>
                      <input
                        type="number"
                        step="0.01"
                        className="input-control"
                        value={finInputs.exchangeRate}
                        onChange={(e) =>
                          setFinInputs({
                            ...finInputs,
                            exchangeRate: parseFloat(e.target.value) || 1
                          })
                        }
                      />
                    </div>
                    <div className="form-field">
                      <label>Advance Percentage (%)</label>
                      <input
                        type="number"
                        step="1"
                        className="input-control"
                        value={finInputs.advancePercentage}
                        onChange={(e) =>
                          setFinInputs({
                            ...finInputs,
                            advancePercentage: parseFloat(e.target.value) || 0
                          })
                        }
                      />
                    </div>
                    <div className="form-field">
                      <label>Gateway Fee (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        className="input-control"
                        value={finInputs.paymentFeePercentage}
                        onChange={(e) =>
                          setFinInputs({
                            ...finInputs,
                            paymentFeePercentage: parseFloat(e.target.value) || 0
                          })
                        }
                      />
                    </div>
                    <div className="form-field">
                      <label>Fixed Fee ({selectedOrder.currency})</label>
                      <input
                        type="number"
                        step="0.05"
                        className="input-control"
                        value={finInputs.paymentFixedFee}
                        onChange={(e) =>
                          setFinInputs({
                            ...finInputs,
                            paymentFixedFee: parseFloat(e.target.value) || 0
                          })
                        }
                      />
                    </div>
                    <div className="form-field">
                      <label>Procurement / Manufacturing (INR)</label>
                      <input
                        type="number"
                        className="input-control"
                        value={finInputs.procurementCostInr}
                        onChange={(e) =>
                          setFinInputs({
                            ...finInputs,
                            procurementCostInr: parseFloat(e.target.value) || 0
                          })
                        }
                      />
                    </div>
                    <div className="form-field">
                      <label>Logistics & Ocean Freight (INR)</label>
                      <input
                        type="number"
                        className="input-control"
                        value={finInputs.logisticsCostInr}
                        onChange={(e) =>
                          setFinInputs({
                            ...finInputs,
                            logisticsCostInr: parseFloat(e.target.value) || 0
                          })
                        }
                      />
                    </div>
                    <div className="form-field">
                      <label>Export Packaging & Crating (INR)</label>
                      <input
                        type="number"
                        className="input-control"
                        value={finInputs.packagingCostInr}
                        onChange={(e) =>
                          setFinInputs({
                            ...finInputs,
                            packagingCostInr: parseFloat(e.target.value) || 0
                          })
                        }
                      />
                    </div>
                    <div className="form-field">
                      <label>Lab Assay, ECGC & Customs (INR)</label>
                      <input
                        type="number"
                        className="input-control"
                        value={finInputs.otherCostsInr}
                        onChange={(e) =>
                          setFinInputs({
                            ...finInputs,
                            otherCostsInr: parseFloat(e.target.value) || 0
                          })
                        }
                      />
                    </div>
                  </div>

                  {/* Expandable Deterministic Formula Audit */}
                  <div style={{ marginTop: 16 }}>
                    <button
                      type="button"
                      className="btn btn-outline"
                      style={{ width: '100%', justifyContent: 'space-between' }}
                      onClick={() => setShowFormulaAudit(!showFormulaAudit)}
                    >
                      <span>📐 Deterministic Formula Audit Trail</span>
                      <span>{showFormulaAudit ? '▲ Hide' : '▼ Inspect Math'}</span>
                    </button>
                    {showFormulaAudit && (
                      <div
                        className="mono-code"
                        style={{
                          marginTop: 10,
                          padding: 14,
                          borderRadius: 10,
                          backgroundColor: 'var(--bg-ivory)',
                          border: '1px solid var(--border-warm)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6
                        }}
                      >
                        <div>
                          1. Gross Order Value = {selectedOrder.quantity} × {selectedOrder.unitPrice}{' '}
                          = {selectedOrder.currency}{' '}
                          {liveCalculatedAssessment.grossOrderValue.toLocaleString()}
                        </div>
                        <div>
                          2. Converted Value (INR) = {liveCalculatedAssessment.grossOrderValue} ×{' '}
                          {liveCalculatedAssessment.exchangeRate} = ₹
                          {liveCalculatedAssessment.convertedValueInr.toLocaleString()}
                        </div>
                        <div>
                          3. Gateway Fee (INR) = ((Gross ×{' '}
                          {liveCalculatedAssessment.paymentFeePercentage}%) +{' '}
                          {liveCalculatedAssessment.paymentFixedFee}) ×{' '}
                          {liveCalculatedAssessment.exchangeRate} = ₹
                          {liveCalculatedAssessment.paymentFeeInr.toLocaleString()}
                        </div>
                        <div>
                          4. Net Revenue (INR) = Converted - Fee = ₹
                          {liveCalculatedAssessment.estimatedNetRevenueInr.toLocaleString()}
                        </div>
                        <div>
                          5. Net Profit (INR) = Net Revenue - Operating Costs = ₹
                          {liveCalculatedAssessment.estimatedProfitInr.toLocaleString()} (
                          {liveCalculatedAssessment.profitMarginPercent}%)
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Isolated Hypothetical What-If Scenario Simulator */}
                <div className="fintech-card hero">
                  <div className="eyebrow">Isolated Stress-Test Sandbox</div>
                  <div className="card-title" style={{ marginTop: 4, marginBottom: 6 }}>
                    Hypothetical What-If Scenario Simulator
                  </div>
                  <p style={{ fontSize: 12.5, color: 'var(--ink-secondary)', marginBottom: 14 }}>
                    Simulate currency shocks, Red Sea freight surges, or raw material inflation
                    without overwriting your saved financial record.
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="form-field">
                      <label>
                        FX Spot Shock ({whatIfDeltas.fxShockPct >= 0 ? '+' : ''}
                        {whatIfDeltas.fxShockPct}% → FX {hypotheticalWhatIfAssessment?.exchangeRate})
                      </label>
                      <input
                        type="range"
                        min={-15}
                        max={15}
                        step={1}
                        value={whatIfDeltas.fxShockPct}
                        onChange={(e) =>
                          setWhatIfDeltas({
                            ...whatIfDeltas,
                            fxShockPct: Number(e.target.value)
                          })
                        }
                      />
                    </div>

                    <div className="form-field">
                      <label>
                        Ocean Freight Surge ({whatIfDeltas.freightDeltaPct >= 0 ? '+' : ''}
                        {whatIfDeltas.freightDeltaPct}%)
                      </label>
                      <input
                        type="range"
                        min={-30}
                        max={60}
                        step={5}
                        value={whatIfDeltas.freightDeltaPct}
                        onChange={(e) =>
                          setWhatIfDeltas({
                            ...whatIfDeltas,
                            freightDeltaPct: Number(e.target.value)
                          })
                        }
                      />
                    </div>

                    <div className="form-field">
                      <label>
                        Procurement / Raw Material Cost Delta (
                        {whatIfDeltas.rawMaterialDeltaPct >= 0 ? '+' : ''}
                        {whatIfDeltas.rawMaterialDeltaPct}%)
                      </label>
                      <input
                        type="range"
                        min={-20}
                        max={30}
                        step={2}
                        value={whatIfDeltas.rawMaterialDeltaPct}
                        onChange={(e) =>
                          setWhatIfDeltas({
                            ...whatIfDeltas,
                            rawMaterialDeltaPct: Number(e.target.value)
                          })
                        }
                      />
                    </div>
                  </div>

                  {hypotheticalWhatIfAssessment && (
                    <div
                      style={{
                        marginTop: 16,
                        padding: 14,
                        borderRadius: 12,
                        backgroundColor: 'var(--surface-white)',
                        border: '1px solid var(--border-warm)'
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <div>
                          <div className="eyebrow">Simulated Net Profit</div>
                          <div className="mono-metric" style={{ fontSize: 22 }}>
                            ₹{formatInrShort(hypotheticalWhatIfAssessment.estimatedProfitInr)}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div className="eyebrow">Simulated Margin</div>
                          <div
                            className="mono-metric"
                            style={{
                              fontSize: 22,
                              color:
                                hypotheticalWhatIfAssessment.profitMarginPercent >= 12
                                  ? 'var(--emerald-primary)'
                                  : 'var(--crimson-primary)'
                            }}
                          >
                            {hypotheticalWhatIfAssessment.profitMarginPercent}%
                          </div>
                        </div>
                      </div>
                      <div
                        style={{
                          marginTop: 10,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <span className="mono-code" style={{ color: 'var(--ink-secondary)' }}>
                          Profit Delta:{' '}
                          {hypotheticalWhatIfAssessment.estimatedProfitInr -
                            liveCalculatedAssessment.estimatedProfitInr >=
                          0
                            ? '+'
                            : ''}
                          ₹
                          {formatInrShort(
                            hypotheticalWhatIfAssessment.estimatedProfitInr -
                              liveCalculatedAssessment.estimatedProfitInr
                          )}
                        </span>
                        <button
                          type="button"
                          className="btn btn-outline"
                          style={{ padding: '4px 10px', fontSize: 11.5 }}
                          onClick={() =>
                            setWhatIfDeltas({
                              fxShockPct: 0,
                              freightDeltaPct: 0,
                              rawMaterialDeltaPct: 0
                            })
                          }
                        >
                          Reset Sliders
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Contextual Viability Advisory */}
                  {(() => {
                    const advisory = generateFinancialViabilityAdvisory(
                      selectedOrder,
                      liveCalculatedAssessment
                    );
                    return (
                      <div style={{ marginTop: 16 }}>
                        <div className="eyebrow" style={{ marginBottom: 4 }}>
                          {advisory.modeLabel}
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>
                          {advisory.headline}
                        </div>
                        <ul style={{ paddingLeft: 18, fontSize: 12.5, color: 'var(--ink-secondary)' }}>
                          {advisory.recommendations.map((rec, i) => (
                            <li key={i} style={{ marginBottom: 4 }}>
                              {rec}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </>
          )}

          {/* MODULE 9: DOCUMENT CENTRE WITH WEB CRYPTO SHA-256 & VERSION TRACKING */}
          {activeTab === 'documents' && selectedOrder && (
            <>
              <div className="simulated-payment-banner">
                <span>
                  🔒 LOCALLY STORED IN BROWSER — NOT UPLOADED TO CLOUD OR OFFICIALLY CERTIFIED
                </span>
                <span>Web Crypto API SHA-256 Integrity • Max 15 MB PDF/Image Validation</span>
              </div>

              <div className="fintech-card">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 14,
                    flexWrap: 'wrap',
                    gap: 10
                  }}
                >
                  <div>
                    <div className="eyebrow">
                      Pre-Shipment Compliance Checklist • {selectedOrder.orderNumber}
                    </div>
                    <div className="card-title">
                      Mandatory Readiness: {digitalTwinState?.verifiedRequiredDocs} /{' '}
                      {digitalTwinState?.totalRequiredDocs} Verified (
                      {digitalTwinState?.documentReadinessPercent}%)
                    </div>
                  </div>
                </div>

                <div className="data-table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Document Type</th>
                        <th>Requirement</th>
                        <th>Status</th>
                        <th>File & Version</th>
                        <th>SHA-256 Checksum</th>
                        <th>Attach / Verify</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedOrderDocuments.map((doc) => (
                        <tr key={doc.id}>
                          <td>
                            <div style={{ fontWeight: 700 }}>{doc.documentType}</div>
                            {doc.reviewerNote && (
                              <div style={{ fontSize: 11.5, color: 'var(--ink-secondary)' }}>
                                {doc.reviewerNote}
                              </div>
                            )}
                          </td>
                          <td>
                            <span
                              className={`status-chip ${
                                doc.requirementLevel === 'REQUIRED' ? 'warning' : 'neutral'
                              }`}
                            >
                              {doc.requirementLevel}
                            </span>
                          </td>
                          <td>
                            <select
                              className="select-control"
                              style={{ padding: '4px 8px', fontSize: 11.5 }}
                              value={doc.status}
                              onChange={(e) => {
                                const nextStatus = e.target.value as DocumentStatus;
                                updateActiveWorkspace((prev) => ({
                                  ...prev,
                                  documents: prev.documents.map((d) =>
                                    d.id === doc.id
                                      ? {
                                          ...d,
                                          status: nextStatus,
                                          updatedAtEpochMs: Date.now()
                                        }
                                      : d
                                  )
                                }));
                                showToast(`Updated ${doc.documentType} status to ${nextStatus}.`);
                              }}
                            >
                              <option value="MISSING">MISSING</option>
                              <option value="UPLOADED">UPLOADED</option>
                              <option value="PENDING_REVIEW">PENDING_REVIEW</option>
                              <option value="UNDER_REVIEW">UNDER_REVIEW</option>
                              <option value="VERIFIED">VERIFIED</option>
                              <option value="APPROVED">APPROVED</option>
                              <option value="REUPLOAD_REQUIRED">REUPLOAD_REQUIRED</option>
                              <option value="REJECTED">REJECTED</option>
                            </select>
                          </td>
                          <td className="mono-code">
                            {doc.fileName ? (
                              <>
                                <div>
                                  {doc.fileName} <strong>(v{doc.versionNumber})</strong>
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
                                  {(doc.fileSizeBytes / 1024).toFixed(1)} KB • {doc.fileMimeType}
                                </div>
                              </>
                            ) : (
                              <span style={{ color: 'var(--ink-muted)' }}>No file attached</span>
                            )}
                          </td>
                          <td className="mono-code" style={{ fontSize: 11 }}>
                            {doc.sha256Checksum ? (
                              <span title={doc.sha256Checksum}>
                                {doc.sha256Checksum.slice(0, 16)}…
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              <label
                                className="btn btn-outline"
                                style={{ padding: '5px 10px', fontSize: 11.5, cursor: 'pointer' }}
                              >
                                📎 Attach File
                                <input
                                  type="file"
                                  accept=".pdf,image/*"
                                  style={{ display: 'none' }}
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    if (file.size > 15 * 1024 * 1024) {
                                      showToast(
                                        `Rejected ${file.name}: File exceeds 15 MB compliance limit.`
                                      );
                                      return;
                                    }
                                    const sha = await computeFileSha256Hex(file);
                                    const nextVer = doc.fileName ? doc.versionNumber + 1 : 1;
                                    const now = Date.now();
                                    updateActiveWorkspace((prev) => ({
                                      ...prev,
                                      documents: prev.documents.map((d) =>
                                        d.id === doc.id
                                          ? {
                                              ...d,
                                              fileName: file.name,
                                              fileMimeType: file.type || 'application/pdf',
                                              fileSizeBytes: file.size,
                                              sha256Checksum: sha,
                                              versionNumber: nextVer,
                                              status: 'VERIFIED',
                                              reviewerNote: `LOCALLY STORED IN BROWSER • SHA-256 verified (${sha.slice(
                                                0,
                                                12
                                              )}...)`,
                                              updatedAtEpochMs: now
                                            }
                                          : d
                                      ),
                                      activities: [
                                        {
                                          id: `ACT-DOC-${now}`,
                                          userId: activeUserId,
                                          exportOrderId: selectedOrder.id,
                                          eventType: 'DOCUMENT_ATTACHED',
                                          title: `Attached ${doc.documentType} (v${nextVer})`,
                                          description: `${file.name} • SHA-256: ${sha.slice(
                                            0,
                                            16
                                          )}...`,
                                          createdAtEpochMs: now,
                                          updatedAtEpochMs: now
                                        },
                                        ...prev.activities
                                      ]
                                    }));
                                    showToast(
                                      `Attached ${file.name} (v${nextVer}) with SHA-256 ${sha.slice(
                                        0,
                                        12
                                      )}...`
                                    );
                                  }}
                                />
                              </label>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* MODULE 8: PAYMENT MANAGEMENT & ZERO-COST DEMO MODE */}
          {activeTab === 'payments' && selectedOrder && (
            <>
              <div className="simulated-payment-banner">
                <span>⚠️ {SIMULATED_PAYMENT_BANNER}</span>
                <span>Zero-Cost Demo Mode • Idempotent Reference & State Transition Engine</span>
              </div>

              <div className="grid-2">
                {/* Create Simulated Payment */}
                <div className="fintech-card hero">
                  <div className="eyebrow">DemoPaymentService • Order Settlement</div>
                  <div className="card-title" style={{ marginTop: 4, marginBottom: 10 }}>
                    Create Simulated Payment Order for {selectedOrder.orderNumber}
                  </div>
                  <p style={{ fontSize: 12.5, color: 'var(--ink-secondary)', marginBottom: 14 }}>
                    Contract Value: <strong>{selectedOrder.currency}</strong>{' '}
                    <strong>{selectedOrder.orderValue.toLocaleString()}</strong> • Expected Advance (
                    {selectedOrder.advancePercentage}%):{' '}
                    <strong>
                      {selectedOrder.currency}{' '}
                      {round2(
                        selectedOrder.orderValue * (selectedOrder.advancePercentage / 100)
                      ).toLocaleString()}
                    </strong>
                  </p>

                  <div className="form-grid" style={{ marginBottom: 14 }}>
                    <div className="form-field">
                      <label>Payment Milestone Type</label>
                      <select
                        className="select-control"
                        value={paymentTypeInput}
                        onChange={(e) => {
                          const t = e.target.value as 'ADVANCE' | 'BALANCE' | 'FULL';
                          setPaymentTypeInput(t);
                          if (t === 'ADVANCE') {
                            setPaymentAmountInput(
                              String(
                                round2(
                                  selectedOrder.orderValue *
                                    (selectedOrder.advancePercentage / 100)
                                )
                              )
                            );
                          } else if (t === 'BALANCE') {
                            setPaymentAmountInput(
                              String(
                                round2(
                                  selectedOrder.orderValue *
                                    ((100 - selectedOrder.advancePercentage) / 100)
                                )
                              )
                            );
                          } else {
                            setPaymentAmountInput(String(selectedOrder.orderValue));
                          }
                        }}
                      >
                        <option value="ADVANCE">ADVANCE ({selectedOrder.advancePercentage}%)</option>
                        <option value="BALANCE">
                          BALANCE ({100 - selectedOrder.advancePercentage}%)
                        </option>
                        <option value="FULL">FULL (100%)</option>
                      </select>
                    </div>

                    <div className="form-field">
                      <label>Amount ({selectedOrder.currency})</label>
                      <input
                        type="number"
                        step="0.01"
                        className="input-control"
                        value={paymentAmountInput}
                        onChange={(e) => setPaymentAmountInput(e.target.value)}
                      />
                    </div>
                  </div>

                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      const amt = parseFloat(paymentAmountInput) || 0;
                      const res = createDemoPayment({
                        order: selectedOrder,
                        amount: amt,
                        currency: selectedOrder.currency,
                        paymentType: paymentTypeInput,
                        existingPayments: activeData.payments,
                        userId: activeUserId
                      });
                      if (!res.isDuplicatePrevented) {
                        updateActiveWorkspace((prev) => ({
                          ...prev,
                          payments: [res.payment, ...prev.payments],
                          activities: [res.activity, ...prev.activities]
                        }));
                      }
                      showToast(res.message);
                    }}
                  >
                    + Initialize Simulated Payment (DEMO_PENDING)
                  </button>
                </div>

                {/* Order Payment Summary */}
                <div className="fintech-card">
                  <div className="eyebrow">Settlement Telemetry</div>
                  <div className="card-title" style={{ marginTop: 4, marginBottom: 12 }}>
                    Receivable Position for {selectedOrder.orderNumber}
                  </div>
                  <div className="mono-metric" style={{ color: 'var(--emerald-primary)' }}>
                    {selectedOrder.currency}{' '}
                    {(digitalTwinState?.capturedPaymentTotal ?? 0).toLocaleString()}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink-secondary)', marginTop: 6 }}>
                    Settled of {selectedOrder.currency} {selectedOrder.orderValue.toLocaleString()}{' '}
                    total contract value
                  </div>
                </div>
              </div>

              {/* Transaction History & Lifecycle Controls */}
              <div className="fintech-card">
                <div className="card-title" style={{ marginBottom: 12 }}>
                  Payment Transaction Ledger ({activeData.payments.length} Total Across Portfolio)
                </div>

                <div className="data-table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Order</th>
                        <th>Type & Amount</th>
                        <th>Demo Order / Capture Ref</th>
                        <th>Status</th>
                        <th>Verification Audit</th>
                        <th>Simulate Outcome</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeData.payments.map((pay) => (
                        <tr key={pay.id}>
                          <td className="mono-code" style={{ fontWeight: 700 }}>
                            {pay.exportOrderId}
                          </td>
                          <td className="mono-code">
                            <strong>
                              {pay.currency} {pay.amount.toLocaleString()}
                            </strong>{' '}
                            ({pay.paymentType})
                          </td>
                          <td className="mono-code" style={{ fontSize: 11.5 }}>
                            <div>Order: {pay.paypalOrderId}</div>
                            {pay.paypalCaptureId && (
                              <div style={{ color: 'var(--emerald-primary)' }}>
                                Capture: {pay.paypalCaptureId}
                              </div>
                            )}
                          </td>
                          <td>
                            <span className={`status-chip ${statusChipVariant(pay.paymentStatus)}`}>
                              {pay.paymentStatus}
                            </span>
                          </td>
                          <td style={{ fontSize: 12, maxWidth: 280 }}>{pay.verificationDetails}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              <button
                                className="btn btn-emerald"
                                style={{ padding: '5px 9px', fontSize: 11 }}
                                onClick={() => {
                                  const res = transitionDemoPayment({
                                    payment: pay,
                                    orderNumber: pay.exportOrderId,
                                    outcome: 'DEMO_CAPTURED',
                                    userId: activeUserId
                                  });
                                  updateActiveWorkspace((prev) => ({
                                    ...prev,
                                    payments: prev.payments.map((p) =>
                                      p.id === pay.id ? res.updatedPayment : p
                                    ),
                                    activities: [res.activity, ...prev.activities]
                                  }));
                                  showToast(res.message);
                                }}
                              >
                                ✓ Capture
                              </button>
                              <button
                                className="btn btn-outline"
                                style={{ padding: '5px 9px', fontSize: 11 }}
                                onClick={() => {
                                  const res = transitionDemoPayment({
                                    payment: pay,
                                    orderNumber: pay.exportOrderId,
                                    outcome: 'DEMO_FAILED',
                                    userId: activeUserId
                                  });
                                  updateActiveWorkspace((prev) => ({
                                    ...prev,
                                    payments: prev.payments.map((p) =>
                                      p.id === pay.id ? res.updatedPayment : p
                                    ),
                                    activities: [res.activity, ...prev.activities]
                                  }));
                                  showToast(res.message);
                                }}
                              >
                                ✕ Fail
                              </button>
                              <button
                                className="btn btn-danger"
                                style={{ padding: '5px 9px', fontSize: 11 }}
                                onClick={() => {
                                  const res = transitionDemoPayment({
                                    payment: pay,
                                    orderNumber: pay.exportOrderId,
                                    outcome: 'DEMO_CANCELLED',
                                    userId: activeUserId
                                  });
                                  updateActiveWorkspace((prev) => ({
                                    ...prev,
                                    payments: prev.payments.map((p) =>
                                      p.id === pay.id ? res.updatedPayment : p
                                    ),
                                    activities: [res.activity, ...prev.activities]
                                  }));
                                  showToast(res.message);
                                }}
                              >
                                ⊘ Cancel
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* MODULE 7: EXPORT ORDER 8-STAGE DIGITAL TWIN */}
          {activeTab === 'digital_twin' && digitalTwinState && (
            <>
              <div className="fintech-card hero">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 12
                  }}
                >
                  <div>
                    <div className="eyebrow">
                      8-Stage Export Order Digital Twin • {digitalTwinState.order.orderNumber}
                    </div>
                    <div className="section-title">
                      {digitalTwinState.order.buyerName} ({digitalTwinState.order.destinationPort})
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--ink-secondary)', marginTop: 4 }}>
                      Current Gate: <strong>{digitalTwinState.currentStageLabel}</strong> • Doc
                      Readiness: {digitalTwinState.documentReadinessPercent}% • Captured:{' '}
                      {digitalTwinState.order.currency}{' '}
                      {digitalTwinState.capturedPaymentTotal.toLocaleString()}
                    </div>
                  </div>
                  <div className="mono-metric">{digitalTwinState.overallProgressPercent}%</div>
                </div>
                <div className="progress-track" style={{ marginTop: 12 }}>
                  <div
                    className="progress-fill"
                    style={{
                      width: `${digitalTwinState.overallProgressPercent}%`,
                      backgroundColor: 'var(--gold-primary)'
                    }}
                  />
                </div>
              </div>

              {digitalTwinState.outstandingActions.length > 0 && (
                <div className="fintech-card">
                  <div className="card-title" style={{ marginBottom: 10 }}>
                    ⚡ Outstanding Pre-Shipment Blockers ({digitalTwinState.outstandingActions.length})
                  </div>
                  <div className="grid-3">
                    {digitalTwinState.outstandingActions.map((act) => (
                      <div
                        key={act.id}
                        style={{
                          padding: 14,
                          borderRadius: 10,
                          border: '1px solid var(--border-warm)',
                          backgroundColor: 'var(--bg-ivory)'
                        }}
                      >
                        <span
                          className={`status-chip ${
                            act.severity === 'HIGH' ? 'critical' : 'warning'
                          }`}
                        >
                          {act.severity}
                        </span>
                        <div style={{ fontWeight: 700, marginTop: 6 }}>{act.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--ink-secondary)', marginTop: 4 }}>
                          {act.description}
                        </div>
                        <button
                          className="btn btn-outline"
                          style={{ marginTop: 10, fontSize: 11.5, padding: '5px 10px' }}
                          onClick={() => setActiveTab(act.targetScreenRoute)}
                        >
                          Resolve Now →
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="timeline-list">
                {digitalTwinState.stages.map((stage) => (
                  <div key={stage.stageNumber} className={`timeline-node ${stage.status}`}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="mono-code" style={{ fontWeight: 700 }}>
                          STAGE 0{stage.stageNumber}
                        </span>
                        <span style={{ fontWeight: 700, fontSize: 15 }}>{stage.title}</span>
                        <span
                          className={`status-chip ${
                            stage.status === 'COMPLETED'
                              ? 'positive'
                              : stage.status === 'ACTION_REQUIRED'
                              ? 'critical'
                              : stage.status === 'IN_PROGRESS'
                              ? 'warning'
                              : 'neutral'
                          }`}
                        >
                          {stage.status}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, marginTop: 4 }}>{stage.subtitle}</div>
                      <div className="mono-code" style={{ fontSize: 11.5, color: 'var(--ink-muted)', marginTop: 2 }}>
                        {stage.detailText}
                      </div>
                    </div>
                    <button
                      className="btn btn-outline"
                      style={{ fontSize: 12 }}
                      onClick={() => setActiveTab(stage.targetScreenRoute)}
                    >
                      Inspect Module →
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* MODULE 4 & 6: TRADE RISK INTELLIGENCE & AUTONOMOUS AI ADVISOR */}
          {activeTab === 'ai_risk' && (
            <>
              <div className="fintech-card hero">
                <div className="eyebrow">
                  Module 4 • Natural-Language Export Portfolio Query Engine
                </div>
                <div className="card-title" style={{ marginTop: 4, marginBottom: 10 }}>
                  Ask Questions Grounded in Live Workspace Orders, Documents & Payments
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                  {[
                    'Which orders have missing or re-upload required documents?',
                    'Show unpaid advances and pending payment captures',
                    'Rank export orders by highest profit margin in INR'
                  ].map((preset) => (
                    <button
                      key={preset}
                      className="btn btn-outline"
                      style={{ fontSize: 11.5, padding: '5px 10px' }}
                      onClick={() => {
                        setNlQueryInput(preset);
                        setNlQueryResult(
                          answerWorkspaceBusinessQuery({
                            query: preset,
                            orders: activeData.orders,
                            assessments: activeData.assessments,
                            documents: activeData.documents,
                            payments: activeData.payments
                          })
                        );
                      }}
                    >
                      💬 {preset}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="input-control"
                    style={{ flex: 1 }}
                    value={nlQueryInput}
                    onChange={(e) => setNlQueryInput(e.target.value)}
                  />
                  <button
                    className="btn btn-primary"
                    onClick={() =>
                      setNlQueryResult(
                        answerWorkspaceBusinessQuery({
                          query: nlQueryInput,
                          orders: activeData.orders,
                          assessments: activeData.assessments,
                          documents: activeData.documents,
                          payments: activeData.payments
                        })
                      )
                    }
                  >
                    Run Query
                  </button>
                </div>

                <div
                  style={{
                    marginTop: 14,
                    padding: 14,
                    borderRadius: 10,
                    backgroundColor: 'var(--surface-white)',
                    border: '1px solid var(--border-warm)'
                  }}
                >
                  <div className="eyebrow">{nlQueryResult.engineLabel}</div>
                  <div style={{ fontWeight: 700, marginTop: 4, marginBottom: 8 }}>
                    {nlQueryResult.answerTitle}
                  </div>
                  <ul style={{ paddingLeft: 18, fontSize: 13 }}>
                    {nlQueryResult.answerBullets.map((b, idx) => (
                      <li key={idx} style={{ marginBottom: 4 }}>
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="fintech-card">
                <div className="eyebrow">Module 6 • Deterministic TradeRiskEngine</div>
                <div className="card-title" style={{ marginTop: 4, marginBottom: 12 }}>
                  Active Portfolio Risk Alerts ({portfolioRisks.length})
                </div>

                <div className="grid-2">
                  {portfolioRisks.map((risk) => (
                    <div
                      key={risk.id}
                      style={{
                        padding: 16,
                        borderRadius: 12,
                        border: '1px solid var(--border-warm)',
                        backgroundColor: 'var(--bg-ivory)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span
                          className={`status-chip ${
                            risk.severity === 'CRITICAL'
                              ? 'critical'
                              : risk.severity === 'WARNING'
                              ? 'warning'
                              : 'info'
                          }`}
                        >
                          {risk.severity} • {risk.category}
                        </span>
                        <span className="mono-code" style={{ fontWeight: 700 }}>
                          {risk.orderNumber}
                        </span>
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 14.5, marginTop: 8 }}>
                        {risk.title}
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--ink-secondary)', marginTop: 4 }}>
                        <strong>Evidence:</strong> {risk.evidence}
                      </div>
                      <div style={{ fontSize: 12.5, marginTop: 6 }}>
                        <strong>Recommended Action:</strong> {risk.recommendedAction}
                      </div>
                      <button
                        className="btn btn-outline"
                        style={{ marginTop: 10, fontSize: 11.5, padding: '5px 10px' }}
                        onClick={() => {
                          setSelectedOrderId(risk.orderId);
                          setActiveTab(risk.targetScreenRoute);
                        }}
                      >
                        Open {risk.orderNumber} →
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* MODULE 10, 11, 12: WORKSPACE ISOLATION, AUDIT LOGS & CAPABILITY MATRIX */}
          {activeTab === 'workspace' && (
            <>
              <div className="grid-2">
                <div className="fintech-card hero">
                  <div className="eyebrow">Workspace Isolation & Persistence</div>
                  <div className="card-title" style={{ marginTop: 4, marginBottom: 10 }}>
                    {workspaceMode === 'SAMPLE_BUSINESS'
                      ? SAMPLE_WORKSPACE_PROFILE.companyName
                      : `Isolated Production Workspace (${prodUserEmail})`}
                  </div>
                  <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div>
                      <strong>IEC:</strong> {SAMPLE_WORKSPACE_PROFILE.iecNumber}
                    </div>
                    <div>
                      <strong>GSTIN:</strong> {SAMPLE_WORKSPACE_PROFILE.gstin}
                    </div>
                    <div>
                      <strong>AD Code:</strong> {SAMPLE_WORKSPACE_PROFILE.adCode}
                    </div>
                    <div>
                      <strong>Primary Trade Bank:</strong> {SAMPLE_WORKSPACE_PROFILE.primaryBank}
                    </div>
                    <div>
                      <strong>Storage Isolation Key:</strong>{' '}
                      <code className="mono-code">
                        {workspaceMode === 'SAMPLE_BUSINESS'
                          ? 'localStorage["niryat_sample_workspace_v1"]'
                          : 'localStorage["niryat_production_workspace_v1"]'}
                      </code>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-gold"
                      onClick={() => {
                        const fresh = resetSampleWorkspace();
                        setSampleData(fresh);
                        setWorkspaceMode('SAMPLE_BUSINESS');
                        setSelectedOrderId('ORDER-001');
                        showToast('Sample Business Workspace reset to initial 6-order dataset.');
                      }}
                    >
                      ↺ Reset Sample Business Data
                    </button>
                    <button className="btn btn-outline" onClick={handleDownloadPortfolioCsv}>
                      ⬇ Download Portfolio CSV Report
                    </button>
                  </div>
                </div>

                <div className="fintech-card">
                  <div className="eyebrow">Production Workspace Switcher</div>
                  <div className="card-title" style={{ marginTop: 4, marginBottom: 10 }}>
                    Isolated Production Account Context
                  </div>
                  <p style={{ fontSize: 12.5, color: 'var(--ink-secondary)', marginBottom: 12 }}>
                    Switching to Production Workspace isolates all orders, documents, and payments
                    from the Sample Business Workspace so demo records never pollute production
                    ledgers.
                  </p>
                  <div className="form-field" style={{ marginBottom: 12 }}>
                    <label>Exporter Business Email</label>
                    <input
                      className="input-control"
                      value={prodUserEmail}
                      onChange={(e) => setProdUserEmail(e.target.value)}
                    />
                  </div>
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      setWorkspaceMode('AUTHENTICATED_USER');
                      showToast(`Switched to isolated Production Workspace for ${prodUserEmail}.`);
                    }}
                  >
                    Enter Production Workspace
                  </button>
                </div>
              </div>

              {/* Chronological Audit Trail */}
              <div className="fintech-card">
                <div className="card-title" style={{ marginBottom: 12 }}>
                  Immutable Workspace Activity & Compliance Log ({activeData.activities.length})
                </div>
                <div className="data-table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Order</th>
                        <th>Event Type</th>
                        <th>Summary</th>
                        <th>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeData.activities.slice(0, 15).map((act) => (
                        <tr key={act.id}>
                          <td className="mono-code" style={{ fontWeight: 700 }}>
                            {act.exportOrderId}
                          </td>
                          <td>
                            <span className="status-chip info">{act.eventType}</span>
                          </td>
                          <td style={{ fontWeight: 700 }}>{act.title}</td>
                          <td style={{ fontSize: 12.5, color: 'var(--ink-secondary)' }}>
                            {act.description}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      {/* Responsive Mobile Bottom Navigation */}
      <nav className="mobile-bottom-nav">
        <button
          className={`mobile-nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          <span>📊</span>
          <span>Dashboard</span>
        </button>
        <button
          className={`mobile-nav-btn ${activeTab === 'orders' ? 'active' : ''}`}
          onClick={() => setActiveTab('orders')}
        >
          <span>📦</span>
          <span>Orders</span>
        </button>
        <button
          className={`mobile-nav-btn ${activeTab === 'financials' ? 'active' : ''}`}
          onClick={() => setActiveTab('financials')}
        >
          <span>💹</span>
          <span>Financials</span>
        </button>
        <button
          className={`mobile-nav-btn ${activeTab === 'documents' ? 'active' : ''}`}
          onClick={() => setActiveTab('documents')}
        >
          <span>📑</span>
          <span>Docs</span>
        </button>
        <button
          className={`mobile-nav-btn ${activeTab === 'payments' ? 'active' : ''}`}
          onClick={() => setActiveTab('payments')}
        >
          <span>💳</span>
          <span>Payments</span>
        </button>
        <button
          className={`mobile-nav-btn ${activeTab === 'digital_twin' ? 'active' : ''}`}
          onClick={() => setActiveTab('digital_twin')}
        >
          <span>🧭</span>
          <span>Twin</span>
        </button>
      </nav>
    </div>
  );
}

function DualSeriesSvgChart(props: {
  labels: string[];
  intakeSeries: number[];
  capturedSeries: number[];
}) {
  const { labels, intakeSeries, capturedSeries } = props;
  const width = 560;
  const height = 210;
  const padLeft = 44;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 34;

  const maxVal = Math.max(1000, ...intakeSeries, ...capturedSeries);
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const toX = (i: number) =>
    labels.length <= 1 ? padLeft + plotW / 2 : padLeft + (i / (labels.length - 1)) * plotW;
  const toY = (v: number) => padTop + plotH - (v / maxVal) * plotH;

  const intakePoints = intakeSeries.map((v, i) => `${toX(i)},${toY(v)}`).join(' ');
  const capturedPoints = capturedSeries.map((v, i) => `${toX(i)},${toY(v)}`).join(' ');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: '100%', height: 'auto', overflow: 'visible' }}
    >
      {[0, 0.5, 1].map((frac, idx) => {
        const y = padTop + plotH * (1 - frac);
        const val = maxVal * frac;
        return (
          <g key={idx}>
            <line
              x1={padLeft}
              y1={y}
              x2={width - padRight}
              y2={y}
              stroke="#E6E0D6"
              strokeDasharray="4 4"
            />
            <text x={4} y={y + 4} fontSize="10" fill="#8C8881" fontFamily="JetBrains Mono">
              {formatInrShort(val)}
            </text>
          </g>
        );
      })}

      <polyline
        fill="none"
        stroke="#C69C3A"
        strokeWidth="3"
        points={intakePoints}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        fill="none"
        stroke="#1E7E5A"
        strokeWidth="3"
        points={capturedPoints}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {labels.map((lbl, i) => (
        <g key={i}>
          <circle cx={toX(i)} cy={toY(intakeSeries[i] || 0)} r="4.5" fill="#C69C3A" />
          <circle cx={toX(i)} cy={toY(capturedSeries[i] || 0)} r="4" fill="#1E7E5A" />
          <text
            x={toX(i)}
            y={height - 10}
            textAnchor="middle"
            fontSize="10.5"
            fill="#5C5A55"
            fontFamily="JetBrains Mono"
          >
            {lbl}
          </text>
        </g>
      ))}
    </svg>
  );
}
