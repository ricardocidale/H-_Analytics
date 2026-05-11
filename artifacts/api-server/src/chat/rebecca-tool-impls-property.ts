import { storage } from "../storage";
import { isAdminRole } from "@shared/constants";
import type { Property, UpdateProperty } from "@workspace/db";
import { updatePropertySchema, insertPropertySchema, type InsertProperty } from "@workspace/db";
import { createPropertyForUser, archivePropertyForUser } from "../routes/properties";
import type { DataChangedEntry, ToolContext } from "./rebecca-tool-types";
import { requireNumericArg, requireObjectArg } from "./rebecca-tool-types";

// ---------------------------------------------------------------------------
// list_properties / get_property
// ---------------------------------------------------------------------------

export async function toolListProperties(
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const props = await storage.getAllProperties(ctx.userId);
  return {
    result: {
      properties: props.map((p: Property) => ({
        id: p.id,
        name: p.name,
        country: p.country,
        type: p.type,
      })),
    },
  };
}

export async function toolGetProperty(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const id = args.id as number;
  const prop = await storage.getProperty(id);
  if (!prop || prop.userId !== ctx.userId) {
    return { result: { error: "Not found" } };
  }
  return {
    result: {
      property: {
        id: prop.id,
        name: prop.name,
        country: prop.country,
        type: prop.type,
        startAdr: prop.startAdr,
        maxOccupancy: prop.maxOccupancy,
        costRateMarketing: prop.costRateMarketing,
        exitCapRate: prop.exitCapRate,
        location: prop.location,
        city: prop.city,
        stateProvince: prop.stateProvince,
        purchasePrice: prop.purchasePrice,
        roomCount: prop.roomCount,
        startOccupancy: prop.startOccupancy,
        adrGrowthRate: prop.adrGrowthRate,
        taxRate: prop.taxRate,
        status: prop.status,
        market: prop.market,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// update_property / patch_property
// ---------------------------------------------------------------------------

export async function toolUpdateProperty(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const id = args.id as number;
  const field = args.field as string;
  const value = args.value;

  const prop = await storage.getProperty(id);
  if (!prop || prop.userId !== ctx.userId) {
    return { result: { error: "Not found" } };
  }

  if (!Object.keys(updatePropertySchema.shape).includes(field)) {
    return { result: { error: `Unknown field: ${field}` } };
  }

  const fieldSchema = (updatePropertySchema.shape as Record<string, { safeParse: (v: unknown) => { success: boolean; error?: unknown } }>)[field];
  const parsed = fieldSchema.safeParse(value);
  if (!parsed.success) {
    return { result: { error: `Invalid value for field "${field}": ${String(parsed.error)}` } };
  }

  const before = (prop as unknown as Record<string, unknown>)[field];
  await storage.updateProperty(id, { [field]: value } as UpdateProperty);

  return {
    result: { success: true, field, before, after: value, displayName: prop.name },
    dataChanged: { entityType: "property", entityId: id },
  };
}

export async function toolPatchProperty(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const idResult = requireNumericArg(args, "id");
  if (!idResult.ok) return idResult.result;
  const id = idResult.value;
  const fieldsResult = requireObjectArg(args, "fields");
  if (!fieldsResult.ok) return fieldsResult.result;
  const rawFields = fieldsResult.value;

  const prop = await storage.getProperty(id);
  if (!prop || prop.userId !== ctx.userId) {
    return { result: { error: "Not found" } };
  }

  const schemaShape = updatePropertySchema.shape;
  const validated: Record<string, unknown> = {};
  const errors: string[] = [];

  for (const [field, value] of Object.entries(rawFields)) {
    const fieldValidator = schemaShape[field as keyof typeof schemaShape];
    if (!fieldValidator) {
      errors.push(`Unknown field: ${field}`);
      continue;
    }
    const parsed = fieldValidator.safeParse(value);
    if (!parsed.success) {
      errors.push(`Invalid value for "${field}": ${String(parsed.error)}`);
    } else {
      validated[field] = value;
    }
  }

  if (errors.length > 0 && Object.keys(validated).length === 0) {
    return { result: { error: errors.join("; ") } };
  }

  await storage.updateProperty(id, validated as UpdateProperty);

  return {
    result: {
      success: true,
      updated: Object.keys(validated),
      ...(errors.length > 0 ? { skipped: errors } : {}),
      displayName: prop.name,
    },
    dataChanged: { entityType: "property", entityId: id },
  };
}

// ---------------------------------------------------------------------------
// create_property / delete_property
// ---------------------------------------------------------------------------

export async function toolCreateProperty(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const user = await storage.getUserById(ctx.userId);
  if (!user) return { result: { error: "User not found" } };

  const validation = insertPropertySchema.safeParse(args);
  if (!validation.success) {
    const message = validation.error.issues
      .map(i => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return { result: { error: `Invalid property data: ${message}` } };
  }

  try {
    const property = await createPropertyForUser(
      user as unknown as Express.User,
      validation.data as InsertProperty,
    );
    return {
      result: { id: property.id, name: property.name },
      dataChanged: { entityType: "property", entityId: property.id },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { result: { error: `Failed to create property: ${message}` } };
  }
}

export async function toolDeleteProperty(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const id = typeof args.id === "number" ? args.id : Number(args.id);
  if (!id || isNaN(id)) return { result: { error: "id must be a positive integer" } };

  const user = await storage.getUserById(ctx.userId);
  if (!user) return { result: { error: "User not found" } };

  const property = await storage.getProperty(id);
  if (!property) return { result: { error: "Property not found" } };
  const canAccess =
    isAdminRole(user.role) ||
    property.userId === ctx.userId ||
    property.userId === null;
  if (!canAccess) return { result: { error: "Access denied" } };

  await archivePropertyForUser(id, ctx.userId);
  return {
    result: { success: true, displayName: property.name },
    dataChanged: { entityType: "property", entityId: id },
  };
}

// ---------------------------------------------------------------------------
// delete_property_photo / set_hero_photo
// ---------------------------------------------------------------------------

export async function toolDeletePropertyPhoto(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const propertyId = typeof args.propertyId === "number" ? args.propertyId : Number(args.propertyId);
  const photoId = typeof args.photoId === "number" ? args.photoId : Number(args.photoId);
  if (!propertyId || isNaN(propertyId)) return { result: { error: "propertyId must be a positive integer" } };
  if (!photoId || isNaN(photoId)) return { result: { error: "photoId must be a positive integer" } };

  const user = await storage.getUserById(ctx.userId);
  if (!user) return { result: { error: "User not found" } };

  const property = await storage.getProperty(propertyId);
  if (!property || (property.userId !== ctx.userId && !isAdminRole(user.role) && property.userId !== null)) {
    return { result: { error: "Not found" } };
  }

  const photo = await storage.getPhotoById(photoId);
  if (!photo || photo.propertyId !== propertyId) {
    return { result: { error: "Not found" } };
  }

  const photos = await storage.getPropertyPhotos(propertyId);
  if (photos.length <= 1 && !isAdminRole(user.role)) {
    return { result: { error: "Cannot delete the last photo — admin required" } };
  }

  await storage.deletePropertyPhoto(photoId);
  return {
    result: { success: true },
    dataChanged: { entityType: "property", entityId: propertyId },
  };
}

export async function toolSetHeroPhoto(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const propertyId = typeof args.propertyId === "number" ? args.propertyId : Number(args.propertyId);
  const photoId = typeof args.photoId === "number" ? args.photoId : Number(args.photoId);
  if (!propertyId || isNaN(propertyId)) return { result: { error: "propertyId must be a positive integer" } };
  if (!photoId || isNaN(photoId)) return { result: { error: "photoId must be a positive integer" } };

  const user = await storage.getUserById(ctx.userId);
  if (!user) return { result: { error: "User not found" } };

  const property = await storage.getProperty(propertyId);
  if (!property || (property.userId !== ctx.userId && !isAdminRole(user.role) && property.userId !== null)) {
    return { result: { error: "Not found" } };
  }

  const photo = await storage.getPhotoById(photoId);
  if (!photo || photo.propertyId !== propertyId) {
    return { result: { error: "Not found" } };
  }

  await storage.setHeroPhoto(propertyId, photoId);
  return {
    result: { success: true },
    dataChanged: { entityType: "property", entityId: propertyId },
  };
}

// ---------------------------------------------------------------------------
// update_photo / list_property_photos / create_photo / reorder_photos
// ---------------------------------------------------------------------------

export async function toolUpdatePhoto(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const propertyIdResult = requireNumericArg(args, "propertyId");
  if (!propertyIdResult.ok) return propertyIdResult.result;
  const propertyId = propertyIdResult.value;

  const photoIdResult = requireNumericArg(args, "photoId");
  if (!photoIdResult.ok) return photoIdResult.result;
  const photoId = photoIdResult.value;

  const user = await storage.getUserById(ctx.userId);
  if (!user) return { result: { error: "User not found" } };

  const property = await storage.getProperty(propertyId);
  if (!property || (property.userId !== ctx.userId && !isAdminRole(user.role) && property.userId !== null)) {
    return { result: { error: "Not found" } };
  }

  const photo = await storage.getPhotoById(photoId);
  if (!photo || photo.propertyId !== propertyId) {
    return { result: { error: "Not found" } };
  }

  const patch: Record<string, unknown> = {};
  if ("caption" in args) patch.caption = args.caption === null ? null : String(args.caption ?? "");
  if (typeof args.sortOrder === "number") patch.sortOrder = args.sortOrder;

  if (Object.keys(patch).length === 0) {
    return { result: { error: "No updatable fields provided (caption, sortOrder)" } };
  }

  const updated = await storage.updatePropertyPhoto(photoId, patch as Parameters<typeof storage.updatePropertyPhoto>[1]);
  if (!updated) return { result: { error: "Update failed" } };

  return {
    result: { id: updated.id, caption: updated.caption, sortOrder: updated.sortOrder },
    dataChanged: { entityType: "property", entityId: propertyId },
  };
}

export async function toolListPropertyPhotos(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown }> {
  const propertyIdResult = requireNumericArg(args, "propertyId");
  if (!propertyIdResult.ok) return propertyIdResult.result;
  const propertyId = propertyIdResult.value;

  const user = await storage.getUserById(ctx.userId);
  if (!user) return { result: { error: "User not found" } };

  const property = await storage.getProperty(propertyId);
  if (!property || (property.userId !== ctx.userId && !isAdminRole(user.role) && property.userId !== null)) {
    return { result: { error: "Not found" } };
  }

  const photos = await storage.getPropertyPhotos(propertyId);
  return {
    result: photos.map(p => ({
      id: p.id,
      imageUrl: p.imageUrl,
      caption: p.caption,
      isHero: p.isHero,
      sortOrder: p.sortOrder,
    })),
  };
}

export async function toolCreatePhoto(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const propertyIdResult = requireNumericArg(args, "propertyId");
  if (!propertyIdResult.ok) return propertyIdResult.result;
  const propertyId = propertyIdResult.value;

  const imageUrl = typeof args.imageUrl === "string" ? args.imageUrl.trim() : "";
  if (!imageUrl) return { result: { error: "imageUrl is required" } };

  const caption = typeof args.caption === "string" ? args.caption.trim() : undefined;

  const user = await storage.getUserById(ctx.userId);
  if (!user) return { result: { error: "User not found" } };

  const property = await storage.getProperty(propertyId);
  if (!property || (property.userId !== ctx.userId && !isAdminRole(user.role) && property.userId !== null)) {
    return { result: { error: "Not found" } };
  }

  const photo = await storage.addPropertyPhoto({
    propertyId,
    imageUrl,
    ...(caption ? { caption } : {}),
  });

  return {
    result: { id: photo.id, imageUrl: photo.imageUrl, isHero: photo.isHero },
    dataChanged: { entityType: "property", entityId: propertyId },
  };
}

export async function toolReorderPhotos(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const propertyIdResult = requireNumericArg(args, "propertyId");
  if (!propertyIdResult.ok) return propertyIdResult.result;
  const propertyId = propertyIdResult.value;

  if (!Array.isArray(args.orderedPhotoIds) || args.orderedPhotoIds.length === 0) {
    return { result: { error: "orderedPhotoIds must be a non-empty array of photo IDs" } };
  }
  const orderedIds = (args.orderedPhotoIds as unknown[]).map(Number);
  if (orderedIds.some(isNaN)) return { result: { error: "orderedPhotoIds must contain only numbers" } };

  const user = await storage.getUserById(ctx.userId);
  if (!user) return { result: { error: "User not found" } };

  const property = await storage.getProperty(propertyId);
  if (!property || (property.userId !== ctx.userId && !isAdminRole(user.role) && property.userId !== null)) {
    return { result: { error: "Not found" } };
  }

  await storage.reorderPhotos(propertyId, orderedIds);
  return {
    result: { success: true },
    dataChanged: { entityType: "property", entityId: propertyId },
  };
}

// Latitude/longitude bounds for WGS-84 — mirrors the route validation in
// PATCH /api/properties/:id/coords (artifacts/api-server/src/routes/properties.ts).
const LATITUDE_MIN = -90;
const LATITUDE_MAX = 90;
const LONGITUDE_MIN = -180;
const LONGITUDE_MAX = 180;

export async function toolUpdatePropertyCoordinates(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const idResult = requireNumericArg(args, "id");
  if (!idResult.ok) return idResult.result;
  const id = idResult.value;

  const lat = args.latitude;
  const lng = args.longitude;
  if (
    typeof lat !== "number" || typeof lng !== "number" ||
    !Number.isFinite(lat) || !Number.isFinite(lng) ||
    lat < LATITUDE_MIN || lat > LATITUDE_MAX ||
    lng < LONGITUDE_MIN || lng > LONGITUDE_MAX
  ) {
    return {
      result: {
        error: `latitude must be ${LATITUDE_MIN}..${LATITUDE_MAX} and longitude must be ${LONGITUDE_MIN}..${LONGITUDE_MAX}`,
      },
    };
  }

  const prop = await storage.getProperty(id);
  if (!prop || prop.userId !== ctx.userId) {
    return { result: { error: "Not found" } };
  }

  const updated = await storage.updateProperty(id, { latitude: lat, longitude: lng });
  if (!updated) return { result: { error: "Not found" } };

  return {
    result: { success: true, latitude: updated.latitude, longitude: updated.longitude },
    dataChanged: { entityType: "property", entityId: id },
  };
}
