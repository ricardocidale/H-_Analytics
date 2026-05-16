import { storage } from "../storage";
import type { DataChangedEntry, ToolContext } from "./rebecca-tool-types";
import { requireNumericArg } from "./rebecca-tool-types";

export async function toolListPortfolios(
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const items = await storage.getPortfolios(ctx.userId);
  return {
    result: {
      portfolios: items.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        createdAt: p.createdAt,
      })),
    },
  };
}

export async function toolCreatePortfolio(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const name = args.name as string;
  if (!name?.trim()) return { result: { error: "name is required" } };

  const portfolio = await storage.createPortfolio({
    userId: ctx.userId,
    name: name.trim(),
    description: (args.description as string | undefined) ?? null,
  });
  return {
    result: { portfolio },
    dataChanged: { entityType: "portfolio", entityId: portfolio.id },
  };
}

export async function toolUpdatePortfolio(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const idResult = requireNumericArg(args, "id");
  if (!idResult.ok) return idResult.result;
  const id = idResult.value;

  const data: Partial<{ name: string; description: string | null }> = {};
  if (args.name !== undefined) data.name = args.name as string;
  if (args.description !== undefined) data.description = args.description as string | null;

  const updated = await storage.updatePortfolio(id, ctx.userId, data);
  if (!updated) return { result: { error: "Portfolio not found" } };
  return {
    result: { portfolio: updated },
    dataChanged: { entityType: "portfolio", entityId: id },
  };
}

export async function toolDeletePortfolio(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const idResult = requireNumericArg(args, "id");
  if (!idResult.ok) return idResult.result;
  const id = idResult.value;

  const existing = await storage.getPortfolio(id, ctx.userId);
  if (!existing) return { result: { error: "Portfolio not found" } };

  await storage.deletePortfolio(id, ctx.userId);
  return {
    result: { success: true },
    dataChanged: { entityType: "portfolio", entityId: id },
  };
}

export async function toolListPortfolioProperties(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const idResult = requireNumericArg(args, "id");
  if (!idResult.ok) return idResult.result;
  const id = idResult.value;

  const portfolio = await storage.getPortfolio(id, ctx.userId);
  if (!portfolio) return { result: { error: "Portfolio not found" } };

  const items = await storage.getPortfolioProperties(id, ctx.userId);
  return {
    result: {
      properties: items.map((p) => ({
        id: p.id,
        name: p.name,
        country: p.country,
        type: p.type,
      })),
    },
  };
}

export async function toolAssignPropertyPortfolio(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const propResult = requireNumericArg(args, "propertyId");
  if (!propResult.ok) return propResult.result;
  const propertyId = propResult.value;

  const portfolioId = args.portfolioId === null
    ? null
    : (() => {
        const r = requireNumericArg(args, "portfolioId");
        return r.ok ? r.value : null;
      })();

  if (portfolioId !== null) {
    const portfolio = await storage.getPortfolio(portfolioId, ctx.userId);
    if (!portfolio) return { result: { error: "Portfolio not found" } };
  }

  const updated = await storage.updateProperty(propertyId, { portfolioId });
  if (!updated) return { result: { error: "Property not found" } };
  if (updated.userId !== ctx.userId) return { result: { error: "Access denied" } };

  return {
    result: { property: { id: updated.id, name: updated.name, portfolioId: updated.portfolioId } },
    dataChanged: { entityType: "property", entityId: propertyId },
  };
}
