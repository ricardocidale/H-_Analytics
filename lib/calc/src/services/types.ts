/**
 * types.ts — Centralized Services Type Definitions
 *
 * Defines the data structures for the cost-plus centralized services model.
 * The management company can provide services to properties in two modes:
 *   - Centralized: company procures externally, charges property at cost + markup
 *   - Direct: property handles directly, company earns oversight fee (no cost-of-service)
 *
 * Used by the margin calculator, cost-of-services aggregator, and the financial engine.
 */

export type ServiceModel = 'centralized' | 'direct';

export interface ServiceTemplate {
  /** Template ID from company_service_templates table */
  id: number;
  /** Service category name (e.g., "Marketing & Brand", "Technology & Reservations") */
  name: string;
  /** Default fee rate for new properties (e.g., 0.02 = 2% of revenue) */
  defaultRate: number;
  /** Whether company provides centrally or property handles directly */
  serviceModel: ServiceModel;
  /** Cost-plus markup percentage (e.g., 0.20 = 20% markup on vendor cost) */
  serviceMarkup: number;
  /** Whether this template is active */
  isActive: boolean;
  /** Display order */
  sortOrder: number;
}

export interface ServiceCostResult {
  /** Service category name */
  name: string;
  /** Revenue the company earns from this service (= property's fee for this category) */
  revenue: number;
  /** Cost the company pays to the external vendor (= revenue / (1 + markup)) */
  vendorCost: number;
  /** Gross profit the company keeps (= revenue - vendorCost) */
  grossProfit: number;
  /** The service model used for this calculation */
  serviceModel: ServiceModel;
  /** The markup percentage applied */
  markup: number;
}

export interface AggregatedServiceCosts {
  /** Per-category cost breakdown */
  byCategory: Record<string, ServiceCostResult>;
  /** Total revenue from all centralized services */
  centralizedRevenue: number;
  /** Total revenue from all direct services */
  directRevenue: number;
  /** Total vendor cost (only from centralized categories) */
  totalVendorCost: number;
  /** Total gross profit (centralized margin + direct fee revenue) */
  totalGrossProfit: number;
}
