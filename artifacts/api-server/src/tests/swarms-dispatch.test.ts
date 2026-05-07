/**
 * Swarm dispatch — Unit 4 tests.
 *
 * Verifies the dispatch table routes to the correct team module and that
 * the stub teams return well-formed SlideTeamOutput. Phase 1 stubs only —
 * U5/U6 will replace the team implementations and extend these tests.
 */
import { describe, it, expect } from "vitest";
import { dispatchSlideTeam } from "../slides/swarms/dispatch";
import {
  teamOutputToAgentStatus,
  type SlideTeamInput,
} from "../slides/swarms/types";
import { TOTAL_SLIDES } from "../slides/deck-render-constants";

function makeInput(slideNumber: 1 | 2 | 3 | 4 | 5 | 6): SlideTeamInput {
  return {
    runId: 1,
    slideNumber,
    slotDrafts: {},
    financialInputs: null,
    canonicalPngKey: `canonical/lb-6-slide/slides/slide-${slideNumber}.png`,
    briefR2Key: null,
  };
}

describe("dispatchSlideTeam", () => {
  it("routes slide 1 to Sofia stub", async () => {
    const out = await dispatchSlideTeam(makeInput(1));
    expect(out.slideNumber).toBe(1);
    expect(out.status).toBe("ok");
    expect(out.payloadV2).toMatchObject({ team: "sofia", slide: 1 });
  });

  it("routes slide 2 to Bianca stub", async () => {
    const out = await dispatchSlideTeam(makeInput(2));
    expect(out.payloadV2).toMatchObject({ team: "bianca", slide: 2 });
  });

  it("routes slide 3 to Chiara stub", async () => {
    const out = await dispatchSlideTeam(makeInput(3));
    expect(out.payloadV2).toMatchObject({ team: "chiara", slide: 3 });
  });

  it("routes slide 4 to Dario stub", async () => {
    const out = await dispatchSlideTeam(makeInput(4));
    expect(out.payloadV2).toMatchObject({ team: "dario", slide: 4 });
  });

  it("routes slide 5 to Elisa stub", async () => {
    const out = await dispatchSlideTeam(makeInput(5));
    expect(out.payloadV2).toMatchObject({ team: "elisa", slide: 5 });
  });

  it("routes slide 6 to Felix stub", async () => {
    const out = await dispatchSlideTeam(makeInput(6));
    expect(out.payloadV2).toMatchObject({ team: "felix", slide: 6 });
  });

  it("throws on slide number out of range", async () => {
    await expect(
      dispatchSlideTeam({
        ...makeInput(1),
        slideNumber: 7 as unknown as 1,
      }),
    ).rejects.toThrow(/invalid slideNumber/);
  });

  it("six slides can be dispatched in parallel without contention", async () => {
    const results = await Promise.all(
      ([1, 2, 3, 4, 5, 6] as const).map((n) => dispatchSlideTeam(makeInput(n))),
    );
    expect(results).toHaveLength(TOTAL_SLIDES);
    expect(results.map((r) => r.slideNumber)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(results.every((r) => r.status === "ok")).toBe(true);
  });
});

describe("teamOutputToAgentStatus", () => {
  it("maps ok → approved", () => {
    expect(teamOutputToAgentStatus("ok")).toBe("approved");
  });
  it("maps block → rejected", () => {
    expect(teamOutputToAgentStatus("block")).toBe("rejected");
  });
  it("maps fail → rejected", () => {
    expect(teamOutputToAgentStatus("fail")).toBe("rejected");
  });
});
