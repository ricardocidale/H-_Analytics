import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] market-data-tables-001";

export async function runMarketDataTables001(): Promise<void> {
  logger.info(`${TAG} Creating market data lookup tables...`, "migration");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS market_adr_index (
      id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      market text NOT NULL,
      country text NOT NULL,
      quarter text NOT NULL,
      avg_adr real,
      luxury_adr real,
      upscale_adr real,
      midscale_adr real,
      economy_adr real,
      boutique_adr real,
      avg_occupancy real,
      avg_revpar real,
      source text,
      source_url text,
      updated_at timestamp DEFAULT now() NOT NULL,
      CONSTRAINT uq_market_adr_quarter UNIQUE (market, quarter)
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS seasonal_calendars (
      id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      market text NOT NULL,
      country text NOT NULL,
      month integer NOT NULL,
      season_type text NOT NULL,
      demand_multiplier real NOT NULL DEFAULT 1.0,
      avg_adr_multiplier real DEFAULT 1.0,
      notes text,
      updated_at timestamp DEFAULT now() NOT NULL,
      CONSTRAINT uq_seasonal_market_month UNIQUE (market, month)
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS event_calendars (
      id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      market text NOT NULL,
      country text NOT NULL,
      event_name text NOT NULL,
      start_month integer,
      end_month integer,
      specific_date text,
      demand_impact text NOT NULL,
      is_recurring boolean NOT NULL DEFAULT true,
      category text,
      estimated_attendees integer,
      notes text,
      updated_at timestamp DEFAULT now() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS labor_rates (
      id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      market text NOT NULL,
      country text NOT NULL,
      role text NOT NULL,
      hourly_rate real,
      annual_salary real,
      currency text NOT NULL DEFAULT 'USD',
      employment_type text NOT NULL DEFAULT 'fte',
      source text,
      source_url text,
      source_year integer,
      updated_at timestamp DEFAULT now() NOT NULL,
      CONSTRAINT uq_labor_market_role UNIQUE (market, role, employment_type)
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS fb_benchmarks (
      id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      market text NOT NULL,
      country text NOT NULL,
      property_type text NOT NULL,
      avg_ticket_per_person real,
      avg_breakfast_ticket real,
      avg_lunch_ticket real,
      avg_dinner_ticket real,
      avg_bar_revenue_per_guest real,
      covers_per_room_night real,
      catering_cost_per_event real,
      fb_cost_of_goods_percent real,
      fb_labor_cost_percent real,
      source text,
      source_url text,
      source_year integer,
      updated_at timestamp DEFAULT now() NOT NULL,
      CONSTRAINT uq_fb_market_type UNIQUE (market, property_type)
    )
  `);

  logger.info(`${TAG} All 5 market data lookup tables created`, "migration");
}
