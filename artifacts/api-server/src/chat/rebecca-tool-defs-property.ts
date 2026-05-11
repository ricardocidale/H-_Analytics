import type { ToolParam } from "./tool-types";

export function getPropertyTools(): ToolParam[] {
  return [
    {
      name: "list_properties",
      description: "List all properties in the user's portfolio. Returns id, name, country, and type for each property.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    {
      name: "get_property",
      description: "Get detailed information about a specific property including financial assumptions.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Property ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "update_property",
      description: "Update a single field on a property. Returns the old and new values.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Property ID" },
          field: { type: "string", description: "Field name to update (must be a valid updatePropertySchema field)" },
          value: { description: "New value for the field" },
        },
        required: ["id", "field", "value"],
      },
    },
    {
      name: "patch_property",
      description: "Update multiple property fields in a single call. Validates each field against its schema. Returns updated (fields written) and skipped (fields that failed validation). Always check the skipped array and inform the user if any fields were not written.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Property ID" },
          fields: {
            type: "object",
            description: "Map of field names to new values (e.g. { startAdr: 250, maxOccupancy: 20 })",
          },
        },
        required: ["id", "fields"],
      },
    },
    {
      name: "update_property_coordinates",
      description: "Update a property's latitude and longitude. Mirrors the geocode-driven coordinate write triggered when an address is auto-resolved on the Property → Edit basic-info section. Caller must have access to the property.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Property ID" },
          latitude: { type: "number", description: "Latitude in degrees (-90 to 90)." },
          longitude: { type: "number", description: "Longitude in degrees (-180 to 180)." },
        },
        required: ["id", "latitude", "longitude"],
      },
    },
    {
      name: "create_property",
      description:
        "Create a new property (hotel) in the portfolio. Mirrors the UI's 'New Property' action: applies global assumption defaults, " +
        "smart defaults from quality tier / business model / country / room count, suggests a star rating, seeds default fee categories, " +
        "and creates a hero photo if an imageUrl is provided. Returns the new property id and name.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Property name (required)." },
          country: { type: "string", description: "Country, e.g. 'United States'." },
          stateProvince: { type: "string", description: "State or province." },
          city: { type: "string", description: "City." },
          location: { type: "string", description: "Free-form location string." },
          propertyType: { type: "string", description: "Property type, e.g. 'hotel', 'resort', 'inn'." },
          businessModel: { type: "string", description: "Business model classification, e.g. 'hotel', 'resort'." },
          qualityTier: { type: "string", description: "Quality tier, e.g. 'Luxury', 'Upscale', 'Midscale'." },
          roomCount: { type: "number", description: "Total number of guest rooms." },
          imageUrl: { type: "string", description: "Optional hero image URL." },
        },
        required: ["name"],
      },
    },
    {
      name: "delete_property",
      description:
        "Soft-delete (archive) a property. This is reversible by an admin via the restore endpoint, but it removes the property from " +
        "all standard list/detail views and clears its vector index. Confirm with the user before calling. Caller must be the property " +
        "owner or an admin.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Property id to archive." },
        },
        required: ["id"],
      },
    },
    {
      name: "delete_property_photo",
      description:
        "Delete a photo from a property's gallery. Cannot delete the last photo unless you are an admin. Returns an error if the photo does not belong to the specified property.",
      parameters: {
        type: "object",
        properties: {
          propertyId: { type: "number", description: "Property ID the photo belongs to." },
          photoId: { type: "number", description: "ID of the photo to delete." },
        },
        required: ["propertyId", "photoId"],
      },
    },
    {
      name: "set_hero_photo",
      description:
        "Set a photo as the hero (primary) image for a property. The photo must belong to the specified property.",
      parameters: {
        type: "object",
        properties: {
          propertyId: { type: "number", description: "Property ID." },
          photoId: { type: "number", description: "ID of the photo to set as hero." },
        },
        required: ["propertyId", "photoId"],
      },
    },
    {
      name: "update_photo",
      description:
        "Update a property photo's caption or sort order. The photo must belong to the specified property.",
      parameters: {
        type: "object",
        properties: {
          propertyId: { type: "number", description: "Property ID the photo belongs to." },
          photoId: { type: "number", description: "ID of the photo to update." },
          caption: { type: "string", description: "New caption text. Pass null to clear." },
          sortOrder: { type: "number", description: "New sort position (0-based)." },
        },
        required: ["propertyId", "photoId"],
      },
    },
    {
      name: "list_property_photos",
      description:
        "List all photos in a property's gallery, ordered by sort order. Returns id, imageUrl, caption, isHero, and sortOrder for each photo.",
      parameters: {
        type: "object",
        properties: {
          propertyId: { type: "number", description: "Property ID." },
        },
        required: ["propertyId"],
      },
    },
    {
      name: "create_photo",
      description:
        "Add a photo to a property's gallery by URL. The first photo added becomes the hero automatically. Optionally set a caption.",
      parameters: {
        type: "object",
        properties: {
          propertyId: { type: "number", description: "Property ID to add the photo to." },
          imageUrl: { type: "string", description: "Publicly accessible URL of the image." },
          caption: { type: "string", description: "Optional caption for the photo." },
        },
        required: ["propertyId", "imageUrl"],
      },
    },
    {
      name: "reorder_photos",
      description:
        "Reorder a property's photo gallery by providing the full ordered list of photo IDs. The first ID becomes sort_order 0.",
      parameters: {
        type: "object",
        properties: {
          propertyId: { type: "number", description: "Property ID." },
          orderedPhotoIds: {
            type: "array",
            items: { type: "number" },
            description: "Photo IDs in the desired display order.",
          },
        },
        required: ["propertyId", "orderedPhotoIds"],
      },
    },
  ];
}
