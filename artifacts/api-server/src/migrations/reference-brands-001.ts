/**
 * reference-brands-001 — Create the `reference_brands` table and seed 20 boutique brands.
 *
 * The Drizzle migration 0028_reference_brands.sql was added after the
 * bootstrapDrizzleMigrationState() already pre-marked it as applied on the
 * legacy Neon DB, so the actual DDL was never executed by migrate(). This
 * named runtime migration ensures the table exists on every boot.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "reference-brands-001";

export async function runReferenceBrands001(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS reference_brands (
        id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        brand_name TEXT NOT NULL,
        niche TEXT,
        positioning_summary TEXT,
        guest_segment TEXT,
        property_count INTEGER,
        key_count_min INTEGER,
        key_count_max INTEGER,
        geographic_focus TEXT,
        adr_usd REAL,
        occupancy_pct REAL,
        revpar_usd REAL,
        revenue_range_low_usd REAL,
        revenue_range_high_usd REAL,
        ownership_model TEXT,
        acquisition_context TEXT,
        description TEXT,
        reference_disclaimer BOOLEAN NOT NULL DEFAULT TRUE,
        data_year INTEGER,
        source_urls JSONB,
        last_refreshed_at TIMESTAMP,
        refreshed_by_run_id INTEGER,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS reference_brands_name_idx ON reference_brands (brand_name)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS reference_brands_refreshed_idx ON reference_brands (last_refreshed_at)
    `);

    logger.info(`[${TAG}] reference_brands table created (or already existed)`);

    const countResult = await db.execute(
      sql`SELECT COUNT(*)::int AS cnt FROM reference_brands`
    );
    const count =
      (
        countResult as unknown as {
          rows: Array<{ cnt: number }>;
        }
      ).rows[0]?.cnt ?? 0;

    if (count > 0) {
      logger.info(`[${TAG}] reference_brands already seeded (${count} rows), skipping seed`);
      return;
    }

    await db.execute(sql`
      INSERT INTO reference_brands (brand_name, niche, positioning_summary, guest_segment, property_count, key_count_min, key_count_max, geographic_focus, adr_usd, occupancy_pct, revpar_usd, revenue_range_low_usd, revenue_range_high_usd, ownership_model, acquisition_context, description, reference_disclaimer, data_year, source_urls, last_refreshed_at) VALUES
        ('Axel Hotels', 'LGBT+ boutique lifestyle', 'Design-forward urban hotels celebrating LGBTQ+ culture and inclusivity with vibrant social spaces', 'LGBTQ+ travelers and allies, design-conscious urban explorers', 11, 60, 200, 'Europe (Spain, Germany, Netherlands, UK, Argentina)', 195, 0.82, 160, 5000000, 25000000, 'Owner-operated with selective franchise', 'Organic growth; seeking PE-backed expansion', 'Founded 2003 in Barcelona, Axel Hotels pioneered the ''hetero-friendly'' boutique concept. Known for rooftop bars, design-forward rooms, and an inclusive party culture. ADR ~$180–210 in European markets.', TRUE, 2024, '["https://axelhotels.com"]'::jsonb, NOW()),
        ('Mama Shelter', 'Quirky design/lifestyle', 'Bold, irreverent design hotels with a strong F&B identity positioned as neighborhood social hubs', 'Urban millennials, creatives, design-conscious leisure and business travelers', 25, 55, 180, 'Europe, Middle East, North America (Paris-centric)', 155, 0.79, 122, 8000000, 40000000, 'Accor-owned (acquired 2014); founder Philippe Starck-designed concept', 'Acquired by Accor; expansion via management agreements', 'Created by Serge Trigano with Philippe Starck, Mama Shelter is renowned for playful interiors, rooftop bars, and vibrant restaurant concepts. Strong brand voice; now global via Accor''s SBE portfolio.', TRUE, 2024, '["https://mamashelter.com"]'::jsonb, NOW()),
        ('Selina', 'Co-living / co-working hybrid', 'Tech-enabled co-living and co-working hotel brand targeting digital nomads and remote workers', 'Digital nomads, remote workers, backpackers, younger millennial/Gen Z travelers', 150, 10, 200, 'Global (Latin America, Europe, Middle East, Africa, Asia)', 85, 0.62, 53, 40000000, 120000000, 'Publicly traded (NASDAQ: SLNA); asset-light lease model', 'Rapid organic growth via long-term leases; now undergoing restructuring', 'Selina disrupted the hostel market by layering co-working, programming, and community into converted properties globally. ADR is deliberately accessible; revenue model includes co-working day passes and F&B.', TRUE, 2024, '["https://selina.com"]'::jsonb, NOW()),
        ('Eleven Experience', 'Luxury adventure / experiential', 'Ultra-premium remote lodge and expedition brand delivering bespoke adventure experiences', 'High-net-worth adventure seekers, couples celebrating milestones, fly-fishing and skiing enthusiasts', 9, 6, 25, 'USA (Colorado, Montana), Morocco, Greenland, Scotland', 650, 0.72, 468, 5000000, 20000000, 'Privately held; owner-operated lodges', 'Organic; founder-led boutique expansion', 'Founded 2007, Eleven Experience operates remote fly-fishing lodges, ski chalets, and expedition camps at $600–800/night all-inclusive. Best-in-class guide programs and low room counts create exclusivity.', TRUE, 2024, '["https://elevenexperience.com"]'::jsonb, NOW()),
        ('Yotel', 'Tech-forward micro-hotel', 'Compact, tech-enabled hotels delivering premium sleep quality in high-traffic urban and airport locations', 'Efficiency-focused business travelers, tech-savvy urban visitors, transit passengers', 22, 55, 669, 'USA, UK, Netherlands, Singapore, Japan, Turkey', 185, 0.80, 148, 30000000, 90000000, 'Private equity backed (IHC, Starwood Capital previously)', 'Expansion via management agreements and JVs; significant Asia-Pacific pipeline', 'Yotel pioneered the cabin-hotel concept inspired by first-class airline cabins. Signature features include automated check-in robots (YOBOT), adjustable SmartBeds, and super-efficient room design.', TRUE, 2024, '["https://yotel.com"]'::jsonb, NOW()),
        ('1 Hotel', 'Sustainable luxury', 'Biophilic luxury hotels built around nature-inspired design and environmental sustainability', 'Eco-conscious luxury travelers, design-forward urban guests', 12, 100, 400, 'USA (NY, Miami, Nashville, LA), Caribbean, China', 380, 0.76, 289, 25000000, 80000000, 'SH Hotels & Resorts (Starwood Capital); management agreements', 'PE-backed rapid growth; Starwood Capital vehicle', '1 Hotel launched in 2015 and redefined eco-luxury with living walls, reclaimed wood, organic amenities, and sustainability certifications. Strong F&B programming and rooftop bars drive non-rooms revenue.', TRUE, 2024, '["https://1hotels.com"]'::jsonb, NOW()),
        ('Ace Hotel', 'Indie cultural / creative', 'Neighborhood-rooted design hotels celebrating local arts, music, and creative culture', 'Creatives, artists, musicians, independent-minded travelers, hipster millennials', 14, 80, 280, 'USA (NY, LA, Chicago, Portland, New Orleans), UK, Australia', 265, 0.73, 193, 15000000, 55000000, 'Atelier Ace (management company); third-party ownership', 'Management-contract model; selective growth', 'Ace Hotel invented the indie hotel movement in 1999 (Seattle). Lobbies function as community hubs with coffee shops, vinyl DJs, and local art. High-profile collaborations and A-list cultural credibility.', TRUE, 2024, '["https://acehotel.com"]'::jsonb, NOW()),
        ('Graduate Hotels', 'College-town lifestyle', 'Experiential hotels in university towns celebrating campus culture, nostalgia, and local pride', 'Alumni, parents, college sports fans, local business travelers, nostalgic millennials', 35, 80, 250, 'USA (30+ university markets)', 180, 0.74, 133, 20000000, 70000000, 'AJ Capital Partners; sold to Hilton 2024 for $210M', 'Acquired by Hilton 2024; prior PE ownership', 'Graduate Hotels operates in 30+ US college markets. Each property is heavily themed around local university culture. Hilton acquisition validates the model at scale.', TRUE, 2024, '["https://graduatehotels.com"]'::jsonb, NOW()),
        ('citizenM', 'Affordable urban luxury / tech', 'Modular construction, tech-enabled affordable luxury hotels for the mobile global citizen', 'Global frequent business travelers, tech-savvy millennials seeking design at accessible prices', 33, 160, 380, 'Europe, USA, Asia (Amsterdam HQ)', 195, 0.85, 166, 30000000, 100000000, 'Private (Rattan Chadha family); majority sold to APG Asset Management', 'Balance sheet development model; primarily fee-simple owned assets', 'citizenM pioneered the XL bed + small room + grand lobby format using modular rooms. Industry-leading occupancy ~83–87%. EBITDA margins ~35%.', TRUE, 2024, '["https://citizenm.com"]'::jsonb, NOW()),
        ('Proper Hotels', 'Neighborhood luxury / design', 'Architecturally significant boutique luxury hotels rooted in their neighborhoods with strong F&B', 'Design-conscious luxury travelers, local culture seekers, F&B enthusiasts', 7, 110, 270, 'USA (San Francisco, Santa Monica, Austin, San Jose)', 320, 0.74, 237, 15000000, 50000000, 'Proper Hospitality (management); varied third-party ownership', 'Management-contract model; selective urban development', 'Proper Hotels operates architecturally distinctive luxury properties with flagship restaurant partners. Strong design pedigree from Roman and Williams. Formerly known as Commune Hotels.', TRUE, 2024, '["https://properhotels.com"]'::jsonb, NOW()),
        ('The Standard Hotels', 'Iconic design / social', 'Transgressive, design-forward lifestyle hotels known for bold architecture, nightlife, and cultural programming', 'Fashion-forward travelers, nightlife seekers, media/entertainment industry', 18, 60, 350, 'USA (LA, NYC, Miami), Europe (London, Ibiza), Asia', 285, 0.71, 202, 20000000, 60000000, 'Andre Balazs Properties (originally); sold to Ennismore/Accor JV 2024', 'Sold to Accor/Ennismore 2024; management agreement model going forward', 'The Standard is known for boundary-pushing design (High Line NY, Meatpacking), rooftop nightlife, and celebrity culture. Acquired by Ennismore to complement Gleneagles, Hoxton, and 25hours.', TRUE, 2024, '["https://standardhotels.com"]'::jsonb, NOW()),
        ('Freehand Hotels', 'Social design / affordable lifestyle', 'Design-forward social hotels offering shared and private accommodations in cultural neighborhoods', 'Social travelers, design-savvy budget-to-mid-range guests, hostel graduates', 6, 100, 250, 'USA (NY, Chicago, Miami, LA)', 185, 0.76, 141, 8000000, 25000000, 'Generator Hostels (acquired 2019); Queensway Group backed', 'Acquired by Generator; integrated into lifestyle portfolio', 'Freehand blends hostel energy with boutique hotel amenities with dormitory and private rooms. Lobby bars (the Broken Shaker) are local cultural institutions. High F&B revenue relative to rooms.', TRUE, 2024, '["https://freehandhotels.com"]'::jsonb, NOW()),
        ('Autocamp', 'Glamping / nature-luxury', 'Upscale glamping with Airstream trailers, canvas suites, and custom cabins in national park-adjacent locations', 'Nature-loving affluent couples and families, outdoor enthusiasts seeking comfort', 12, 20, 100, 'USA (Yosemite, Joshua Tree, Catskills, Cape Cod, Smoky Mountains)', 325, 0.71, 231, 5000000, 20000000, 'Private (KSL Capital Partners backed)', 'PE-backed build-out; land leases from national parks and private landowners', 'Autocamp pioneered the premium glamping format using refurbished Airstream trailers. RevPAR outperforms comparable limited-service hotels. Strong advance booking; shoulder-season challenge.', TRUE, 2024, '["https://autocamp.com"]'::jsonb, NOW()),
        ('21c Museum Hotels', 'Art-infused boutique luxury', 'Contemporary art museum integrated with boutique luxury hotels in secondary US markets', 'Art collectors, cultural tourists, corporate events, design-forward leisure travelers', 12, 90, 220, 'USA (Louisville, Bentonville, Cincinnati, Durham, etc.)', 240, 0.72, 173, 10000000, 35000000, 'Accor (acquired 2018 via 21c founders and MGallery)', 'Acquired by Accor; management agreement model', 'Founded by Laura Lee Brown and Steve Wilson (bourbon heirs), 21c pioneered the museum-hotel concept in secondary markets. Penthouse spaces double as gallery space. Strong F&B and events revenue.', TRUE, 2024, '["https://21cmuseumhotels.com"]'::jsonb, NOW()),
        ('Nomad Hotel', 'Rooftop culture / urban luxury', 'Lush, eclectic luxury boutique hotels celebrated for iconic rooftop bars and Instagrammable aesthetics', 'Fashionable urban professionals, F&B enthusiasts, social media-savvy luxury travelers', 4, 140, 250, 'USA (New York, Los Angeles, Las Vegas), UK (London)', 340, 0.70, 238, 10000000, 35000000, 'Sydell Group (management); third-party ownership', 'Management-contract model; expansion stalled post-COVID', 'NoMad Hotel (Madison Square Park NYC flagship) set the standard for urban luxury F&B-driven hospitality. Daniel Humm''s restaurant, rooftop bar, and lobby bar generate significant ancillary revenue. ADR ~$300–380.', TRUE, 2024, '["https://thenomadhotel.com"]'::jsonb, NOW()),
        ('Life House', 'Tech-enabled design boutique', 'Technology-first lifestyle hotel operator converting independent boutiques into a branded network', 'Tech-savvy independent travelers, design-conscious leisure guests', 18, 20, 80, 'USA (major leisure markets: Miami, Portland, Hudson, etc.)', 195, 0.77, 150, 5000000, 18000000, 'Private (VC-backed: YC, Thrive Capital, others)', 'Asset-light management and revenue-sharing; conversion of independent hotels', 'Life House raised $50M+ to build a tech stack for independent boutique hotels. Operates as a revenue-optimization and management platform. Lower key counts per property reflect independent boutique conversions.', TRUE, 2024, '["https://lifehousehotels.com"]'::jsonb, NOW()),
        ('Zoku', 'Extended stay / urban living', 'Hybrid work-live hotel spaces for extended-stay travelers blending home comfort with hotel services', 'Extended-stay business travelers, expats, remote workers seeking furnished urban apartments', 6, 130, 220, 'Europe (Amsterdam, Paris, Vienna, Copenhagen, London)', 160, 0.82, 131, 8000000, 25000000, 'Private (Dutch family office + institutional investors)', 'Organic development; plans for 50 cities by 2030', 'Zoku invented the ''loft'' format combining a compact sleeping area with a full work-live space in a foldable configuration. Social rooftops and communal dining drive community. Exceptional occupancy via weekly/monthly pricing.', TRUE, 2024, '["https://livezoku.com"]'::jsonb, NOW()),
        ('Dream Hotel Group', 'Trendy upscale lifestyle', 'Aspirational lifestyle hotels with vibrant nightlife, bold design, and celebrity-adjacent social scenes', 'Upscale leisure travelers, nightlife seekers, entertainment industry, bachelorette/bachelor groups', 12, 90, 300, 'USA (NY, Nashville, Palm Springs), India, Thailand, Bahrain', 275, 0.72, 198, 12000000, 45000000, 'PHM Hospitality (management); varied third-party ownership', 'Management-contract led; selective international JVs', 'Dream Hotel Group operates lifestyle hotels with a nightlife-centric identity. Strong F&B and beverage revenue. Nashville and Palm Springs properties capture high-growth leisure demand.', TRUE, 2024, '["https://dreamhotels.com"]'::jsonb, NOW()),
        ('Hästens Sleep Spa Hotel', 'Ultra-luxury wellness / sleep', 'World''s first sleep-focused luxury hotel featuring bespoke Hästens beds and comprehensive sleep wellness programs', 'Ultra-affluent wellness travelers, sleep-disorder sufferers, luxury experience collectors', 1, 11, 11, 'Portugal (Covilhã)', 1800, 0.65, 1170, 3000000, 8000000, 'Hästens brand-owned concept hotel', 'Single flagship property; proof-of-concept for potential IP licensing', 'The Hästens Sleep Spa Hotel (2021) pushed the niche wellness concept to its extreme: every suite features a $400,000+ Hästens Vividus bed and the $2,000+/night rate includes sleep coaching. ADR/RevPAR reflects ultra-premium niche positioning.', TRUE, 2024, '["https://hastens.com/sleep-spa-hotel"]'::jsonb, NOW())
    `);

    logger.info(`[${TAG}] Seeded 20 reference brands`);
  } catch (error: unknown) {
    logger.error(`[${TAG}] Migration failed: ${String(error)}`, TAG);
    throw error;
  }
}
