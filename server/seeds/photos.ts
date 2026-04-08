import { db } from "../db";
import { propertyPhotos, properties } from "@shared/schema";
import { logger } from "../logger";

interface PhotoSeed {
  imageUrl: string;
  caption: string;
  sortOrder: number;
  isHero: boolean;
}

const PROPERTY_PHOTOS: Record<string, PhotoSeed[]> = {
  "The Hudson Estate": [
    { imageUrl: "/images/property-ny.png", caption: "The Hudson Estate — a refined country retreat in the heart of the Hudson Valley", sortOrder: 0, isHero: true },
    { imageUrl: "/images/property-ny-interior.png", caption: "Grand lobby with period furnishings and crystal chandelier", sortOrder: 1, isHero: false },
    { imageUrl: "/images/property-ny-grounds.png", caption: "Manicured gardens and stone pathways through the estate grounds", sortOrder: 2, isHero: false },
  ],
  "Eden Summit Lodge": [
    { imageUrl: "/images/property-utah.png", caption: "Eden Summit Lodge — alpine luxury nestled in Utah's Ogden Valley", sortOrder: 0, isHero: true },
    { imageUrl: "/images/property-utah-interior.png", caption: "Great room with floor-to-ceiling mountain views and stone fireplace", sortOrder: 1, isHero: false },
    { imageUrl: "/images/property-utah-exterior.png", caption: "Timber and stone lodge framed by snow-covered peaks", sortOrder: 2, isHero: false },
  ],
  "Austin Hillside": [
    { imageUrl: "/images/property-austin.png", caption: "Austin Hillside — contemporary Hill Country boutique retreat", sortOrder: 0, isHero: true },
    { imageUrl: "/images/property-austin-interior.png", caption: "Luxury suite with panoramic views of rolling Hill Country terrain", sortOrder: 1, isHero: false },
    { imageUrl: "/images/property-austin-pool.png", caption: "Infinity pool and terrace overlooking the Texas hills at golden hour", sortOrder: 2, isHero: false },
  ],
  "Casa Medellín": [
    { imageUrl: "/images/property-medellin.png", caption: "Casa Medellín — tropical boutique elegance in El Poblado", sortOrder: 0, isHero: true },
    { imageUrl: "/images/property-medellin-courtyard.png", caption: "Lush courtyard garden with colonial architecture and fountain", sortOrder: 1, isHero: false },
    { imageUrl: "/images/property-medellin-terrace.png", caption: "Rooftop terrace with panoramic Andes mountain and city views", sortOrder: 2, isHero: false },
  ],
  "Blue Ridge Manor": [
    { imageUrl: "/images/property-asheville.png", caption: "Blue Ridge Manor — a grand mountain estate in western North Carolina", sortOrder: 0, isHero: true },
    { imageUrl: "/images/property-asheville-suite.png", caption: "Luxury suite with vaulted beams and misty mountain panorama", sortOrder: 1, isHero: false },
    { imageUrl: "/images/property-asheville-porch.png", caption: "Wraparound porch with rocking chairs overlooking layered ridges", sortOrder: 2, isHero: false },
  ],
  "Jano Grande Ranch": [
    { imageUrl: "/images/property-medellin.png", caption: "Jano Grande Ranch — a luxury hacienda in the heart of Antioquia", sortOrder: 0, isHero: true },
    { imageUrl: "/images/property-medellin-interior.png", caption: "Open-air living room with tropical wood beams and garden views", sortOrder: 1, isHero: false },
    { imageUrl: "/images/property-medellin-grounds.png", caption: "Estate grounds with rolling hills and Andes mountain backdrop", sortOrder: 2, isHero: false },
  ],
  "Loch Sheldrake": [
    { imageUrl: "/images/property-loch-sheldrake.png", caption: "Loch Sheldrake — octagonal lakeside estate in Sullivan County", sortOrder: 0, isHero: true },
    { imageUrl: "/images/property-loch-sheldrake-aerial.png", caption: "Aerial view of the octagonal main house and grounds", sortOrder: 1, isHero: false },
    { imageUrl: "/images/property-loch-sheldrake-lake.png", caption: "Sunset over the private lake from the wraparound deck", sortOrder: 2, isHero: false },
  ],
  "Belleayre Mountain": [
    { imageUrl: "/images/property-belleayre.png", caption: "Belleayre Mountain — alpine luxury in the Western Catskills", sortOrder: 0, isHero: true },
    { imageUrl: "/images/property-belleayre-suite.png", caption: "Luxury suite with vaulted timber ceiling and mountain vista", sortOrder: 1, isHero: false },
    { imageUrl: "/images/property-belleayre-exterior.png", caption: "Timber and stone lodge nestled in forested mountain slopes", sortOrder: 2, isHero: false },
  ],
  "Scott's House": [
    { imageUrl: "/images/property-eden.png", caption: "Scott's House — a modern mountain retreat in Ogden Valley", sortOrder: 0, isHero: true },
    { imageUrl: "/images/property-eden-interior.png", caption: "Open floor plan with exposed beams and Wasatch Range views", sortOrder: 1, isHero: false },
    { imageUrl: "/images/property-eden-exterior.png", caption: "Timber and stone facade framed by snow-covered peaks", sortOrder: 2, isHero: false },
  ],
  "Lakeview Haven Lodge": [
    { imageUrl: "https://uc.orez.io/i/cd4aefa0f4fd4d76ba9b60dc003f8bfd-LargeOriginal", caption: "Large A-frame cabin in Ogden Valley with views of Pineview Reservoir", sortOrder: 0, isHero: true },
    { imageUrl: "https://uc.orez.io/f/67c398a06c5447e687d683e8e86c59fe", caption: "Front entry of Lakeview Haven Lodge", sortOrder: 1, isHero: false },
    { imageUrl: "https://uc.orez.io/i/3b5c876864ba44e2a3b17c094c52e609-LargeOriginal", caption: "Lodge exterior in fresh powder — 10 min to Snowbasin, 15 to Powder Mountain", sortOrder: 2, isHero: false },
    { imageUrl: "https://uc.orez.io/i/9ad9989f233a48579ae25e22ed959dcd-LargeOriginal", caption: "Alpenglow at the start of winter ski season over the lodge", sortOrder: 3, isHero: false },
    { imageUrl: "https://uc.orez.io/i/a9c37177e1394a5cb6b254680b4deb19-LargeOriginal", caption: "Secluded on a wooded hillside — 15 private acres in Ogden Valley", sortOrder: 4, isHero: false },
    { imageUrl: "https://uc.orez.io/f/0f388d6613d544a38652805c08cb7b0c", caption: "Driveway approach to Lakeview Haven Lodge", sortOrder: 5, isHero: false },
    { imageUrl: "https://uc.orez.io/i/3c5cb0dfcf9d4260b26a95c7adf39ad6-LargeOriginal", caption: "Great room with fireplace and views of Pineview Reservoir and the Wasatch Mountains", sortOrder: 6, isHero: false },
    { imageUrl: "https://uc.orez.io/f/ef606c1d7d0d4f6e9e41cdd02fc7a33c", caption: "Open kitchen with counter seating", sortOrder: 7, isHero: false },
    { imageUrl: "https://uc.orez.io/i/b21530d81bad44e0bfab739a0e894047-LargeOriginal", caption: "Primary bedroom with views of Pineview and the Ogden Valley", sortOrder: 8, isHero: false },
    { imageUrl: "https://uc.orez.io/i/0fb36f7bd3f4454d883bf27e0cfac5c8-LargeOriginal", caption: "Hot tub with views of Pineview Reservoir — Dark Sky area for stargazing", sortOrder: 9, isHero: false },
    { imageUrl: "https://uc.orez.io/i/272047098b274baaae11c23c32f7dac2-LargeOriginal", caption: "Side yard atrium with hot rock sauna inside", sortOrder: 10, isHero: false },
    { imageUrl: "https://uc.orez.io/i/04888df64e104a2489ad99bef51064c3-LargeOriginal", caption: "Private pickleball/sports court, covered gazebo and cornhole", sortOrder: 11, isHero: false },
    { imageUrl: "https://uc.orez.io/f/15dedec9b239418b8446a6a5b1818ce0", caption: "Private gym with stationary bikes, Woodway treadmill, Total Gym and free weights", sortOrder: 12, isHero: false },
    { imageUrl: "https://uc.orez.io/f/03ae0b6b0f9c4144809a866604338fe4", caption: "Media room with Samsung Smart TV, Sonos and foosball", sortOrder: 13, isHero: false },
    { imageUrl: "https://uc.orez.io/i/8d21b2953d8b4c97b840fdc76a88ca39-LargeOriginal", caption: "Winter view at dusk from the deck — Alpenglow on the Wasatch Mountains", sortOrder: 14, isHero: false },
  ],
  "San Diego": [
    { imageUrl: "/images/property-cartagena.png", caption: "San Diego — colonial elegance in Cartagena's walled city", sortOrder: 0, isHero: true },
    { imageUrl: "/images/property-cartagena-courtyard.png", caption: "Colonial courtyard with bougainvillea and central fountain", sortOrder: 1, isHero: false },
    { imageUrl: "/images/property-cartagena-rooftop.png", caption: "Rooftop terrace with Caribbean Sea and old city panorama", sortOrder: 2, isHero: false },
  ],
  "Medellin Duplex": [
    { imageUrl: "/images/medellin-duplex-1.jpeg", caption: "Open-concept living and dining area with Calacatta marble island and floating staircase", sortOrder: 0, isHero: true },
    { imageUrl: "/images/medellin-duplex-2.jpeg", caption: "Chef's kitchen with marble waterfall island and panoramic Andes mountain views", sortOrder: 1, isHero: false },
    { imageUrl: "/images/medellin-duplex-3.jpeg", caption: "Master suite with floor-to-ceiling windows overlooking Medellín's skyline and mountains", sortOrder: 2, isHero: false },
  ],
};

export async function seedPropertyPhotos() {
  const existing = await db.select().from(propertyPhotos).limit(1);
  if (existing.length > 0) return;

  const allProperties = await db.select().from(properties);

  let count = 0;
  for (const prop of allProperties) {
    const photoSet = PROPERTY_PHOTOS[prop.name];
    if (!photoSet) continue;

    for (const photo of photoSet) {
      await db.insert(propertyPhotos).values({
        propertyId: prop.id,
        imageUrl: photo.imageUrl,
        caption: photo.caption,
        sortOrder: photo.sortOrder,
        isHero: photo.isHero,
      });
      count++;
    }
  }

  logger.info(`Seeded ${count} property photos for ${allProperties.length} properties`, "seed");
}
