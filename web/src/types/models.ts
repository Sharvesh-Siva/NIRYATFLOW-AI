export type WorkspaceMode = 'SAMPLE_BUSINESS' | 'AUTHENTICATED_USER' | 'UNAUTHENTICATED';

export type TimePeriodCode = '1D' | '1W' | '1M' | '3M' | '1Y' | 'ALL';

export interface BusinessWorkspaceProfile {
  companyName: string;
  iecNumber: string;
  gstin: string;
  adCode: string;
  primaryBank: string;
  headquarters: string;
  exportSpecialties: string;
  settlementCurrencies: string[];
  workspaceBannerText: string;
}

export interface ExportOrder {
  id: string;
  userId: string;
  orderNumber: string;
  exporterName: string;
  exporterContact: string;
  exporterAddress: string;
  buyerName: string;
  buyerCountry: string;
  buyerContact: string;
  buyerAddress: string;
  productName: string;
  productDescription: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  orderValue: number;
  currency: string;
  incoterm: string;
  destinationPort: string;
  orderDate: string;
  expectedShipmentDate: string;
  paymentTerms: string;
  advancePercentage: number;
  orderStatus:
    | 'CREATED'
    | 'VALIDATED'
    | 'FINANCIALLY_ASSESSED'
    | 'DOCS_READY'
    | 'PAYMENT_INITIATED'
    | 'COMPLETED'
    | 'CANCELLED';
  extractionSource: 'MANUAL' | 'AI_EXTRACTED_CONFIRMED' | string;
  createdAtEpochMs?: number;
  updatedAtEpochMs?: number;
}

export interface FinancialAssessment {
  id: string;
  userId: string;
  exportOrderId: string;
  grossOrderValue: number;
  currency: string;
  exchangeRate: number;
  convertedValueInr: number;
  advancePercentage: number;
  advanceAmount: number;
  outstandingAmount: number;
  paymentFeePercentage: number;
  paymentFixedFee: number;
  paymentFeeInr: number;
  procurementCostInr: number;
  logisticsCostInr: number;
  packagingCostInr: number;
  otherCostsInr: number;
  estimatedNetRevenueInr: number;
  estimatedProfitInr: number;
  profitMarginPercent: number;
  assumptionsNote: string;
  createdAtEpochMs?: number;
  updatedAtEpochMs?: number;
}

export type DocumentStatus =
  | 'MISSING'
  | 'UPLOADED'
  | 'PENDING_REVIEW'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'VERIFIED'
  | 'REJECTED'
  | 'REUPLOAD_REQUIRED'
  | 'OFFICIALLY_CERTIFIED'
  | 'NOT_APPLICABLE';

export interface DocumentRecord {
  id: string;
  userId: string;
  exportOrderId: string;
  documentType: string;
  requirementLevel: 'REQUIRED' | 'OPTIONAL' | 'NOT_APPLICABLE';
  status: DocumentStatus;
  fileName: string;
  fileReference: string;
  reviewerNote: string;
  fileMimeType: string;
  fileSizeBytes: number;
  sha256Checksum: string;
  versionNumber: number;
  reviewerRole: string;
  createdAtEpochMs?: number;
  updatedAtEpochMs?: number;
}

export type PaymentStatus =
  | 'NOT_INITIATED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'CAPTURED'
  | 'FAILED'
  | 'CANCELLED'
  | 'REQUIRES_RECONCILIATION'
  | 'DEMO_PENDING'
  | 'DEMO_CAPTURED'
  | 'DEMO_FAILED'
  | 'DEMO_CANCELLED';

export interface PaymentRecord {
  id: string;
  userId: string;
  exportOrderId: string;
  paypalOrderId: string;
  paypalCaptureId: string;
  approvalUrl: string;
  amount: number;
  currency: string;
  paymentType: 'ADVANCE' | 'BALANCE' | 'FULL';
  paymentStatus: PaymentStatus;
  verificationDetails: string;
  createdAtEpochMs?: number;
  updatedAtEpochMs?: number;
}

export interface ActivityRecord {
  id: string;
  userId: string;
  exportOrderId: string;
  eventType: string;
  title: string;
  description: string;
  createdAtEpochMs?: number;
  updatedAtEpochMs?: number;
}

export interface AIExtractedOrderDraft {
  exporterName: string;
  exporterContact: string;
  exporterAddress: string;
  buyerName: string;
  buyerCountry: string;
  buyerContact: string;
  buyerAddress: string;
  productName: string;
  productDescription: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  currency: string;
  incoterm: string;
  destinationPort: string;
  orderDate: string;
  expectedShipmentDate: string;
  paymentTerms: string;
  advancePercentage: number;
  confidenceScore: number;
  missingFields: string[];
  uncertainFields: string[];
  conflictsDetected: string[];
  aiExtractionNotes: string;
  extractionEngineLabel: string;
}

export type LifecycleStageStatus = 'COMPLETED' | 'IN_PROGRESS' | 'ACTION_REQUIRED' | 'PENDING';

export interface LifecycleStageNode {
  stageNumber: number;
  title: string;
  subtitle: string;
  status: LifecycleStageStatus;
  detailText: string;
  targetScreenRoute: WebNavTab;
}

export interface OutstandingAction {
  id: string;
  title: string;
  description: string;
  severity: 'HIGH' | 'MEDIUM' | 'INFO';
  targetScreenRoute: WebNavTab;
}

export interface DigitalTwinState {
  order: ExportOrder;
  financialAssessment: FinancialAssessment | null;
  documents: DocumentRecord[];
  payments: PaymentRecord[];
  documentReadinessPercent: number;
  verifiedRequiredDocs: number;
  totalRequiredDocs: number;
  capturedPaymentTotal: number;
  overallProgressPercent: number;
  currentStageLabel: string;
  stages: LifecycleStageNode[];
  outstandingActions: OutstandingAction[];
}

export interface PerformanceMetrics {
  totalOrders: number;
  activeOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  pendingOrders: number;
  totalOrderValueInr: number;
  capturedPaymentValueInr: number;
  outstandingPaymentValueInr: number;
  totalEstimatedProfitInr: number;
  averageOrderValueInr: number;
  averageProfitMarginPercent: number;
  paymentCompletionRatePercent: number;
  documentReadinessRatePercent: number;
  statusDistribution: Record<string, number>;
  countryDistribution: Record<string, number>;
}

export interface PeriodDashboardAnalytics {
  periodCode: TimePeriodCode;
  periodLabel: string;
  metrics: PerformanceMetrics;
  filteredOrders: ExportOrder[];
  filteredPayments: PaymentRecord[];
  previousPeriodOrderValueInr: number;
  orderValueGrowthPercent: number | null;
  previousPeriodCapturedInr: number;
  capturedRevenueGrowthPercent: number | null;
  chartBucketLabels: string[];
  chartOrderIntakeInr: number[];
  chartCapturedPaymentsInr: number[];
  periodSummaryText: string;
}

export interface TradeRiskAlert {
  id: string;
  orderId: string;
  orderNumber: string;
  category: 'DOCUMENTATION' | 'SETTLEMENT' | 'MARGIN' | 'CONCENTRATION';
  severity: 'CRITICAL' | 'WARNING' | 'ADVISORY';
  title: string;
  evidence: string;
  recommendedAction: string;
  targetScreenRoute: WebNavTab;
}

export type WebNavTab =
  | 'dashboard'
  | 'orders'
  | 'financials'
  | 'documents'
  | 'payments'
  | 'digital_twin'
  | 'ai_risk'
  | 'workspace';
